import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useLanguage } from "../../context/LanguageContext";
import { useTheme } from "../../context/ThemeContext";
import { getWeightMealPlan } from "../../services/assistantOrchestrator";
import {
  PRIME_DAILY_QUESTION_LIMIT,
  addAssistantDailyUsage,
  getAssistantDailyUsage,
  isAssistantDailyLimitError,
  setAssistantDailyUsage,
} from "../../services/assistantUsage";
import { supabase } from "../../services/supabase";
import dayjs from "../../utils/dayjs";
import { getWeightTheme } from "./weightTheme";

const CACHE_KEY = "cycle_app_weight_meals";

// Today's AI menu on the weight screen. Generated once a day and kept on the
// device, so opening the screen again costs nothing; a new day, a new target
// or another language asks for a fresh one. Calories are left out of the key
// on purpose: each weigh-in nudges them by ~10 kcal, not worth a new menu.
// "Another option" re-asks and tells the model not to repeat the dishes.
//
// Each menu is one chat question on the server (product decision: no separate
// budget), so it also moves the chat screen's local counter. Weight mode is
// Prime-only, hence Prime's daily limit; admins are not counted.
export default function WeightMealPlanCard({ calories, targetKg, phaseKey }) {
  const { t, language } = useLanguage();
  const { isDark, isAdmin } = useTheme();
  const theme = getWeightTheme(isDark);

  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const inFlightRef = useRef(false);

  const dayKey = [dayjs().format("YYYY-MM-DD"), targetKg ?? "", language].join("::");

  const generate = useCallback(async ({ previousMenu = "" } = {}) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    setFailed(false);
    let user = null;
    try {
      ({ data: { user } } = await supabase.auth.getUser());
      // Out of questions already: don't spend a request just to be refused.
      if (user && !isAdmin && (await getAssistantDailyUsage(user.id)) >= PRIME_DAILY_QUESTION_LIMIT) {
        setLimitReached(true);
        return;
      }

      const response = await getWeightMealPlan({ previousMenu });
      const menu = (response?.text || "").trim();
      if (!menu) throw new Error("empty-menu");
      setText(menu);
      if (user) {
        if (!isAdmin) await addAssistantDailyUsage(user.id, 1);
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ userId: user.id, dayKey, text: menu }));
      }
    } catch (error) {
      console.log("Weight meal plan error:", error);
      if (isAssistantDailyLimitError(error)) {
        // The server says the day's questions are spent — sync the chat counter.
        setLimitReached(true);
        if (user) await setAssistantDailyUsage(user.id, PRIME_DAILY_QUESTION_LIMIT);
      } else {
        setFailed(true);
      }
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [dayKey, isAdmin]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        const cached = raw ? JSON.parse(raw) : null;
        if (active && cached && user && cached.userId === user.id && cached.dayKey === dayKey && cached.text) {
          setText(cached.text);
          return;
        }
      } catch (error) {
        console.log("Weight meal cache read error:", error);
      }
      if (active) generate();
    })();
    return () => {
      active = false;
    };
  }, [dayKey, generate]);

  const subtitle = calories
    ? t("weight.meals.subtitle", { kcal: calories, phase: phaseKey ? t(`home.phases.${phaseKey}`) : "" })
    : phaseKey ? t(`home.phases.${phaseKey}`) : "";

  return (
    <LinearGradient colors={theme.cardGradient} style={[styles.card, { borderColor: theme.border }]}>
      <View style={styles.headerRow}>
        <View style={[styles.icon, { backgroundColor: theme.accentSoft }]}>
          <Ionicons name="restaurant-outline" size={18} color={theme.accent} />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.eyebrow, { color: theme.accent }]}>{t("weight.meals.eyebrow")}</Text>
          <Text style={[styles.title, { color: theme.text }]}>{t("weight.meals.title")}</Text>
          {!!subtitle && <Text style={[styles.subtitle, { color: theme.subText }]}>{subtitle}</Text>}
        </View>
      </View>

      {loading && !text ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={theme.accent} />
          <Text style={[styles.loadingText, { color: theme.subText }]}>{t("weight.meals.loading")}</Text>
        </View>
      ) : limitReached && !text ? (
        <Text style={[styles.loadingText, { color: theme.subText }]}>{t("weight.meals.limitReached")}</Text>
      ) : failed && !text ? (
        <View style={styles.loadingRow}>
          <Text style={[styles.loadingText, { color: theme.subText }]}>{t("weight.meals.failed")}</Text>
          <TouchableOpacity onPress={() => generate()} activeOpacity={0.8}>
            <Text style={[styles.retry, { color: theme.accent }]}>{t("weight.meals.retry")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={[styles.menu, { color: theme.text }]}>{text}</Text>
      )}

      {!!text && limitReached && (
        <Text style={[styles.limitNote, { color: theme.subText }]}>{t("weight.meals.limitReached")}</Text>
      )}

      {!!text && !limitReached && (
        <TouchableOpacity
          style={[styles.anotherBtn, { borderColor: theme.accentBorder, backgroundColor: theme.inputBg }]}
          onPress={() => generate({ previousMenu: text })}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator size="small" color={theme.accent} />
          ) : (
            <>
              <Ionicons name="refresh" size={16} color={theme.accent} />
              <Text style={[styles.anotherText, { color: theme.accent }]}>{t("weight.meals.another")}</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {!isAdmin && <Text style={[styles.note, { color: theme.subText }]}>{t("weight.meals.usesQuestion")}</Text>}
      <Text style={[styles.note, { color: theme.subText }]}>{t("weight.meals.note")}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { borderRadius: 26, borderWidth: 1, padding: 19, marginBottom: 18 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  eyebrow: { fontSize: 10, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" },
  title: { fontSize: 17, fontWeight: "900", marginTop: 2 },
  subtitle: { fontSize: 12, fontWeight: "700", marginTop: 2 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, flexWrap: "wrap" },
  loadingText: { fontSize: 13, fontWeight: "600" },
  retry: { fontSize: 13, fontWeight: "900" },
  menu: { fontSize: 14, lineHeight: 23, fontWeight: "600" },
  anotherBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderRadius: 16, paddingVertical: 11, marginTop: 14, minHeight: 44 },
  anotherText: { fontSize: 13, fontWeight: "800" },
  limitNote: { fontSize: 12, lineHeight: 17, fontWeight: "700", marginTop: 12 },
  note: { fontSize: 11, lineHeight: 16, fontWeight: "600", marginTop: 10 },
});
