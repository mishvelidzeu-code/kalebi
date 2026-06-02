import dayjs from "dayjs";
import "dayjs/locale/ka";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, DeviceEventEmitter, Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import PrimePreview from "../../components/PrimePreview";
import { useTheme } from "../../context/ThemeContext";
import { usePregnancy } from "../../context/PregnancyContext";
import { getHomeAssistantAdvice, getPregnancyWeeklyAdvice, invalidateAssistantContextCache } from "../../services/assistantOrchestrator";
import { syncCycleRemindersForUser } from "../../services/notifications";
import { supabase } from "../../services/supabase";
import { calculateCycleState, getPregnancyChanceKey } from "../../utils/cycleEngine";
import { getPreferredCycleLength, getPreferredPeriodLength } from "../../utils/cyclePrediction";
import { getDailyAdvice } from "../../utils/dailyAdvice";

dayjs.locale("ka");

const DEFAULT_GOAL = "ციკლის კონტროლი";
const HOME_ADVICE_CACHE_KEY_PREFIX = "@cycle-care/home-advice";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const BABY_IMAGES_WITH_PHOTO = new Set([5,6,7,8,9,10,11,12,13]);

function getBabyImageUrl(week) {
  if (!BABY_IMAGES_WITH_PHOTO.has(week)) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/baby-images/week-${week}.png`;
}

function getHomeAdviceCacheKey(userId) {
  return `${HOME_ADVICE_CACHE_KEY_PREFIX}/${userId}`;
}

async function readCachedHomeAdvice(userId, adviceKey) {
  try {
    if (!userId || !adviceKey) return null;

    const rawValue = await AsyncStorage.getItem(getHomeAdviceCacheKey(userId));
    if (!rawValue) return null;

    const parsedValue = JSON.parse(rawValue);
    if (parsedValue?.adviceKey !== adviceKey || !parsedValue?.text) {
      return null;
    }

    return parsedValue.text;
  } catch (error) {
    console.log("Home advice cache read error:", error);
    return null;
  }
}

async function writeCachedHomeAdvice(userId, adviceKey, text) {
  try {
    if (!userId || !adviceKey || !text) return;

    await AsyncStorage.setItem(
      getHomeAdviceCacheKey(userId),
      JSON.stringify({
        adviceKey,
        text,
        cachedAt: new Date().toISOString(),
      })
    );
  } catch (error) {
    console.log("Home advice cache save error:", error);
  }
}

const BABY_DATA = {
  1:  { size: "ნაყოფის უჯრედი", emoji: "🔬", advice: "ორსულობა ახლა იწყება. ფოლიუმის მჟავა ძალიან მნიშვნელოვანია." },
  2:  { size: "ნაყოფის უჯრედი", emoji: "🔬", advice: "ორგანიზმი მზადდება ნაყოფის ჩასახვისთვის." },
  3:  { size: "ყაყაჩოს თესლი", emoji: "🌱", advice: "ნაყოფი ახლა ძალიან პატარაა — 1-2 მმ. მიიღე ვიტამინები." },
  4:  { size: "ხაშხაშის თესლი", emoji: "🌸", advice: "გული ახლა ჩამოყალიბდება. მოერიდე ალკოჰოლს და კოფეინს." },
  5:  { size: "სეზამი", emoji: "🫘", advice: "ნაყოფი დაახლოებით 5 მმ-ია. პირველი ექიმის ვიზიტი დაგეგმე." },
  6:  { size: "მოცვი", emoji: "🫐", advice: "გული ცემს! ახლა შეიძლება გულისრევა გაჩნდეს." },
  7:  { size: "ჟოლო", emoji: "🍓", advice: "ტვინი სწრაფად ვითარდება. ბევრი სითხე დალიე." },
  8:  { size: "კივი", emoji: "🥝", advice: "ნაყოფი 1.6 სმ-ია. ყველა ძირითადი ორგანო ვითარდება." },
  9:  { size: "ყურძნის მარცვალი", emoji: "🍇", advice: "ნაყოფს ახლა ყველა თითი აქვს. ეჭვები ნორმალურია." },
  10: { size: "ატამი", emoji: "🍑", advice: "კრიტიკული ფაზა დასრულდა — ნაყოფი ახლა ნაყოფია!" },
  11: { size: "ლეღვი", emoji: "🍈", advice: "ნაყოფი 4.5 სმ-ია. პირველი ტრიმესტრი თითქმის დასრულდა." },
  12: { size: "ლიმონი", emoji: "🍋", advice: "ალბათ გულისრევა შეიმსუბუქება. USG დროა!" },
  13: { size: "ნეკერჩხალი", emoji: "🍎", advice: "მეორე ტრიმესტრი იწყება! ენერგია დაბრუნდება." },
  14: { size: "ლიმონი", emoji: "🍋", advice: "ნაყოფი 8.5 სმ-ია. მოძრაობა მალე იგრძნობა." },
  15: { size: "ვაშლი", emoji: "🍎", advice: "სმენა ვითარდება. ესაუბრე შენს ბავშვს!" },
  16: { size: "ავოკადო", emoji: "🥑", advice: "ნაყოფი 11.5 სმ-ია. სქესი შეიძლება გაიგო USG-ზე." },
  17: { size: "ბოლოკი", emoji: "🥕", advice: "ნაყოფი ცხიმს იკრებს. ეს მას სიტყველობს." },
  18: { size: "ბადრიჯანი", emoji: "🍆", advice: "პირველი მოძრაობა შეიძლება იგრძნო!" },
  19: { size: "მანგო", emoji: "🥭", advice: "ნაყოფი 15 სმ-ია. კანი ჩამოყალიბება." },
  20: { size: "ბანანი", emoji: "🍌", advice: "ნახევარი გზა გავლილია! შენიშნე ბავშვის მოძრაობა." },
  21: { size: "სტაფილო", emoji: "🥕", advice: "ნაყოფი 26 სმ-ია. ძილი გვერდზე უფრო კომფორტულია." },
  22: { size: "სიმინდი", emoji: "🌽", advice: "ტუჩები და წარბები ჩამოყალიბდა. ბავშვი გეფიცხება!" },
  23: { size: "კივი", emoji: "🥝", advice: "სმენა კარგად ვითარდება. მუსიკა უკრა!" },
  24: { size: "სიმინდი", emoji: "🌽", advice: "ნაყოფი ახლა 600 გ-ია. ფილტვები ვითარდება." },
  25: { size: "ბოსტნეული", emoji: "🫑", advice: "ნაყოფი 34 სმ-ია. ძილი შეიძლება გართულდეს." },
  26: { size: "ბადრიჯანი", emoji: "🍆", advice: "თვალები გაიხელება! ნაყოფი სინათლეს გრძნობს." },
  27: { size: "ყვავილოვანი კომბოსტო", emoji: "🥦", advice: "მესამე ტრიმესტრის ბოლო კვირა. ბავშვი ბრუნდება." },
  28: { size: "ბადია", emoji: "🫚", advice: "მესამე ტრიმესტრი! ნაყოფი 1 კგ-ია. ბრეგტონ-ჰიქსი ნორმალურია." },
  29: { size: "კარტოფილი", emoji: "🥔", advice: "ნაყოფი ბრუნდება. თავი ქვემოთ კარგი ნიშანია." },
  30: { size: "კომბოსტო", emoji: "🥬", advice: "ახლა ნაყოფი 1.3 კგ-ია. სვინგები ხშირია — ეს ნორმალურია." },
  31: { size: "ქოქოსი", emoji: "🥥", advice: "ნაყოფი 1.5 კგ-ია. ოფლიანობა შეიძლება მოიმატოს." },
  32: { size: "ჯუნჯული", emoji: "🫚", advice: "ნაყოფი 1.7 კგ-ია. ნებისმიერ დროს მზადაა გარე სამყაროსთვის." },
  33: { size: "ანანასი", emoji: "🍍", advice: "ნაყოფი 1.9 კგ-ია. ბებიაქალი/ექიმი ვიზიტი სულ უახლოვდება." },
  34: { size: "კივი", emoji: "🥝", advice: "ფილტვები თითქმის მზადაა. ბავშვი ნებისმიერ დროს შეიძლება მოვიდეს." },
  35: { size: "ნემსიყლაპია", emoji: "🫚", advice: "ნაყოფი 2.4 კგ-ია. გირჩევ, საავადმყოფოს ჩანთა შეფუთო!" },
  36: { size: "ქოქოსი", emoji: "🥥", advice: "ნაყოფი 2.6 კგ-ია. ყოველი კვირა მნიშვნელოვანია!" },
  37: { size: "ბოლქვი", emoji: "🧅", advice: "ბავშვი სრული ვადისაა! ნებისმიერ დროს შეიძლება." },
  38: { size: "ვიდრო", emoji: "🥬", advice: "ნაყოფი 3 კგ-ია. სხეული ემზადება მშობიარობისთვის." },
  39: { size: "საზამთრო", emoji: "🍉", advice: "თითქმის დროა! ისვენე, ძალები შეინახე." },
  40: { size: "საზამთრო", emoji: "🍉", advice: "სრული ვადა! ბავშვი ნებისმიერ დროს მოდის. 🎉" },
};

const TRIMESTER_COLORS = { 1: "#06d6a0", 2: "#ffd166", 3: "#ff4d88" };
const TRIMESTER_LABELS = { 1: "I ტრიმესტრი", 2: "II ტრიმესტრი", 3: "III ტრიმესტრი" };

function PregnancyHomeScreen({ isDark }) {
  const { currentWeek, currentTrimester, daysRemaining } = usePregnancy();
  const [weeklyAdvice, setWeeklyAdvice] = useState("");
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [adviceError, setAdviceError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showBabyModal, setShowBabyModal] = useState(false);
  const loadedForWeekRef = useRef(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const url = getBabyImageUrl(week);
    if (url) Image.prefetch(url).catch(() => {});
  }, [week]);

  const week = Math.min(Math.max(currentWeek || 1, 1), 40);
  const baby = BABY_DATA[week];
  const trimesterColor = TRIMESTER_COLORS[currentTrimester] || "#ff4d88";
  const progress = (week / 40) * 100;

  const theme = {
    bg: isDark ? "#0F0F0F" : "#faf7f7",
    card: isDark ? "#1A1A1A" : "#fff",
    text: isDark ? "#FFFFFF" : "#333",
    subText: isDark ? "#AAAAAA" : "#888",
    primary: "#ff4d88",
  };

  const loadWeeklyAdvice = useCallback(async (force = false) => {
    if (!force && loadedForWeekRef.current === week) return;
    if (!isMountedRef.current) return;
    setAdviceError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!isMountedRef.current) return;
      if (!user) return;
      const cacheKey = `@cycle-care/pregnancy-weekly-advice/${user.id}`;
      if (!force) {
        try {
          const raw = await AsyncStorage.getItem(cacheKey);
          if (!isMountedRef.current) return;
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed?.week === week && parsed?.text) {
              setWeeklyAdvice(parsed.text);
              loadedForWeekRef.current = week;
              return;
            }
          }
        } catch {}
      }
      if (!isMountedRef.current) return;
      setAdviceLoading(true);
      const response = await getPregnancyWeeklyAdvice();
      if (!isMountedRef.current) return;
      if (response?.text) {
        setWeeklyAdvice(response.text);
        loadedForWeekRef.current = week;
        try {
          await AsyncStorage.setItem(cacheKey, JSON.stringify({ week, text: response.text, cachedAt: new Date().toISOString() }));
        } catch {}
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      console.log("Pregnancy weekly advice error:", err?.message);
      setAdviceError(err?.message || "შეცდომა");
    } finally {
      if (isMountedRef.current) setAdviceLoading(false);
    }
  }, [week]);

  useFocusEffect(
    useCallback(() => {
      loadWeeklyAdvice();
    }, [loadWeeklyAdvice])
  );

  const onRefresh = useCallback(async () => {
    if (!isMountedRef.current) return;
    setRefreshing(true);
    await loadWeeklyAdvice(false);
    if (isMountedRef.current) setRefreshing(false);
  }, [loadWeeklyAdvice]);

  const displayAdvice = weeklyAdvice || baby.advice;

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.bg }]} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={trimesterColor} />}>
      <Text style={[styles.topDate, { color: theme.subText }]}>{dayjs().format("D MMMM, dddd")}</Text>

      <View style={[styles.mainCard, { backgroundColor: theme.card }]}>
        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>ტრიმესტრი</Text>
            <Text style={[styles.infoValue, { color: trimesterColor }]}>{TRIMESTER_LABELS[currentTrimester]}</Text>
          </View>
          <View style={[styles.infoItem, { borderLeftWidth: 1, borderLeftColor: isDark ? "#333" : "#eee" }]}>
            <Text style={styles.infoLabel}>დარჩენილია</Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>{daysRemaining} დღე</Text>
          </View>
        </View>

        <View style={[styles.circleContainer, { backgroundColor: isDark ? "#252525" : "#fff0f5", borderColor: trimesterColor }]}>
          <View style={styles.outerCircle}>
            <Text style={{ fontSize: 36 }}>{baby.emoji}</Text>
            <Text style={[styles.cycleDayNumber, { color: trimesterColor, fontSize: 38 }]}>{week}</Text>
            <Text style={[styles.cycleDayText, { color: trimesterColor }]}>კვირა</Text>
          </View>
        </View>

        <View style={[styles.progressBarContainer, { backgroundColor: isDark ? "#222" : "#f0f0f0" }]}>
          <View style={[styles.progressFill, { width: `${Math.min(progress, 100)}%`, backgroundColor: trimesterColor }]} />
        </View>

        <Text style={[styles.daysLeftLabel, { color: theme.subText }]}>ბავშვის ზომა ახლა</Text>
        <Text style={[styles.daysLeftNumber, { color: theme.text, fontSize: 22 }]}>{baby.size}</Text>
        <Text style={[styles.nextDateText, { color: theme.subText }]}>სავარაუდო მშობიარობა: {dayjs().add(daysRemaining, "day").format("D MMMM YYYY")}</Text>
        <TouchableOpacity onPress={() => setShowBabyModal(true)} style={{ marginTop: 14, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: trimesterColor + "22", borderRadius: 20, borderWidth: 1, borderColor: trimesterColor + "55" }}>
          <Text style={{ color: trimesterColor, fontWeight: "700", fontSize: 14 }}>{baby.emoji} კვირა {week} — ნაყოფი ნახე</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showBabyModal} transparent animationType="fade" onRequestClose={() => setShowBabyModal(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "center", alignItems: "center" }} onPress={() => setShowBabyModal(false)}>
          <Pressable style={{ width: "100%", alignItems: "center" }} onPress={() => {}}>
            <TouchableOpacity onPress={() => setShowBabyModal(false)} style={{ position: "absolute", top: -50, right: 24, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", justifyContent: "center", alignItems: "center", zIndex: 10 }}>
              <Text style={{ fontSize: 20, color: "#fff", fontWeight: "700" }}>✕</Text>
            </TouchableOpacity>

            {getBabyImageUrl(week) ? (
              <BabyImage uri={getBabyImageUrl(week)} emoji={baby.emoji} />
            ) : (
              <Text style={{ fontSize: 100 }}>{baby.emoji}</Text>
            )}

            <View style={{ marginTop: 20, alignItems: "center" }}>
              <Text style={{ fontSize: 15, color: trimesterColor, fontWeight: "700", letterSpacing: 1 }}>{TRIMESTER_LABELS[currentTrimester]}</Text>
              <Text style={{ fontSize: 36, fontWeight: "800", color: "#fff", marginTop: 4 }}>{week}-ე კვირა</Text>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Text style={[styles.sectionTitle, { color: theme.text }]}>კვირა {week} — AI ასისტენტი ✨</Text>
      <View style={[styles.insightCard, { backgroundColor: theme.card }]}>
        {adviceLoading ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 24 }}>
            <ActivityIndicator color={trimesterColor} size="small" />
            <Text style={[styles.insightText, { color: theme.subText }]}>ასისტენტი ამზადებს კვირის განახლებას...</Text>
          </View>
        ) : weeklyAdvice ? (
          <WeeklyAdviceCard text={weeklyAdvice} trimesterColor={trimesterColor} isDark={isDark} theme={theme} />
        ) : adviceError ? (
          <View style={{ padding: 24, gap: 10 }}>
            <Text style={{ color: "#ff4d88", fontSize: 13 }}>⚠️ {adviceError}</Text>
            <TouchableOpacity onPress={() => loadWeeklyAdvice(true)} style={{ alignSelf: "flex-start", paddingHorizontal: 16, paddingVertical: 8, backgroundColor: trimesterColor, borderRadius: 12 }}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>ხელახლა სცადე</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { isDark, isPremium } = useTheme();
  const { pregnancyMode } = usePregnancy();
  const lastAdviceKeyRef = useRef("");
  const adviceRequestKeyRef = useRef("");
  const hasLoadedOnceRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nextPeriod, setNextPeriod] = useState(null);
  const [daysLeft, setDaysLeft] = useState(null);
  const [cycleDay, setCycleDay] = useState(null);
  const [cycleLength, setCycleLength] = useState(28);
  const [phase, setPhase] = useState("");
  const [phaseKey, setPhaseKey] = useState("period");
  const [periodLength, setPeriodLength] = useState(5);
  const [pregnancyChance, setPregnancyChance] = useState("დაბალი");
  const [phaseColor, setPhaseColor] = useState("#ff4d88");
  const [userGoal, setUserGoal] = useState(DEFAULT_GOAL);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [dailyAdvice, setDailyAdvice] = useState("დღეს საკუთარ სხეულს მოუსმინე და ჩაინიშნე როგორ გრძნობ თავს.");

  const theme = {
    bg: isDark ? "#0F0F0F" : "#faf7f7",
    card: isDark ? "#1A1A1A" : "#fff",
    text: isDark ? "#FFFFFF" : "#333",
    subText: isDark ? "#AAAAAA" : "#888",
    primary: isDark ? "#E94560" : "#ff4d88",
    circleBg: isDark ? "#252525" : "#fff0f5",
  };

  const refreshHomeAdvice = useCallback(async (userId, adviceKey, forceRefresh = false) => {
    if (!forceRefresh && adviceKey === lastAdviceKeyRef.current) {
      return;
    }

    if (!forceRefresh && adviceRequestKeyRef.current === adviceKey) {
      return;
    }

    adviceRequestKeyRef.current = adviceKey;

    try {
      if (!forceRefresh) {
        const cachedAdvice = await readCachedHomeAdvice(userId, adviceKey);
        if (cachedAdvice) {
          setDailyAdvice(cachedAdvice);
          lastAdviceKeyRef.current = adviceKey;
          return;
        }
      }

      setAdviceLoading(true);

      const aiAdvice = await getHomeAssistantAdvice();
      if (adviceRequestKeyRef.current !== adviceKey) {
        return;
      }

      if (aiAdvice?.text) {
        setDailyAdvice(aiAdvice.text);
        lastAdviceKeyRef.current = adviceKey;
        await writeCachedHomeAdvice(userId, adviceKey, aiAdvice.text);
      }
    } catch (aiError) {
      console.log("Home AI advice error:", aiError);
    } finally {
      if (adviceRequestKeyRef.current === adviceKey) {
        adviceRequestKeyRef.current = "";
        setAdviceLoading(false);
      }
    }
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData({ forceAdviceRefresh: false });
    setRefreshing(false);
  };

  const getDailyStats = (day, total, pLength) => {
    const ovulation = total - 14;
    if (day <= pLength) return { anger: 35, energy: 20, appetite: 75, stability: 40 };
    if (day < ovulation - 5) return { anger: 10, energy: 85, appetite: 40, stability: 90 };
    if (day >= ovulation - 5 && day <= ovulation + 1) return { anger: 5, energy: 98, appetite: 50, stability: 85 };
    if (day > ovulation + 1 && day < total - 6) return { anger: 20, energy: 60, appetite: 60, stability: 75 };
    return { anger: 90, energy: 30, appetite: 95, stability: 15 };
  };

  const getPhaseAndChance = useCallback((day, totalLength, pLength) => {
    const ovulation = totalLength - 13;
    const chanceKey = getPregnancyChanceKey(day, totalLength);

    if (day <= pLength) {
      return { phase: "პერიოდი", phaseKey: "period", chance: "ძალიან დაბალი", color: theme.primary };
    }

    if (day < ovulation - 5) {
      return { phase: "ფოლიკულური ფაზა", phaseKey: "follicular", chance: "დაბალი", color: "#48CAE4" };
    }

    if (day >= ovulation - 5 && day <= ovulation + 1) {
      const isPeak = day === ovulation || day === ovulation - 1;
      return {
        phase: "ნაყოფიერი პერიოდი",
        phaseKey: "fertile",
        chance: chanceKey === "veryHigh" ? "უმაღლესი 🔥" : "მაღალი",
        color: isPeak ? "#ffd166" : "#06d6a0",
      };
    }

    return { phase: "ლუტეალური ფაზა", phaseKey: "luteal", chance: "დაბალი", color: "#C8B6FF" };
  }, [theme.primary]);

  const loadData = useCallback(async ({ forceAdviceRefresh = false } = {}) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setAdviceLoading(false);
        return;
      }

      const today = dayjs().startOf("day");
      const todayKey = today.format("YYYY-MM-DD");

      const [cyclesRes, profileRes, todaySymptomsRes] = await Promise.all([
        supabase.from("cycles").select("*").eq("user_id", user.id).order("start_date", { ascending: true }),
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("symptoms").select("symptoms, mood, note").eq("user_id", user.id).eq("date", todayKey).maybeSingle(),
      ]);

      const cycles = cyclesRes.data || [];
      const profile = profileRes.data;
      const todayEntry = todaySymptomsRes.data || null;
      const currentGoal = profile?.goal || DEFAULT_GOAL;

      setUserGoal(currentGoal);

      if (!profile && cycles.length === 0) {
        setAdviceLoading(false);
        return;
      }

      const preferredCycleLength = getPreferredCycleLength(cycles, profile);
      const preferredPeriodLength = getPreferredPeriodLength(cycles, profile);
      const lastStartDate = cycles.length > 0 ? cycles[cycles.length - 1].start_date : profile?.last_period;

      if (!lastStartDate) {
        setAdviceLoading(false);
        return;
      }

      const cycleState = calculateCycleState({
        lastStartDate,
        cycleLength: preferredCycleLength,
        periodLength: preferredPeriodLength,
        referenceDate: today,
      });

      if (!cycleState) {
        setAdviceLoading(false);
        return;
      }

      setCycleLength(preferredCycleLength);
      setPeriodLength(preferredPeriodLength);

      setDaysLeft(cycleState.daysLeft);
      setNextPeriod(cycleState.nextPeriod.format("D MMMM"));

      const dayInCycle = cycleState.cycleDay;
      setCycleDay(dayInCycle);

      const status = getPhaseAndChance(dayInCycle, preferredCycleLength, preferredPeriodLength);
      setPhase(status.phase);
      setPhaseKey(status.phaseKey);
      setPregnancyChance(status.chance);
      setPhaseColor(status.color);

      const fallbackAdvice = getDailyAdvice({
        phaseKey: status.phaseKey,
        goal: currentGoal,
        cycleDay: dayInCycle,
        cycleLength: preferredCycleLength,
        periodLength: preferredPeriodLength,
        date: today.toDate(),
      });

      const adviceKey = [
        todayKey,
        currentGoal,
        dayInCycle,
        status.phaseKey,
        preferredCycleLength,
        preferredPeriodLength,
        [...(todayEntry?.symptoms || [])].sort().join("|"),
        todayEntry?.mood || "",
        (todayEntry?.note || "").trim(),
      ].join("::");

      if (!hasLoadedOnceRef.current) {
        setLoading(false);
        hasLoadedOnceRef.current = true;
      }

      if (isPremium) {
        if (forceAdviceRefresh || adviceKey !== lastAdviceKeyRef.current) {
          setDailyAdvice(fallbackAdvice);
        }

        void refreshHomeAdvice(user.id, adviceKey, forceAdviceRefresh);
      } else {
        setDailyAdvice(fallbackAdvice);
        setAdviceLoading(false);
      }
    } catch (error) {
      console.log("Home load error:", error);
    } finally {
      if (!hasLoadedOnceRef.current) {
        setLoading(false);
        hasLoadedOnceRef.current = true;
      }
    }
  }, [getPhaseAndChance, isPremium, refreshHomeAdvice]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const logPeriod = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const today = dayjs().format("YYYY-MM-DD");
      const { data: existing } = await supabase.from("cycles").select("id").eq("user_id", user.id).eq("start_date", today).maybeSingle();

      if (existing) {
        Alert.alert("ინფორმაცია", "დღევანდელი ციკლი უკვე დაფიქსირებულია.");
        return;
      }

      Alert.alert("დადასტურება", "დარწმუნებული ხარ, რომ ციკლი დღეს მოგივიდა? ✨", [
        { text: "გაუქმება", style: "cancel" },
        {
          text: "დიახ, დაამატე",
          onPress: async () => {
            const { error } = await supabase.from("cycles").insert([
              {
                user_id: user.id,
                start_date: today,
                period_length: periodLength,
                cycle_length: cycleLength,
              },
            ]);

            if (error) throw error;

            invalidateAssistantContextCache();
            await syncCycleRemindersForUser();

            Alert.alert(
              "წარმატება 🎉",
              "ახალი პერიოდი დაფიქსირებულია!\n\n💡 მითითება: თუ კალენდარში ძველი არასწორი ნიშნებიც დარჩა, შეგიძლია კალენდარში გადახვიდე, იმ დღეს დააჭირო და წაშალო."
            );

            loadData();
            DeviceEventEmitter.emit("cycleUpdated");
          },
        },
      ]);
    } catch {
      Alert.alert("შეცდომა", "მონაცემების შენახვა ვერ მოხერხდა");
    }
  };

  if (pregnancyMode) {
    return <PregnancyHomeScreen isDark={isDark} />;
  }

  if (loading && !refreshing) {
    return (
      <View style={[styles.container, { justifyContent: "center", backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const progress = cycleDay ? (cycleDay / cycleLength) * 100 : 0;
  const stats = getDailyStats(cycleDay, cycleLength, periodLength);

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.bg }]} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}>
      <Text style={[styles.topDate, { color: theme.subText }]}>{dayjs().format("D MMMM, dddd")}</Text>

      <LinearGradient
        colors={isDark ? ["#1C1820", "#121216"] : ["#FFFFFF", "#FFF8FA"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cycleMainCard}
      >
        <View style={styles.cycleCardHeader}>
          <View>
            <Text style={styles.cycleEyebrow}>CYCLE OVERVIEW</Text>
            <Text style={[styles.cycleCardTitle, { color: theme.text }]}>შენი ციკლის სტატუსი</Text>
          </View>
          <View style={styles.cycleHeaderIcon}>
            <Ionicons name="calendar-outline" size={19} color="#E94560" />
          </View>
        </View>

        <View style={styles.cycleStatusRow}>
          <View style={[styles.cycleStatusItem, { backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(233,69,96,0.05)" }]}>
            <View style={styles.cycleStatusLabelRow}>
              <Ionicons name="pulse-outline" size={14} color="#E94560" />
              <Text style={styles.cycleStatusLabel}>ფაზა</Text>
            </View>
            <Text style={[styles.cycleStatusValue, { color: theme.text }]}>{phase}</Text>
          </View>
          <View style={[styles.cycleStatusItem, { backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(233,69,96,0.05)" }]}>
            <View style={styles.cycleStatusLabelRow}>
              <Ionicons name="heart-outline" size={14} color="#E94560" />
              <Text style={styles.cycleStatusLabel}>{userGoal === "დაორსულება" ? "ნაყოფიერება" : "დაორსულების შანსი"}</Text>
            </View>
            <Text style={[styles.cycleStatusValue, { color: pregnancyChance.includes("მაღალი") || pregnancyChance.includes("უმაღლესი") ? "#06D6A0" : theme.primary }]}>{pregnancyChance}</Text>
          </View>
        </View>

        <View style={styles.cycleDayArea}>
          <View style={[styles.cycleCircleOuter, { borderColor: isDark ? "rgba(233,69,96,0.18)" : "rgba(233,69,96,0.14)" }]}>
            <View style={[styles.cycleCircleInner, { backgroundColor: isDark ? "rgba(233,69,96,0.08)" : "rgba(233,69,96,0.06)", borderColor: theme.primary }]}>
              <Text style={[styles.cycleDayNumber, { color: phaseColor }]}>{cycleDay}</Text>
              <Text style={[styles.cycleDayText, { color: phaseColor }]}>დღე</Text>
            </View>
          </View>
        </View>

        <View style={styles.cycleProgressHeader}>
          <Text style={[styles.cycleProgressLabel, { color: theme.subText }]}>მიმდინარე ციკლის პროგრესი</Text>
          <Text style={styles.cycleProgressPercent}>{Math.round(Math.min(progress, 100))}%</Text>
        </View>
        <View style={[styles.cycleProgressTrack, { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(233,69,96,0.10)" }]}>
          <LinearGradient
            colors={["#FF6B91", "#E94560"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.cycleProgressFill, { width: `${Math.min(progress, 100)}%` }]}
          />
        </View>

        <View style={styles.cyclePeriodSummary}>
          <View>
            <Text style={[styles.daysLeftLabel, { color: theme.subText }]}>შემდეგ პერიოდამდე დარჩა</Text>
            <Text style={[styles.daysLeftNumber, { color: theme.text }]}>{daysLeft} დღე</Text>
          </View>
          <View style={styles.cycleDatePill}>
            <Ionicons name="calendar-clear-outline" size={14} color="#E94560" />
            <Text style={styles.cycleDateText}>{nextPeriod}</Text>
          </View>
        </View>

        <TouchableOpacity activeOpacity={0.86} style={styles.cycleLogButton} onPress={logPeriod}>
          <Ionicons name="add-circle-outline" size={19} color="#FFFFFF" />
          <Text style={styles.logButtonText}>პერიოდი დამეწყო დღეს</Text>
        </TouchableOpacity>
      </LinearGradient>

      <View>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>დღევანდელი მაჩვენებლები</Text>
        <LinearGradient
          colors={isDark ? ["#19191D", "#121217"] : ["#FFFFFF", "#FCFAFC"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.statsCard}
        >
          <View style={styles.statsCardHeader}>
            <View>
              <Text style={styles.statsEyebrow}>DAILY OVERVIEW</Text>
              <Text style={[styles.statsCardTitle, { color: theme.text }]}>შენი დღიური სურათი</Text>
            </View>
            <View style={styles.statsHeaderIcon}>
              <Ionicons name="analytics-outline" size={19} color="#E94560" />
            </View>
          </View>

          <View style={styles.statsDivider} />

          <StatMeter icon="flame-outline" label="გაღიზიანება" percent={stats.anger} color="#FF6B6B" textColor={theme.text} />
          <StatMeter icon="flash-outline" label="ენერგიის დონე" percent={stats.energy} color="#48CAE4" textColor={theme.text} />
          <StatMeter icon="restaurant-outline" label="მადა" percent={stats.appetite} color="#FFB347" textColor={theme.text} />
          <StatMeter icon="leaf-outline" label="სტაბილურობა" percent={stats.stability} color="#06D6A0" textColor={theme.text} isLast />
        </LinearGradient>
      </View>

      <Text style={[styles.sectionTitle, { color: theme.text }]}>დღევანდელი რჩევა</Text>
      <View style={[styles.insightCard, { backgroundColor: theme.card }]}>
        <View style={[styles.insightIconBox, { backgroundColor: theme.circleBg }]}>
          <Text style={{ fontSize: 24 }}>{phaseKey === "fertile" ? "🌿" : phaseKey === "period" ? "🫶" : "💡"}</Text>
        </View>
        <View style={styles.insightContent}>
          <PrimePreview
            style={styles.insightPreview}
            minHeight={118}
            concealCompletely
            message="სრული რჩევის სანახავად გახსენი Prime"
          >
            <Text style={[styles.insightText, { color: theme.subText }]}>
              {dailyAdvice}
            </Text>
          </PrimePreview>

          {isPremium && adviceLoading && (
            <View style={styles.insightLoadingRow}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={[styles.insightHint, { color: theme.subText }]}>
                ასისტენტი აახლებს რჩევას...
              </Text>
            </View>
          )}
        </View>
        {isPremium && (
          <Text style={{ fontSize: 11, color: "#aaa", textAlign: "right", marginTop: 8, opacity: 0.7 }}>ასისტენტი შეიძლება შეცდეს</Text>
        )}
      </View>

      {!isPremium && !pregnancyMode && (
        <TouchableOpacity
          activeOpacity={0.82}
          style={styles.pregnancyBanner}
          onPress={() => router.push("/pregnancy-premium")}
        >
          <LinearGradient
            colors={isDark ? ["#19171C", "#14211F"] : ["#FFFFFF", "#F2FBF8"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.pregnancyBannerGradient}
          >
            <View style={styles.pregnancyBannerLeft}>
              <View style={styles.pregnancyBannerIcon}>
                <Ionicons name="heart" size={23} color="#06B98A" />
              </View>
              <View style={styles.pregnancyBannerCopy}>
                <View style={styles.pregnancyBannerEyebrow}>
                  <Text style={styles.pregnancyBannerEyebrowText}>MATERNITY</Text>
                  <View style={styles.pregnancyBannerDot} />
                  <Text style={styles.pregnancyBannerEyebrowText}>PREMIUM</Text>
                </View>
                <Text style={[styles.pregnancyBannerTitle, { color: theme.text }]}>ორსულობის რეჟიმი</Text>
                <Text style={[styles.pregnancyBannerSub, { color: theme.subText }]}>კვირეული AI რჩევა, ნოტიფიკაციები და ნაყოფის ვიზუალიზაცია</Text>
              </View>
            </View>
            <View style={styles.pregnancyBannerArrow}>
              <Ionicons name="chevron-forward" size={16} color="#06B98A" />
            </View>
          </LinearGradient>
        </TouchableOpacity>
      )}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

function BabyImage({ uri, emoji }) {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  if (error) {
    return <Text style={{ fontSize: 100 }}>{emoji}</Text>;
  }

  return (
    <View style={{ width: "100%", aspectRatio: 1, backgroundColor: "#111", justifyContent: "center", alignItems: "center" }}>
      {loading && <ActivityIndicator color="#ff4d88" size="large" style={{ position: "absolute" }} />}
      <Image
        source={{ uri }}
        style={{ width: "100%", height: "100%" }}
        resizeMode="contain"
        onLoad={() => setLoading(false)}
        onError={(e) => { console.log("Baby image error:", uri, e.nativeEvent?.error); setError(true); setLoading(false); }}
      />
    </View>
  );
}

function WeeklyAdviceCard({ text, trimesterColor, isDark, theme }) {
  const babyIdx = text.indexOf("🍼");
  const adviceIdx = text.indexOf("💗");

  if (babyIdx === -1 || adviceIdx === -1 || babyIdx >= adviceIdx) {
    return (
      <View style={{ padding: 24 }}>
        <Text style={{ color: theme.text, fontSize: 15, lineHeight: 26 }}>{text}</Text>
      </View>
    );
  }

  const babyBody = text.slice(babyIdx, adviceIdx).replace(/^🍼[^\n]*\n?/, "").trim();
  const adviceBody = text.slice(adviceIdx).replace(/^💗[^\n]*\n?/, "").trim();

  return (
    <View>
      <View style={{ padding: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <View style={{ width: 3, height: 18, borderRadius: 2, backgroundColor: trimesterColor }} />
          <Text style={{ color: trimesterColor, fontWeight: "700", fontSize: 14 }}>🍼 ნაყოფის განვითარება</Text>
        </View>
        <Text style={{ color: theme.text, fontSize: 15, lineHeight: 26 }}>{babyBody}</Text>
      </View>
      <View style={{ height: 1, backgroundColor: isDark ? "#2a2a2a" : "#f0f0f0", marginHorizontal: 20 }} />
      <View style={{ padding: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <View style={{ width: 3, height: 18, borderRadius: 2, backgroundColor: "#ff4d88" }} />
          <Text style={{ color: "#ff4d88", fontWeight: "700", fontSize: 14 }}>💗 ამ კვირის რჩევა</Text>
        </View>
        <Text style={{ color: theme.text, fontSize: 15, lineHeight: 26 }}>{adviceBody}</Text>
      </View>
      <Text style={{ fontSize: 11, color: "#aaa", textAlign: "right", paddingHorizontal: 20, paddingBottom: 12, opacity: 0.7 }}>ასისტენტი შეიძლება შეცდეს</Text>
    </View>
  );
}

function StatMeter({ icon, label, percent, color, textColor, isLast = false }) {
  const safePercent = Math.max(0, Math.min(percent, 100));

  return (
    <View style={[styles.meterWrapper, isLast && styles.meterWrapperLast]}>
      <View style={styles.meterLabelRow}>
        <View style={styles.meterIdentity}>
          <View style={[styles.meterIcon, { backgroundColor: `${color}1A` }]}>
            <Ionicons name={icon} size={15} color={color} />
          </View>
          <Text style={[styles.meterLabel, { color: textColor }]}>{label}</Text>
        </View>
        <View style={[styles.meterPercentPill, { backgroundColor: `${color}1A` }]}>
          <Text style={[styles.meterPercent, { color }]}>{safePercent}%</Text>
        </View>
      </View>
      <View style={styles.meterBg}>
        <View style={[styles.meterFill, { width: `${safePercent}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 60 },
  topDate: { textAlign: "center", fontSize: 16, marginBottom: 20, textTransform: "capitalize" },
  mainCard: { borderRadius: 30, padding: 25, alignItems: "center", elevation: 8, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 15, marginBottom: 30 },
  cycleMainCard: { borderRadius: 28, padding: 18, elevation: 8, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 15, marginBottom: 30, overflow: "hidden" },
  cycleCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  cycleEyebrow: { color: "#E94560", fontSize: 9, fontWeight: "900", letterSpacing: 1, marginBottom: 5 },
  cycleCardTitle: { fontSize: 18, fontWeight: "800" },
  cycleHeaderIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: "rgba(233,69,96,0.12)", justifyContent: "center", alignItems: "center" },
  cycleStatusRow: { flexDirection: "row", gap: 10 },
  cycleStatusItem: { flex: 1, minHeight: 72, borderRadius: 15, padding: 11, justifyContent: "space-between" },
  cycleStatusLabelRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  cycleStatusLabel: { color: "#A9A4AA", fontSize: 10, fontWeight: "700" },
  cycleStatusValue: { fontSize: 13, fontWeight: "800" },
  cycleDayArea: { alignItems: "center", paddingVertical: 20 },
  cycleCircleOuter: { width: 166, height: 166, borderRadius: 83, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  cycleCircleInner: { width: 140, height: 140, borderRadius: 70, borderWidth: 7, justifyContent: "center", alignItems: "center" },
  cycleProgressHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  cycleProgressLabel: { fontSize: 12, fontWeight: "700" },
  cycleProgressPercent: { color: "#E94560", fontSize: 12, fontWeight: "900" },
  cycleProgressTrack: { height: 7, borderRadius: 999, overflow: "hidden", marginBottom: 18 },
  cycleProgressFill: { height: "100%", borderRadius: 999 },
  cyclePeriodSummary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 17 },
  cycleDatePill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(233,69,96,0.11)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 8 },
  cycleDateText: { color: "#E94560", fontSize: 11, fontWeight: "800" },
  cycleLogButton: { minHeight: 52, borderRadius: 16, backgroundColor: "#E94560", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, elevation: 3 },
  infoRow: { flexDirection: "row", marginBottom: 30, width: "100%" },
  infoItem: { flex: 1, alignItems: "center", paddingHorizontal: 5 },
  infoLabel: { fontSize: 12, color: "#aaa", marginBottom: 5 },
  infoValue: { fontSize: 14, fontWeight: "700", textAlign: "center" },
  circleContainer: { width: 150, height: 150, borderRadius: 75, borderWidth: 8, justifyContent: "center", alignItems: "center", marginBottom: 20 },
  outerCircle: { alignItems: "center" },
  cycleDayNumber: { fontSize: 48, fontWeight: "800" },
  cycleDayText: { fontSize: 16, fontWeight: "600" },
  progressBarContainer: { width: "100%", height: 8, borderRadius: 4, marginBottom: 25, overflow: "hidden" },
  progressFill: { height: "100%" },
  daysLeftLabel: { fontSize: 16, marginBottom: 5 },
  daysLeftNumber: { fontSize: 32, fontWeight: "700", marginBottom: 5 },
  nextDateText: { fontSize: 14, marginBottom: 25 },
  logButton: { paddingVertical: 15, paddingHorizontal: 40, borderRadius: 20, elevation: 5 },
  logButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  sectionTitle: { fontSize: 20, fontWeight: "700", marginBottom: 15 },
  statsCard: { borderRadius: 24, padding: 18, marginBottom: 25, elevation: 4, position: "relative", overflow: "hidden" },
  statsCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statsEyebrow: { color: "#E94560", fontSize: 9, fontWeight: "900", letterSpacing: 1, marginBottom: 5 },
  statsCardTitle: { fontSize: 16, fontWeight: "800" },
  statsHeaderIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: "rgba(233,69,96,0.12)", justifyContent: "center", alignItems: "center" },
  statsDivider: { height: 1, backgroundColor: "rgba(150,150,150,0.12)", marginVertical: 17 },
  meterWrapper: { marginBottom: 16 },
  meterWrapperLast: { marginBottom: 0 },
  meterLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  meterIdentity: { flexDirection: "row", alignItems: "center", gap: 9 },
  meterIcon: { width: 28, height: 28, borderRadius: 9, justifyContent: "center", alignItems: "center" },
  meterLabel: { fontSize: 13, fontWeight: "700" },
  meterPercentPill: { minWidth: 46, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, alignItems: "center" },
  meterPercent: { fontSize: 12, fontWeight: "800" },
  meterBg: { height: 6, backgroundColor: "rgba(150,150,150,0.12)", borderRadius: 999, overflow: "hidden" },
  meterFill: { height: "100%", borderRadius: 4 },
  insightCard: { borderRadius: 24, padding: 8, elevation: 3, overflow: "hidden" },
  insightIconBox: { display: "none" },
  insightContent: { gap: 10 },
  insightPreview: { alignSelf: "stretch" },
  insightLoadingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  insightHint: { fontSize: 12, fontWeight: "600" },
  insightText: { fontSize: 14, lineHeight: 21 },
  pregnancyBanner: {
    marginTop: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(6,185,138,0.26)",
    overflow: "hidden",
  },
  pregnancyBannerGradient: {
    minHeight: 112,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pregnancyBannerLeft: { flexDirection: "row", alignItems: "center", gap: 13, flex: 1 },
  pregnancyBannerIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "rgba(6,185,138,0.13)",
    borderColor: "rgba(6,185,138,0.18)",
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  pregnancyBannerCopy: { flex: 1 },
  pregnancyBannerEyebrow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  pregnancyBannerEyebrowText: { color: "#06B98A", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  pregnancyBannerDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: "#06B98A" },
  pregnancyBannerTitle: { fontSize: 16, fontWeight: "800", marginBottom: 3 },
  pregnancyBannerSub: { fontSize: 12, lineHeight: 17, paddingRight: 4 },
  pregnancyBannerArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(6,185,138,0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
});
