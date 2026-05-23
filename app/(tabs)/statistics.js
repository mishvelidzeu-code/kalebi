import dayjs from "dayjs";
import "dayjs/locale/ka";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, RefreshControl, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from "react-native";

import { useTheme } from "../../context/ThemeContext";
import { usePregnancy } from "../../context/PregnancyContext";
import { supabase } from "../../services/supabase";
import { calculateCycleState } from "../../utils/cycleEngine";
import { getPreferredCycleLength, getPreferredPeriodLength } from "../../utils/cyclePrediction";

dayjs.locale("ka");

const SYMPTOM_LABELS = {
  headache: "თავის ტკივილი",
  cramps: "მუცლის ტკივილი",
  fatigue: "დაღლილობა",
  bloating: "შეშუპება",
  backache: "წელის ტკივილი",
  irritable: "გაღიზიანება",
  sad: "სევდა",
  anxious: "შფოთვა",
  happy: "ბედნიერი",
  nausea: "გულისრევა",
  heartburn: "გულძმარვა",
  movement: "ბავშვი იძრვის",
  urination: "ხშირი შარდვა",
};

const PREGNANCY_MILESTONES = [
  { week: 12, label: "I ტრიმესტრი სრულდება", icon: "🌱" },
  { week: 16, label: "სქესის გაგება", icon: "👶" },
  { week: 20, label: "ანატომიური USG", icon: "🔬" },
  { week: 24, label: "ვიაბილობის ზღვარი", icon: "💪" },
  { week: 28, label: "III ტრიმესტრი იწყება", icon: "🌟" },
  { week: 32, label: "ნაყოფი თითქმის მზადაა", icon: "🎯" },
  { week: 36, label: "სრული ვადის მიახლოება", icon: "⏰" },
  { week: 37, label: "სრული ვადა", icon: "✨" },
  { week: 40, label: "მშობიარობის თარიღი", icon: "🎊" },
];

function PregnancyStatisticsScreen() {
  const { isDark } = useTheme();
  const { currentWeek, currentTrimester, daysRemaining, pregnancyStartDate } = usePregnancy();

  const [topSymptoms, setTopSymptoms] = useState([]);
  const [loading, setLoading] = useState(true);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  const theme = {
    bg: isDark ? "#0F0F0F" : "#F7F8FA",
    card: isDark ? "#1A1A1A" : "#FFFFFF",
    text: isDark ? "#FFFFFF" : "#1A1A1A",
    subText: isDark ? "#AAAAAA" : "#777777",
    iconBg: isDark ? "#2A2A2A" : "#F0F4FF",
    divider: isDark ? "#333" : "#F0F0F0",
  };

  const trimesterColor = currentTrimester === 1 ? "#06d6a0" : currentTrimester === 2 ? "#ffd166" : "#ff4d88";
  const progress = ((currentWeek || 1) / 40) * 100;
  const nextMilestone = PREGNANCY_MILESTONES.find((m) => m.week >= (currentWeek || 1));

  useFocusEffect(useCallback(() => {
    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase.from("symptoms").select("symptoms").eq("user_id", user.id);
        const all = (data || []).flatMap((s) => s.symptoms || []);
        const counts = all.reduce((acc, s) => { acc[s] = (acc[s] || 0) + 1; return acc; }, {});
        const top = Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 4).map(([id, count]) => ({ label: SYMPTOM_LABELS[id] || id, count }));
        setTopSymptoms(top);
      } catch (e) { console.log(e); }
      finally {
        setLoading(false);
        Animated.parallel([
          Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
        ]).start();
      }
    };
    load();
  }, [fadeAnim, slideAnim]));

  if (loading) return <View style={[styles.center, { backgroundColor: theme.bg }]}><ActivityIndicator size="large" color={trimesterColor} /></View>;

  const dueDate = pregnancyStartDate ? dayjs(pregnancyStartDate).add(280, "day").format("D MMMM YYYY") : "-";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.bg} />
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>ორსულობის ანალიტიკა 🤰</Text>

        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* Hero */}
          <View style={[styles.heroCard, { backgroundColor: trimesterColor }]}>
            <View style={styles.heroGlow} />
            <Text style={styles.heroLabel}>მშობიარობამდე დარჩა</Text>
            <Text style={styles.heroNumber}>{daysRemaining} <Text style={styles.heroSubText}>დღე</Text></Text>
            <View style={styles.heroDateBadge}>
              <Text style={styles.heroDate}>{dueDate}</Text>
            </View>
          </View>

          {/* Progress */}
          <View style={[styles.chartCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>ორსულობის პროგრესი</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
              <Text style={[{ color: theme.subText, fontSize: 13, fontWeight: "600" }]}>კვირა {currentWeek} / 40</Text>
              <Text style={[{ color: trimesterColor, fontSize: 13, fontWeight: "700" }]}>{Math.round(progress)}%</Text>
            </View>
            <View style={[styles.symptomTrack, { backgroundColor: isDark ? "#2A2A2A" : "#F5F5F5", height: 12, borderRadius: 6 }]}>
              <View style={[styles.symptomFill, { width: `${progress}%`, backgroundColor: trimesterColor, borderRadius: 6 }]} />
            </View>
          </View>

          {/* Trimester Cards */}
          <View style={styles.metricsRow}>
            <View style={[styles.metricCard, { backgroundColor: theme.card }]}>
              <View style={[styles.iconBox, { backgroundColor: isDark ? "#2A2A2A" : "#fff0f5" }]}>
                <Text style={{ fontSize: 20 }}>🗓️</Text>
              </View>
              <Text style={[styles.metricValue, { color: theme.text }]}>{currentWeek}<Text style={styles.metricUnit}> კვ.</Text></Text>
              <Text style={[styles.metricLabel, { color: theme.subText }]}>მიმდინარე კვირა</Text>
            </View>
            <View style={[styles.metricCard, { backgroundColor: theme.card }]}>
              <View style={[styles.iconBox, { backgroundColor: isDark ? "#2A2A2A" : "#fff0f5" }]}>
                <Text style={{ fontSize: 20 }}>
                  {currentTrimester === 1 ? "🌱" : currentTrimester === 2 ? "🌸" : "🌟"}
                </Text>
              </View>
              <Text style={[styles.metricValue, { color: trimesterColor, fontSize: 22 }]}>
                {currentTrimester === 1 ? "I" : currentTrimester === 2 ? "II" : "III"}
              </Text>
              <Text style={[styles.metricLabel, { color: theme.subText }]}>ტრიმესტრი</Text>
            </View>
          </View>

          {/* Next Milestone */}
          {nextMilestone && nextMilestone.week > (currentWeek || 1) && (
            <View style={[styles.datesCard, { backgroundColor: theme.card }]}>
              <View style={styles.dateItem}>
                <Text style={styles.dateIcon}>{nextMilestone.icon}</Text>
                <View>
                  <Text style={[styles.dateLabel, { color: theme.subText }]}>მომდევნო მილსტოუნი — კვირა {nextMilestone.week}</Text>
                  <Text style={[styles.dateValue, { color: theme.text }]}>{nextMilestone.label}</Text>
                </View>
              </View>
            </View>
          )}

          {/* Symptoms */}
          {topSymptoms.length > 0 && (
            <View style={[styles.symptomsCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>ხშირი სიმპტომები</Text>
              {topSymptoms.map((s, i) => {
                const maxCount = topSymptoms[0].count;
                const percent = (s.count / maxCount) * 100;
                return (
                  <View key={i} style={styles.symptomRow}>
                    <View style={styles.symptomHeader}>
                      <Text style={[styles.symptomName, { color: theme.text }]}>{s.label}</Text>
                      <Text style={[styles.symptomCount, { color: trimesterColor }]}>{s.count}-ჯერ</Text>
                    </View>
                    <View style={[styles.symptomTrack, { backgroundColor: isDark ? "#2A2A2A" : "#F5F5F5" }]}>
                      <View style={[styles.symptomFill, { width: `${percent}%`, backgroundColor: trimesterColor }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <View style={{ height: 100 }} />
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const AnimatedBar = ({ value, maxValue, label, index, isDark }) => {
  const heightAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(heightAnim, {
      toValue: (value / maxValue) * 100,
      friction: 6,
      tension: 40,
      delay: index * 100,
      useNativeDriver: false,
    }).start();
  }, [heightAnim, index, maxValue, value]);

  return (
    <View style={styles.barWrapper}>
      <Text style={[styles.barValue, { color: "#E94560" }]}>{value}</Text>
      <View style={[styles.barTrack, { backgroundColor: isDark ? "#2A2A2A" : "#FFF0F5" }]}>
        <Animated.View
          style={[
            styles.barFill,
            {
              backgroundColor: "#E94560",
              height: heightAnim.interpolate({
                inputRange: [0, 100],
                outputRange: ["0%", "100%"],
              }),
            },
          ]}
        />
      </View>
      <Text style={[styles.barLabel, { color: isDark ? "#888" : "#999" }]}>{label}</Text>
    </View>
  );
};

export default function StatisticsScreen() {
  const { isDark } = useTheme();
  const { pregnancyMode } = usePregnancy();

  if (pregnancyMode) return <PregnancyStatisticsScreen />;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedOnceRef = useRef(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const [stats, setStats] = useState({
    avgCycle: 28,
    avgPeriod: 5,
    cyclesCount: 0,
    nextPeriod: "-",
    daysLeft: null,
    ovulationDay: "-",
    fertileWindow: "-",
    topSymptoms: [],
    history: [],
  });

  const theme = {
    bg: isDark ? "#0F0F0F" : "#F7F8FA",
    card: isDark ? "#1A1A1A" : "#FFFFFF",
    text: isDark ? "#FFFFFF" : "#1A1A1A",
    subText: isDark ? "#AAAAAA" : "#777777",
    iconBg: isDark ? "#2A2A2A" : "#F0F4FF",
    divider: isDark ? "#333" : "#F0F0F0",
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAllStats();
    setRefreshing(false);
  };

  const startEntranceAnimation = useCallback(() => {
    fadeAnim.setValue(0);
    slideAnim.setValue(30);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const loadAllStats = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const [cyclesRes, profileRes, symptomsRes] = await Promise.all([
        supabase.from("cycles").select("*").eq("user_id", user.id).order("start_date", { ascending: true }),
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("symptoms").select("symptoms").eq("user_id", user.id),
      ]);

      const cycles = cyclesRes.data || [];
      const profile = profileRes.data;
      const symptomsData = symptomsRes.data || [];

      const avgC = getPreferredCycleLength(cycles, profile);
      const avgP = getPreferredPeriodLength(cycles, profile);

      const lastStart = cycles.length > 0 ? cycles[cycles.length - 1].start_date : profile?.last_period;
      const forecast = calculateCycleState({
        lastStartDate: lastStart,
        cycleLength: avgC,
        periodLength: avgP,
      });

      if (!forecast) {
        setStats((prev) => ({
          ...prev,
          avgCycle: avgC,
          avgPeriod: avgP,
          cyclesCount: cycles.length,
          nextPeriod: "-",
          daysLeft: null,
          ovulationDay: "-",
          fertileWindow: "-",
          topSymptoms: [],
          history: [],
        }));
        return;
      }

      const allSymptoms = symptomsData.flatMap((s) => s.symptoms || []);
      const counts = allSymptoms.reduce((acc, curr) => {
        acc[curr] = (acc[curr] || 0) + 1;
        return acc;
      }, {});

      const topSymptoms = Object.entries(counts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 4)
        .map(([id, count]) => ({ label: SYMPTOM_LABELS[id] || id, count }));

      const history = cycles.slice(-6).map((c) => ({
        month: dayjs(c.start_date).format("MMM"),
        length: c.cycle_length || avgC,
      }));

      if (history.length === 0 && profile?.cycle_length) {
        history.push({ month: dayjs().format("MMM"), length: profile.cycle_length });
      }

      setStats({
        avgCycle: avgC,
        avgPeriod: avgP,
        cyclesCount: cycles.length,
        nextPeriod: forecast.nextPeriod.format("D MMMM"),
        daysLeft: forecast.daysLeft,
        ovulationDay: forecast.ovulation.format("D MMMM"),
        fertileWindow: `${forecast.fertileStart.format("D")} - ${forecast.fertileEnd.format("D MMM")}`,
        topSymptoms,
        history,
      });

      startEntranceAnimation();
    } catch (err) {
      console.log("Statistics error:", err);
    } finally {
      if (!hasLoadedOnceRef.current) {
        setLoading(false);
        hasLoadedOnceRef.current = true;
      }
    }
  }, [startEntranceAnimation]);

  useFocusEffect(
    useCallback(() => {
      loadAllStats();
    }, [loadAllStats])
  );

  if (loading && !refreshing) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color="#E94560" />
      </View>
    );
  }

  const maxChartValue = Math.max(...stats.history.map((h) => h.length), 40);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.bg} />
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isDark ? "#E94560" : "#ff4d88"} />}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>შენი ანალიტიკა ✨</Text>

        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <View style={[styles.heroCard, { backgroundColor: "#E94560" }]}>
            <View style={styles.heroGlow} />
            <Text style={styles.heroLabel}>მომდევნო პერიოდამდე დარჩა</Text>
            <Text style={styles.heroNumber}>
              {stats.daysLeft} <Text style={styles.heroSubText}>დღე</Text>
            </Text>
            <View style={styles.heroDateBadge}>
              <Text style={styles.heroDate}>{stats.nextPeriod}</Text>
            </View>
          </View>

          {stats.history.length > 0 && (
            <View style={[styles.chartCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>ციკლის დინამიკა (დღეები)</Text>
              <View style={styles.chartContainer}>
                {stats.history.map((item, index) => (
                  <AnimatedBar key={index} index={index} value={item.length} maxValue={maxChartValue} label={item.month} isDark={isDark} />
                ))}
              </View>
            </View>
          )}

          <View style={styles.metricsRow}>
            <View style={[styles.metricCard, { backgroundColor: theme.card }]}>
              <View style={[styles.iconBox, { backgroundColor: theme.iconBg }]}>
                <Text style={{ fontSize: 20 }}>🔄</Text>
              </View>
              <Text style={[styles.metricValue, { color: theme.text }]}>
                {stats.avgCycle} <Text style={styles.metricUnit}>დღე</Text>
              </Text>
              <Text style={[styles.metricLabel, { color: theme.subText }]}>საშ. ციკლი</Text>
            </View>
            <View style={[styles.metricCard, { backgroundColor: theme.card }]}>
              <View style={[styles.iconBox, { backgroundColor: isDark ? theme.iconBg : "#ffe4e1" }]}>
                <Text style={{ fontSize: 20 }}>🩸</Text>
              </View>
              <Text style={[styles.metricValue, { color: theme.text }]}>
                {stats.avgPeriod} <Text style={styles.metricUnit}>დღე</Text>
              </Text>
              <Text style={[styles.metricLabel, { color: theme.subText }]}>საშ. პერიოდი</Text>
            </View>
          </View>

          <View style={[styles.datesCard, { backgroundColor: theme.card }]}>
            <View style={styles.dateItem}>
              <Text style={styles.dateIcon}>🌸</Text>
              <View>
                <Text style={[styles.dateLabel, { color: theme.subText }]}>ოვულაცია</Text>
                <Text style={[styles.dateValue, { color: theme.text }]}>{stats.ovulationDay}</Text>
              </View>
            </View>
            <View style={[styles.dateDivider, { backgroundColor: theme.divider }]} />
            <View style={styles.dateItem}>
              <Text style={styles.dateIcon}>✨</Text>
              <View>
                <Text style={[styles.dateLabel, { color: theme.subText }]}>ნაყოფიერი დღეები</Text>
                <Text style={[styles.dateValue, { color: theme.text }]}>{stats.fertileWindow}</Text>
              </View>
            </View>
          </View>

          {stats.topSymptoms.length > 0 && (
            <View style={[styles.symptomsCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>ხშირი სიმპტომები</Text>
              {stats.topSymptoms.map((s, i) => {
                const maxCount = stats.topSymptoms[0].count;
                const percent = (s.count / maxCount) * 100;

                return (
                  <View key={i} style={styles.symptomRow}>
                    <View style={styles.symptomHeader}>
                      <Text style={[styles.symptomName, { color: theme.text }]}>{s.label}</Text>
                      <Text style={[styles.symptomCount, { color: "#E94560" }]}>{s.count}-ჯერ</Text>
                    </View>
                    <View style={[styles.symptomTrack, { backgroundColor: isDark ? "#2A2A2A" : "#F5F5F5" }]}>
                      <View style={[styles.symptomFill, { width: `${percent}%`, backgroundColor: "#E94560" }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <View style={{ height: 100 }} />
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 10 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  headerTitle: { fontSize: 32, fontWeight: "900", marginBottom: 25, letterSpacing: -0.5 },
  heroCard: { borderRadius: 32, padding: 35, alignItems: "center", marginBottom: 25, overflow: "hidden", elevation: 10, shadowColor: "#E94560", shadowOpacity: 0.4, shadowRadius: 20 },
  heroGlow: { position: "absolute", top: -50, right: -50, width: 150, height: 150, borderRadius: 75, backgroundColor: "rgba(255,255,255,0.15)" },
  heroLabel: { color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 },
  heroNumber: { color: "#fff", fontSize: 64, fontWeight: "900", lineHeight: 70 },
  heroSubText: { fontSize: 24, fontWeight: "600", color: "rgba(255,255,255,0.8)" },
  heroDateBadge: { marginTop: 15, backgroundColor: "rgba(0,0,0,0.15)", paddingVertical: 8, paddingHorizontal: 20, borderRadius: 20 },
  heroDate: { color: "#fff", fontSize: 15, fontWeight: "600" },
  chartCard: { borderRadius: 28, padding: 25, marginBottom: 20, elevation: 4 },
  cardTitle: { fontSize: 18, fontWeight: "800", marginBottom: 25 },
  chartContainer: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", height: 160, paddingHorizontal: 10 },
  barWrapper: { alignItems: "center", width: 40 },
  barValue: { fontSize: 12, fontWeight: "700", marginBottom: 8 },
  barTrack: { height: 100, width: 14, borderRadius: 10, justifyContent: "flex-end", overflow: "hidden" },
  barFill: { width: "100%", borderRadius: 10 },
  barLabel: { fontSize: 11, marginTop: 10, fontWeight: "600" },
  metricsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  metricCard: { width: "48%", padding: 20, borderRadius: 28, elevation: 4 },
  iconBox: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center", marginBottom: 15 },
  metricValue: { fontSize: 28, fontWeight: "800" },
  metricUnit: { fontSize: 14, fontWeight: "600", color: "#999" },
  metricLabel: { fontSize: 13, marginTop: 5, fontWeight: "600" },
  datesCard: { borderRadius: 28, padding: 25, marginBottom: 20, elevation: 4 },
  dateItem: { flexDirection: "row", alignItems: "center" },
  dateIcon: { fontSize: 32, marginRight: 15 },
  dateLabel: { fontSize: 13, fontWeight: "600", marginBottom: 4 },
  dateValue: { fontSize: 17, fontWeight: "800" },
  dateDivider: { height: 1, marginVertical: 20 },
  symptomsCard: { borderRadius: 28, padding: 25, marginBottom: 20, elevation: 4 },
  symptomRow: { marginBottom: 18 },
  symptomHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  symptomName: { fontSize: 15, fontWeight: "600" },
  symptomCount: { fontSize: 13, fontWeight: "700" },
  symptomTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
  symptomFill: { height: "100%", borderRadius: 4 },
});
