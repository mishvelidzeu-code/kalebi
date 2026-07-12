import dayjs from "dayjs";
import "dayjs/locale/ka";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, DeviceEventEmitter, Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";

import DiaryAvatar from "../../components/DiaryAvatar";
import PrimePreview from "../../components/PrimePreview";
import { TEMP_FERTILITY_COMING_SOON } from "../../constants/tempFlags";
import { useTheme } from "../../context/ThemeContext";
import { usePregnancy } from "../../context/PregnancyContext";
import { useFertility } from "../../context/FertilityContext";
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
const PREGNANCY_BANNER_IMAGE = require("../../assets/images/pregnancy-banner-hero.png");
const FERTILITY_BANNER_IMAGE = require("../../assets/images/minda-daorsuleba.png");
const ASSISTANT_GUIDE_IMAGE = require("../../assets/images/assistant-guide.png");

function getBabyImageUrl(week) {
  if (!SUPABASE_URL || week < 1 || week > 40) return null;
  const imageKey = week <= 8 ? "1" : week <= 19 ? "2" : week <= 30 ? "3" : "4";
  return `${SUPABASE_URL}/storage/v1/object/public/baby-images/${imageKey}.png`;
}

function getBabyWeekDetails(week, baby) {
  const trimesterNote =
    week <= 12
      ? "ამ ეტაპზე სხეული სწრაფად ეწყობა ორსულობას. დაღლილობა, გულისრევა, მკერდის მგრძნობელობა და ემოციური ცვლილებები ხშირია."
      : week <= 27
        ? "ამ პერიოდში ბევრს ენერგია უბრუნდება. შეიძლება ნელ-ნელა იგრძნო მოძრაობა, მუცლის დაჭიმულობა ან ზურგის მსუბუქი დაღლა."
        : "ბავშვი აქტიურად იმატებს წონაში. შეიძლება იგრძნო სიმძიმე, შეშუპება, ძილის სირთულე ან უფრო ხშირი მოძრაობები.";

  const developmentNote =
    week <= 8
      ? "ნაყოფის მთავარი ორგანოები ახლა ყალიბდება და განვითარება ძალიან სწრაფად მიდის."
      : week <= 19
        ? "სახის ნაკვთები, კიდურები და შეგრძნებების საფუძველი უფრო მკაფიო ხდება."
        : week <= 30
          ? "ბავშვი იზრდება, მოძრაობები ძლიერდება და სმენა/რეაქციები უფრო შესამჩნევი ხდება."
          : "ბავშვი უკვე ემზადება დაბადებისთვის: იმატებს ცხიმს, ძალას და უფრო სტაბილურ რიტმს.";

  return [
    `${week}-ე კვირაში ნაყოფის ზომა დაახლოებით "${baby.size}"-ს შეედრება.`,
    developmentNote,
    trimesterNote,
    baby.advice,
  ].join("\n\n");
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
  3:  { size: "ყაყაჩოს თესლი", emoji: "🌱", advice: "ნაყოფი ახლა ძალიან პატარაა - 1-2 მმ. მიიღე ვიტამინები." },
  4:  { size: "ხაშხაშის თესლი", emoji: "🌸", advice: "გული ახლა ჩამოყალიბდება. მოერიდე ალკოჰოლს და კოფეინს." },
  5:  { size: "სეზამი", emoji: "🫘", advice: "ნაყოფი დაახლოებით 5 მმ-ია. პირველი ექიმის ვიზიტი დაგეგმე." },
  6:  { size: "მოცვი", emoji: "🫐", advice: "გული ცემს! ახლა შეიძლება გულისრევა გაჩნდეს." },
  7:  { size: "ჟოლო", emoji: "🍓", advice: "ტვინი სწრაფად ვითარდება. ბევრი სითხე დალიე." },
  8:  { size: "კივი", emoji: "🥝", advice: "ნაყოფი 1.6 სმ-ია. ყველა ძირითადი ორგანო ვითარდება." },
  9:  { size: "ყურძნის მარცვალი", emoji: "🍇", advice: "ნაყოფს ახლა ყველა თითი აქვს. ეჭვები ნორმალურია." },
  10: { size: "ატამი", emoji: "🍑", advice: "კრიტიკული ფაზა დასრულდა - ნაყოფი ახლა ნაყოფია!" },
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
  30: { size: "კომბოსტო", emoji: "🥬", advice: "ახლა ნაყოფი 1.3 კგ-ია. სვინგები ხშირია - ეს ნორმალურია." },
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

const TRIMESTER_LABELS = { 1: "I ტრიმესტრი", 2: "II ტრიმესტრი", 3: "III ტრიმესტრი" };

function PregnancyHomeScreen({ isDark }) {
  const { currentWeek, currentTrimester, daysRemaining } = usePregnancy();
  const { width: screenWidth } = useWindowDimensions();
  const [weeklyAdvice, setWeeklyAdvice] = useState("");
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [adviceError, setAdviceError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showBabyModal, setShowBabyModal] = useState(false);
  const loadedForWeekRef = useRef(null);
  const isMountedRef = useRef(true);
  const calendarScrollRef = useRef(null);

  const week = Math.min(Math.max(currentWeek || 1, 1), 40);
  const baby = BABY_DATA[week];
  const progress = (week / 40) * 100;
  const today = dayjs();
  const calendarVisibleWidth = screenWidth - 40;
  const calendarGap = 10;
  const calendarItemWidth = (calendarVisibleWidth - calendarGap * 4) / 5;
  const todayCalendarIndex = 30;
  const calendarSnapInterval = calendarItemWidth + calendarGap;
  const todayCalendarOffset = Math.max(0, (todayCalendarIndex - 2) * calendarSnapInterval);
  const calendarDays = Array.from({ length: 61 }, (_, index) => today.add(index - todayCalendarIndex, "day"));
  const babyImageUrl = getBabyImageUrl(week);
  const trimesterLabel = TRIMESTER_LABELS[currentTrimester] || TRIMESTER_LABELS[1];
  const theme = {
    bg: isDark ? "#1A1115" : "#fff8fa",
    card: isDark ? "rgba(35,24,30,0.82)" : "rgba(255,255,255,0.72)",
    text: isDark ? "#FFFFFF" : "#2F2026",
    subText: isDark ? "#D0B9C2" : "#8F6574",
    primary: "#ff4d88",
    glass: isDark ? "rgba(44,29,37,0.72)" : "rgba(255,255,255,0.58)",
    glassStrong: isDark ? "rgba(58,38,48,0.82)" : "rgba(255,255,255,0.72)",
    glassBorder: isDark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.74)",
    cardText: isDark ? "#FFF3F7" : "#3B232C",
    mutedText: isDark ? "#D7B8C4" : "#8F6574",
    activeCalendar: isDark ? ["rgba(255,77,136,0.95)", "rgba(153,62,93,0.9)"] : ["rgba(255,77,136,0.95)", "rgba(255,144,177,0.78)"],
    babyCard: isDark ? ["rgba(76,42,51,0.96)", "rgba(128,57,82,0.9)"] : ["rgba(255,233,219,0.95)", "rgba(255,148,182,0.9)"],
  };

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (babyImageUrl) Image.prefetch(babyImageUrl).catch(() => {});
  }, [babyImageUrl]);

  const scrollTodayToCenter = useCallback((animated = true) => {
    calendarScrollRef.current?.scrollTo({ x: todayCalendarOffset, animated });
  }, [todayCalendarOffset]);

  useEffect(() => {
    const timer = setTimeout(() => scrollTodayToCenter(false), 80);
    return () => clearTimeout(timer);
  }, [screenWidth, scrollTodayToCenter]);

  const loadWeeklyAdvice = useCallback(async (force = false) => {
    if (!force && loadedForWeekRef.current === week) return;
    if (!isMountedRef.current) return;
    setAdviceError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!isMountedRef.current || !user) return;
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

  return (
    <LinearGradient
      colors={isDark ? ["#25151B", "#140E12", "#120C10"] : ["#FFFDFC", "#FFEFF4", "#F8B5C9"]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={styles.pregnancyRoot}
    >
      <ScrollView
        style={styles.pregnancyScroll}
        contentContainerStyle={styles.pregnancyContent}
        showsVerticalScrollIndicator={false}
        onLayout={() => scrollTodayToCenter(false)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        <View style={styles.pregnancyHeader}>
          <Text style={[styles.pregnancyTitle, { color: theme.text }]}>ბავშვის ზრდის ფაზა</Text>
        </View>

        <ScrollView
          ref={calendarScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: todayCalendarOffset, y: 0 }}
          contentContainerStyle={styles.weekCalendarContent}
          snapToInterval={calendarSnapInterval}
          decelerationRate="fast"
        >
          {calendarDays.map((date, index) => {
            const isToday = index === todayCalendarIndex;
            return (
              <TouchableOpacity
                key={date.format("YYYY-MM-DD")}
                activeOpacity={0.8}
                style={[
                  styles.weekDayItem,
                  {
                    width: calendarItemWidth,
                    backgroundColor: theme.glass,
                    borderColor: theme.glassBorder,
                  },
                ]}
              >
                {isToday ? (
                  <LinearGradient colors={theme.activeCalendar} style={[styles.weekDayGlass, { width: calendarItemWidth }]}>
                    <Text style={styles.weekDayNameActive}>{date.format("ddd")}</Text>
                    <Text style={styles.weekDayNumberActive}>{date.format("D")}</Text>
                  </LinearGradient>
                ) : (
                  <>
                    <Text style={[styles.weekDayName, { color: theme.mutedText }]}>{date.format("ddd")}</Text>
                    <Text style={[styles.weekDayNumber, { color: theme.cardText }]}>{date.format("D")}</Text>
                  </>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.babyGrowthCard}>
          <LinearGradient
            colors={theme.babyCard}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.babyGrowthGradient}
          >
            <View style={[styles.babyWeekBadge, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
              <Text style={[styles.babyWeekBadgeText, { color: theme.cardText }]}>{week} კვირა</Text>
            </View>
            <View style={styles.babyImageStage}>
              <BabyPreview uri={babyImageUrl} emoji={baby.emoji} />
            </View>
            <View style={styles.babyOrbitLine} />
            <TouchableOpacity
              style={[styles.assistantGlassButton, { backgroundColor: theme.glassStrong, borderColor: theme.glassBorder }]}
              activeOpacity={0.86}
              onPress={() => setShowBabyModal(true)}
            >
              <View style={[styles.assistantAvatar, { backgroundColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(255,236,242,0.9)" }]}>
                <Text style={styles.assistantAvatarEmoji}>{baby.emoji}</Text>
              </View>
              <View style={styles.assistantCopy}>
                <Text style={[styles.assistantLabel, { color: theme.cardText }]}>ნაყოფის აღწერა</Text>
                <Text style={[styles.assistantSub, { color: theme.mutedText }]}>{baby.size}</Text>
              </View>
              <View style={[styles.assistantArrow, { backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.75)" }]}>
                <Ionicons name="arrow-forward" size={18} color={isDark ? "#FFE8F0" : "#7C4054"} />
              </View>
            </TouchableOpacity>
          </LinearGradient>
        </View>

        <View style={styles.pregnancyInsightGrid}>
          <View style={[styles.pregnancyMetricCard, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
            <Text style={[styles.pregnancyMetricLabel, { color: theme.mutedText }]}>ტრიმესტრი</Text>
            <Text style={[styles.pregnancyMetricValue, { color: theme.cardText }]}>{trimesterLabel}</Text>
          </View>
          <View style={[styles.pregnancyMetricCard, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
            <Text style={[styles.pregnancyMetricLabel, { color: theme.mutedText }]}>დარჩენილია</Text>
            <Text style={[styles.pregnancyMetricValue, { color: theme.cardText }]}>{daysRemaining} დღე</Text>
          </View>
        </View>

        <View style={[styles.weekProgressCard, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
          <View style={styles.weekProgressHeader}>
            <Text style={[styles.weekProgressTitle, { color: theme.cardText }]}>ორსულობის პროგრესი</Text>
            <Text style={styles.weekProgressPercent}>{Math.round(progress)}%</Text>
          </View>
          <View style={styles.weekProgressTrack}>
            <View style={[styles.weekProgressFill, { width: `${Math.min(progress, 100)}%` }]} />
          </View>
          <Text style={[styles.weekProgressHint, { color: theme.mutedText }]}>სავარაუდო მშობიარობა: {dayjs().add(daysRemaining, "day").format("D MMMM YYYY")}</Text>
        </View>

        <Text style={[styles.pregnancySectionTitle, { color: theme.text }]}>კვირის რჩევა</Text>
        <View style={[styles.weekAdviceGlass, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
          <View style={styles.pregnancyAdviceDoctorRow}>
            <View style={[styles.pregnancyAdviceDoctorAvatar, { borderColor: theme.glassBorder }]}>
              <Image source={ASSISTANT_GUIDE_IMAGE} style={styles.pregnancyAdviceDoctorImage} resizeMode="cover" />
            </View>
          </View>
          {adviceLoading ? (
            <View style={styles.pregnancyAdviceLoading}>
              <ActivityIndicator color={theme.primary} size="small" />
              <Text style={[styles.weekAdviceText, { color: theme.cardText }]}>ასისტენტი ამზადებს კვირის განახლებას...</Text>
            </View>
          ) : weeklyAdvice ? (
            <WeeklyAdviceCard text={weeklyAdvice} trimesterColor={theme.primary} isDark={isDark} theme={theme} />
          ) : adviceError ? (
            <View style={{ padding: 20 }}>
              <Text style={[styles.weekAdviceText, { color: theme.cardText }]}>{adviceError}</Text>
              <TouchableOpacity onPress={() => loadWeeklyAdvice(true)} style={styles.retryAdviceButton}>
                <Text style={styles.retryAdviceText}>ხელახლა სცადე</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={[styles.weekAdviceText, { color: theme.cardText }]}>{baby.advice}</Text>
          )}
        </View>

        <View style={{ height: 160 }} />
      </ScrollView>
      <View style={styles.floatingDiaryAvatar}>
        <DiaryAvatar accent={theme.primary} isDark={isDark} size={46} showHint={false} />
      </View>

      <Modal visible={showBabyModal} transparent animationType="fade" onRequestClose={() => setShowBabyModal(false)}>
        <Pressable style={styles.babyModalOverlay} onPress={() => setShowBabyModal(false)}>
          <Pressable
            style={[
              styles.babyModalCard,
              {
                backgroundColor: isDark ? "rgba(37,24,31,0.96)" : "rgba(255,248,250,0.96)",
                borderColor: theme.glassBorder,
              },
            ]}
            onPress={() => {}}
          >
            <TouchableOpacity onPress={() => setShowBabyModal(false)} style={styles.babyModalClose}>
              <Ionicons name="close" size={20} color="#fff" />
            </TouchableOpacity>
            <View style={styles.babyModalPreview}>
              <BabyPreview uri={babyImageUrl} emoji={baby.emoji} />
            </View>
            <Text style={styles.babyModalWeek}>{week}-ე კვირა</Text>
            <Text style={[styles.babyModalTitle, { color: theme.cardText }]}>ნაყოფის აღწერა</Text>
            <Text style={[styles.babyModalText, { color: theme.mutedText }]}>{getBabyWeekDetails(week, baby)}</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </LinearGradient>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { isDark, isPremium, isAdmin } = useTheme();
  const { pregnancyMode } = usePregnancy();
  const { fertilityMode } = useFertility();
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
  const [userName, setUserName] = useState("");
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [dailyAdvice, setDailyAdvice] = useState("დღეს საკუთარ სხეულს მოუსმინე და ჩაინიშნე როგორ გრძნობ თავს.");

  const theme = {
    bg: isDark ? "#211621" : "#FFFDFC",
    card: isDark ? "rgba(55,40,58,0.86)" : "rgba(255,255,255,0.78)",
    text: isDark ? "#FFF7FB" : "#2F2026",
    subText: isDark ? "#E9C7D4" : "#8F6574",
    primary: "#FF4D88",
    circleBg: isDark ? "#241A2B" : "#fff0f5",
    softCard: isDark ? "rgba(67,49,72,0.72)" : "rgba(255,255,255,0.72)",
    border: isDark ? "rgba(255,209,224,0.16)" : "rgba(255,255,255,0.82)",
    peach: "#FF9E7D",
    lavender: "#B8A4FF",
    fertile: "#9AB7FF",
    glassIcon: isDark ? "rgba(255,209,224,0.10)" : "rgba(255,255,255,0.58)",
    pageGradient: isDark ? ["#2A1B2A", "#211621", "#17151D"] : ["#FFFDFC", "#FFF1EB", "#F6F0FF"],
    heroGradient: isDark ? ["#3A2A44", "#2A2036", "#1B1721"] : ["#FFFFFF", "#FFF2E8", "#F4ECFF"],
    cardGradient: isDark ? ["rgba(68,48,70,0.96)", "rgba(35,26,42,0.94)"] : ["rgba(255,255,255,0.92)", "rgba(255,240,232,0.84)", "rgba(246,240,255,0.82)"],
    bannerGradient: isDark ? ["#3A2330", "#241B2C", "#173028"] : ["#FFFFFF", "#FFF0EA", "#EFFBF5"],
    fertilityBannerGradient: isDark ? ["#16332B", "#1C2B33", "#122336"] : ["#F2FFFB", "#E7FBF1", "#EAF4FF"],
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
      const rawGoal = profile?.goal || DEFAULT_GOAL;
      // Fertility goal is free to pick, but the tailored advice pool is locked
      // behind the same "pregnancy" entitlement until the user pays for it.
      const fertilityUnlocked = isAdmin || Boolean(profile?.has_pregnancy_subscription);
      const currentGoal = rawGoal === "დაორსულება" && !fertilityUnlocked ? DEFAULT_GOAL : rawGoal;

      setUserName(profile?.name || user.email?.split("@")[0] || "ანი");

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
  }, [getPhaseAndChance, isPremium, isAdmin, refreshHomeAdvice]);

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
      <LinearGradient colors={theme.pageGradient} style={[styles.container, { justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </LinearGradient>
    );
  }

  const progress = cycleDay ? (cycleDay / cycleLength) * 100 : 0;
  const stats = getDailyStats(cycleDay, cycleLength, periodLength);
  const ovulationDay = cycleLength - 13;
  // Days until the estimated ovulation, rolling into the next cycle once passed.
  let daysToOvulation = cycleDay ? ovulationDay - cycleDay : null;
  if (daysToOvulation != null && daysToOvulation < -1) daysToOvulation += cycleLength;
  const ovulationLabel = daysToOvulation == null
    ? "დაამატე ციკლი პროგნოზისთვის"
    : daysToOvulation > 0
      ? `ოვულაციამდე ${daysToOvulation} დღე`
      : daysToOvulation === 0
        ? "ოვულაცია სავარაუდოდ დღეს 🌟"
        : "ოვულაცია ახლახან იყო";
  const calendarColors = {
    period: "#E94560",
    ovulation: "#FFD166",
    fertile: "#35C99B",
    today: "#6C63FF",
    neutral: isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.62)",
  };
  const today = dayjs();
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = today.add(index - 3, "day");
    const offset = date.startOf("day").diff(today.startOf("day"), "day");
    const predictedCycleDay = cycleDay ? ((cycleDay + offset - 1 + cycleLength) % cycleLength) + 1 : null;
    const isPeriod = predictedCycleDay ? predictedCycleDay <= periodLength : false;
    const isOvulation = predictedCycleDay ? predictedCycleDay === ovulationDay || predictedCycleDay === ovulationDay - 1 : false;
    const isFertile = predictedCycleDay ? predictedCycleDay >= ovulationDay - 5 && predictedCycleDay <= ovulationDay + 1 : false;
    return { date, isToday: offset === 0, isPeriod, isOvulation, isFertile };
  });
  const heroMainNumber = cycleDay && cycleDay <= periodLength ? cycleDay : (daysLeft ?? "-");
  const heroMainLabel = cycleDay && cycleDay <= periodLength
    ? "მენსტრუაციის მიმდინარე დღე"
    : "მენსტრუაციამდე დარჩა";
  const trackerNumberColor = cycleDay && cycleDay <= periodLength
    ? theme.primary
    : daysLeft != null && daysLeft <= 1
      ? "#E94560"
      : daysLeft != null && daysLeft <= 3
        ? "#FF6B6B"
        : phaseColor;

  return (
    <LinearGradient
      colors={theme.pageGradient}
      style={styles.regularRoot}
    >
      <ScrollView style={styles.regularScroll} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}>
        <View style={styles.regularHeader}>
          <View>
            <Text style={[styles.regularGreeting, { color: theme.text }]}>გამარჯობა, {userName || "ანი"}!</Text>
            <Text style={[styles.regularDate, { color: theme.subText }]}>{dayjs().format("D MMMM, dddd")}</Text>
          </View>
        </View>

        <LinearGradient colors={theme.heroGradient} style={[styles.regularHeroCard, { borderColor: theme.border }]}>
          <View style={styles.heroGlowPeach} />
          <View style={styles.heroGlowLavender} />
          <View style={styles.heroMiniCardsRow}>
            <View style={[styles.heroMiniCard, { backgroundColor: theme.softCard, borderColor: theme.border }]}>
              <View style={[styles.heroMiniIcon, { backgroundColor: `${theme.fertile}22` }]}>
                <Ionicons name="leaf" size={16} color={theme.fertile} />
              </View>
              <View style={styles.heroMiniCopy}>
                <Text style={[styles.heroMiniLabel, { color: theme.subText }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>ნაყოფიერი პერიოდი</Text>
                <Text style={[styles.heroMiniValue, { color: phaseColor }]} numberOfLines={1}>{phase}</Text>
              </View>
            </View>
            <View style={[styles.heroMiniCard, { backgroundColor: theme.softCard, borderColor: theme.border }]}>
              <View style={[styles.heroMiniIcon, { backgroundColor: "rgba(255,138,107,0.18)" }]}>
                <Ionicons name="heart" size={16} color="#FF8A6B" />
              </View>
              <View style={styles.heroMiniCopy}>
                <Text style={[styles.heroMiniLabel, { color: theme.subText }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>დაორსულების შანსი</Text>
                <Text style={[styles.heroMiniValue, { color: pregnancyChance.includes("მაღალი") || pregnancyChance.includes("უმაღლესი") ? "#06D6A0" : theme.primary }]} numberOfLines={1}>{pregnancyChance}</Text>
              </View>
            </View>
          </View>
          <View style={styles.circularTracker}>
            <LinearGradient colors={[theme.peach, "#FF7EA8", theme.lavender, theme.fertile]} style={styles.trackerRing}>
              <View style={[styles.trackerInner, { backgroundColor: isDark ? "#1B171E" : "#FFFDFC" }]}>
                <Text style={[styles.trackerLabel, { color: theme.subText }]}>{heroMainLabel}</Text>
                <Text style={[styles.trackerNumber, { color: trackerNumberColor, textShadowColor: `${trackerNumberColor}55` }]}>{heroMainNumber}</Text>
                <Text style={[styles.trackerDateHint, { color: theme.subText }]}>შემდეგი პროგნოზი: {nextPeriod}</Text>
              </View>
            </LinearGradient>
            <View style={[styles.trackerProgressDot, { backgroundColor: phaseColor, transform: [{ rotate: `${Math.min(progress, 100) * 3.6}deg` }, { translateY: -104 }] }]} />
          </View>
          <TouchableOpacity style={styles.trackerCta} onPress={logPeriod} activeOpacity={0.86}>
            <Text style={styles.trackerCtaText}>ციკლი დამეწყო დღეს</Text>
          </TouchableOpacity>
        </LinearGradient>

        {fertilityMode && (
          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.fertilityStrip, { backgroundColor: theme.softCard, borderColor: theme.border }]}
            onPress={() => router.push("/(tabs)/calendar")}
          >
            <View style={[styles.fertilityStripIcon, { backgroundColor: "rgba(14,159,110,0.14)" }]}>
              <Ionicons name="leaf" size={20} color="#0E9F6E" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fertilityStripTitle, { color: theme.text }]}>{ovulationLabel}</Text>
              <Text style={[styles.fertilityStripSub, { color: theme.subText }]}>დღეს: {pregnancyChance} · აღრიცხე ტესტი, ტემპერატურა და ნიშნები</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.subText} />
          </TouchableOpacity>
        )}

        <View style={[styles.weekMiniCard, { backgroundColor: theme.softCard, borderColor: theme.border }]}>
          <View style={styles.weekMiniRow}>
            {weekDays.map((item) => {
              const accent = item.isPeriod
                ? calendarColors.period
                : item.isOvulation
                  ? calendarColors.ovulation
                  : item.isFertile
                    ? calendarColors.fertile
                    : "transparent";
              const dayBackground = item.isToday
                ? calendarColors.today
                : accent === "transparent"
                  ? calendarColors.neutral
                  : `${accent}30`;
              return (
                <View key={item.date.format("YYYY-MM-DD")} style={styles.weekMiniDayWrap}>
                  <Text style={[styles.weekMiniName, { color: theme.subText }]}>{item.date.format("dd")}</Text>
                  <View style={[styles.weekMiniDay, item.isToday && styles.weekMiniToday, { backgroundColor: dayBackground }]}>
                    <Text style={[styles.weekMiniNumber, { color: item.isToday ? "#FFFFFF" : theme.text }]}>{item.date.format("D")}</Text>
                  </View>
                  <View style={[styles.weekMiniMark, { backgroundColor: accent }]} />
                </View>
              );
            })}
          </View>
          <View style={styles.weekLegendRow}>
            <View style={[styles.weekLegendItem, { backgroundColor: theme.glassIcon }]}>
              <View style={[styles.weekLegendDot, { backgroundColor: calendarColors.period }]} />
              <Text style={[styles.weekLegendText, { color: theme.subText }]}>პერიოდი</Text>
            </View>
            <View style={[styles.weekLegendItem, { backgroundColor: theme.glassIcon }]}>
              <View style={[styles.weekLegendDot, { backgroundColor: calendarColors.ovulation }]} />
              <Text style={[styles.weekLegendText, { color: theme.subText }]}>ოვულაცია</Text>
            </View>
            <View style={[styles.weekLegendItem, { backgroundColor: theme.glassIcon }]}>
              <View style={[styles.weekLegendDot, { backgroundColor: calendarColors.fertile }]} />
              <Text style={[styles.weekLegendText, { color: theme.subText }]}>ნაყოფიერი</Text>
            </View>
          </View>
        </View>

        <Text style={[styles.regularSectionTitle, { color: theme.text }]}>დღევანდელი მაჩვენებლები</Text>
        <LinearGradient
          colors={theme.cardGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.regularStatsCard, { borderColor: theme.border }]}
        >
          <View style={styles.regularStatsHeader}>
            <View>
              <Text style={styles.regularStatsEyebrow}>DAILY OVERVIEW</Text>
              <Text style={[styles.regularStatsTitle, { color: theme.text }]}>შენი დღიური სურათი</Text>
            </View>
            <View style={[styles.regularStatsIcon, { backgroundColor: theme.glassIcon, borderColor: theme.border }]}>
              <Ionicons name="analytics-outline" size={19} color="#FF8A6B" />
            </View>
          </View>
          <View style={[styles.regularStatsDivider, { backgroundColor: theme.border }]} />
          <StatMeter icon="flame-outline" label="გაღიზიანება" percent={stats.anger} color="#FF7A7A" textColor={theme.text} />
          <StatMeter icon="flash-outline" label="ენერგიის დონე" percent={stats.energy} color="#9AB7FF" textColor={theme.text} />
          <StatMeter icon="restaurant-outline" label="მადა" percent={stats.appetite} color="#FFB56F" textColor={theme.text} />
          <StatMeter icon="leaf-outline" label="სტაბილურობა" percent={stats.stability} color="#71D7B8" textColor={theme.text} isLast />
        </LinearGradient>

        <LinearGradient
          colors={isDark ? ["rgba(68,48,70,0.96)", "rgba(35,26,42,0.94)"] : ["rgba(255,255,255,0.96)", "rgba(255,239,231,0.9)", "rgba(247,241,255,0.86)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.adviceGlassCard, { borderColor: theme.border }]}
        >
          <View style={styles.adviceGlowPeach} />
          <View style={styles.adviceGlowLavender} />
          <View style={styles.adviceHeader}>
            <View style={[styles.adviceIconBubble, { backgroundColor: theme.glassIcon, borderColor: theme.border }]}>
              <Image source={ASSISTANT_GUIDE_IMAGE} style={styles.adviceGuideImage} resizeMode="cover" />
              <Text style={styles.smallInsightEmoji}>{phaseKey === "fertile" ? "🌿" : phaseKey === "period" ? "🫶" : "🍵"}</Text>
            </View>
            <View style={styles.adviceTitleWrap}>
              <Text style={styles.adviceEyebrow}>დღის გზამკვლევი</Text>
              <Text style={[styles.adviceTitle, { color: theme.text }]}>დღევანდელი რჩევა</Text>
            </View>
          </View>
          <PrimePreview
            style={styles.insightPreview}
            minHeight={142}
            concealCompletely
            message="სრული რჩევისთვის გახსენი Prime"
            buttonLabel="გახსნა"
          >
            <Text style={[styles.insightText, { color: theme.subText }]}>{dailyAdvice}</Text>
          </PrimePreview>
          {isPremium && adviceLoading && (
            <View style={styles.insightLoadingRow}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={[styles.insightHint, { color: theme.subText }]}>ასისტენტი აახლებს რჩევას...</Text>
            </View>
          )}
        </LinearGradient>

      {!isPremium && !pregnancyMode && (
        <TouchableOpacity
          activeOpacity={0.82}
          style={styles.pregnancyBanner}
          onPress={() => router.push("/pregnancy-premium")}
        >
          <LinearGradient
            colors={theme.bannerGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.pregnancyBannerGradient}
          >
            <View style={styles.pregnancyBannerGlowPink} />
            <View style={styles.pregnancyBannerGlowMint} />
            <View style={styles.pregnancyBannerLeft}>
              <View style={[styles.pregnancyBannerIcon, { backgroundColor: theme.glassIcon, borderColor: theme.border }]}>
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
            <View style={[styles.pregnancyBannerImageWrap, { backgroundColor: theme.glassIcon, borderColor: theme.border }]}>
              <Image source={PREGNANCY_BANNER_IMAGE} style={styles.pregnancyBannerImage} resizeMode="cover" />
            </View>
          </LinearGradient>
        </TouchableOpacity>
      )}

      {!isPremium && !pregnancyMode && (
        <TouchableOpacity
          activeOpacity={0.82}
          style={[styles.pregnancyBanner, styles.fertilityBannerShell]}
          onPress={() => {
            if (TEMP_FERTILITY_COMING_SOON) {
              Alert.alert("მალე დაემატება 🌿", "\"მინდა დაორსულება\" რეჟიმი მალე გაეშვება — ცოტაც მოითმინე.");
              return;
            }
            router.push({ pathname: "/(tabs)/profile", params: { openFertility: String(Date.now()) } });
          }}
        >
          <LinearGradient
            colors={theme.fertilityBannerGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.pregnancyBannerGradient}
          >
            <View style={styles.fertilityBannerGlowGreen} />
            <View style={styles.fertilityBannerGlowBlue} />
            <View style={styles.pregnancyBannerLeft}>
              <View style={[styles.pregnancyBannerIcon, { backgroundColor: theme.glassIcon, borderColor: theme.border }]}>
                <Ionicons name="leaf" size={23} color="#0E9F6E" />
              </View>
              <View style={styles.pregnancyBannerCopy}>
                <View style={styles.pregnancyBannerEyebrow}>
                  <Text style={styles.fertilityBannerEyebrowText}>FERTILITY</Text>
                  <View style={styles.fertilityBannerDot} />
                  <Text style={styles.fertilityBannerEyebrowText}>PREMIUM</Text>
                </View>
                <Text style={[styles.pregnancyBannerTitle, { color: theme.text }]}>მინდა დაორსულება</Text>
                <Text style={[styles.pregnancyBannerSub, { color: theme.subText }]}>ოვულაცია, ნაყოფიერი ფანჯარა და AI რჩევები ჩასახვის დაგეგმვისთვის</Text>
              </View>
            </View>
            <View style={[styles.pregnancyBannerImageWrap, { backgroundColor: theme.glassIcon, borderColor: theme.border }]}>
              <Image source={FERTILITY_BANNER_IMAGE} style={styles.pregnancyBannerImage} resizeMode="cover" />
            </View>
          </LinearGradient>
        </TouchableOpacity>
      )}

      <View style={{ height: 160 }} />
      </ScrollView>
      <View style={styles.floatingDiaryAvatar}>
        <DiaryAvatar accent={theme.primary} isDark={isDark} size={46} showHint={false} />
      </View>
    </LinearGradient>
  );
}

function BabyPreview({ uri, emoji }) {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(Boolean(uri));

  if (!uri || error) {
    return <Text style={styles.babyPreviewEmoji}>{emoji}</Text>;
  }

  return (
    <View style={styles.babyPreviewWrap}>
      {loading && <ActivityIndicator color="#ff4d88" size="small" style={styles.babyPreviewLoader} />}
      <Image
        source={{ uri }}
        style={styles.babyPreviewImage}
        resizeMode="contain"
        onLoad={() => setLoading(false)}
        onError={() => {
          setError(true);
          setLoading(false);
        }}
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
          <View style={[styles.meterIcon, { backgroundColor: `${color}24` }]}>
            <Ionicons name={icon} size={15} color={color} />
          </View>
          <Text style={[styles.meterLabel, { color: textColor }]}>{label}</Text>
        </View>
        <View style={[styles.meterPercentPill, { backgroundColor: `${color}24` }]}>
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
  pregnancyRoot: { flex: 1 },
  pregnancyScroll: { flex: 1 },
  pregnancyContent: { paddingTop: 54, paddingBottom: 24 },
  pregnancyHeader: { paddingHorizontal: 22, marginBottom: 12 },
  pregnancyTitle: { fontSize: 24, fontWeight: "900", letterSpacing: 0 },
  pregnancySubtitle: { marginTop: 5, fontSize: 13, fontWeight: "700" },
  weekCalendarContent: { gap: 10, paddingVertical: 7, paddingHorizontal: 20 },
  weekDayItem: {
    height: 64,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.72)",
  },
  weekDayGlass: {
    height: 64,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#FF4D88",
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  weekDayName: { color: "#8F6574", fontSize: 11, fontWeight: "800", textTransform: "capitalize" },
  weekDayNumber: { color: "#402933", fontSize: 17, fontWeight: "900", marginTop: 4 },
  weekDayNameActive: { color: "#fff", fontSize: 11, fontWeight: "900", textTransform: "capitalize" },
  weekDayNumberActive: { color: "#fff", fontSize: 17, fontWeight: "900", marginTop: 4 },
  babyGrowthCard: { marginHorizontal: 20, marginTop: 12, borderRadius: 30, overflow: "hidden", shadowColor: "#D76586", shadowOpacity: 0.24, shadowRadius: 26, shadowOffset: { width: 0, height: 14 }, elevation: 10 },
  babyGrowthGradient: { minHeight: 392, padding: 18, justifyContent: "space-between" },
  babyWeekBadge: { alignSelf: "flex-start", paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.52)", borderWidth: 1, borderColor: "rgba(255,255,255,0.74)" },
  babyWeekBadgeText: { color: "#7C4054", fontSize: 12, fontWeight: "900" },
  babyImageStage: { flex: 1, alignItems: "center", justifyContent: "center", marginTop: 4, marginBottom: -18 },
  babyOrbitLine: { height: 1, marginHorizontal: 24, marginBottom: -12, backgroundColor: "rgba(255,255,255,0.72)" },
  assistantGlassButton: {
    minHeight: 70,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.58)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.78)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    marginBottom: 28,
    shadowColor: "#B94C6F",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  assistantAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,236,242,0.9)", marginRight: 11 },
  assistantAvatarEmoji: { fontSize: 25 },
  assistantCopy: { flex: 1 },
  assistantLabel: { color: "#3B232C", fontSize: 13, fontWeight: "900", marginBottom: 3 },
  assistantSub: { color: "#8F6574", fontSize: 12, fontWeight: "700" },
  assistantArrow: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.75)" },
  pregnancyInsightGrid: { flexDirection: "row", gap: 12, paddingHorizontal: 20, marginTop: 16 },
  pregnancyMetricCard: { flex: 1, minHeight: 80, borderRadius: 24, padding: 15, backgroundColor: "rgba(255,255,255,0.58)", borderWidth: 1, borderColor: "rgba(255,255,255,0.74)" },
  pregnancyMetricLabel: { color: "#9A6A79", fontSize: 11, fontWeight: "800", marginBottom: 8 },
  pregnancyMetricValue: { color: "#34232B", fontSize: 17, fontWeight: "900" },
  weekProgressCard: { marginHorizontal: 20, marginTop: 14, borderRadius: 24, padding: 16, backgroundColor: "rgba(255,255,255,0.58)", borderWidth: 1, borderColor: "rgba(255,255,255,0.74)" },
  weekProgressHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  weekProgressTitle: { color: "#3B232C", fontSize: 14, fontWeight: "900" },
  weekProgressPercent: { color: "#FF4D88", fontSize: 14, fontWeight: "900" },
  weekProgressTrack: { height: 8, borderRadius: 999, backgroundColor: "rgba(255,77,136,0.14)", overflow: "hidden" },
  weekProgressFill: { height: "100%", borderRadius: 999, backgroundColor: "#FF4D88" },
  weekProgressHint: { color: "#8F6574", fontSize: 12, fontWeight: "700", marginTop: 10 },
  pregnancySectionTitle: { fontSize: 18, fontWeight: "900", marginHorizontal: 20, marginTop: 22, marginBottom: 12 },
  weekAdviceGlass: { marginHorizontal: 20, borderRadius: 24, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.58)", borderWidth: 1, borderColor: "rgba(255,255,255,0.74)" },
  pregnancyAdviceDoctorRow: { paddingHorizontal: 20, paddingTop: 18, alignItems: "flex-start" },
  pregnancyAdviceDoctorAvatar: { width: 48, height: 48, borderRadius: 20, overflow: "hidden", borderWidth: 1, backgroundColor: "rgba(255,255,255,0.64)" },
  pregnancyAdviceDoctorImage: { width: "100%", height: "100%" },
  pregnancyAdviceLoading: { flexDirection: "row", alignItems: "center", gap: 10, padding: 20 },
  weekAdviceText: { color: "#4B303B", fontSize: 14, lineHeight: 22, padding: 20 },
  retryAdviceButton: { marginTop: 12, alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 9, borderRadius: 14, backgroundColor: "#FF4D88" },
  retryAdviceText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  babyPreviewWrap: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  babyPreviewImage: { width: "118%", height: "118%" },
  babyPreviewLoader: { position: "absolute", zIndex: 2 },
  babyPreviewEmoji: { fontSize: 112 },
  babyModalOverlay: { flex: 1, backgroundColor: "rgba(32,18,25,0.72)", justifyContent: "center", alignItems: "center", padding: 20 },
  babyModalCard: { width: "100%", maxWidth: 390, borderRadius: 30, padding: 20, backgroundColor: "rgba(255,248,250,0.96)", borderWidth: 1, borderColor: "rgba(255,255,255,0.8)" },
  babyModalClose: { position: "absolute", right: 14, top: 14, width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,77,136,0.9)", alignItems: "center", justifyContent: "center", zIndex: 4 },
  babyModalPreview: { height: 250, alignItems: "center", justifyContent: "center" },
  babyModalWeek: { color: "#FF4D88", fontSize: 13, fontWeight: "900", marginTop: 12 },
  babyModalTitle: { color: "#2F2026", fontSize: 24, fontWeight: "900", marginTop: 4, marginBottom: 10 },
  babyModalText: { color: "#5F3F4B", fontSize: 14, lineHeight: 22 },
  regularRoot: { flex: 1 },
  regularScroll: { flex: 1, paddingHorizontal: 20, paddingTop: 58 },
  regularHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18, paddingRight: 70 },
  regularGreeting: { fontSize: 25, fontWeight: "900", letterSpacing: -0.5 },
  regularDate: { marginTop: 5, fontSize: 13, fontWeight: "700", textTransform: "capitalize" },
  regularHeaderActions: { flexDirection: "row", gap: 10 },
  regularHeaderAvatar: { width: 54, height: 54, alignItems: "center", justifyContent: "center" },
  floatingDiaryAvatar: { position: "absolute", top: 54, right: 18, zIndex: 30, elevation: 30 },
  headerRoundButton: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  notificationDot: { position: "absolute", top: 10, right: 11, width: 7, height: 7, borderRadius: 4, backgroundColor: "#FF4D88", borderWidth: 1, borderColor: "#FFFFFF" },
  regularHeroCard: { minHeight: 436, borderRadius: 34, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: 14, overflow: "hidden", shadowColor: "#D98976", shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: 14 }, elevation: 8, paddingVertical: 22 },
  heroGlowPeach: { position: "absolute", width: 210, height: 210, borderRadius: 105, backgroundColor: "rgba(255,158,125,0.18)", top: -78, right: -44 },
  heroGlowLavender: { position: "absolute", width: 220, height: 220, borderRadius: 110, backgroundColor: "rgba(184,164,255,0.16)", bottom: -84, left: -70 },
  heroMiniCardsRow: { width: "88%", flexDirection: "row", gap: 10, marginBottom: 18 },
  heroMiniCard: { flex: 1, minHeight: 76, borderRadius: 22, borderWidth: 1, padding: 11, flexDirection: "row", alignItems: "center", gap: 9, shadowColor: "#E6A08C", shadowOpacity: 0.10, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  heroMiniIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  heroMiniCopy: { flex: 1, minWidth: 0 },
  heroMiniLabel: { fontSize: 10, lineHeight: 13, fontWeight: "900", marginBottom: 4 },
  heroMiniValue: { fontSize: 13, lineHeight: 16, fontWeight: "900" },
  circularTracker: { width: 250, height: 250, alignItems: "center", justifyContent: "center" },
  trackerRing: { width: 242, height: 242, borderRadius: 121, alignItems: "center", justifyContent: "center", padding: 17 },
  trackerInner: { width: "100%", height: "100%", borderRadius: 104, alignItems: "center", justifyContent: "center", paddingHorizontal: 22 },
  trackerLabel: { fontSize: 13, lineHeight: 17, fontWeight: "900", textAlign: "center", marginBottom: 6 },
  trackerNumber: { fontSize: 64, lineHeight: 68, fontWeight: "900", letterSpacing: -2.5, marginBottom: 8, textShadowOffset: { width: 0, height: 8 }, textShadowRadius: 18 },
  trackerDateHint: { fontSize: 10, lineHeight: 14, fontWeight: "800", textAlign: "center" },
  trackerCta: { width: "78%", minHeight: 54, borderRadius: 999, backgroundColor: "#FF8A6B", paddingHorizontal: 24, marginTop: 18, alignItems: "center", justifyContent: "center", shadowColor: "#FF8A6B", shadowOpacity: 0.28, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  trackerCtaText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900", textAlign: "center" },
  trackerProgressDot: { position: "absolute", top: 121, left: 121, width: 14, height: 14, borderRadius: 7, borderWidth: 3, borderColor: "#FFFFFF" },
  fertilityStrip: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 22, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 14 },
  fertilityStripIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  fertilityStripTitle: { fontSize: 15, fontWeight: "900" },
  fertilityStripSub: { fontSize: 12, fontWeight: "600", marginTop: 3 },
  weekMiniCard: { borderRadius: 24, borderWidth: 1, padding: 12, marginBottom: 22, shadowColor: "#E6A08C", shadowOpacity: 0.10, shadowRadius: 16, shadowOffset: { width: 0, height: 9 }, elevation: 4 },
  weekMiniRow: { flexDirection: "row", justifyContent: "space-between" },
  weekMiniDayWrap: { alignItems: "center", width: "13.5%" },
  weekMiniName: { fontSize: 10, fontWeight: "800", textTransform: "capitalize", marginBottom: 6 },
  weekMiniDay: { width: 37, height: 37, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  weekMiniToday: { shadowColor: "#6C63FF", shadowOpacity: 0.32, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 7, borderWidth: 2, borderColor: "rgba(255,255,255,0.82)" },
  weekMiniNumber: { fontSize: 14, fontWeight: "900" },
  weekMiniMark: { width: 24, height: 5, borderRadius: 999, marginTop: 7 },
  weekLegendRow: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginTop: 12 },
  weekLegendItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 6, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.38)" },
  weekLegendDot: { width: 8, height: 8, borderRadius: 4 },
  weekLegendText: { fontSize: 10, fontWeight: "800" },
  regularSectionTitle: { fontSize: 18, fontWeight: "900", marginBottom: 12 },
  regularStatsCard: { borderRadius: 28, borderWidth: 1, padding: 18, marginBottom: 22, overflow: "hidden", shadowColor: "#D98976", shadowOpacity: 0.13, shadowRadius: 20, shadowOffset: { width: 0, height: 11 }, elevation: 6 },
  regularStatsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  regularStatsEyebrow: { color: "#FF8A6B", fontSize: 9, fontWeight: "900", letterSpacing: 1, marginBottom: 5 },
  regularStatsTitle: { fontSize: 17, fontWeight: "900" },
  regularStatsIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: "rgba(255,138,107,0.16)", alignItems: "center", justifyContent: "center" },
  regularStatsDivider: { height: 1, marginVertical: 17 },
  quickLogCard: { borderRadius: 26, borderWidth: 1, padding: 16, marginBottom: 22 },
  quickLogLabel: { fontSize: 12, fontWeight: "900", marginBottom: 9 },
  quickTagRow: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  quickTag: { minHeight: 54, borderRadius: 18, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 8, alignItems: "center", justifyContent: "center", minWidth: 72 },
  quickTagIcon: { fontSize: 20, marginBottom: 3 },
  quickTagText: { fontSize: 10, fontWeight: "800", textAlign: "center" },
  smallInsightEmoji: { fontSize: 23 },
  adviceGlassCard: { borderRadius: 30, borderWidth: 1, padding: 18, marginBottom: 18, overflow: "hidden", shadowColor: "#D98976", shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 12 }, elevation: 6 },
  adviceGlowPeach: { position: "absolute", width: 140, height: 140, borderRadius: 70, backgroundColor: "rgba(255,138,107,0.18)", top: -58, right: -42 },
  adviceGlowLavender: { position: "absolute", width: 150, height: 150, borderRadius: 75, backgroundColor: "rgba(184,164,255,0.16)", bottom: -64, left: -46 },
  adviceHeader: { flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 12 },
  adviceIconBubble: { width: 42, height: 42, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.58)", borderWidth: 1, borderColor: "rgba(255,255,255,0.7)", overflow: "hidden" },
  adviceGuideImage: { ...StyleSheet.absoluteFillObject, zIndex: 2, width: "100%", height: "100%" },
  adviceTitleWrap: { flex: 1 },
  adviceEyebrow: { color: "#FF8A6B", fontSize: 9, fontWeight: "900", letterSpacing: 1.1, marginBottom: 3 },
  adviceTitle: { fontSize: 17, fontWeight: "900" },
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
  cyclePeriodSummary: { alignItems: "center", marginBottom: 17 },
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
  insightPreview: { alignSelf: "stretch", borderRadius: 22 },
  insightLoadingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  insightHint: { fontSize: 12, fontWeight: "600" },
  insightText: { fontSize: 14, lineHeight: 22, fontWeight: "700" },
  pregnancyBanner: {
    marginTop: 14,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.76)",
    overflow: "hidden",
    shadowColor: "#D98976",
    shadowOpacity: 0.14,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 7,
  },
  pregnancyBannerGradient: {
    minHeight: 152,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    overflow: "hidden",
  },
  pregnancyBannerGlowPink: { position: "absolute", width: 150, height: 150, borderRadius: 75, backgroundColor: "rgba(255,138,107,0.18)", top: -58, left: -40 },
  pregnancyBannerGlowMint: { position: "absolute", width: 150, height: 150, borderRadius: 75, backgroundColor: "rgba(53,201,155,0.16)", bottom: -70, right: -36 },
  pregnancyBannerLeft: { flexDirection: "row", alignItems: "center", gap: 13, flex: 1 },
  pregnancyBannerIcon: {
    width: 50,
    height: 50,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.58)",
    borderColor: "rgba(255,255,255,0.74)",
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  pregnancyBannerCopy: { flex: 1 },
  pregnancyBannerEyebrow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  pregnancyBannerEyebrowText: { color: "#06B98A", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  pregnancyBannerDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: "#FF8A6B" },
  pregnancyBannerTitle: { fontSize: 18, fontWeight: "900", marginBottom: 4 },
  pregnancyBannerSub: { fontSize: 12, lineHeight: 17, paddingRight: 6, fontWeight: "700" },
  pregnancyBannerImageWrap: { width: 104, height: 124, borderRadius: 26, overflow: "hidden", marginLeft: 8, backgroundColor: "rgba(255,255,255,0.46)", borderWidth: 1, borderColor: "rgba(255,255,255,0.72)" },
  pregnancyBannerImage: { width: "100%", height: "100%" },
  // Fertility banner variant — same layout as the pregnancy banner, its own palette.
  fertilityBannerShell: { borderColor: "rgba(53,201,155,0.55)", shadowColor: "#2E9C7C" },
  fertilityBannerGlowGreen: { position: "absolute", width: 150, height: 150, borderRadius: 75, backgroundColor: "rgba(53,201,155,0.20)", top: -58, left: -40 },
  fertilityBannerGlowBlue: { position: "absolute", width: 150, height: 150, borderRadius: 75, backgroundColor: "rgba(96,165,250,0.18)", bottom: -70, right: -36 },
  fertilityBannerEyebrowText: { color: "#0E9F6E", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  fertilityBannerDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: "#60A5FA" },
});
