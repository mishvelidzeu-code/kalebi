import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useLanguage } from "../../context/LanguageContext";
import { useTheme } from "../../context/ThemeContext";
import { supabase } from "../../services/supabase";
import { getWeightLogsRange, getWeightProfile } from "../../services/weightLogs";
import { getPreferredCycleLength, getPreferredPeriodLength } from "../../utils/cyclePrediction";
import dayjs from "../../utils/dayjs";
import { annotateWeightLogs, getLatestWeightInsight, getWeightProgress, normalizeWeightLogs } from "../../utils/weightStats";
import AddWeightModal from "./AddWeightModal";
import { getWeightTheme } from "./weightTheme";

// Home-screen card in weight mode: today's weigh-in (or a prompt to log it),
// the cycle-aware note, and progress. Tapping it opens the statistics tab.
export default function WeightHomeCard() {
  const router = useRouter();
  const { t } = useLanguage();
  const { isDark } = useTheme();
  const theme = getWeightTheme(isDark);
  const [state, setState] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const today = dayjs().format("YYYY-MM-DD");
      const [profile, cyclesRes, rows] = await Promise.all([
        getWeightProfile(),
        supabase.from("cycles").select("start_date, cycle_length, period_length").eq("user_id", user.id).order("start_date", { ascending: true }),
        getWeightLogsRange(dayjs().subtract(45, "day").format("YYYY-MM-DD"), today),
      ]);
      const cycles = cyclesRes.data || [];
      const cycleRows = cycles.length ? cycles : profile?.last_period ? [{ start_date: profile.last_period }] : [];
      const logs = annotateWeightLogs(normalizeWeightLogs(rows), cycleRows, {
        cycleLength: getPreferredCycleLength(cycles, profile),
        periodLength: getPreferredPeriodLength(cycles, profile),
      });
      const latest = logs[logs.length - 1] || null;

      setState({
        latest,
        todayKg: latest?.date === today ? latest.weight : null,
        insight: getLatestWeightInsight(logs),
        progress: getWeightProgress({ startKg: profile?.weight_start_kg, targetKg: profile?.weight_target_kg, currentKg: latest?.avg }),
      });
    } catch (error) {
      console.log("Weight home card error:", error);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const insight = state?.insight;
  const subtitle = insight?.key === "waterLikely"
    ? t("weight.home.water", { delta: Math.abs(insight.delta) })
    : state?.progress
      ? state.progress.reached
        ? t("weight.goalReached")
        : t("weight.toGoal", { kg: state.progress.remainingKg })
      : t("weight.subtitle");

  return (
    <>
      <TouchableOpacity activeOpacity={0.88} onPress={() => router.push("/(tabs)/statistics")}>
        <LinearGradient colors={theme.cardGradient} style={[styles.card, { borderColor: theme.accentBorder }]}>
          <View style={[styles.icon, { backgroundColor: insight?.key === "waterLikely" ? theme.waterSoft : theme.accentSoft }]}>
            <Ionicons name={insight?.key === "waterLikely" ? "water-outline" : "scale-outline"} size={20} color={insight?.key === "waterLikely" ? theme.water : theme.accent} />
          </View>
          <View style={styles.copy}>
            <Text style={[styles.eyebrow, { color: theme.accent }]}>{t("weight.home.eyebrow")}</Text>
            <Text style={[styles.title, { color: theme.text }]}>
              {state?.todayKg != null
                ? `${state.todayKg} ${t("weight.kg")}`
                : t("weight.home.notToday")}
            </Text>
            <Text style={[styles.subtitle, { color: theme.subText }]} numberOfLines={2}>{subtitle}</Text>
          </View>
          <TouchableOpacity
            style={[styles.logBtn, { backgroundColor: state?.todayKg != null ? theme.accentSoft : theme.accent }]}
            onPress={() => setShowAdd(true)}
            activeOpacity={0.85}
            accessibilityLabel={t("weight.addToday")}
          >
            <Ionicons name={state?.todayKg != null ? "create-outline" : "add"} size={20} color={state?.todayKg != null ? theme.accent : "#fff"} />
          </TouchableOpacity>
        </LinearGradient>
      </TouchableOpacity>

      <AddWeightModal
        visible={showAdd}
        initialKg={state?.todayKg ?? state?.latest?.weight ?? null}
        onClose={() => setShowAdd(false)}
        onSaved={load}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 24, padding: 16, marginBottom: 18 },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1 },
  eyebrow: { fontSize: 10, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" },
  title: { fontSize: 18, fontWeight: "900", marginTop: 2 },
  subtitle: { fontSize: 12, lineHeight: 17, fontWeight: "600", marginTop: 2 },
  logBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
});
