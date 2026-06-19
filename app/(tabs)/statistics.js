import dayjs from "dayjs";
import "dayjs/locale/ka";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, RefreshControl, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from "react-native";

import { useTheme } from "../../context/ThemeContext";
import { usePregnancy } from "../../context/PregnancyContext";
import DiaryAvatar from "../../components/DiaryAvatar";
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
    bg: isDark ? "#181015" : "#FFF8FA",
    card: isDark ? "rgba(36,24,31,0.84)" : "rgba(255,255,255,0.74)",
    text: isDark ? "#FFF5F8" : "#2F2026",
    subText: isDark ? "#D7B9C4" : "#8E6273",
    iconBg: isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.6)",
    divider: isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.65)",
    border: isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.82)",
    accent: "#ff4d88",
    activeSoft: isDark ? "rgba(255,77,136,0.18)" : "rgba(255,77,136,0.12)",
    activeBorder: isDark ? "rgba(255,144,177,0.35)" : "rgba(255,77,136,0.35)",
    cardGradient: isDark ? ["rgba(58,38,48,0.94)", "rgba(28,18,24,0.84)"] : ["rgba(255,255,255,0.9)", "rgba(255,234,241,0.82)"],
    heroGradient: isDark ? ["#FF6F9F", "#B83360", "#2B1721"] : ["#FFB8CE", "#FF6F9F", "#E64E82"],
    track: isDark ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.58)",
  };

  const trimesterColor = theme.accent;
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

  if (loading) {
    return (
      <LinearGradient colors={isDark ? ["#25151B", "#140E12", "#120C10"] : ["#FFFDFC", "#FFEFF4", "#F8B5C9"]} style={{ flex: 1 }}>
        <View style={[styles.center, { backgroundColor: "transparent" }]}>
          <ActivityIndicator size="large" color={trimesterColor} />
        </View>
      </LinearGradient>
    );
  }

  const dueDate = pregnancyStartDate ? dayjs(pregnancyStartDate).add(280, "day").format("D MMMM YYYY") : "-";

  return (
    <LinearGradient
      colors={isDark ? ["#25151B", "#140E12", "#120C10"] : ["#FFFDFC", "#FFEFF4", "#F8B5C9"]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor="transparent" />
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.pageHeader}>
          <View>
            <Text style={[styles.pageEyebrow, { color: theme.accent }]}>MATERNITY INSIGHTS</Text>
            <Text style={[styles.headerTitle, { color: theme.text }]}>ორსულობის ანალიტიკა</Text>
            <Text style={[styles.pageSubtitle, { color: theme.subText }]}>შენი პროგრესი და მნიშვნელოვანი ეტაპები</Text>
          </View>
        </View>

        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* Hero */}
          <LinearGradient colors={theme.heroGradient} start={{ x: 0.08, y: 0 }} end={{ x: 0.95, y: 1 }} style={[styles.heroCard, { borderColor: theme.border, borderWidth: 1 }]}>
            <View style={styles.heroGlow} />
            <Text style={styles.heroLabel}>მშობიარობამდე დარჩა</Text>
            <Text style={styles.heroNumber}>{daysRemaining} <Text style={styles.heroSubText}>დღე</Text></Text>
            <View style={styles.heroDateBadge}>
              <Text style={styles.heroDate}>{dueDate}</Text>
            </View>
          </LinearGradient>

          {/* Progress */}
          <LinearGradient colors={theme.cardGradient} style={[styles.chartCard, { borderColor: theme.border, borderWidth: 1 }]}>
            <View style={styles.cardHeaderRow}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>ორსულობის პროგრესი</Text>
              <View style={[styles.cardHeaderIcon, { backgroundColor: theme.activeSoft, borderColor: theme.activeBorder, borderWidth: 1 }]}>
                <Ionicons name="trending-up-outline" size={17} color={trimesterColor} />
              </View>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
              <Text style={[{ color: theme.subText, fontSize: 13, fontWeight: "600" }]}>კვირა {currentWeek} / 40</Text>
              <Text style={[{ color: trimesterColor, fontSize: 13, fontWeight: "700" }]}>{Math.round(progress)}%</Text>
            </View>
            <View style={[styles.symptomTrack, { backgroundColor: theme.track, height: 12, borderRadius: 6 }]}>
              <View style={[styles.symptomFill, { width: `${progress}%`, backgroundColor: trimesterColor, borderRadius: 6 }]} />
            </View>
          </LinearGradient>

          {/* Trimester Cards */}
          <View style={styles.metricsRow}>
            <LinearGradient colors={theme.cardGradient} style={[styles.metricCard, { borderColor: theme.border, borderWidth: 1 }]}>
              <View style={[styles.iconBox, { backgroundColor: theme.iconBg }]}>
                <Text style={{ fontSize: 20 }}>🗓️</Text>
              </View>
              <Text style={[styles.metricValue, { color: theme.text }]}>{currentWeek}<Text style={styles.metricUnit}> კვ.</Text></Text>
              <Text style={[styles.metricLabel, { color: theme.subText }]}>მიმდინარე კვირა</Text>
            </LinearGradient>
            <LinearGradient colors={theme.cardGradient} style={[styles.metricCard, { borderColor: theme.border, borderWidth: 1 }]}>
              <View style={[styles.iconBox, { backgroundColor: theme.iconBg }]}>
                <Text style={{ fontSize: 20 }}>
                  {currentTrimester === 1 ? "🌱" : currentTrimester === 2 ? "🌸" : "🌟"}
                </Text>
              </View>
              <Text style={[styles.metricValue, { color: trimesterColor, fontSize: 22 }]}>
                {currentTrimester === 1 ? "I" : currentTrimester === 2 ? "II" : "III"}
              </Text>
              <Text style={[styles.metricLabel, { color: theme.subText }]}>ტრიმესტრი</Text>
            </LinearGradient>
          </View>

          {/* Next Milestone */}
          {nextMilestone && nextMilestone.week > (currentWeek || 1) && (
            <LinearGradient colors={theme.cardGradient} style={[styles.datesCard, { borderColor: theme.border, borderWidth: 1 }]}>
              <View style={styles.dateItem}>
                <Text style={styles.dateIcon}>{nextMilestone.icon}</Text>
                <View>
                  <Text style={[styles.dateLabel, { color: theme.subText }]}>მომდევნო მილსტოუნი — კვირა {nextMilestone.week}</Text>
                  <Text style={[styles.dateValue, { color: theme.text }]}>{nextMilestone.label}</Text>
                </View>
              </View>
            </LinearGradient>
          )}

          {/* Symptoms */}
          {topSymptoms.length > 0 && (
            <LinearGradient colors={theme.cardGradient} style={[styles.symptomsCard, { borderColor: theme.border, borderWidth: 1 }]}>
              <View style={styles.cardHeaderRow}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>ხშირი სიმპტომები</Text>
                <View style={[styles.cardHeaderIcon, { backgroundColor: theme.activeSoft, borderColor: theme.activeBorder, borderWidth: 1 }]}>
                  <Ionicons name="pulse-outline" size={17} color={trimesterColor} />
                </View>
              </View>
              {topSymptoms.map((s, i) => {
                const maxCount = topSymptoms[0].count;
                const percent = (s.count / maxCount) * 100;
                return (
                  <View key={i} style={styles.symptomRow}>
                    <View style={styles.symptomHeader}>
                      <Text style={[styles.symptomName, { color: theme.text }]}>{s.label}</Text>
                      <Text style={[styles.symptomCount, { color: trimesterColor }]}>{s.count}-ჯერ</Text>
                    </View>
                    <View style={[styles.symptomTrack, { backgroundColor: theme.track }]}>
                      <View style={[styles.symptomFill, { width: `${percent}%`, backgroundColor: trimesterColor }]} />
                    </View>
                  </View>
                );
              })}
            </LinearGradient>
          )}

          <View style={{ height: 100 }} />
        </Animated.View>
        </ScrollView>
      </SafeAreaView>
      <View style={styles.floatingDiaryAvatar}>
        <DiaryAvatar accent={theme.accent} isDark={isDark} size={46} showHint={false} />
      </View>
    </LinearGradient>
  );
}

const AnimatedBar = ({ value, maxValue, label, index, isDark, accent = "#FF4D88", trackColor }) => {
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
      <Text style={[styles.barValue, { color: accent }]}>{value}</Text>
      <View style={[styles.barTrack, { backgroundColor: trackColor || (isDark ? "#2A2A2A" : "#FFF0F5") }]}>
        <Animated.View
          style={[
            styles.barFill,
            {
              backgroundColor: accent,
              height: heightAnim.interpolate({
                inputRange: [0, 100],
                outputRange: ["0%", "100%"],
              }),
            },
          ]}
        />
      </View>
      <Text style={[styles.barLabel, { color: isDark ? "#D5BFC8" : "#9E7281" }]}>{label}</Text>
    </View>
  );
};

function RegularStatisticsScreen() {
  const { isDark } = useTheme();

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
    bg: isDark ? "#211621" : "#FFFDFC",
    card: isDark ? "rgba(55,40,58,0.86)" : "rgba(255,255,255,0.78)",
    text: isDark ? "#FFF7FB" : "#2F2026",
    subText: isDark ? "#E9C7D4" : "#8F6574",
    iconBg: isDark ? "rgba(255,209,224,0.10)" : "rgba(255,255,255,0.58)",
    divider: isDark ? "rgba(255,209,224,0.12)" : "rgba(255,255,255,0.64)",
    border: isDark ? "rgba(255,209,224,0.16)" : "rgba(255,255,255,0.78)",
    accent: "#FF4D88",
    peach: "#FF9E7D",
    track: isDark ? "rgba(255,209,224,0.10)" : "rgba(255,255,255,0.58)",
    activeSoft: isDark ? "rgba(255,77,136,0.18)" : "rgba(255,77,136,0.12)",
    activeBorder: isDark ? "rgba(255,144,177,0.35)" : "rgba(255,77,136,0.35)",
    pageGradient: isDark ? ["#2A1B2A", "#211621", "#17151D"] : ["#FFFDFC", "#FFF1EB", "#F6F0FF"],
    cardGradient: isDark
      ? ["rgba(68,48,70,0.96)", "rgba(35,26,42,0.94)"]
      : ["rgba(255,255,255,0.94)", "rgba(255,240,232,0.84)", "rgba(246,240,255,0.82)"],
    heroGradient: isDark ? ["#56364F", "#3A2A44", "#241A2B"] : ["#FF9E7D", "#FF7EA8", "#B8A4FF"],
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
      <LinearGradient colors={theme.pageGradient} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ flex: 1 }}>
        <View style={[styles.center, { backgroundColor: "transparent" }]}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      </LinearGradient>
    );
  }

  const maxChartValue = Math.max(...stats.history.map((h) => h.length), 40);

  return (
    <LinearGradient colors={theme.pageGradient} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ flex: 1 }}>
    <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor="transparent" />
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}>
        <View style={styles.pageHeader}>
          <View>
            <Text style={[styles.pageEyebrow, { color: theme.peach }]}>CYCLE INSIGHTS</Text>
            <Text style={[styles.headerTitle, { color: theme.text }]}>შენი ანალიტიკა</Text>
            <Text style={[styles.pageSubtitle, { color: theme.subText }]}>ციკლის დინამიკა და პერსონალური მაჩვენებლები</Text>
          </View>
        </View>

        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <LinearGradient
            colors={theme.heroGradient}
            start={{ x: 0.05, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.heroCard, { borderColor: theme.border, borderWidth: 1 }]}
          >
            <View style={styles.heroGlow} />
            <Text style={styles.heroLabel}>მომდევნო პერიოდამდე დარჩა</Text>
            <Text style={styles.heroNumber}>
              {stats.daysLeft} <Text style={styles.heroSubText}>დღე</Text>
            </Text>
            <View style={styles.heroDateBadge}>
              <Text style={styles.heroDate}>{stats.nextPeriod}</Text>
            </View>
          </LinearGradient>

          {stats.history.length > 0 && (
            <LinearGradient colors={theme.cardGradient} style={[styles.chartCard, { borderColor: theme.border, borderWidth: 1 }]}>
              <View style={styles.cardHeaderRow}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>ციკლის დინამიკა</Text>
                <View style={[styles.cardHeaderIcon, { backgroundColor: theme.activeSoft, borderColor: theme.activeBorder, borderWidth: 1 }]}>
                  <Ionicons name="stats-chart-outline" size={17} color={theme.accent} />
                </View>
              </View>
              <Text style={[styles.cardSubtitle, { color: theme.subText }]}>ბოლო ჩანაწერები დღეების მიხედვით</Text>
              <View style={styles.chartContainer}>
                {stats.history.map((item, index) => (
                  <AnimatedBar key={index} index={index} value={item.length} maxValue={maxChartValue} label={item.month} isDark={isDark} accent={theme.accent} trackColor={theme.track} />
                ))}
              </View>
            </LinearGradient>
          )}

          <View style={styles.metricsRow}>
            <LinearGradient colors={theme.cardGradient} style={[styles.metricCard, { borderColor: theme.border, borderWidth: 1 }]}>
              <View style={[styles.iconBox, { backgroundColor: theme.iconBg }]}>
                <Text style={{ fontSize: 20 }}>🔄</Text>
              </View>
              <Text style={[styles.metricValue, { color: theme.text }]}>
                {stats.avgCycle} <Text style={styles.metricUnit}>დღე</Text>
              </Text>
              <Text style={[styles.metricLabel, { color: theme.subText }]}>საშ. ციკლი</Text>
            </LinearGradient>
            <LinearGradient colors={theme.cardGradient} style={[styles.metricCard, { borderColor: theme.border, borderWidth: 1 }]}>
              <View style={[styles.iconBox, { backgroundColor: theme.activeSoft }]}>
                <Text style={{ fontSize: 20 }}>🩸</Text>
              </View>
              <Text style={[styles.metricValue, { color: theme.text }]}>
                {stats.avgPeriod} <Text style={styles.metricUnit}>დღე</Text>
              </Text>
              <Text style={[styles.metricLabel, { color: theme.subText }]}>საშ. პერიოდი</Text>
            </LinearGradient>
          </View>

          <LinearGradient colors={theme.cardGradient} style={[styles.datesCard, { borderColor: theme.border, borderWidth: 1 }]}>
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
          </LinearGradient>

          {stats.topSymptoms.length > 0 && (
            <LinearGradient colors={theme.cardGradient} style={[styles.symptomsCard, { borderColor: theme.border, borderWidth: 1 }]}>
              <View style={styles.cardHeaderRow}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>ხშირი სიმპტომები</Text>
                <View style={[styles.cardHeaderIcon, { backgroundColor: theme.activeSoft, borderColor: theme.activeBorder, borderWidth: 1 }]}>
                  <Ionicons name="pulse-outline" size={17} color={theme.accent} />
                </View>
              </View>
              {stats.topSymptoms.map((s, i) => {
                const maxCount = stats.topSymptoms[0].count;
                const percent = (s.count / maxCount) * 100;

                return (
                  <View key={i} style={styles.symptomRow}>
                    <View style={styles.symptomHeader}>
                      <Text style={[styles.symptomName, { color: theme.text }]}>{s.label}</Text>
                      <Text style={[styles.symptomCount, { color: theme.accent }]}>{s.count}-ჯერ</Text>
                    </View>
                    <View style={[styles.symptomTrack, { backgroundColor: theme.track }]}>
                      <View style={[styles.symptomFill, { width: `${percent}%`, backgroundColor: theme.accent }]} />
                    </View>
                  </View>
                );
              })}
            </LinearGradient>
          )}

          <View style={{ height: 100 }} />
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
    <View style={styles.floatingDiaryAvatar}>
      <DiaryAvatar accent={theme.accent} isDark={isDark} size={46} showHint={false} />
    </View>
    </LinearGradient>
  );
}

export default function StatisticsScreen() {
  const { pregnancyMode } = usePregnancy();
  return pregnancyMode ? <PregnancyStatisticsScreen /> : <RegularStatisticsScreen />;
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 12 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  pageHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 22, paddingRight: 70 },
  pageEyebrow: { color: "#FF8A6B", fontSize: 9, fontWeight: "900", letterSpacing: 1.1, marginBottom: 6 },
  pageSubtitle: { fontSize: 13, fontWeight: "600", marginTop: 5 },
  pageHeaderIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.55)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#D98976",
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  floatingDiaryAvatar: { position: "absolute", top: 54, right: 18, zIndex: 30, elevation: 30 },
  headerTitle: { fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  heroCard: {
    borderRadius: 30,
    padding: 30,
    alignItems: "center",
    marginBottom: 20,
    overflow: "hidden",
    elevation: 8,
    shadowColor: "#D98976",
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
  },
  heroGlow: { position: "absolute", top: -50, right: -50, width: 150, height: 150, borderRadius: 75, backgroundColor: "rgba(255,255,255,0.15)" },
  heroLabel: { color: "rgba(255,255,255,0.9)", fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1.4, marginBottom: 9 },
  heroNumber: { color: "#fff", fontSize: 60, fontWeight: "900", lineHeight: 66 },
  heroSubText: { fontSize: 22, fontWeight: "700", color: "rgba(255,255,255,0.82)" },
  heroDateBadge: { marginTop: 14, backgroundColor: "rgba(0,0,0,0.14)", paddingVertical: 8, paddingHorizontal: 18, borderRadius: 999 },
  heroDate: { color: "#fff", fontSize: 14, fontWeight: "700" },
  chartCard: {
    borderRadius: 26,
    padding: 19,
    marginBottom: 18,
    elevation: 3,
    shadowColor: "#D98976",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 15 },
  cardHeaderIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: "rgba(233,69,96,0.11)", alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 17, fontWeight: "900" },
  cardSubtitle: { fontSize: 12, fontWeight: "600", marginTop: -7, marginBottom: 12 },
  chartContainer: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", height: 160, paddingHorizontal: 10 },
  barWrapper: { alignItems: "center", width: 40 },
  barValue: { fontSize: 12, fontWeight: "800", marginBottom: 8 },
  barTrack: { height: 100, width: 12, borderRadius: 999, justifyContent: "flex-end", overflow: "hidden" },
  barFill: { width: "100%", borderRadius: 10 },
  barLabel: { fontSize: 11, marginTop: 10, fontWeight: "700" },
  metricsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  metricCard: {
    width: "48%",
    padding: 17,
    borderRadius: 24,
    elevation: 3,
    shadowColor: "#D98976",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  iconBox: { width: 40, height: 40, borderRadius: 13, justifyContent: "center", alignItems: "center", marginBottom: 13 },
  metricValue: { fontSize: 27, fontWeight: "900" },
  metricUnit: { fontSize: 13, fontWeight: "700", color: "#999" },
  metricLabel: { fontSize: 12, marginTop: 5, fontWeight: "700" },
  datesCard: {
    borderRadius: 26,
    padding: 19,
    marginBottom: 18,
    elevation: 3,
    shadowColor: "#D98976",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  dateItem: { flexDirection: "row", alignItems: "center" },
  dateIcon: { fontSize: 28, marginRight: 14 },
  dateLabel: { fontSize: 12, fontWeight: "700", marginBottom: 4 },
  dateValue: { fontSize: 16, fontWeight: "900" },
  dateDivider: { height: 1, marginVertical: 17 },
  symptomsCard: {
    borderRadius: 26,
    padding: 19,
    marginBottom: 18,
    elevation: 3,
    shadowColor: "#D98976",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  symptomRow: { marginBottom: 16 },
  symptomHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  symptomName: { fontSize: 14, fontWeight: "700" },
  symptomCount: { fontSize: 12, fontWeight: "800" },
  symptomTrack: { height: 7, borderRadius: 999, overflow: "hidden" },
  symptomFill: { height: "100%", borderRadius: 999 },
});
