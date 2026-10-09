import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, RefreshControl, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import DiaryAvatar from "../DiaryAvatar";
import { useLanguage } from "../../context/LanguageContext";
import { useTheme } from "../../context/ThemeContext";
import { supabase } from "../../services/supabase";
import { getWeightLogsRange, WEIGHT_PROFILE_FIELDS } from "../../services/weightLogs";
import { calculateCycleState } from "../../utils/cycleEngine";
import { getPreferredCycleLength, getPreferredPeriodLength } from "../../utils/cyclePrediction";
import dayjs from "../../utils/dayjs";
import { getAgeFromBirthDate } from "../../utils/fertilityInsights";
import {
  annotateWeightLogs,
  compareLastTwoCycles,
  computeBmi,
  detectCycleDisruption,
  estimateWeeksToGoal,
  getBmiCategoryKey,
  getDailyCalorieTarget,
  getHealthyWeightRange,
  getLatestWeightInsight,
  getSafeWeeklyLossKg,
  getWeightPhaseGuide,
  getWeightProgress,
  normalizeWeightLogs,
  scaleWeightsForChart,
} from "../../utils/weightStats";
import AddWeightModal from "./AddWeightModal";
import { getWeightTheme } from "./weightTheme";

const CHART_BARS = 10;
const WATER_PHASES = new Set(["luteal", "period"]);
// Same phase colors as the home screen.
const PHASE_COLORS = { period: "#FF4D88", follicular: "#48CAE4", fertile: "#06D6A0", luteal: "#C8B6FF" };

const INSIGHT_STYLE = {
  waterLikely: { icon: "water-outline", tone: "water" },
  loss: { icon: "trending-down-outline", tone: "success" },
  gain: { icon: "trending-up-outline", tone: "accent" },
  stable: { icon: "remove-outline", tone: "accent" },
};

export default function WeightStatisticsScreen({ headerSlot }) {
  const router = useRouter();
  const { t } = useLanguage();
  const { isDark } = useTheme();
  const theme = getWeightTheme(isDark);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [data, setData] = useState(null);
  const hasLoadedOnceRef = useRef(false);

  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const today = dayjs().format("YYYY-MM-DD");
      const [profileRes, cyclesRes, rows] = await Promise.all([
        supabase.from("profiles").select(WEIGHT_PROFILE_FIELDS).eq("id", user.id).maybeSingle(),
        supabase.from("cycles").select("start_date, cycle_length, period_length").eq("user_id", user.id).order("start_date", { ascending: true }),
        getWeightLogsRange(dayjs().subtract(1, "year").format("YYYY-MM-DD"), today),
      ]);

      const profile = profileRes.data || {};
      const cycles = cyclesRes.data || [];
      const cycleRows = cycles.length ? cycles : profile.last_period ? [{ start_date: profile.last_period }] : [];
      const cycleLength = getPreferredCycleLength(cycles, profile);
      const periodLength = getPreferredPeriodLength(cycles, profile);
      const age = getAgeFromBirthDate(profile.birth_date);

      const logs = normalizeWeightLogs(rows);
      const annotated = annotateWeightLogs(logs, cycleRows, { cycleLength, periodLength });
      const latest = annotated[annotated.length - 1] || null;
      // The 7-day average drives every number below: one watery morning should
      // not move the plan.
      const currentKg = latest?.avg ?? null;
      const heightCm = profile.height_cm;
      const targetKg = profile.weight_target_kg;

      const calories = getDailyCalorieTarget({ weightKg: currentKg, heightCm, age, activity: profile.activity_level });
      const weeklyLossKg = calories?.weeklyLossKg ?? getSafeWeeklyLossKg(age);
      const bmi = computeBmi(currentKg, heightCm);
      const lastStart = cycleRows.length ? cycleRows[cycleRows.length - 1].start_date : null;
      const forecast = calculateCycleState({ lastStartDate: lastStart, cycleLength, periodLength });

      setData({
        latest,
        todayKg: latest?.date === today ? latest.weight : null,
        annotated,
        insight: getLatestWeightInsight(annotated),
        comparison: compareLastTwoCycles(logs, cycleRows),
        progress: getWeightProgress({ startKg: profile.weight_start_kg, targetKg, currentKg }),
        calories,
        weeklyLossKg,
        weeks: estimateWeeksToGoal(currentKg, targetKg, weeklyLossKg),
        bmi,
        bmiCategory: getBmiCategoryKey(bmi),
        healthy: getHealthyWeightRange(heightCm, age),
        disruption: detectCycleDisruption({ cycles: cycleRows, weightStartedAt: profile.weight_started_at, fallbackCycleLength: cycleLength }),
        today: forecast
          ? {
              cycleDay: forecast.cycleDay,
              daysLeft: forecast.daysLeft,
              guide: getWeightPhaseGuide({ cycleDay: forecast.cycleDay, cycleLength, periodLength }),
            }
          : null,
        ageMissing: age == null,
      });
    } catch (error) {
      console.log("Weight statistics error:", error);
    } finally {
      if (!hasLoadedOnceRef.current) {
        hasLoadedOnceRef.current = true;
        setLoading(false);
      }
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <LinearGradient colors={theme.pageGradient} style={styles.flex}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      </LinearGradient>
    );
  }

  const latest = data?.latest;
  const chartLogs = (data?.annotated || []).slice(-CHART_BARS);
  const barHeights = scaleWeightsForChart(chartLogs.map((log) => log.weight));
  const insight = data?.insight;
  const insightStyle = insight ? INSIGHT_STYLE[insight.key] : null;
  const toneColor = (tone) => (tone === "water" ? theme.water : tone === "success" ? theme.success : theme.accent);
  const phaseName = (key) => (key ? t(`home.phases.${key}`) : "");

  return (
    <LinearGradient colors={theme.pageGradient} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor="transparent" />
        <ScrollView
          style={styles.container}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        >
          {headerSlot}

          <View style={styles.pageHeader}>
            <Text style={[styles.eyebrow, { color: theme.accent }]}>WEIGHT · CYCLE</Text>
            <Text style={[styles.headerTitle, { color: theme.text }]}>{t("weight.title")}</Text>
            <Text style={[styles.headerSubtitle, { color: theme.subText }]}>{t("weight.subtitle")}</Text>
          </View>

          {/* Hero: latest weigh-in, 7-day average, progress to the target */}
          <LinearGradient colors={theme.heroGradient} start={{ x: 0.05, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <View style={styles.heroGlow} />
            <Text style={styles.heroLabel}>
              {latest ? t("weight.latestLabel", { date: dayjs(latest.date).format("D MMMM") }) : t("weight.noWeighIns")}
            </Text>
            {latest && (
              <>
                <Text style={styles.heroNumber}>
                  {latest.weight} <Text style={styles.heroUnit}>{t("weight.kg")}</Text>
                </Text>
                <Text style={styles.heroSub}>{t("weight.avgLabel", { avg: latest.avg })}</Text>
              </>
            )}

            {data?.progress && (
              <View style={styles.progressBlock}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${Math.max(data.progress.percent, 3)}%` }]} />
                </View>
                <View style={styles.progressRow}>
                  <Text style={styles.progressText}>
                    {data.progress.reached ? t("weight.goalReached") : t("weight.toGoal", { kg: data.progress.remainingKg })}
                  </Text>
                  {data.progress.lostKg > 0 && (
                    <Text style={styles.progressText}>{t("weight.lostSoFar", { kg: data.progress.lostKg })}</Text>
                  )}
                </View>
              </View>
            )}

            <TouchableOpacity style={styles.heroButton} onPress={() => setShowAdd(true)} activeOpacity={0.85}>
              <Ionicons name={data?.todayKg != null ? "create-outline" : "add"} size={18} color={theme.accent} />
              <Text style={[styles.heroButtonText, { color: theme.accent }]}>
                {data?.todayKg != null ? t("weight.updateToday") : t("weight.addToday")}
              </Text>
            </TouchableOpacity>
          </LinearGradient>

          {/* Too strong a deficit can stop periods — the most important card when it shows. */}
          {data?.disruption && (
            <View style={[styles.noticeCard, { backgroundColor: theme.warningSoft, borderColor: theme.warningBorder }]}>
              <Ionicons name="alert-circle-outline" size={22} color={theme.warning} />
              <View style={styles.flex}>
                <Text style={[styles.noticeTitle, { color: theme.warning }]}>
                  {data.disruption.key === "late"
                    ? t("weight.disruption.lateTitle", { count: data.disruption.daysLate })
                    : t("weight.disruption.changedTitle")}
                </Text>
                <Text style={[styles.noticeBody, { color: theme.text }]}>{t("weight.disruption.body")}</Text>
              </View>
            </View>
          )}

          {insight && insightStyle && (
            <View
              style={[
                styles.noticeCard,
                insightStyle.tone === "water"
                  ? { backgroundColor: theme.waterSoft, borderColor: theme.waterBorder }
                  : { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder },
              ]}
            >
              <Ionicons name={insightStyle.icon} size={22} color={toneColor(insightStyle.tone)} />
              <View style={styles.flex}>
                <Text style={[styles.noticeTitle, { color: toneColor(insightStyle.tone) }]}>
                  {t(`weight.insight.${insight.key}Title`, { delta: Math.abs(insight.delta) })}
                </Text>
                <Text style={[styles.noticeBody, { color: theme.text }]}>
                  {t(`weight.insight.${insight.key}Body`, { phase: phaseName(insight.phaseKey) })}
                </Text>
              </View>
            </View>
          )}

          {/* Chart: pink bars fall on luteal / period days, where water retention is common */}
          <LinearGradient colors={theme.cardGradient} style={[styles.card, { borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{t("weight.chartTitle")}</Text>
            {chartLogs.length < 2 ? (
              <Text style={[styles.cardNote, { color: theme.subText }]}>{t("weight.chartEmpty")}</Text>
            ) : (
              <>
                <View style={styles.chartRow}>
                  {chartLogs.map((log, index) => {
                    const color = WATER_PHASES.has(log.phaseKey) ? theme.water : theme.accent;
                    return (
                      <View key={log.date} style={styles.barColumn}>
                        <Text style={[styles.barValue, { color }]} numberOfLines={1}>{log.weight}</Text>
                        <View style={[styles.barTrack, { backgroundColor: theme.track }]}>
                          <View style={[styles.barFill, { height: `${barHeights[index]}%`, backgroundColor: color }]} />
                        </View>
                        <Text style={[styles.barLabel, { color: theme.subText }]} numberOfLines={1}>{dayjs(log.date).format("D/M")}</Text>
                      </View>
                    );
                  })}
                </View>
                <View style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: theme.water }]} />
                  <Text style={[styles.legendText, { color: theme.subText }]}>{t("weight.legendWater")}</Text>
                </View>
                <View style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: theme.accent }]} />
                  <Text style={[styles.legendText, { color: theme.subText }]}>{t("weight.legendOther")}</Text>
                </View>
              </>
            )}
          </LinearGradient>

          {/* Today's phase: stage-specific advice that changes daily, what the
              scale is likely to do today, and today's calorie target. */}
          {data?.today?.guide && (
            <LinearGradient colors={theme.cardGradient} style={[styles.card, { borderColor: theme.border }]}>
              <Text style={[styles.cardEyebrow, { color: theme.water }]}>{t("weight.phaseTipEyebrow")}</Text>
              <View style={styles.phaseTitleRow}>
                <View style={[styles.phaseDot, { backgroundColor: PHASE_COLORS[data.today.guide.phaseKey] }]} />
                <Text style={[styles.cardTitle, styles.phaseTitle, { color: theme.text }]}>{phaseName(data.today.guide.phaseKey)}</Text>
              </View>
              <Text style={[styles.phaseMeta, { color: theme.subText }]}>
                {t("weight.phaseCard.dayOfCycle", { day: data.today.cycleDay })}
                {data.today.guide.phaseKey !== "period" ? ` · ${t("weight.phaseCard.periodIn", { count: data.today.daysLeft })}` : ""}
              </Text>
              <Text style={[styles.cardNote, { color: theme.text }]}>
                {t(`weight.stageTips.${data.today.guide.stageKey}.${data.today.guide.tipKey}`)}
              </Text>
              <View style={[styles.phaseFacts, { borderTopColor: theme.divider }]}>
                <View style={styles.phaseFact}>
                  <Ionicons name="scale-outline" size={16} color={WATER_PHASES.has(data.today.guide.phaseKey) ? theme.water : theme.accent} />
                  <Text style={[styles.phaseFactText, { color: theme.subText }]}>
                    {t(`weight.weighInNotes.${data.today.guide.weighInKey}`)}
                  </Text>
                </View>
                {data.calories && (
                  <View style={styles.phaseFact}>
                    <Ionicons name="flame-outline" size={16} color={theme.accent} />
                    <Text style={[styles.phaseFactText, { color: theme.subText }]}>
                      {t("weight.phaseCard.todayCalories", { kcal: data.calories.target })}
                    </Text>
                  </View>
                )}
              </View>
            </LinearGradient>
          )}

          {data?.comparison && (
            <LinearGradient colors={theme.cardGradient} style={[styles.card, { borderColor: theme.border }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>{t("weight.compareTitle")}</Text>
              <Text style={[styles.compareDelta, { color: data.comparison.delta <= 0 ? theme.success : theme.accent }]}>
                {data.comparison.delta > 0 ? "+" : ""}{data.comparison.delta} {t("weight.kg")}
              </Text>
              <Text style={[styles.cardNote, { color: theme.subText }]}>
                {t("weight.compareBody", { current: data.comparison.currentAvg, previous: data.comparison.previousAvg })}
              </Text>
            </LinearGradient>
          )}

          {/* Plan: every number here is age-aware and floored for safety */}
          <LinearGradient colors={theme.cardGradient} style={[styles.card, { borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{t("weight.planTitle")}</Text>

            {data?.calories ? (
              <PlanRow theme={theme} label={t("weight.dailyCalories")} value={`~${data.calories.target} ${t("weight.kcal")}`} />
            ) : (
              <TouchableOpacity onPress={() => router.push("/weight-setup")} activeOpacity={0.8}>
                <PlanRow theme={theme} label={t("weight.dailyCalories")} value={data?.ageMissing ? t("weight.addAge") : "—"} valueColor={theme.accent} />
              </TouchableOpacity>
            )}
            {data?.calories?.flooredAtMinimum && (
              <Text style={[styles.planHint, { color: theme.subText }]}>{t("weight.caloriesFloored")}</Text>
            )}
            <View style={[styles.divider, { backgroundColor: theme.divider }]} />
            <PlanRow theme={theme} label={t("weight.pace")} value={t("weight.paceValue", { kg: data?.weeklyLossKg ?? 0.5 })} />
            {data?.weeks != null && (
              <>
                <View style={[styles.divider, { backgroundColor: theme.divider }]} />
                <PlanRow theme={theme} label={t("weight.eta")} value={t("weight.etaValue", { count: data.weeks })} />
              </>
            )}
            {data?.bmi != null && (
              <>
                <View style={[styles.divider, { backgroundColor: theme.divider }]} />
                <PlanRow theme={theme} label="BMI" value={`${data.bmi} · ${t(`weight.bmiCategory.${data.bmiCategory}`)}`} />
              </>
            )}
            {data?.healthy && (
              <>
                <View style={[styles.divider, { backgroundColor: theme.divider }]} />
                <PlanRow theme={theme} label={t("weight.healthyRange")} value={t("weight.healthyRangeValue", { min: data.healthy.min, max: data.healthy.max })} />
              </>
            )}
          </LinearGradient>

          <TouchableOpacity
            style={[styles.editButton, { borderColor: theme.accentBorder, backgroundColor: theme.inputBg }]}
            onPress={() => router.push("/weight-setup")}
            activeOpacity={0.85}
          >
            <Ionicons name="options-outline" size={18} color={theme.accent} />
            <Text style={[styles.editButtonText, { color: theme.accent }]}>{t("weight.editSettings")}</Text>
          </TouchableOpacity>

          <Text style={[styles.disclaimer, { color: theme.subText }]}>{t("weight.disclaimer")}</Text>
          <View style={{ height: 100 }} />
        </ScrollView>
      </SafeAreaView>

      <View style={styles.floatingDiaryAvatar}>
        <DiaryAvatar accent={theme.accent} isDark={isDark} size={46} showHint={false} />
      </View>

      <AddWeightModal
        visible={showAdd}
        initialKg={data?.todayKg ?? latest?.weight ?? null}
        onClose={() => setShowAdd(false)}
        onSaved={loadData}
      />
    </LinearGradient>
  );
}

function PlanRow({ theme, label, value, valueColor }) {
  return (
    <View style={styles.planRow}>
      <Text style={[styles.planLabel, { color: theme.subText }]}>{label}</Text>
      <Text style={[styles.planValue, { color: valueColor || theme.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 12 },
  pageHeader: { marginBottom: 20, paddingRight: 70 },
  eyebrow: { fontSize: 9, fontWeight: "900", letterSpacing: 1.1, marginBottom: 6 },
  headerTitle: { fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 13, fontWeight: "600", marginTop: 5 },
  floatingDiaryAvatar: { position: "absolute", top: 54, right: 18, zIndex: 30, elevation: 30 },

  hero: { borderRadius: 30, padding: 24, marginBottom: 18, overflow: "hidden", alignItems: "center" },
  heroGlow: { position: "absolute", top: -50, right: -50, width: 150, height: 150, borderRadius: 75, backgroundColor: "rgba(255,255,255,0.15)" },
  heroLabel: { color: "rgba(255,255,255,0.92)", fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 },
  heroNumber: { color: "#fff", fontSize: 54, fontWeight: "900", lineHeight: 62 },
  heroUnit: { fontSize: 22, fontWeight: "700", color: "rgba(255,255,255,0.85)" },
  heroSub: { color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: "700", marginTop: 2 },
  progressBlock: { alignSelf: "stretch", marginTop: 18 },
  progressTrack: { height: 10, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.28)", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999, backgroundColor: "#FFFFFF" },
  progressRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  progressText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  heroButton: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 18, backgroundColor: "#FFFFFF", borderRadius: 999, paddingVertical: 12, paddingHorizontal: 20 },
  heroButtonText: { fontSize: 14, fontWeight: "900" },

  noticeCard: { flexDirection: "row", gap: 12, borderWidth: 1, borderRadius: 22, padding: 16, marginBottom: 18 },
  noticeTitle: { fontSize: 15, fontWeight: "900", marginBottom: 4 },
  noticeBody: { fontSize: 13, lineHeight: 19, fontWeight: "600" },

  card: { borderRadius: 26, borderWidth: 1, padding: 19, marginBottom: 18 },
  cardEyebrow: { fontSize: 10, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 },
  cardTitle: { fontSize: 17, fontWeight: "900", marginBottom: 8 },
  cardNote: { fontSize: 13, lineHeight: 19, fontWeight: "600" },
  compareDelta: { fontSize: 28, fontWeight: "900", marginBottom: 4 },
  phaseTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  phaseDot: { width: 10, height: 10, borderRadius: 5 },
  phaseTitle: { marginBottom: 2 },
  phaseMeta: { fontSize: 12, fontWeight: "700", marginBottom: 10 },
  phaseFacts: { borderTopWidth: 1, marginTop: 12, paddingTop: 10, gap: 8 },
  phaseFact: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  phaseFactText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: "600" },

  chartRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 8, marginBottom: 14 },
  barColumn: { flex: 1, alignItems: "center" },
  barValue: { fontSize: 9, fontWeight: "800", marginBottom: 6 },
  barTrack: { height: 100, width: 12, borderRadius: 999, justifyContent: "flex-end", overflow: "hidden" },
  barFill: { width: "100%", borderRadius: 10 },
  barLabel: { fontSize: 9, fontWeight: "700", marginTop: 8 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { flex: 1, fontSize: 12, fontWeight: "600" },

  planRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, gap: 12 },
  planLabel: { fontSize: 13, fontWeight: "700", flexShrink: 1 },
  planValue: { fontSize: 14, fontWeight: "900", textAlign: "right", flexShrink: 1 },
  planHint: { fontSize: 12, lineHeight: 17, fontWeight: "600", marginBottom: 6 },
  divider: { height: 1 },

  editButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderRadius: 20, paddingVertical: 14, marginBottom: 14 },
  editButtonText: { fontSize: 14, fontWeight: "800" },
  disclaimer: { fontSize: 11, lineHeight: 16, fontWeight: "600", textAlign: "center", paddingHorizontal: 10 },
});
