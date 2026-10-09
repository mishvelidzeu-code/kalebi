import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { getWeightTheme } from "../components/weight/weightTheme";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";
import { useWeight } from "../context/WeightContext";
import { invalidateAssistantContextCache } from "../services/assistantOrchestrator";
import { getWeightLogsRange, getWeightProfile, saveWeightSetup } from "../services/weightLogs";
import dayjs from "../utils/dayjs";
import { getAgeFromBirthDate } from "../utils/fertilityInsights";
import {
  estimateWeeksToGoal,
  getDailyCalorieTarget,
  getHealthyWeightRange,
  validateWeightGoal,
} from "../utils/weightStats";

const ACTIVITY_IDS = ["low", "moderate", "high"];

const parseNumber = (text) => {
  const value = Number(String(text ?? "").replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
};

// Weight-mode setup: height, current and target weight, activity. Age comes
// from the onboarding birth date but is shown so it can be corrected — the
// onboarding picker starts at 2000-01-01, so a skipped step looks like 26.
export default function WeightSetupScreen() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const { isDark, isPremium } = useTheme();
  const { weightMode, blockedBy, reload: reloadWeight } = useWeight();
  const theme = getWeightTheme(isDark);
  // Editing a running plan keeps its start date and start weight.
  const [editing] = useState(weightMode);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [height, setHeight] = useState("");
  const [current, setCurrent] = useState("");
  const [target, setTarget] = useState("");
  const [activity, setActivity] = useState("moderate");
  const [birthDate, setBirthDate] = useState(null);
  const [birthChanged, setBirthChanged] = useState(false);
  const [showBirthPicker, setShowBirthPicker] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      const [profile, rows] = await Promise.all([
        getWeightProfile(),
        getWeightLogsRange(dayjs().subtract(60, "day").format("YYYY-MM-DD"), dayjs().format("YYYY-MM-DD")),
      ]);
      if (!active) return;
      const latestKg = rows.length ? rows[rows.length - 1].weight_kg : profile?.weight_start_kg;
      if (profile?.height_cm) setHeight(String(Number(profile.height_cm)));
      if (latestKg) setCurrent(String(Number(latestKg)));
      if (profile?.weight_target_kg) setTarget(String(Number(profile.weight_target_kg)));
      if (profile?.activity_level) setActivity(profile.activity_level);
      if (profile?.birth_date) setBirthDate(profile.birth_date);
      else setShowBirthPicker(true);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const age = getAgeFromBirthDate(birthDate);
  const values = { heightCm: parseNumber(height), currentKg: parseNumber(current), targetKg: parseNumber(target), age };
  const validation = validateWeightGoal(values);

  const preview = useMemo(() => {
    if (!validation.ok) return null;
    const calories = getDailyCalorieTarget({ weightKg: values.currentKg, heightCm: values.heightCm, age, activity });
    return {
      calories,
      weeks: estimateWeeksToGoal(values.currentKg, values.targetKg, calories?.weeklyLossKg),
      healthy: getHealthyWeightRange(values.heightCm, age),
    };
  }, [validation.ok, values.currentKg, values.heightCm, values.targetKg, age, activity]);

  // Errors appear once the form is complete or after a save attempt, not while typing the first field.
  const formComplete = values.heightCm && values.currentKg && values.targetKg && age != null;
  const showError = !validation.ok && (submitted || formComplete);

  const handleSave = async () => {
    setSubmitted(true);
    setSaveError("");
    if (!validation.ok) return;

    setSaving(true);
    const result = await saveWeightSetup({
      heightCm: values.heightCm,
      currentKg: Math.round(values.currentKg * 10) / 10,
      targetKg: Math.round(values.targetKg * 10) / 10,
      activity,
      birthDate: birthChanged ? birthDate : null,
      keepStartedAt: editing,
    });
    if (!result.ok) {
      setSaving(false);
      setSaveError(t("weight.saveFailed"));
      return;
    }
    invalidateAssistantContextCache();
    await reloadWeight();
    setSaving(false);
    router.back();
  };

  const onBirthChange = (_event, selected) => {
    if (Platform.OS === "android") setShowBirthPicker(false);
    if (selected) {
      setBirthDate(dayjs(selected).format("YYYY-MM-DD"));
      setBirthChanged(true);
    }
  };

  // Reachable only with Prime and outside fertility / pregnancy; guard anyway
  // in case the screen is opened some other way.
  const blockedMessage = !isPremium
    ? t("weight.setup.needsPrime")
    : blockedBy === "pregnancy"
      ? t("weight.setup.blockedPregnancy")
      : blockedBy === "fertility"
        ? t("weight.setup.blockedFertility")
        : null;

  return (
    <LinearGradient colors={theme.pageGradient} style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <TouchableOpacity onPress={() => router.back()} style={styles.close} accessibilityLabel={t("common.close")}>
          <Ionicons name="close" size={28} color={theme.subText} />
        </TouchableOpacity>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.accent} />
          </View>
        ) : blockedMessage ? (
          <View style={styles.blocked}>
            <Text style={[styles.title, { color: theme.text }]}>{t("weight.title")}</Text>
            <Text style={[styles.subtitle, { color: theme.subText }]}>{blockedMessage}</Text>
            {!isPremium && (
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: theme.accent }]} onPress={() => router.replace("/premium")} activeOpacity={0.85}>
                <Text style={styles.saveText}>{t("weight.entry.unlock")}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={[styles.title, { color: theme.text }]}>{editing ? t("weight.setup.editTitle") : t("weight.setup.title")}</Text>
              <Text style={[styles.subtitle, { color: theme.subText }]}>{t("weight.setup.subtitle")}</Text>

              <NumberField theme={theme} label={t("weight.setup.height")} unit={t("weight.setup.cm")} value={height} onChange={setHeight} placeholder="165" />
              <NumberField theme={theme} label={t("weight.setup.current")} unit={t("weight.kg")} value={current} onChange={setCurrent} placeholder="66" />
              <NumberField theme={theme} label={t("weight.setup.target")} unit={t("weight.kg")} value={target} onChange={setTarget} placeholder="60" />

              <Text style={[styles.label, { color: theme.text }]}>{t("weight.setup.activity")}</Text>
              <View style={styles.chips}>
                {ACTIVITY_IDS.map((id) => {
                  const active = id === activity;
                  return (
                    <TouchableOpacity
                      key={id}
                      style={[styles.chip, { borderColor: active ? theme.accent : theme.border, backgroundColor: active ? theme.accentSoft : theme.inputBg }]}
                      onPress={() => setActivity(id)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.chipTitle, { color: active ? theme.accent : theme.text }]}>{t(`weight.setup.activityOptions.${id}`)}</Text>
                      <Text style={[styles.chipHint, { color: theme.subText }]}>{t(`weight.setup.activityHints.${id}`)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={[styles.ageRow, { borderColor: theme.border, backgroundColor: theme.inputBg }]}>
                <View style={styles.flex}>
                  <Text style={[styles.ageLabel, { color: theme.subText }]}>{t("weight.setup.age")}</Text>
                  <Text style={[styles.ageValue, { color: theme.text }]}>
                    {age != null ? t("weight.setup.ageValue", { count: age }) : t("weight.setup.ageMissing")}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setShowBirthPicker((open) => !open)} activeOpacity={0.7}>
                  <Text style={[styles.ageChange, { color: theme.accent }]}>
                    {showBirthPicker && Platform.OS === "ios" ? t("weight.setup.ageDone") : t("weight.setup.ageChange")}
                  </Text>
                </TouchableOpacity>
              </View>
              {showBirthPicker && (
                <DateTimePicker
                  value={birthDate ? dayjs(birthDate).toDate() : new Date(1995, 0, 1)}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  maximumDate={new Date()}
                  onChange={onBirthChange}
                  locale={language}
                  textColor={theme.text}
                />
              )}

              {showError && (
                <View style={[styles.errorBox, { backgroundColor: theme.waterSoft, borderColor: theme.waterBorder }]}>
                  <Text style={[styles.errorText, { color: theme.water }]}>
                    {t(`weight.setup.errors.${validation.errorKey}`, { kg: validation.minHealthyKg })}
                  </Text>
                  {validation.errorKey === "targetBelowHealthy" && (
                    <TouchableOpacity onPress={() => setTarget(String(validation.minHealthyKg))} activeOpacity={0.8}>
                      <Text style={[styles.errorAction, { color: theme.accent }]}>{t("weight.setup.useMin", { kg: validation.minHealthyKg })}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {preview && (
                <View style={[styles.preview, { borderColor: theme.accentBorder, backgroundColor: theme.accentSoft }]}>
                  <Text style={[styles.previewTitle, { color: theme.accent }]}>{t("weight.planTitle")}</Text>
                  {preview.calories && (
                    <Text style={[styles.previewLine, { color: theme.text }]}>
                      {t("weight.setup.previewCalories", { kcal: preview.calories.target })}
                    </Text>
                  )}
                  <Text style={[styles.previewLine, { color: theme.text }]}>
                    {t("weight.paceValue", { kg: preview.calories?.weeklyLossKg ?? 0.5 })}
                    {preview.weeks != null ? ` · ${t("weight.etaValue", { count: preview.weeks })}` : ""}
                  </Text>
                  {preview.healthy && (
                    <Text style={[styles.previewHint, { color: theme.subText }]}>
                      {t("weight.healthyRange")}: {t("weight.healthyRangeValue", { min: preview.healthy.min, max: preview.healthy.max })}
                    </Text>
                  )}
                </View>
              )}

              {!!saveError && <Text style={[styles.errorText, { color: theme.water, marginTop: 12 }]}>{saveError}</Text>}

              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: theme.accent }]} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{editing ? t("common.save") : t("weight.setup.start")}</Text>}
              </TouchableOpacity>
              <Text style={[styles.disclaimer, { color: theme.subText }]}>{t("weight.disclaimer")}</Text>
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

function NumberField({ theme, label, unit, value, onChange, placeholder }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      <View style={[styles.inputRow, { borderColor: theme.border, backgroundColor: theme.inputBg }]}>
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          placeholder={placeholder}
          placeholderTextColor={theme.subText}
          maxLength={6}
          style={[styles.input, { color: theme.text }]}
        />
        <Text style={[styles.unit, { color: theme.subText }]}>{unit}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  close: { paddingHorizontal: 20, paddingVertical: 12, alignSelf: "flex-start" },
  blocked: { paddingHorizontal: 24, paddingTop: 20 },
  content: { paddingHorizontal: 24, paddingBottom: 48 },
  title: { fontSize: 30, fontWeight: "900", letterSpacing: -0.5 },
  subtitle: { fontSize: 14, lineHeight: 20, fontWeight: "600", marginTop: 6, marginBottom: 22 },
  field: { marginBottom: 14 },
  label: { fontSize: 14, fontWeight: "800", marginBottom: 8 },
  inputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 16, paddingHorizontal: 16 },
  input: { flex: 1, fontSize: 20, fontWeight: "800", paddingVertical: 12 },
  unit: { fontSize: 15, fontWeight: "800" },
  chips: { flexDirection: "row", gap: 8, marginBottom: 16 },
  chip: { flex: 1, borderWidth: 1.5, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 8, alignItems: "center" },
  chipTitle: { fontSize: 14, fontWeight: "900" },
  chipHint: { fontSize: 10, fontWeight: "600", textAlign: "center", marginTop: 4 },
  ageRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  ageLabel: { fontSize: 12, fontWeight: "700" },
  ageValue: { fontSize: 17, fontWeight: "900", marginTop: 2 },
  ageChange: { fontSize: 14, fontWeight: "800" },
  errorBox: { borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 16 },
  errorText: { fontSize: 13, lineHeight: 19, fontWeight: "700" },
  errorAction: { fontSize: 13, fontWeight: "900", marginTop: 8 },
  preview: { borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 16 },
  previewTitle: { fontSize: 12, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 },
  previewLine: { fontSize: 15, fontWeight: "800", marginTop: 2 },
  previewHint: { fontSize: 12, fontWeight: "600", marginTop: 6 },
  saveBtn: { marginTop: 24, borderRadius: 999, paddingVertical: 17, alignItems: "center" },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  disclaimer: { fontSize: 11, lineHeight: 16, fontWeight: "600", textAlign: "center", marginTop: 14 },
});
