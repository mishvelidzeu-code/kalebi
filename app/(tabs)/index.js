import dayjs from "dayjs";
import "dayjs/locale/ka";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";

import { useTheme } from "../../context/ThemeContext";
import { supabase } from "../../services/supabase";
import { calculateAverageCycle, calculateAveragePeriod } from "../../utils/cyclePrediction";

dayjs.locale("ka");

export default function HomeScreen() {
  const router = useRouter();
  const { isPremium, isDark } = useTheme(); 

  const [loading, setLoading] = useState(true);
  const [nextPeriod, setNextPeriod] = useState(null);
  const [daysLeft, setDaysLeft] = useState(null);
  const [cycleDay, setCycleDay] = useState(null);
  const [cycleLength, setCycleLength] = useState(28);
  const [phase, setPhase] = useState("");
  const [periodLength, setPeriodLength] = useState(5);
  const [pregnancyChance, setPregnancyChance] = useState("დაბალი");
  const [phaseColor, setPhaseColor] = useState("#ff4d88");
  
  // ახალი სტეიტი მიზნისთვის
  const [userGoal, setUserGoal] = useState("ციკლის კონტროლი");

  const theme = {
    bg: isDark ? "#0F0F0F" : "#faf7f7",
    card: isDark ? "#1A1A1A" : "#fff",
    text: isDark ? "#FFFFFF" : "#333",
    subText: isDark ? "#AAAAAA" : "#888",
    primary: isDark ? "#E94560" : "#ff4d88",
    circleBg: isDark ? "#252525" : "#fff0f5",
  };

  useEffect(() => {
    loadData();
  }, []);

  const getDailyStats = (day, total, pLength) => {
    const ovulation = total - 14;
    if (day <= pLength) return { anger: 35, energy: 20, appetite: 75, stability: 40 };
    if (day < ovulation - 5) return { anger: 10, energy: 85, appetite: 40, stability: 90 };
    if (day >= ovulation - 5 && day <= ovulation + 1) return { anger: 5, energy: 98, appetite: 50, stability: 85 };
    if (day > ovulation + 1 && day < total - 6) return { anger: 20, energy: 60, appetite: 60, stability: 75 };
    return { anger: 90, energy: 30, appetite: 95, stability: 15 };
  };

  const getPhaseAndChance = (day, totalLength, pLength) => {
    const ovulation = totalLength - 14;
    if (day <= pLength) return { phase: "პერიოდი", chance: "ძალიან დაბალი", color: theme.primary };
    if (day < ovulation - 5) return { phase: "ფოლიკულური ფაზა", chance: "დაბალი", color: "#48CAE4" };
    if (day >= ovulation - 5 && day <= ovulation + 1) {
      const isPeak = day === ovulation || day === ovulation - 1;
      return { 
        phase: "ნაყოფიერი პერიოდი", 
        chance: isPeak ? "უმაღლესი 🔥" : "მაღალი",
        color: isPeak ? "#ffd166" : "#06d6a0" 
      };
    }
    return { phase: "ლუტეალური ფაზა", chance: "დაბალი", color: "#C8B6FF" };
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [cyclesRes, profileRes] = await Promise.all([
        supabase.from("cycles").select("*").eq("user_id", user.id).order("start_date", { ascending: true }),
        supabase.from("profiles").select("*").eq("id", user.id).single()
      ]);

      const cycles = cyclesRes.data || [];
      const profile = profileRes.data;

      // მიზნის წამოღება პროფილიდან
      if (profile?.goal) {
        setUserGoal(profile.goal);
      }

      if (!profile && cycles.length === 0) { setLoading(false); return; }

      const avgCycle = calculateAverageCycle(cycles) || profile?.cycle_length || 28;
      const avgPeriod = calculateAveragePeriod(cycles) || profile?.period_length || 5;
      const lastStartDate = cycles.length > 0 ? cycles[cycles.length - 1].start_date : profile?.last_period;

      if (!lastStartDate) { setLoading(false); return; }

      const start = dayjs(lastStartDate);
      const today = dayjs().startOf('day');
      setCycleLength(avgCycle);
      setPeriodLength(avgPeriod);

      let next = start.add(avgCycle, "day");
      while (next.isBefore(today)) { next = next.add(avgCycle, "day"); }

      setDaysLeft(next.diff(today, "day"));
      setNextPeriod(next.format("D MMMM"));

      let dayInCycle = today.diff(start, "day") + 1;
      if (dayInCycle > avgCycle) dayInCycle = ((dayInCycle - 1) % avgCycle) + 1;
      setCycleDay(dayInCycle);

      const status = getPhaseAndChance(dayInCycle, avgCycle, avgPeriod);
      setPhase(status.phase);
      setPregnancyChance(status.chance);
      setPhaseColor(status.color);

    } catch (error) {
      console.log("Home load error:", error);
    } finally {
      setLoading(false);
    }
  };

  const logPeriod = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const today = dayjs().format("YYYY-MM-DD");
      const { error } = await supabase.from("cycles").insert([{ user_id: user.id, start_date: today, period_length: periodLength, cycle_length: cycleLength }]);
      if (error) throw error;
      Alert.alert("წარმატება", "ციკლის დაწყება დაფიქსირდა!");
      loadData();
    } catch (error) {
      Alert.alert("შეცდომა", "მონაცემების შენახვა ვერ მოხერხდა");
    }
  };

  if (loading) return <View style={[styles.container, { justifyContent: 'center', backgroundColor: theme.bg }]}><ActivityIndicator size="large" color={theme.primary} /></View>;

  const progress = cycleDay ? (cycleDay / cycleLength) * 100 : 0;
  const stats = getDailyStats(cycleDay, cycleLength, periodLength);

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.bg }]} showsVerticalScrollIndicator={false}>
      <Text style={[styles.topDate, { color: theme.subText }]}>{dayjs().format("D MMMM, dddd")}</Text>

      {/* მთავარი ბარათი */}
      <View style={[styles.mainCard, { backgroundColor: theme.card }]}>
        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>ფაზა</Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>{phase}</Text>
          </View>
          <View style={[styles.infoItem, { borderLeftWidth: 1, borderLeftColor: isDark ? '#333' : '#eee' }]}>
            <Text style={styles.infoLabel}>
              {userGoal === "დაორსულება" ? "ნაყოფიერება" : "დაორსულების შანსი"}
            </Text>
            <Text style={[styles.infoValue, { color: pregnancyChance.includes("მაღალი") ? "#06d6a0" : theme.primary }]}>
              {pregnancyChance}
            </Text>
          </View>
        </View>

        <View style={[styles.circleContainer, { backgroundColor: theme.bg, borderColor: theme.circleBg }]}>
          <View style={styles.outerCircle}>
            <Text style={[styles.cycleDayNumber, { color: phaseColor }]}>{cycleDay}</Text>
            <Text style={[styles.cycleDayText, { color: phaseColor }]}>დღე</Text>
          </View>
        </View>

        <View style={[styles.progressBarContainer, { backgroundColor: isDark ? "#222" : "#f0f0f0" }]}>
           <View style={[styles.progressFill, { width: `${Math.min(progress, 100)}%`, backgroundColor: theme.primary }]} />
        </View>

        <Text style={[styles.daysLeftLabel, { color: theme.subText }]}>შემდეგ პერიოდამდე დარჩა</Text>
        <Text style={[styles.daysLeftNumber, { color: theme.text }]}>{daysLeft} დღე</Text>
        <Text style={[styles.nextDateText, { color: theme.subText }]}>სავარაუდო თარიღი: {nextPeriod}</Text>

        <TouchableOpacity style={[styles.logButton, { backgroundColor: theme.primary }]} onPress={logPeriod}>
          <Text style={styles.logButtonText}>პერიოდი დამეწყო დღეს</Text>
        </TouchableOpacity>
      </View>

      {/* დღევანდელი მაჩვენებლები */}
      <View>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>დღევანდელი მაჩვენებლები</Text>
        <View style={[styles.statsCard, { backgroundColor: theme.card, overflow: 'hidden' }]}>
          <StatMeter label="გაღიზიანება" percent={stats.anger} color="#FF5A5F" textColor={theme.text} />
          <StatMeter label="ენერგიის დონე" percent={stats.energy} color="#48CAE4" textColor={theme.text} />
          <StatMeter label="მადა" percent={stats.appetite} color="#FF9F1C" textColor={theme.text} />
          <StatMeter label="სტაბილურობა" percent={stats.stability} color="#06D6A0" textColor={theme.text} />
          
          {!isPremium && (
            <BlurView intensity={7} tint={isDark ? "dark" : "light"} style={styles.premiumOverlay}>
              <TouchableOpacity style={styles.premiumBadge} onPress={() => router.push("/premium")}>
                <Text style={styles.premiumBadgeText}>გახსენი პრაიმით ✨</Text>
              </TouchableOpacity>
            </BlurView>
          )}
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: theme.text }]}>დღევანდელი რჩევა</Text>
      <View style={[styles.insightCard, { backgroundColor: theme.card }]}>
        <View style={[styles.insightIconBox, { backgroundColor: theme.circleBg }]}>
          <Text style={{ fontSize: 24 }}>💡</Text>
        </View>
        <Text style={[styles.insightText, { color: theme.subText }]}>
          {userGoal === "დაორსულება" ? (
             phase === "ნაყოფიერი პერიოდი" 
               ? "საუკეთესო დროა ჩასახვისთვის! მაქსიმალურად გამოიყენე ეს დღეები. 🔥" 
               : (phase === "პერიოდი" ? "ამ პერიოდში ორგანიზმი ისვენებს. მიიღეთ რკინით მდიდარი საკვები." : "დააკვირდით თქვენს განწყობას და ემზადეთ ნაყოფიერი დღეებისთვის.")
          ) : userGoal === "ჯანმრთელობის მონიტორინგი" ? (
             "ყურადღება მიაქციეთ სიმპტომების ცვლილებას და აუცილებლად ჩაინიშნეთ დღიურში."
          ) : (
            // სტანდარტული რჩევები
            phase === "პერიოდი" && "ეცადეთ მიიღოთ თბილი სითხეები და მაგნიუმით მდიდარი საკვები." ||
            phase === "ფოლიკულური ფაზა" && "თქვენი ენერგია პიკშია! საუკეთესო დროა ახალი პროექტებისთვის." ||
            phase === "ნაყოფიერი პერიოდი" && "ორგანიზმი ოვულაციისთვის ემზადება. შესაძლოა იგრძნოთ ენერგიის მატება." ||
            phase === "ლუტეალური ფაზა" && "დროა შეანელოთ ტემპი. ხარისხიანი ძილი დაგეხმარებათ PMS-ის დაძლევაში."
          )}
        </Text>
      </View>
      
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

function StatMeter({ label, percent, color, textColor }) {
  return (
    <View style={styles.meterWrapper}>
      <View style={styles.meterLabelRow}>
        <Text style={[styles.meterLabel, { color: textColor }]}>{label}</Text>
        <Text style={[styles.meterPercent, { color: color }]}>{percent}%</Text>
      </View>
      <View style={styles.meterBg}>
        <View style={[styles.meterFill, { width: `${percent}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 60 },
  topDate: { textAlign: "center", fontSize: 16, marginBottom: 20, textTransform: 'capitalize' },
  mainCard: { borderRadius: 30, padding: 25, alignItems: "center", elevation: 8, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 15, marginBottom: 30 },
  infoRow: { flexDirection: 'row', marginBottom: 30, width: '100%' },
  infoItem: { flex: 1, alignItems: 'center', paddingHorizontal: 5 },
  infoLabel: { fontSize: 12, color: '#aaa', marginBottom: 5 },
  infoValue: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  circleContainer: { width: 150, height: 150, borderRadius: 75, borderWidth: 8, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  outerCircle: { alignItems: 'center' },
  cycleDayNumber: { fontSize: 48, fontWeight: '800' },
  cycleDayText: { fontSize: 16, fontWeight: '600' },
  progressBarContainer: { width: '100%', height: 8, borderRadius: 4, marginBottom: 25, overflow: 'hidden' },
  progressFill: { height: '100%' },
  daysLeftLabel: { fontSize: 16, marginBottom: 5 },
  daysLeftNumber: { fontSize: 32, fontWeight: '700', marginBottom: 5 },
  nextDateText: { fontSize: 14, marginBottom: 25 },
  logButton: { paddingVertical: 15, paddingHorizontal: 40, borderRadius: 20, elevation: 5 },
  logButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  sectionTitle: { fontSize: 20, fontWeight: "700", marginBottom: 15 },
  statsCard: { borderRadius: 25, padding: 20, marginBottom: 25, elevation: 4, position: 'relative' },
  meterWrapper: { marginBottom: 15 },
  meterLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  meterLabel: { fontSize: 14, fontWeight: '600' },
  meterPercent: { fontSize: 13, fontWeight: '700' },
  meterBg: { height: 8, backgroundColor: 'rgba(150,150,150,0.1)', borderRadius: 4, overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: 4 },
  insightCard: { borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center', elevation: 3 },
  insightIconBox: { width: 50, height: 50, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  insightText: { flex: 1, fontSize: 14, lineHeight: 20 },
  premiumOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  premiumBadge: { backgroundColor: '#1A1A1A', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 15 },
  premiumBadgeText: { color: '#fff', fontWeight: 'bold', fontSize: 14 }
});