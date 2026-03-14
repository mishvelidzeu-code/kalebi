import dayjs from "dayjs";
import "dayjs/locale/ka";
import { BlurView } from "expo-blur";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";

import { useTheme } from "../../context/ThemeContext";
import { supabase } from "../../services/supabase";
import { calculateAverageCycle, calculateAveragePeriod } from "../../utils/cyclePrediction";

dayjs.locale("ka");

const { width } = Dimensions.get("window");

const SYMPTOM_LABELS = {
  headache: "თავის ტკივილი",
  cramps: "მუცლის ტკივილი",
  fatigue: "დაღლილობა",
  bloating: "შეშუპება",
  backache: "წელის ტკივილი",
  irritable: "გაღიზიანება",
  sad: "სევდა",
  anxious: "შფოთვა",
  happy: "ბედნიერი"
};

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
  }, [value]);

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
                outputRange: ['0%', '100%']
              }) 
            }
          ]} 
        />
      </View>
      <Text style={[styles.barLabel, { color: isDark ? "#888" : "#999" }]}>{label}</Text>
    </View>
  );
};

export default function StatisticsScreen() {
  const router = useRouter();
  const { isPremium, isDark } = useTheme(); 
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false); // 👈 ჩამოსქროლვის სტეიტი

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
    history: []
  });

  const theme = {
    bg: isDark ? "#0F0F0F" : "#F7F8FA",
    card: isDark ? "#1A1A1A" : "#FFFFFF",
    text: isDark ? "#FFFFFF" : "#1A1A1A",
    subText: isDark ? "#AAAAAA" : "#777777",
    iconBg: isDark ? "#2A2A2A" : "#F0F4FF",
    divider: isDark ? "#333" : "#F0F0F0",
  };

  // 👈 ავტომატური განახლება ამ ტაბზე გადმოსვლისას
  useFocusEffect(
    useCallback(() => {
      loadAllStats();
    }, [])
  );

  // 👈 ჩამოსქროლვით განახლების ფუნქცია
  const onRefresh = async () => {
    setRefreshing(true);
    await loadAllStats();
    setRefreshing(false);
  };

  const startEntranceAnimation = () => {
    fadeAnim.setValue(0);
    slideAnim.setValue(30);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true })
    ]).start();
  };

  const loadAllStats = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [cyclesRes, profileRes, symptomsRes] = await Promise.all([
        supabase.from("cycles").select("*").eq("user_id", user.id).order("start_date", { ascending: true }),
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("symptoms").select("symptoms").eq("user_id", user.id)
      ]);

      const cycles = cyclesRes.data || [];
      const profile = profileRes.data;
      const symptomsData = symptomsRes.data || [];

      const avgC = calculateAverageCycle(cycles) || profile?.cycle_length || 28;
      const avgP = calculateAveragePeriod(cycles) || profile?.period_length || 5;

      const lastStart = cycles.length > 0 ? cycles[cycles.length - 1].start_date : profile?.last_period;
      const start = dayjs(lastStart);
      const next = start.add(avgC, "day");
      const today = dayjs().startOf('day');
      
      const diff = Math.max(0, next.diff(today, "day"));
      const ovulation = next.subtract(14, "day");
      const fertileStart = ovulation.subtract(5, "day");

      const allSymptoms = symptomsData.flatMap(s => s.symptoms || []);
      const counts = allSymptoms.reduce((acc, curr) => {
        acc[curr] = (acc[curr] || 0) + 1;
        return acc;
      }, {});

      const topSymptoms = Object.entries(counts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 4)
        .map(([id, count]) => ({
          label: SYMPTOM_LABELS[id] || id,
          count: count
        }));

      const history = cycles.slice(-6).map(c => ({
        month: dayjs(c.start_date).format("MMM"),
        length: c.cycle_length || avgC
      }));

      if (history.length === 0 && profile?.cycle_length) {
        history.push({ month: dayjs().format("MMM"), length: profile.cycle_length });
      }

      setStats({
        avgCycle: avgC,
        avgPeriod: avgP,
        cyclesCount: cycles.length,
        nextPeriod: next.format("D MMMM"),
        daysLeft: diff,
        ovulationDay: ovulation.format("D MMMM"),
        fertileWindow: `${fertileStart.format("D")} - ${ovulation.format("D MMM")}`,
        topSymptoms,
        history
      });

      startEntranceAnimation();
    } catch (err) {
      console.log("Statistics error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !refreshing) return <View style={[styles.center, {backgroundColor: theme.bg}]}><ActivityIndicator size="large" color="#E94560" /></View>;

  const maxChartValue = Math.max(...stats.history.map(h => h.length), 40);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.bg} />
      <ScrollView 
        style={styles.container} 
        showsVerticalScrollIndicator={false}
        scrollEnabled={isPremium}
        // 👈 დაემატა RefreshControl
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh} 
            tintColor={isDark ? "#E94560" : "#ff4d88"} 
          />
        }
      >
        <Text style={[styles.headerTitle, { color: theme.text }]}>შენი ანალიტიკა ✨</Text>

        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          
          <View style={[styles.heroCard, { backgroundColor: "#E94560" }]}>
            <View style={styles.heroGlow} />
            <Text style={styles.heroLabel}>მომდევნო პერიოდამდე დარჩა</Text>
            <Text style={styles.heroNumber}>{stats.daysLeft} <Text style={styles.heroSubText}>დღე</Text></Text>
            <View style={styles.heroDateBadge}>
              <Text style={styles.heroDate}>{stats.nextPeriod}</Text>
            </View>
          </View>

          {stats.history.length > 0 && (
            <View style={[styles.chartCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>ციკლის დინამიკა (დღეები)</Text>
              <View style={styles.chartContainer}>
                {stats.history.map((item, index) => (
                  <AnimatedBar 
                    key={index} 
                    index={index} 
                    value={item.length} 
                    maxValue={maxChartValue} 
                    label={item.month}
                    isDark={isDark}
                  />
                ))}
              </View>
            </View>
          )}

          <View style={styles.metricsRow}>
            <View style={[styles.metricCard, { backgroundColor: theme.card }]}>
              <View style={[styles.iconBox, { backgroundColor: theme.iconBg }]}><Text style={{fontSize: 20}}>🔄</Text></View>
              <Text style={[styles.metricValue, { color: theme.text }]}>{stats.avgCycle} <Text style={styles.metricUnit}>დღე</Text></Text>
              <Text style={[styles.metricLabel, { color: theme.subText }]}>საშ. ციკლი</Text>
            </View>
            <View style={[styles.metricCard, { backgroundColor: theme.card }]}>
              <View style={[styles.iconBox, { backgroundColor: isDark ? theme.iconBg : '#ffe4e1' }]}><Text style={{fontSize: 20}}>🩸</Text></View>
              <Text style={[styles.metricValue, { color: theme.text }]}>{stats.avgPeriod} <Text style={styles.metricUnit}>დღე</Text></Text>
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

      {/* --- განახლებული პრაიმ მოდალი (ინტენსივობა 10) --- */}
      {!isPremium && (
        <BlurView intensity={10} tint={isDark ? "dark" : "light"} style={styles.premiumOverlay}>
          <View style={[
            styles.premiumCard, 
            { 
              backgroundColor: isDark ? "rgba(26,26,26,0.85)" : "rgba(255,255,255,0.85)",
              borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)"
            }
          ]}>
            <Text style={styles.premiumIcon}>✨</Text>
            <Text style={[styles.premiumTitle, { color: theme.text }]}>გახდი პრაიმი</Text>
            <Text style={[styles.premiumSubtitle, { color: theme.subText }]}>
              განბლოკე კალენდარი, სიმპტომების ისტორია და დეტალური ანალიტიკა.
            </Text>
            
            <TouchableOpacity 
              style={[
                styles.premiumBadge, 
                { backgroundColor: isDark ? "#E94560" : "#ff4d88" }
              ]} 
              activeOpacity={0.8}
              onPress={() => router.push("/premium")}
            >
              <Text style={styles.premiumBadgeText}>სრული ვერსიის გააქტიურება</Text>
            </TouchableOpacity>
          </View>
        </BlurView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 10 }, // 👈 padding ოდნავ შევამცირე SafeAreaView-ს გამო
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  headerTitle: { fontSize: 32, fontWeight: "900", marginBottom: 25, letterSpacing: -0.5 },
  
  heroCard: { borderRadius: 32, padding: 35, alignItems: "center", marginBottom: 25, overflow: 'hidden', elevation: 10, shadowColor: "#E94560", shadowOpacity: 0.4, shadowRadius: 20 },
  heroGlow: { position: 'absolute', top: -50, right: -50, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.15)' },
  heroLabel: { color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 },
  heroNumber: { color: "#fff", fontSize: 64, fontWeight: "900", lineHeight: 70 },
  heroSubText: { fontSize: 24, fontWeight: "600", color: "rgba(255,255,255,0.8)" },
  heroDateBadge: { marginTop: 15, backgroundColor: "rgba(0,0,0,0.15)", paddingVertical: 8, paddingHorizontal: 20, borderRadius: 20 },
  heroDate: { color: "#fff", fontSize: 15, fontWeight: "600" },

  chartCard: { borderRadius: 28, padding: 25, marginBottom: 20, elevation: 4 },
  cardTitle: { fontSize: 18, fontWeight: "800", marginBottom: 25 },
  chartContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 160, paddingHorizontal: 10 },
  barWrapper: { alignItems: 'center', width: 40 },
  barValue: { fontSize: 12, fontWeight: '700', marginBottom: 8 },
  barTrack: { height: 100, width: 14, borderRadius: 10, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', borderRadius: 10 },
  barLabel: { fontSize: 11, marginTop: 10, fontWeight: '600' },

  metricsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  metricCard: { width: "48%", padding: 20, borderRadius: 28, elevation: 4 },
  iconBox: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  metricValue: { fontSize: 28, fontWeight: "800" },
  metricUnit: { fontSize: 14, fontWeight: "600", color: "#999" },
  metricLabel: { fontSize: 13, marginTop: 5, fontWeight: "600" },

  datesCard: { borderRadius: 28, padding: 25, marginBottom: 20, elevation: 4 },
  dateItem: { flexDirection: 'row', alignItems: 'center' },
  dateIcon: { fontSize: 32, marginRight: 15 },
  dateLabel: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
  dateValue: { fontSize: 17, fontWeight: "800" },
  dateDivider: { height: 1, marginVertical: 20 },

  symptomsCard: { borderRadius: 28, padding: 25, marginBottom: 20, elevation: 4 },
  symptomRow: { marginBottom: 18 },
  symptomHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  symptomName: { fontSize: 15, fontWeight: '600' },
  symptomCount: { fontSize: 13, fontWeight: '700' },
  symptomTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  symptomFill: { height: '100%', borderRadius: 4 },

  // --- განახლებული პრაიმ სტილები ---
  premiumOverlay: { 
    ...StyleSheet.absoluteFillObject, 
    justifyContent: "center", 
    alignItems: "center",
    padding: 24,
    zIndex: 100,
  },
  premiumCard: {
    width: "100%",
    maxWidth: 360,
    padding: 30,
    borderRadius: 32,
    alignItems: "center",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 15 },
    shadowOpacity: 0.15,
    shadowRadius: 25,
    elevation: 10,
  },
  premiumIcon: {
    fontSize: 50,
    marginBottom: 15,
  },
  premiumTitle: {
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 10,
    textAlign: "center",
  },
  premiumSubtitle: {
    fontSize: 15,
    textAlign: "center",
    marginBottom: 25,
    lineHeight: 22,
  },
  premiumBadge: { 
    width: "100%",
    paddingVertical: 16, 
    borderRadius: 20, 
    alignItems: "center",
    shadowColor: "#ff4d88",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  premiumBadgeText: { 
    color: "#FFF", 
    fontSize: 16, 
    fontWeight: "800" 
  }
});