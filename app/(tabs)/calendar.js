import dayjs from "dayjs";
import "dayjs/locale/ka";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Image,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Calendar, LocaleConfig } from "react-native-calendars";

import DiaryAvatar from "../../components/DiaryAvatar";
import PrimePreview from "../../components/PrimePreview";
import { getDiaryAssistantSupport, invalidateAssistantContextCache } from "../../services/assistantOrchestrator";
import { useTheme } from "../../context/ThemeContext";
import { usePregnancy } from "../../context/PregnancyContext";
import { useFertility } from "../../context/FertilityContext";
import { useCycles } from "../../hooks/useCycles";
import { supabase } from "../../services/supabase";
import { FERTILITY_LOG_TYPES, getFertilityLogsForDay, getFertilityLogsRange, upsertFertilityLog } from "../../services/fertilityLogs";
import { SUPPLEMENT_OPTIONS } from "../../utils/fertilityPlan";
import { buildFertilityRecommendations } from "../../utils/fertilityInsights";
import { calculateCycleState } from "../../utils/cycleEngine";
import { getPreferredCycleLength, getPreferredPeriodLength } from "../../utils/cyclePrediction";

dayjs.locale("ka");

const ASSISTANT_GUIDE_IMAGE = require("../../assets/images/assistant-guide.png");

LocaleConfig.locales["ka"] = {
  monthNames: ["იანვარი","თებერვალი","მარტი","აპრილი","მაისი","ივნისი","ივლისი","აგვისტო","სექტემბერი","ოქტომბერი","ნოემბერი","დეკემბერი"],
  monthNamesShort: ["იან.","თებ.","მარ.","აპრ.","მაი.","ივნ.","ივლ.","აგვ.","სექ.","ოქტ.","ნოე.","დეკ."],
  dayNames: ["კვირა","ორშაბათი","სამშაბათი","ოთხშაბათი","ხუთშაბათი","პარასკევი","შაბათი"],
  dayNamesShort: ["კვი","ორშ","სამ","ოთხ","ხუთ","პარ","შაბ"],
  today: "დღეს",
};
LocaleConfig.defaultLocale = "ka";

const shortMonths = ["იან","თებ","მარ","აპრ","მაი","ივნ","ივლ","აგვ","სექ","ოქტ","ნოე","დეკ"];

const symptomLabels = {
  headache: "თავის ტკივილი 🤕",
  cramps: "მუცლის ტკივილი 😫",
  fatigue: "დაღლილობა 🥱",
  bloating: "შეშუპება 🎈",
  backache: "წელის ტკივილი ⚡",
  irritable: "გაღიზიანება 💢",
  sad: "სევდა 😢",
  anxious: "შფოთვა 😰",
  happy: "ბედნიერი ✨",
};

const symptomCategories = [
  {
    title: "ფიზიკური სიმპტომები",
    items: [
      { id: "headache", label: "თავის ტკივილი", icon: "🤕" },
      { id: "cramps", label: "მუცლის ტკივილი", icon: "😫" },
      { id: "fatigue", label: "დაღლილობა", icon: "🥱" },
      { id: "bloating", label: "შეშუპება", icon: "🎈" },
      { id: "backache", label: "წელის ტკივილი", icon: "⚡" },
    ],
  },
  {
    title: "ემოციური ფონი",
    items: [
      { id: "irritable", label: "გაღიზიანება", icon: "💢" },
      { id: "sad", label: "სევდა", icon: "😢" },
      { id: "anxious", label: "შფოთვა", icon: "😰" },
      { id: "happy", label: "ბედნიერი", icon: "✨" },
    ],
  },
];

const moodOptions = [
  { emoji: "🤩", label: "არაჩვეულებრივი" },
  { emoji: "😊", label: "კარგი" },
  { emoji: "😐", label: "ნორმალური" },
  { emoji: "😔", label: "ცუდი" },
  { emoji: "😫", label: "საშინელი" },
];

const hasDiaryContent = ({ symptoms = [], mood = null, note = "" } = {}) =>
  Boolean((symptoms || []).length || mood || note?.trim());

const buildDiarySignature = ({ symptoms = [], mood = null, note = "" } = {}) =>
  [
    [...(symptoms || [])].sort().join("|"),
    mood || "",
    note.trim(),
  ].join("::");

const TRIMESTER_COLORS = { 1: "#06d6a0", 2: "#ffd166", 3: "#ff4d88" };

const pregnancySymptomCategories = [
  {
    title: "ფიზიკური სიმპტომები",
    items: [
      { id: "nausea", label: "გულისრევა", icon: "🤢" },
      { id: "heartburn", label: "გულძმარვა", icon: "🔥" },
      { id: "fatigue", label: "დაღლილობა", icon: "🥱" },
      { id: "backache", label: "ზურგის ტკივილი", icon: "⚡" },
      { id: "bloating", label: "შეშუპება", icon: "🎈" },
      { id: "headache", label: "თავის ტკივილი", icon: "🤕" },
      { id: "movement", label: "ბავშვი იძრვის", icon: "👶" },
      { id: "urination", label: "ხშირი შარდვა", icon: "🚿" },
    ],
  },
  {
    title: "ემოციური ფონი",
    items: [
      { id: "happy", label: "ბედნიერი", icon: "✨" },
      { id: "anxious", label: "შფოთვა", icon: "😰" },
      { id: "sad", label: "სევდა", icon: "😢" },
      { id: "irritable", label: "გაღიზიანება", icon: "💢" },
    ],
  },
];
const MILESTONES = {
  6:  "პირველი გულისცემა 🫀",
  8:  "ყველა ძირითადი ორგანო ვითარდება",
  12: "I ტრიმესტრი დასრულდა 🎉",
  13: "II ტრიმესტრი იწყება",
  16: "სქესის გაგება შეიძლება 👶",
  18: "პირველი მოძრაობა შეიძლება იგრძნო",
  20: "ანატომიური USG დროა 🔬",
  24: "ვიაბილობის ზღვარი",
  28: "III ტრიმესტრი იწყება 🌟",
  32: "ნაყოფი თითქმის მზადაა",
  36: "სრული ვადის მიახლოება",
  37: "სრული ვადა ✨",
  40: "მშობიარობის სავარაუდო თარიღი 🎊",
};

const MILESTONE_WEEKS = new Set([6, 8, 12, 16, 20, 24, 28, 32, 36, 37, 40]);

function buildPregnancyMarks(pregnancyStartDate) {
  if (!pregnancyStartDate) return {};
  const marks = {};
  const start = dayjs(pregnancyStartDate);
  const today = dayjs();
  const todayStr = today.format("YYYY-MM-DD");
  const dueDate = start.add(280, "day");
  const dueDateStr = dueDate.format("YYYY-MM-DD");

  // კვირის დასაწყის დღეები — პატარა წერტილი ტრიმესტრის ფერით
  for (let w = 1; w <= 40; w++) {
    const weekStart = start.add((w - 1) * 7, "day");
    const dateStr = weekStart.format("YYYY-MM-DD");
    if (dateStr === todayStr || dateStr === dueDateStr) continue;
    const color = w <= 12 ? TRIMESTER_COLORS[1] : w <= 27 ? TRIMESTER_COLORS[2] : TRIMESTER_COLORS[3];
    marks[dateStr] = {
      marked: true,
      dotColor: color,
      ...(MILESTONE_WEEKS.has(w) && { selected: true, selectedColor: color + "44" }),
    };
  }

  // მშობიარობის სავარაუდო თარიღი
  marks[dueDateStr] = { selected: true, selectedColor: "#ff4d88", marked: true, dotColor: "#ff4d88" };

  // დღეს
  marks[todayStr] = { selected: true, selectedColor: "#ff4d88", marked: false };

  return marks;
}

function PregnancyCalendarScreen() {
  const { isDark } = useTheme();
  const { pregnancyStartDate } = usePregnancy();

  const [currentDate, setCurrentDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [selectedDay, setSelectedDay] = useState(dayjs().format("YYYY-MM-DD"));
  const [calendarKey, setCalendarKey] = useState(1);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [selectedSymptoms, setSelectedSymptoms] = useState([]);
  const [mood, setMood] = useState(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [symptomsLoading, setSymptomsLoading] = useState(true);
  const [diaryEverSaved, setDiaryEverSaved] = useState(false);
  const [assistantSupport, setAssistantSupport] = useState({
    loading: false,
    text: "",
    signature: null,
    error: null,
  });
  // Refs for deduplication — avoids putting assistantSupport in useCallback deps
  // which would cause a cascade: state change → new fn → effect re-fires → loading flicker
  const lastAdviceSignatureRef = useRef(null);
  const lastAdviceTextRef = useRef("");

  const todayStr = dayjs().format("YYYY-MM-DD");
  const pregnancyMarks = buildPregnancyMarks(pregnancyStartDate);

  const calendarMarks = { ...pregnancyMarks };
  if (selectedDay) {
    calendarMarks[selectedDay] = { ...calendarMarks[selectedDay], selected: true, selectedColor: "#ff4d88" };
  }

  const theme = {
    bg: isDark ? "#181015" : "#FFF8FA",
    card: isDark ? "rgba(36,24,31,0.84)" : "rgba(255,255,255,0.74)",
    text: isDark ? "#FFF5F8" : "#2F2026",
    subText: isDark ? "#D7B9C4" : "#8E6273",
    chip: isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.54)",
    inputBg: isDark ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.62)",
    accent: "#ff4d88",
    divider: isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.65)",
    border: isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.82)",
    glass: isDark ? "rgba(44,29,37,0.72)" : "rgba(255,255,255,0.58)",
    glassStrong: isDark ? "rgba(58,38,48,0.86)" : "rgba(255,255,255,0.78)",
    cardGradient: isDark ? ["rgba(58,38,48,0.94)", "rgba(28,18,24,0.84)"] : ["rgba(255,255,255,0.9)", "rgba(255,234,241,0.82)"],
    calendarGradient: isDark ? ["rgba(76,42,51,0.96)", "rgba(35,22,29,0.9)"] : ["rgba(255,255,255,0.94)", "rgba(255,231,239,0.94)"],
    activeSoft: isDark ? "rgba(255,77,136,0.18)" : "rgba(255,77,136,0.12)",
    activeBorder: isDark ? "rgba(255,144,177,0.35)" : "rgba(255,77,136,0.35)",
  };

  const getWeekForDay = (dateStr) => {
    if (!pregnancyStartDate) return null;
    const diff = dayjs(dateStr).diff(dayjs(pregnancyStartDate), "day");
    if (diff < 0) return null;
    return Math.min(Math.floor(diff / 7) + 1, 40);
  };

  const selectedWeek = getWeekForDay(selectedDay);
  const milestone = selectedWeek ? MILESTONES[selectedWeek] : null;
  const trimesterColor = selectedWeek
    ? selectedWeek <= 12 ? TRIMESTER_COLORS[1] : selectedWeek <= 27 ? TRIMESTER_COLORS[2] : TRIMESTER_COLORS[3]
    : "#ff4d88";

  const changeYear = (amount) => {
    const newDate = dayjs(currentDate).add(amount, "year").format("YYYY-MM-DD");
    setCurrentDate(newDate);
    setCalendarKey(Date.now());
  };

  const selectMonth = (index) => {
    const newDate = dayjs(currentDate).month(index).format("YYYY-MM-DD");
    setCurrentDate(newDate);
    setCalendarKey(Date.now());
    setShowMonthPicker(false);
  };

  const loadPregnancyAssistantSupport = useCallback(async (entry, options = {}) => {
    if (!hasDiaryContent(entry)) {
      setAssistantSupport({ loading: false, text: "", signature: null, error: null });
      lastAdviceSignatureRef.current = null;
      lastAdviceTextRef.current = "";
      return;
    }

    const signature = buildDiarySignature(entry);
    if (!options.force && lastAdviceSignatureRef.current === signature && lastAdviceTextRef.current) return;

    // Keep previous text visible during reload — no flicker
    setAssistantSupport((prev) => ({
      ...prev,
      loading: true,
      signature,
      error: null,
    }));

    try {
      const response = await getDiaryAssistantSupport(entry);
      const text = response.text || "ასისტენტი ახლა ვერ პასუხობს. სცადე ცოტა ხანში.";
      lastAdviceSignatureRef.current = signature;
      lastAdviceTextRef.current = text;
      setAssistantSupport({ loading: false, text, signature, error: null });
    } catch (err) {
      console.error("Pregnancy diary advice error:", err?.message);
      setAssistantSupport((prev) => ({
        ...prev,
        loading: false,
        // Keep whatever text we had; if none, show fallback so card stays visible
        text: prev.text || "ასისტენტი ახლა ვერ პასუხობს. სცადე ცოტა ხანში.",
      }));
    }
  }, []); // stable — deduplication via refs, not state

  const loadTodaySymptoms = useCallback(async () => {
    setSymptomsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("symptoms").select("*").eq("user_id", user.id).eq("date", todayStr).maybeSingle();
      if (data) {
        const entry = { symptoms: data.symptoms || [], mood: data.mood || null, note: data.note || "" };
        setSelectedSymptoms(entry.symptoms);
        setMood(entry.mood);
        setNote(entry.note);
        if (hasDiaryContent(entry)) {
          setDiaryEverSaved(true);
          void loadPregnancyAssistantSupport(entry);
        }
      } else {
        setSelectedSymptoms([]); setMood(null); setNote("");
      }
    } catch (e) { console.log(e); }
    finally { setSymptomsLoading(false); }
  }, [todayStr, loadPregnancyAssistantSupport]); // loadPregnancyAssistantSupport is stable (empty deps)

  useFocusEffect(useCallback(() => { loadTodaySymptoms(); }, [loadTodaySymptoms]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTodaySymptoms();
    setRefreshing(false);
  }, [loadTodaySymptoms]);

  const toggleSymptom = (id) => setSelectedSymptoms((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);

  const saveSymptoms = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("symptoms").upsert({ user_id: user.id, date: todayStr, symptoms: selectedSymptoms, mood, note, updated_at: new Date().toISOString() }, { onConflict: "user_id,date" });
      Alert.alert("წარმატება", "დღიური შენახულია ✨");
      setDiaryEverSaved(true);
      loadPregnancyAssistantSupport({ symptoms: selectedSymptoms, mood, note }, { force: true });
    } catch { Alert.alert("შეცდომა", "შენახვა ვერ მოხერხდა"); }
    finally { setSaving(false); }
  };

  return (
    <LinearGradient
      colors={isDark ? ["#25151B", "#140E12", "#120C10"] : ["#FFFDFC", "#FFEFF4", "#F8B5C9"]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={{ flex: 1 }}
    >
    <View style={{ flex: 1, backgroundColor: "transparent" }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120, paddingTop: 60 }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}>

          <View style={styles.pageHeader}>
            <View>
              <Text style={styles.pageEyebrow}>MATERNITY CALENDAR</Text>
              <Text style={[styles.pageTitle, { color: theme.text }]}>ორსულობის კალენდარი</Text>
              <Text style={[styles.pageSubtitle, { color: theme.subText }]}>თვალი ადევნე კვირებს და მნიშვნელოვან ეტაპებს</Text>
            </View>
          </View>

          <LinearGradient
            colors={theme.calendarGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.calendarShell, { borderWidth: 1, borderColor: theme.border }]}
          >
            <Calendar
              key={`pregnancy-${isDark ? "dark" : "light"}-${calendarKey}`}
              current={currentDate}
              onMonthChange={(month) => setCurrentDate(month.dateString)}
              markedDates={calendarMarks}
              firstDay={1}
              enableSwipeMonths
              onDayPress={(day) => setSelectedDay(day.dateString)}
              renderHeader={(date) => (
                <TouchableOpacity style={styles.calHeader} activeOpacity={0.7} onPress={() => setShowMonthPicker(true)}>
                  <Text style={[styles.calHeaderText, { color: theme.text }]}>{dayjs(date).format("MMMM YYYY")} <Text style={styles.calHeaderChevron}>⌄</Text></Text>
                </TouchableOpacity>
              )}
              theme={{
                calendarBackground: "transparent",
                dayTextColor: theme.text,
                monthTextColor: theme.text,
                todayTextColor: theme.accent,
                arrowColor: theme.accent,
                selectedDayBackgroundColor: theme.accent,
                selectedDayTextColor: "#fff",
                textDisabledColor: isDark ? "rgba(255,255,255,0.22)" : "rgba(143,101,116,0.35)",
              }}
            />
          </LinearGradient>

          <View style={[styles.legend, { backgroundColor: theme.glass, borderWidth: 1, borderColor: theme.border }]}>
            <LegendItem color={TRIMESTER_COLORS[1]} label="I ტრიმ." textColor={theme.text} />
            <LegendItem color={TRIMESTER_COLORS[2]} label="II ტრიმ." textColor={theme.text} />
            <LegendItem color={TRIMESTER_COLORS[3]} label="III ტრიმ." textColor={theme.text} />
            <LegendItem color={theme.accent} label="დღეს" textColor={theme.text} />
            <LegendItem color="#ff4d88" label="მშობ. თარ." textColor={theme.text} />
          </View>

          <View style={styles.sectionContainer}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{dayjs(selectedDay).format("D MMMM")}</Text>
            <LinearGradient colors={theme.cardGradient} style={[styles.card, { borderColor: theme.border, borderWidth: 1, marginTop: 15 }]}>
              {selectedWeek ? (
                <>
                  <View style={styles.statusRow}>
                    <Text style={[styles.statusLabel, { color: theme.subText }]}>ორსულობის კვირა:</Text>
                    <Text style={[styles.statusValue, { color: trimesterColor }]}>{selectedWeek}-ე კვირა</Text>
                  </View>
                  <View style={styles.statusRow}>
                    <Text style={[styles.statusLabel, { color: theme.subText }]}>ტრიმესტრი:</Text>
                    <Text style={[styles.statusValue, { color: trimesterColor }]}>
                      {selectedWeek <= 12 ? "I" : selectedWeek <= 27 ? "II" : "III"}
                    </Text>
                  </View>
                  {milestone && (
                    <View style={[styles.noteBox, { backgroundColor: theme.activeSoft, borderLeftColor: trimesterColor, marginTop: 10 }]}>
                      <Text style={[styles.noteText, { color: trimesterColor }]}>{milestone}</Text>
                    </View>
                  )}
                </>
              ) : (
                <Text style={[styles.emptyText, { color: theme.subText, borderTopWidth: 0 }]}>ეს თარიღი ორსულობამდეა.</Text>
              )}
            </LinearGradient>

            {/* Assistant advice — shown after diary is ever saved */}
            {diaryEverSaved && (
              <View style={[styles.assistantBox, { backgroundColor: theme.glass, borderColor: theme.border, marginTop: 16 }]}>
                <Text style={[styles.assistantTitle, { color: theme.text }]}>ასისტენტის რჩევა 🤰✨</Text>
                <View style={styles.assistantHeader}>
                  <View style={styles.assistantIconBubble}>
                    <Image source={ASSISTANT_GUIDE_IMAGE} style={styles.assistantGuideImage} resizeMode="cover" />
                  </View>
                </View>
                {assistantSupport.loading && !assistantSupport.text ? (
                  <View style={styles.assistantLoadingRow}>
                    <ActivityIndicator color={theme.accent} size="small" />
                    <Text style={[styles.assistantText, { color: theme.subText }]}>ასისტენტი ამზადებს შენზე მორგებულ რჩევას...</Text>
                  </View>
                ) : (
                  <Text style={[styles.assistantText, { color: theme.text }]}>{assistantSupport.text}</Text>
                )}
                <Text style={{ fontSize: 11, color: "#aaa", textAlign: "right", marginTop: 8, opacity: 0.7 }}>ასისტენტი შეიძლება შეცდეს</Text>
              </View>
            )}
          </View>

          <View style={[styles.divider, { borderBottomColor: theme.divider }]} />

          {symptomsLoading ? <ActivityIndicator color={theme.accent} style={{ marginTop: 30 }} /> : (
            <View style={styles.sectionContainer}>
              <View style={styles.diaryHeading}>
                <View style={styles.diaryHeadingCopy}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>დღევანდელი დღიური</Text>
                  <Text style={[styles.dateSubtitle, { color: theme.accent }]}>{dayjs().format("dddd, D MMMM")}</Text>
                </View>
                <DiaryAvatar accent={theme.accent} isDark={isDark} />
              </View>

              <LinearGradient colors={theme.cardGradient} style={[styles.card, { borderColor: theme.border, borderWidth: 1, marginTop: 16 }]}>
                <Text style={[styles.cardLabel, { color: theme.text }]}>როგორ გრძნობ თავს</Text>
                <View style={styles.moodGrid}>
                  {moodOptions.map((m) => {
                    const active = mood === m.label;
                    return (
                      <TouchableOpacity
                        key={m.label}
                        style={[
                          styles.moodItem,
                          { backgroundColor: active ? theme.activeSoft : "transparent", borderColor: active ? theme.activeBorder : "transparent" },
                          active && styles.activeMood,
                        ]}
                        onPress={() => setMood(m.label)}
                      >
                        <Text style={styles.moodEmoji}>{m.emoji}</Text>
                        <Text style={[styles.moodLabel, { color: theme.subText }, active && { color: theme.accent, fontWeight: "700" }]}>{m.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </LinearGradient>

              {pregnancySymptomCategories.map((cat, idx) => (
                <View key={idx} style={{ marginTop: 24 }}>
                  <Text style={[styles.cardLabel, { color: theme.text }]}>{cat.title}</Text>
                  <View style={styles.chipGrid}>
                    {cat.items.map((item) => {
                      const active = selectedSymptoms.includes(item.id);
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={[
                            styles.chip,
                            {
                              backgroundColor: active ? theme.accent : theme.chip,
                              borderColor: active ? "rgba(255,255,255,0.72)" : theme.border,
                            },
                          ]}
                          onPress={() => toggleSymptom(item.id)}
                        >
                          <Text style={styles.chipIcon}>{item.icon}</Text>
                          <Text style={[styles.chipText, { color: theme.text }, active && styles.activeChipText]}>{item.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}

              <View style={{ marginTop: 24 }}>
                <Text style={[styles.cardLabel, { color: theme.text }]}>დღევანდელი ჩანაწერი</Text>
                <TextInput
                  style={[styles.noteInput, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
                  placeholder="როგორ ჩაიარა დღემ..."
                  placeholderTextColor={theme.subText}
                  multiline
                  value={note}
                  onChangeText={setNote}
                />
              </View>

              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: theme.accent }]} onPress={saveSymptoms} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>დღიურის შენახვა</Text>}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showMonthPicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.monthPickerCard, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }]}>
            <View style={styles.yearSelector}>
              <TouchableOpacity onPress={() => changeYear(-1)} style={styles.yearBtn}><Text style={[styles.yearBtnText, { color: theme.text }]}>{"<"}</Text></TouchableOpacity>
              <Text style={[styles.yearText, { color: theme.text }]}>{dayjs(currentDate).year()}</Text>
              <TouchableOpacity onPress={() => changeYear(1)} style={styles.yearBtn}><Text style={[styles.yearBtnText, { color: theme.text }]}>{">"}</Text></TouchableOpacity>
            </View>
            <View style={styles.monthsGrid}>
              {shortMonths.map((m, i) => {
                const isActive = dayjs(currentDate).month() === i;
                return (
                  <TouchableOpacity key={m} style={[styles.monthBtn, { backgroundColor: isActive ? theme.accent : theme.glass }]} onPress={() => selectMonth(i)}>
                    <Text style={[styles.monthBtnText, { color: isActive ? "#FFF" : theme.text }]}>{m}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={styles.closeModalBtn} onPress={() => setShowMonthPicker(false)}>
              <Text style={styles.closeModalBtnText}>დახურვა</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <View style={styles.floatingDiaryAvatar}>
        <DiaryAvatar accent={theme.accent} isDark={isDark} size={46} showHint={false} />
      </View>
    </View>
    </LinearGradient>
  );
}

function RegularCalendarScreen() {
  const { isDark, isPremium } = useTheme();
  const { markedDates, loadData, addCycle, deleteCycle, rawCycles } = useCycles();

  // -- Calendar state ----------------------------------------------
  const [currentDate, setCurrentDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [selectedDay, setSelectedDay] = useState(dayjs().format("YYYY-MM-DD"));
  const [calendarKey, setCalendarKey] = useState(1);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dayDetails, setDayDetails] = useState({
    symptoms: [],
    note: null,
    mood: null,
    loading: false,
  });

  // -- Symptoms / diary state (always today) -----------------------
  const todayStr = dayjs().format("YYYY-MM-DD");
  const [selectedSymptoms, setSelectedSymptoms] = useState([]);
  const [mood, setMood] = useState(null);
  const [note, setNote] = useState("");
  const [symptomsLoading, setSymptomsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assistantSupport, setAssistantSupport] = useState({
    loading: false,
    text: "",
    signature: null,
    error: null,
  });

  // -- Theme -------------------------------------------------------
  const theme = {
    bg: isDark ? "#211621" : "#FFFDFC",
    card: isDark ? "rgba(55,40,58,0.86)" : "rgba(255,255,255,0.78)",
    text: isDark ? "#FFF7FB" : "#2F2026",
    subText: isDark ? "#E9C7D4" : "#8F6574",
    pill: isDark ? "rgba(255,209,224,0.10)" : "rgba(255,255,255,0.58)",
    divider: isDark ? "rgba(255,209,224,0.12)" : "rgba(255,255,255,0.74)",
    calendarBg: isDark ? "rgba(55,40,58,0.86)" : "rgba(255,255,255,0.78)",
    chip: isDark ? "rgba(255,209,224,0.10)" : "rgba(255,255,255,0.62)",
    inputBg: isDark ? "rgba(255,209,224,0.10)" : "rgba(255,255,255,0.68)",
    accent: "#FF4D88",
    peach: "#FF9E7D",
    lavender: "#B8A4FF",
    fertile: "#35C99B",
    ovulation: "#FFD166",
    selected: "#6C63FF",
    border: isDark ? "rgba(255,209,224,0.16)" : "rgba(255,255,255,0.78)",
    softCard: isDark ? "rgba(67,49,72,0.72)" : "rgba(255,255,255,0.66)",
    calendarGradient: isDark ? ["rgba(68,48,70,0.96)", "rgba(35,26,42,0.94)"] : ["rgba(255,255,255,0.96)", "rgba(255,242,232,0.9)", "rgba(246,240,255,0.86)"],
    cardGradient: isDark ? ["rgba(68,48,70,0.96)", "rgba(35,26,42,0.94)"] : ["rgba(255,255,255,0.94)", "rgba(255,240,232,0.84)", "rgba(246,240,255,0.82)"],
    assistantGradient: isDark ? ["rgba(72,50,76,0.96)", "rgba(38,28,45,0.92)"] : ["rgba(255,255,255,0.94)", "rgba(255,242,232,0.88)", "rgba(246,240,255,0.84)"],
  };

  // -- Data loading ------------------------------------------------
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener("cycleUpdated", () => loadData());
    return () => subscription.remove();
  }, [loadData]);

  useEffect(() => {
    fetchDayDetails(selectedDay);
  }, [selectedDay]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadData(), loadTodaySymptoms()]);
    setRefreshing(false);
  };

  // -- Calendar helpers --------------------------------------------
  const fetchDayDetails = async (dateStr) => {
    setDayDetails((prev) => ({ ...prev, loading: true }));
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("symptoms")
        .select("symptoms, note, mood")
        .eq("user_id", user.id)
        .eq("date", dateStr)
        .maybeSingle();

      setDayDetails(
        data
          ? { symptoms: data.symptoms || [], note: data.note, mood: data.mood, loading: false }
          : { symptoms: [], note: null, mood: null, loading: false }
      );
    } catch {
      setDayDetails({ symptoms: [], note: null, mood: null, loading: false });
    }
  };

  const adjustPeriodLength = async (cycle, delta) => {
    const newLen = cycle.period_length + delta;
    if (newLen < 1) return;
    try {
      await supabase.from("cycles").update({ period_length: newLen }).eq("id", cycle.id);
      invalidateAssistantContextCache();
      DeviceEventEmitter.emit("cycleUpdated");
      await loadData();
    } catch (e) {
      console.log(e);
    }
  };

  const getActiveCycleForDate = (date) => {
    if (!date || !rawCycles) return null;
    const target = dayjs(date);
    return rawCycles.find((c) => {
      const start = dayjs(c.start_date);
      const end = start.add((c.period_length || 5) - 1, "day");
      return (
        target.isSame(start, "day") ||
        target.isSame(end, "day") ||
        (target.isAfter(start) && target.isBefore(end))
      );
    });
  };

  const activeCycle = selectedDay ? getActiveCycleForDate(selectedDay) : null;

  const calendarMarks = { ...markedDates };
  if (selectedDay) {
    calendarMarks[selectedDay] = {
      ...calendarMarks[selectedDay],
      selected: true,
      selectedColor: theme.selected,
      disableTouchEvent: false,
    };
  }

  const changeYear = (amount) => {
    const newDate = dayjs(currentDate).add(amount, "year").format("YYYY-MM-DD");
    setCurrentDate(newDate);
    setCalendarKey(Date.now());
  };

  const selectMonth = (index) => {
    const newDate = dayjs(currentDate).month(index).format("YYYY-MM-DD");
    setCurrentDate(newDate);
    setCalendarKey(Date.now());
    setShowMonthPicker(false);
  };

  // -- Symptoms helpers --------------------------------------------
  const loadAssistantSupport = useCallback(async ({ symptoms = [], mood: moodValue = null, note: noteValue = "" } = {}, options = {}) => {
    const cleanNote = noteValue.trim();
    const entry = {
      symptoms,
      mood: moodValue,
      note: cleanNote,
    };

    if (!isPremium) {
      setAssistantSupport({
        loading: false,
        text: "",
        signature: null,
        error: null,
      });
      return;
    }

    if (!hasDiaryContent(entry)) {
      setAssistantSupport({
        loading: false,
        text: "",
        signature: null,
        error: null,
      });
      return;
    }

    const signature = buildDiarySignature(entry);

    if (!options.force && assistantSupport.signature === signature && assistantSupport.text) {
      return;
    }

    setAssistantSupport((prev) => ({
      ...prev,
      loading: true,
      signature,
      error: null,
      text: options.keepPreviousText ? prev.text : "",
    }));

    try {
      const response = await getDiaryAssistantSupport(entry);

      setAssistantSupport({
        loading: false,
        text: response.text,
        signature,
        error: null,
      });
    } catch (error) {
      setAssistantSupport((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : "assistant-support-failed",
      }));
    }
  }, [assistantSupport.signature, assistantSupport.text, isPremium]);

  const loadTodaySymptoms = useCallback(async () => {
    setSymptomsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setSelectedSymptoms([]);
        setMood(null);
        setNote("");
        setAssistantSupport({
          loading: false,
          text: "",
          signature: null,
          error: null,
        });
        return;
      }
      const { data } = await supabase
        .from("symptoms")
        .select("*")
        .eq("user_id", user.id)
        .eq("date", todayStr)
        .maybeSingle();

      if (data) {
        setSelectedSymptoms(data.symptoms || []);
        setMood(data.mood || null);
        setNote(data.note || "");
        void loadAssistantSupport({
          symptoms: data.symptoms || [],
          mood: data.mood || null,
          note: data.note || "",
        });
      } else {
        setSelectedSymptoms([]);
        setMood(null);
        setNote("");
        setAssistantSupport({
          loading: false,
          text: "",
          signature: null,
          error: null,
        });
      }
    } catch (error) {
      console.log("Load symptoms error:", error);
    } finally {
      setSymptomsLoading(false);
    }
  }, [loadAssistantSupport, todayStr]);

  useFocusEffect(
    useCallback(() => {
      loadData();
      loadTodaySymptoms();
    }, [loadData, loadTodaySymptoms])
  );

  const toggleSymptom = (id) => {
    setSelectedSymptoms((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const saveSymptoms = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from("symptoms").upsert(
        {
          user_id: user.id,
          date: todayStr,
          symptoms: selectedSymptoms,
          mood,
          note,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,date" }
      );
      if (error) throw error;
      invalidateAssistantContextCache();
      Alert.alert("წარმატება", "დღიური შენახულია ✨");
      const savedDiary = {
        symptoms: selectedSymptoms,
        mood,
        note,
      };
      setDayDetails({
        symptoms: selectedSymptoms,
        note: note.trim() || null,
        mood,
        loading: false,
      });
      loadAssistantSupport(savedDiary, { force: true, keepPreviousText: false });
      // Refresh calendar details if today is selected
      if (selectedDay === todayStr) fetchDayDetails(todayStr);
    } catch {
      Alert.alert("შეცდომა", "დღიურის შენახვა ვერ მოხერხდა");
    } finally {
      setSaving(false);
    }
  };

  const isTodaySelected = selectedDay === todayStr;
  const todayDiarySaved = isTodaySelected && hasDiaryContent(dayDetails);

  // -- Render ------------------------------------------------------
  return (
    <LinearGradient
      colors={isDark ? ["#2A1B2A", "#211621", "#17151D"] : ["#FFFDFC", "#FFF1EB", "#F6F0FF"]}
      style={{ flex: 1 }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120, paddingTop: 60 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.accent}
            />
          }
        >
          {/* --------------- CALENDAR --------------- */}
          <View style={styles.pageHeader}>
            <View>
              <Text style={styles.pageEyebrow}>ციკლის კალენდარი</Text>
              <Text style={[styles.pageTitle, { color: theme.text }]}>შენი კალენდარი</Text>
              <Text style={[styles.pageSubtitle, { color: theme.subText }]}>მართე ციკლი და დღიური ერთ სივრცეში</Text>
            </View>
          </View>

          <LinearGradient
            colors={theme.calendarGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.calendarShell, { borderColor: theme.border }]}
          >
            <View style={styles.calendarGlowPeach} />
            <View style={styles.calendarGlowLavender} />
            <Calendar
              key={`${isDark ? "dark" : "light"}-${calendarKey}`}
              current={currentDate}
              onMonthChange={(month) => setCurrentDate(month.dateString)}
              markedDates={calendarMarks}
              firstDay={1}
              enableSwipeMonths
              onDayPress={(day) => setSelectedDay(day.dateString)}
              renderHeader={(date) => (
                <TouchableOpacity
                  style={styles.calHeader}
                  activeOpacity={0.7}
                  onPress={() => setShowMonthPicker(true)}
                >
                  <Text style={[styles.calHeaderText, { color: theme.text }]}>
                    {dayjs(date).format("MMMM YYYY")}{" "}
                    <Text style={styles.calHeaderChevron}>⌄</Text>
                  </Text>
                </TouchableOpacity>
              )}
              theme={{
                calendarBackground: "transparent",
                dayTextColor: theme.text,
                monthTextColor: theme.text,
                todayTextColor: theme.selected,
                arrowColor: theme.accent,
                textDisabledColor: isDark ? "rgba(255,255,255,0.24)" : "rgba(143,101,116,0.34)",
                selectedDayTextColor: "#ffffff",
              }}
            />
          </LinearGradient>

          {/* Legend */}
          <View style={[styles.legend, { backgroundColor: theme.softCard, borderColor: theme.border }]}>
            <LegendItem color={theme.accent} label="პერიოდი" textColor={theme.text} />
            <LegendItem color={theme.ovulation} label="ოვულაცია" textColor={theme.text} />
            <LegendItem color={theme.fertile} label="ნაყოფიერი" textColor={theme.text} />
          </View>

          {/* Selected-day details */}
          <View style={styles.sectionContainer}>
            <View style={styles.detailsHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                {dayjs(selectedDay).format("D MMMM")}
              </Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                {activeCycle && !activeCycle.isPrediction ? (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: isDark ? "rgba(255,50,50,0.1)" : "#ffe5e5" }]}
                    onPress={() =>
                      Alert.alert("წაშლა", "ნამდვილად გინდა ამ ჩანაწერის წაშლა?", [
                        { text: "გაუქმება", style: "cancel" },
                        { text: "წაშლა", style: "destructive", onPress: () => deleteCycle(activeCycle) },
                      ])
                    }
                  >
                    <Text style={{ color: "#ff3333", fontWeight: "700" }}>წაშლა</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: isDark ? "rgba(233,69,96,0.15)" : "#FFF0F5" }]}
                    onPress={() =>
                      Alert.alert(
                        "დამატება",
                        `${dayjs(selectedDay).format("D MMMM")}-ს დავიწყოთ პერიოდის ჩანაწერი?`,
                        [
                          { text: "გაუქმება", style: "cancel" },
                          { text: "დამატება", onPress: async () => { await addCycle(selectedDay); } },
                        ]
                      )
                    }
                  >
                    <Text style={[styles.actionBtnText, { color: theme.accent }]}>+ დამატება</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {dayDetails.loading ? (
              <ActivityIndicator color={theme.accent} style={{ marginTop: 20 }} />
            ) : (
              <LinearGradient colors={theme.cardGradient} style={[styles.card, { borderColor: theme.border, borderWidth: 1 }]}>
                <View style={styles.statusRow}>
                  <Text style={[styles.statusLabel, { color: theme.subText }]}>სტატუსი:</Text>
                  <Text style={[styles.statusValue, { color: theme.text }]}>
                    {activeCycle ? "პერიოდის დღე" : "თავისუფალი დღე"}
                  </Text>
                </View>

                {activeCycle && !activeCycle.isPrediction && (
                  <View style={[styles.statusRow, { alignItems: "center", marginTop: 5, marginBottom: 15 }]}>
                    <Text style={[styles.statusLabel, { color: theme.subText }]}>ხანგრძლივობა:</Text>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <TouchableOpacity
                        onPress={() => adjustPeriodLength(activeCycle, -1)}
                        style={[styles.countBtn, { backgroundColor: theme.pill }]}
                      >
                        <Text style={{ color: theme.text, fontWeight: "bold", fontSize: 16 }}>-</Text>
                      </TouchableOpacity>
                      <Text style={{ color: theme.text, fontWeight: "bold", marginHorizontal: 15 }}>
                        {activeCycle.period_length} დღე
                      </Text>
                      <TouchableOpacity
                        onPress={() => adjustPeriodLength(activeCycle, 1)}
                        style={[styles.countBtn, { backgroundColor: theme.pill }]}
                      >
                        <Text style={{ color: theme.text, fontWeight: "bold", fontSize: 16 }}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {dayDetails.mood && (
                  <View style={styles.statusRow}>
                    <Text style={[styles.statusLabel, { color: theme.subText }]}>განწყობა:</Text>
                    <Text style={[styles.statusValue, { color: theme.text }]}>{dayDetails.mood}</Text>
                  </View>
                )}

                {dayDetails.symptoms.length > 0 ? (
                  <View style={[styles.symptomsList, { borderTopColor: theme.divider }]}>
                    {dayDetails.symptoms.map((s, i) => (
                      <View key={i} style={[styles.symptomPill, { backgroundColor: theme.pill }]}>
                        <Text style={[styles.symptomPillText, { color: theme.text }]}>
                          {symptomLabels[s] || s}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={[styles.emptyText, { borderTopColor: theme.divider, color: theme.subText }]}>
                    ამ დღეს სიმპტომები არ ჩაგიწერია.
                  </Text>
                )}

                {dayDetails.note && (
                  <View
                    style={[
                      styles.noteBox,
                      { backgroundColor: isDark ? "rgba(233,69,96,0.1)" : "#FFF0F5", borderLeftColor: theme.accent },
                    ]}
                  >
                    <Text style={[styles.noteText, { color: theme.accent }]}>{`"${dayDetails.note}"`}</Text>
                  </View>
                )}

                {isTodaySelected && !todayDiarySaved && (
                  <LinearGradient
                    colors={theme.assistantGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.assistantBox, { borderColor: theme.border }]}
                  >
                    <View style={styles.assistantGlowPeach} />
                    <View style={styles.assistantHeader}>
                      <View style={styles.assistantIconBubble}>
                        <Image source={ASSISTANT_GUIDE_IMAGE} style={styles.assistantGuideImage} resizeMode="cover" />
                      </View>
                      <View style={styles.assistantCopy}>
                        <Text style={styles.assistantEyebrow}>AI ასისტენტი</Text>
                        <Text style={[styles.assistantTitle, { color: theme.text }]}>როგორ ხარ დღეს?</Text>
                      </View>
                    </View>
                    <Text style={[styles.assistantText, { color: theme.subText }]}>
                      შეავსე დღიური და მიიღე შენზე მორგებული მოკლე რჩევა.
                    </Text>
                  </LinearGradient>
                )}
              </LinearGradient>
            )}
          </View>

          {/* --------------- DIVIDER --------------- */}
          <View style={[styles.divider, { borderBottomColor: theme.divider }]} />

          {/* --------------- TODAY'S DIARY --------------- */}
          {symptomsLoading ? (
            <ActivityIndicator color={theme.accent} style={{ marginTop: 30 }} />
          ) : (
            <View style={styles.sectionContainer}>
              <View style={styles.diaryHeading}>
                <View style={styles.diaryHeadingCopy}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>დღევანდელი დღიური</Text>
                  <Text style={[styles.dateSubtitle, { color: theme.accent }]}>
                    {dayjs().format("dddd, D MMMM")}
                  </Text>
                </View>
                <DiaryAvatar accent={theme.accent} isDark={isDark} />
              </View>

              {/* Assistant advice — shown at top of diary after save */}
              {(assistantSupport.loading || assistantSupport.text || (!isPremium && todayDiarySaved)) && (
                <LinearGradient
                  colors={theme.assistantGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.assistantBox, { borderColor: theme.border, marginTop: 16 }]}
                >
                  <View style={styles.assistantGlowPeach} />
                  <View style={styles.assistantGlowLavender} />
                  <View style={styles.assistantHeader}>
                    <View style={styles.assistantIconBubble}>
                      <Image source={ASSISTANT_GUIDE_IMAGE} style={styles.assistantGuideImage} resizeMode="cover" />
                    </View>
                    <View style={styles.assistantCopy}>
                      <Text style={styles.assistantEyebrow}>დღიური AI</Text>
                      <Text style={[styles.assistantTitle, { color: theme.text }]}>ასისტენტის რჩევა</Text>
                    </View>
                  </View>

                  {!isPremium ? (
                    <PrimePreview
                      minHeight={128}
                      concealCompletely
                      message="სრული რჩევისთვის გახსენი Prime"
                      buttonLabel="გახსნა"
                    >
                      <View style={styles.assistantHiddenPreview} />
                    </PrimePreview>
                  ) : assistantSupport.loading ? (
                    <View style={styles.assistantLoadingRow}>
                      <ActivityIndicator color={theme.accent} size="small" />
                      <Text style={[styles.assistantText, { color: theme.subText }]}>
                        ასისტენტი ამზადებს შენზე მორგებულ რჩევას...
                      </Text>
                    </View>
                  ) : (
                    <Text style={[styles.assistantText, { color: theme.text }]}>
                      {assistantSupport.text}
                    </Text>
                  )}
                  {isPremium && !assistantSupport.loading && assistantSupport.text ? (
                    <Text style={[styles.assistantDisclaimer, { color: theme.subText }]}>ასისტენტი შეიძლება შეცდეს</Text>
                  ) : null}
                </LinearGradient>
              )}

              {/* Mood */}
              <LinearGradient colors={theme.cardGradient} style={[styles.card, { borderColor: theme.border, borderWidth: 1, marginTop: 16 }]}>
                <Text style={[styles.cardLabel, { color: theme.text }]}>როგორ გრძნობ თავს</Text>
                <View style={styles.moodGrid}>
                  {moodOptions.map((m) => {
                    const active = mood === m.label;
                    return (
                      <TouchableOpacity
                        key={m.label}
                        style={[styles.moodItem, active && styles.activeMood]}
                        onPress={() => setMood(m.label)}
                      >
                        <Text style={styles.moodEmoji}>{m.emoji}</Text>
                        <Text
                          style={[
                            styles.moodLabel,
                            { color: theme.subText },
                            active && { color: theme.accent, fontWeight: "700" },
                          ]}
                        >
                          {m.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </LinearGradient>

              {/* Symptom categories */}
              {symptomCategories.map((cat, idx) => (
                <View key={idx} style={{ marginTop: 24 }}>
                  <Text style={[styles.cardLabel, { color: theme.text }]}>{cat.title}</Text>
                  <View style={styles.chipGrid}>
                    {cat.items.map((item) => {
                      const active = selectedSymptoms.includes(item.id);
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={[
                            styles.chip,
                            { backgroundColor: theme.chip },
                            active && styles.activeChip,
                          ]}
                          onPress={() => toggleSymptom(item.id)}
                        >
                          <Text style={styles.chipIcon}>{item.icon}</Text>
                          <Text
                            style={[
                              styles.chipText,
                              { color: theme.text },
                              active && styles.activeChipText,
                            ]}
                          >
                            {item.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}

              {/* Note */}
              <View style={{ marginTop: 24 }}>
                <Text style={[styles.cardLabel, { color: theme.text }]}>დღევანდელი ჩანაწერი</Text>
                <TextInput
                  style={[styles.noteInput, { backgroundColor: theme.inputBg, color: theme.text }]}
                  placeholder="როგორ ჩაიარა დღემ..."
                  placeholderTextColor={theme.subText}
                  multiline
                  value={note}
                  onChangeText={setNote}
                />
              </View>

              {/* Save */}
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: theme.accent }]}
                onPress={saveSymptoms}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>დღიურის შენახვა</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* --------------- MONTH PICKER MODAL --------------- */}
      <Modal visible={showMonthPicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.monthPickerCard, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }]}>
            <View style={styles.yearSelector}>
              <TouchableOpacity onPress={() => changeYear(-1)} style={styles.yearBtn}>
                <Text style={[styles.yearBtnText, { color: theme.text }]}>{"<"}</Text>
              </TouchableOpacity>
              <Text style={[styles.yearText, { color: theme.text }]}>
                {dayjs(currentDate).year()}
              </Text>
              <TouchableOpacity onPress={() => changeYear(1)} style={styles.yearBtn}>
                <Text style={[styles.yearBtnText, { color: theme.text }]}>{">"}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.monthsGrid}>
              {shortMonths.map((m, i) => {
                const isActive = dayjs(currentDate).month() === i;
                return (
                  <TouchableOpacity
                    key={m}
                    style={[
                      styles.monthBtn,
                      { backgroundColor: isActive ? theme.accent : theme.pill },
                    ]}
                    onPress={() => selectMonth(i)}
                  >
                    <Text style={[styles.monthBtnText, { color: isActive ? "#FFF" : theme.text }]}>
                      {m}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={styles.closeModalBtn} onPress={() => setShowMonthPicker(false)}>
              <Text style={styles.closeModalBtnText}>დახურვა</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <View style={styles.floatingDiaryAvatar}>
        <DiaryAvatar accent={theme.accent} isDark={isDark} size={46} showHint={false} />
      </View>
    </LinearGradient>
  );
}

// ================= FERTILITY ("მინდა დაორსულება") =================

const LH_TEST_OPTIONS = [
  { id: "negative", label: "უარყოფითი", icon: "➖" },
  { id: "weak", label: "სუსტი დადებითი", icon: "🌗" },
  { id: "positive", label: "დადებითი", icon: "➕" },
  { id: "peak", label: "პიკი", icon: "🔥" },
];

const MUCUS_OPTIONS = [
  { id: "dry", label: "მშრალი", icon: "🍂" },
  { id: "sticky", label: "წებოვანი", icon: "🩹" },
  { id: "creamy", label: "კრემისებრი", icon: "🥛" },
  { id: "watery", label: "წყლიანი", icon: "💧" },
  { id: "eggwhite", label: "კვერცხის ცილა", icon: "🥚" },
];

const OVULATION_SYMPTOMS = [
  { id: "cramps", label: "მუცლის ტკივილი", icon: "😣" },
  { id: "breast", label: "მკერდის მგრძნობელობა", icon: "🌸" },
  { id: "libido", label: "ლიბიდოს ცვლილება", icon: "💗" },
  { id: "fatigue", label: "დაღლილობა", icon: "🥱" },
  { id: "nausea", label: "გულისრევა", icon: "🤢" },
  { id: "energy", label: "ენერგიის მომატება", icon: "⚡" },
];

const FERTILITY_GUIDE = [
  { id: "marks", icon: "🗓️", title: "კალენდრის ფერები", text: "წითელი — მენსტრუაცია, მწვანე — ნაყოფიერი დღეები, ყვითელი — ოვულაცია. მწვანე წერტილი ნიშნავს, რომ იმ დღეს რაღაც უკვე ჩაწერე." },
  { id: "pick", icon: "👆", title: "აირჩიე დღე", text: "დააჭირე კალენდარში ნებისმიერ დღეს და ქვემოთ გამოჩნდება იმ დღის ჩანაწერები. ჩაწერა შეგიძლია ნებისმიერ დღეზე — არა მხოლოდ დღევანდელზე." },
  { id: "lh", icon: "🧪", title: "ოვულაციის ტესტი", text: "ოვულაციამდე ~5 დღით ადრე დაიწყე ტესტირება, დღეში ერთხელ. დადებითის შემდეგ ოვულაცია ჩვეულებრივ 24–36 საათში ხდება." },
  { id: "bbt", icon: "🌡️", title: "ბაზალური ტემპერატურა", text: "გაზომე დილით, ლოგინიდან ადგომამდე, ყოველდღე ერთსა და იმავე დროს. 9+ დღის შემდეგ აპი ტემპერატურის ახტომას ამოიცნობს და ოვულაციას დაადასტურებს." },
  { id: "mucus", icon: "💧", title: "ლორწო", text: "კვერცხის ცილის მსგავსი ან წყლიანი ლორწო ყველაზე ნაყოფიერი ნიშანია — ოვულაცია ახლოსაა." },
  { id: "sex", icon: "❤️", title: "ურთიერთობა", text: "ნაყოფიერ ფანჯარაში ყოველ მეორე დღეს ურთიერთობა ოპტიმალურია. აპი ავტომატურად აღნიშნავს, დაემთხვა თუ არა ნაყოფიერ დღეს." },
  { id: "stats", icon: "📊", title: "სად ვნახო შედეგები", text: "სტატისტიკის გვერდზე ნახავ ოვულაციის დადასტურებას, პროგნოზის ხარისხს, ტესტის სწორ დროს და ექიმისთვის გასაზიარებელ ანგარიშს." },
];

// A day is fertile if the base cycle marks paint it as fertile (green) or
// ovulation (yellow). Reuses the marks the user already sees on the calendar.
function isFertileDayFromMarks(marks, dateStr) {
  const color = marks?.[dateStr]?.selectedColor || "";
  return color.startsWith("#06d6a0") || color.startsWith("#ffd166");
}

function FertilityCalendarScreen() {
  const { isDark } = useTheme();
  const { markedDates, loadData, rawCycles } = useCycles();

  const todayStr = dayjs().format("YYYY-MM-DD");
  const [currentDate, setCurrentDate] = useState(todayStr);
  const [selectedDay, setSelectedDay] = useState(todayStr);
  const [calendarKey, setCalendarKey] = useState(1);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [dayLogs, setDayLogs] = useState({});
  const [logsLoading, setLogsLoading] = useState(true);
  const [monthLogDates, setMonthLogDates] = useState({});
  const [bbtInput, setBbtInput] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  const [note, setNote] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [assistantSupport, setAssistantSupport] = useState({ loading: false, text: "", signature: null });

  const theme = {
    text: isDark ? "#EAFBF4" : "#183A30",
    subText: isDark ? "#A7D8C6" : "#5C8A79",
    accent: "#0E9F6E",
    selected: "#0E9F6E",
    fertile: "#35C99B",
    ovulation: "#FFD166",
    period: "#FF6FA0",
    card: isDark ? "rgba(22,51,43,0.9)" : "rgba(255,255,255,0.82)",
    chip: isDark ? "rgba(53,201,155,0.12)" : "rgba(53,201,155,0.10)",
    chipActive: "#0E9F6E",
    border: isDark ? "rgba(53,201,155,0.22)" : "rgba(14,159,110,0.18)",
    softCard: isDark ? "rgba(28,43,51,0.72)" : "rgba(255,255,255,0.7)",
    inputBg: isDark ? "rgba(53,201,155,0.10)" : "rgba(255,255,255,0.7)",
    calendarGradient: isDark
      ? ["rgba(22,51,43,0.96)", "rgba(18,35,54,0.94)"]
      : ["rgba(242,255,251,0.96)", "rgba(231,251,241,0.9)", "rgba(234,244,255,0.86)"],
  };

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener("cycleUpdated", () => loadData());
    return () => subscription.remove();
  }, [loadData]);

  // useCycles does not fetch on its own — without this the calendar renders
  // with empty marks until a pull-to-refresh happens to call loadData().
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const loadDayLogs = useCallback(async (dateStr) => {
    setLogsLoading(true);
    setDayLogs(await getFertilityLogsForDay(dateStr));
    setLogsLoading(false);
  }, []);

  const loadMonthLogs = useCallback(async (anchorDate) => {
    const start = dayjs(anchorDate).startOf("month").subtract(7, "day").format("YYYY-MM-DD");
    const end = dayjs(anchorDate).endOf("month").add(7, "day").format("YYYY-MM-DD");
    const rows = await getFertilityLogsRange(start, end);
    const byDate = {};
    rows.forEach((row) => { byDate[row.date] = true; });
    setMonthLogDates(byDate);
  }, []);

  useEffect(() => {
    loadDayLogs(selectedDay);
  }, [selectedDay, loadDayLogs]);

  useEffect(() => {
    loadMonthLogs(currentDate);
  }, [currentDate, loadMonthLogs]);

  // Keep the BBT text field in sync with the selected day's stored value.
  useEffect(() => {
    const stored = dayLogs[FERTILITY_LOG_TYPES.bbt]?.temp;
    setBbtInput(stored != null ? String(stored) : "");
  }, [dayLogs]);

  // The comment lives in the shared `symptoms` table (same place the other
  // calendars write it), so the assistant sees it in its normal context.
  const loadDayNote = useCallback(async (dateStr) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("symptoms")
        .select("note")
        .eq("user_id", user.id)
        .eq("date", dateStr)
        .maybeSingle();
      setNote(data?.note || "");
    } catch {
      setNote("");
    }
  }, []);

  useEffect(() => {
    loadDayNote(selectedDay);
    setAssistantSupport({ loading: false, text: "", signature: null });
  }, [selectedDay, loadDayNote]);

  // Fertility advice is not Prime-gated — the pregnancy entitlement covers it,
  // same as the pregnancy calendar.
  // `signature` must cover the fertility logs too, not just symptoms/mood/note:
  // changing only the LH result would otherwise look unchanged and be skipped.
  const loadFertilityAdvice = useCallback(async (entry, signature, options = {}) => {
    if (!options.force && assistantSupport.signature === signature && assistantSupport.text) {
      return;
    }

    setAssistantSupport({ loading: true, text: "", signature });
    try {
      // getAssistantContext already injects fertilityTracking (LH/BBT/mucus),
      // so the reply reasons about today's logged signals too.
      const response = await getDiaryAssistantSupport(entry);
      setAssistantSupport({ loading: false, text: response.text, signature });
    } catch (error) {
      console.log("Fertility diary advice error:", error);
      setAssistantSupport({ loading: false, text: "", signature: null });
    }
  }, [assistantSupport.signature, assistantSupport.text]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadData(), loadDayLogs(selectedDay), loadMonthLogs(currentDate), loadDayNote(selectedDay)]);
    setRefreshing(false);
  };

  const saveLog = async (type, value) => {
    // Optimistic update so the UI responds instantly.
    setDayLogs((prev) => {
      const next = { ...prev };
      if (value == null) delete next[type];
      else next[type] = value;
      return next;
    });
    await upsertFertilityLog(selectedDay, type, value);
    setMonthLogDates((prev) => ({ ...prev, [selectedDay]: true }));
    // The assistant context caches for 45s — drop it so the advice below
    // reasons about the signal that was just logged, not a stale snapshot.
    invalidateAssistantContextCache();
  };

  const saveNote = async () => {
    setNoteSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from("symptoms").upsert(
        { user_id: user.id, date: selectedDay, note, updated_at: new Date().toISOString() },
        { onConflict: "user_id,date" }
      );
      invalidateAssistantContextCache();

      // Advice only makes sense for today — past days are just records.
      if (selectedDay === todayStr) {
        loadFertilityAdvice(
          { symptoms: ovSymptoms, mood: null, note },
          JSON.stringify({ logs: dayLogs, note: note.trim() }),
          { force: true }
        );
      } else {
        Alert.alert("შენახულია ✨", "კომენტარი შენახულია.");
      }
    } catch {
      Alert.alert("შეცდომა", "კომენტარის შენახვა ვერ მოხერხდა.");
    } finally {
      setNoteSaving(false);
    }
  };

  const changeYear = (amount) => {
    setCurrentDate(dayjs(currentDate).add(amount, "year").format("YYYY-MM-DD"));
    setCalendarKey(Date.now());
  };
  const selectMonth = (index) => {
    setCurrentDate(dayjs(currentDate).month(index).format("YYYY-MM-DD"));
    setCalendarKey(Date.now());
    setShowMonthPicker(false);
  };

  const calendarMarks = { ...markedDates };
  // Overlay a small dot on days that already have a fertility log.
  Object.keys(monthLogDates).forEach((dateStr) => {
    calendarMarks[dateStr] = { ...(calendarMarks[dateStr] || {}), marked: true, dotColor: theme.accent };
  });
  if (selectedDay) {
    calendarMarks[selectedDay] = {
      ...calendarMarks[selectedDay],
      selected: true,
      selectedColor: theme.selected,
    };
  }

  const intercourseLog = dayLogs[FERTILITY_LOG_TYPES.intercourse];
  const lhResult = dayLogs[FERTILITY_LOG_TYPES.lhTest]?.result || null;
  const mucusValue = dayLogs[FERTILITY_LOG_TYPES.cervicalMucus]?.mucus || null;
  const ovSymptoms = dayLogs[FERTILITY_LOG_TYPES.ovulationSymptom]?.symptoms || [];
  const takenSupplements = dayLogs[FERTILITY_LOG_TYPES.supplement]?.taken || [];
  const selectedIsFertile = isFertileDayFromMarks(markedDates, selectedDay);

  // Contextual tips for today, driven by what has actually been logged.
  // Only meaningful for today — past days show their logs, not advice.
  const isTodaySelected = selectedDay === todayStr;
  const recommendations = isTodaySelected
    ? buildFertilityRecommendations({
        forecast: calculateCycleState({
          lastStartDate: rawCycles?.length ? rawCycles[rawCycles.length - 1].start_date : null,
          cycleLength: getPreferredCycleLength(rawCycles || [], null),
          periodLength: getPreferredPeriodLength(rawCycles || [], null),
        }),
        todayLogs: dayLogs,
      })
    : [];

  // Auto-fetch advice once today's marks settle. Only the logs drive this —
  // keystrokes deliberately do not, or every pause while typing would spend
  // another call from the daily AI budget. The comment reaches the assistant
  // when it is saved.
  const loggedSignalsKey = isTodaySelected ? JSON.stringify(dayLogs) : null;

  useEffect(() => {
    if (!loggedSignalsKey || loggedSignalsKey === "{}") return undefined;

    const timer = setTimeout(() => {
      loadFertilityAdvice(
        { symptoms: ovSymptoms, mood: null, note },
        JSON.stringify({ logs: dayLogs, note: note.trim() })
      );
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedSignalsKey]);

  const toggleOvSymptom = (id) => {
    const next = ovSymptoms.includes(id) ? ovSymptoms.filter((s) => s !== id) : [...ovSymptoms, id];
    saveLog(FERTILITY_LOG_TYPES.ovulationSymptom, next.length ? { symptoms: next } : null);
  };

  const toggleSupplement = (id) => {
    const next = takenSupplements.includes(id)
      ? takenSupplements.filter((s) => s !== id)
      : [...takenSupplements, id];
    saveLog(FERTILITY_LOG_TYPES.supplement, next.length ? { taken: next } : null);
  };

  const saveBbt = () => {
    const clean = bbtInput.replace(",", ".").trim();
    if (!clean) { saveLog(FERTILITY_LOG_TYPES.bbt, null); return; }
    const temp = Number(clean);
    if (Number.isNaN(temp) || temp < 34 || temp > 43) {
      Alert.alert("არასწორი ტემპერატურა", "შეიყვანე ბაზალური ტემპერატურა 34–43 °C შუალედში.");
      return;
    }
    saveLog(FERTILITY_LOG_TYPES.bbt, { temp });
  };

  return (
    <LinearGradient
      colors={isDark ? ["#12241D", "#141E20", "#14161D"] : ["#F4FFFB", "#EBF9F2", "#EEF6FF"]}
      style={{ flex: 1 }}
    >
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120, paddingTop: 60 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        >
          <View style={styles.pageHeader}>
            <View>
              <Text style={[styles.pageEyebrow, { color: theme.accent }]}>დაორსულების კალენდარი</Text>
              <Text style={[styles.pageTitle, { color: theme.text }]}>ნაყოფიერების ტრეკერი 🌿</Text>
              <Text style={[styles.pageSubtitle, { color: theme.subText }]}>აღრიცხე ტესტები, ტემპერატურა და ნიშნები</Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setShowGuide(true)}
              style={[styles.guideBtn, { backgroundColor: theme.chip, borderColor: theme.border }]}
            >
              <Text style={[styles.guideBtnText, { color: theme.accent }]}>?</Text>
            </TouchableOpacity>
          </View>

          <LinearGradient
            colors={theme.calendarGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.calendarShell, { borderColor: theme.border }]}
          >
            <Calendar
              key={`fertility-${isDark ? "dark" : "light"}-${calendarKey}`}
              current={currentDate}
              onMonthChange={(month) => setCurrentDate(month.dateString)}
              markedDates={calendarMarks}
              firstDay={1}
              enableSwipeMonths
              onDayPress={(day) => setSelectedDay(day.dateString)}
              renderHeader={(date) => (
                <TouchableOpacity style={styles.calHeader} activeOpacity={0.7} onPress={() => setShowMonthPicker(true)}>
                  <Text style={[styles.calHeaderText, { color: theme.text }]}>
                    {dayjs(date).format("MMMM YYYY")} <Text style={styles.calHeaderChevron}>⌄</Text>
                  </Text>
                </TouchableOpacity>
              )}
              theme={{
                calendarBackground: "transparent",
                dayTextColor: theme.text,
                monthTextColor: theme.text,
                todayTextColor: theme.accent,
                arrowColor: theme.accent,
                textDisabledColor: isDark ? "rgba(255,255,255,0.24)" : "rgba(92,138,121,0.34)",
                selectedDayTextColor: "#ffffff",
              }}
            />
          </LinearGradient>

          <View style={[styles.legend, { backgroundColor: theme.softCard, borderColor: theme.border }]}>
            <LegendItem color={theme.period} label="პერიოდი" textColor={theme.text} />
            <LegendItem color={theme.ovulation} label="ოვულაცია" textColor={theme.text} />
            <LegendItem color={theme.fertile} label="ნაყოფიერი" textColor={theme.text} />
          </View>

          {/* Selected-day fertility logging */}
          <View style={styles.sectionContainer}>
            <View style={styles.detailsHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>{dayjs(selectedDay).format("D MMMM")}</Text>
              {selectedIsFertile && (
                <View style={[styles.fertBadge, { backgroundColor: theme.fertile + "22", borderColor: theme.fertile }]}>
                  <Text style={[styles.fertBadgeText, { color: theme.accent }]}>ნაყოფიერი დღე 🌿</Text>
                </View>
              )}
            </View>

            {logsLoading ? (
              <ActivityIndicator color={theme.accent} style={{ marginTop: 24 }} />
            ) : (
              <>
                {/* Intercourse */}
                <View style={[styles.fertBlock, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Text style={[styles.fertBlockTitle, { color: theme.text }]}>❤️ ინტიმური ურთიერთობა</Text>
                  <View style={styles.fertRow}>
                    <FertChip
                      label="დაცული" active={intercourseLog?.protected === true} theme={theme}
                      onPress={() => saveLog(FERTILITY_LOG_TYPES.intercourse, intercourseLog?.protected === true ? null : { protected: true })}
                    />
                    <FertChip
                      label="დაუცველი" active={intercourseLog?.protected === false} theme={theme}
                      onPress={() => saveLog(FERTILITY_LOG_TYPES.intercourse, intercourseLog?.protected === false ? null : { protected: false })}
                    />
                  </View>
                  {intercourseLog && selectedIsFertile && (
                    <Text style={[styles.fertHint, { color: theme.accent }]}>✓ დაემთხვა ნაყოფიერ დღეს</Text>
                  )}
                </View>

                {/* LH test */}
                <View style={[styles.fertBlock, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Text style={[styles.fertBlockTitle, { color: theme.text }]}>🧪 ოვულაციის ტესტი</Text>
                  <View style={styles.fertWrap}>
                    {LH_TEST_OPTIONS.map((opt) => (
                      <FertChip
                        key={opt.id} label={`${opt.icon} ${opt.label}`} active={lhResult === opt.id} theme={theme}
                        onPress={() => saveLog(FERTILITY_LOG_TYPES.lhTest, lhResult === opt.id ? null : { result: opt.id })}
                      />
                    ))}
                  </View>
                </View>

                {/* BBT */}
                <View style={[styles.fertBlock, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Text style={[styles.fertBlockTitle, { color: theme.text }]}>🌡️ ბაზალური ტემპერატურა</Text>
                  <View style={styles.fertRow}>
                    <TextInput
                      value={bbtInput}
                      onChangeText={setBbtInput}
                      keyboardType="decimal-pad"
                      placeholder="36.6"
                      placeholderTextColor={theme.subText}
                      style={[styles.bbtInput, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
                    />
                    <Text style={[styles.bbtUnit, { color: theme.subText }]}>°C</Text>
                    <TouchableOpacity style={[styles.bbtSaveBtn, { backgroundColor: theme.accent }]} onPress={saveBbt}>
                      <Text style={styles.bbtSaveText}>შენახვა</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Cervical mucus */}
                <View style={[styles.fertBlock, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Text style={[styles.fertBlockTitle, { color: theme.text }]}>💧 საშვილოსნოს ყელის ლორწო</Text>
                  <View style={styles.fertWrap}>
                    {MUCUS_OPTIONS.map((opt) => (
                      <FertChip
                        key={opt.id} label={`${opt.icon} ${opt.label}`} active={mucusValue === opt.id} theme={theme}
                        onPress={() => saveLog(FERTILITY_LOG_TYPES.cervicalMucus, mucusValue === opt.id ? null : { mucus: opt.id })}
                      />
                    ))}
                  </View>
                </View>

                {/* Ovulation symptoms */}
                <View style={[styles.fertBlock, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Text style={[styles.fertBlockTitle, { color: theme.text }]}>🌸 ოვულაციის ნიშნები</Text>
                  <View style={styles.fertWrap}>
                    {OVULATION_SYMPTOMS.map((opt) => (
                      <FertChip
                        key={opt.id} label={`${opt.icon} ${opt.label}`} active={ovSymptoms.includes(opt.id)} theme={theme}
                        onPress={() => toggleOvSymptom(opt.id)}
                      />
                    ))}
                  </View>
                </View>

                {/* Supplements */}
                <View style={[styles.fertBlock, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Text style={[styles.fertBlockTitle, { color: theme.text }]}>💊 ვიტამინები და დამატებები</Text>
                  <View style={styles.fertWrap}>
                    {SUPPLEMENT_OPTIONS.map((opt) => (
                      <FertChip
                        key={opt.id} label={`${opt.icon} ${opt.label}`} active={takenSupplements.includes(opt.id)} theme={theme}
                        onPress={() => toggleSupplement(opt.id)}
                      />
                    ))}
                  </View>
                </View>

                {/* Comment */}
                <View style={[styles.fertBlock, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Text style={[styles.fertBlockTitle, { color: theme.text }]}>📝 კომენტარი</Text>
                  <TextInput
                    value={note}
                    onChangeText={setNote}
                    placeholder="როგორ ჩაიარა დღემ, რას შეამჩნევდი..."
                    placeholderTextColor={theme.subText}
                    multiline
                    style={[styles.fertNoteInput, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
                  />
                  <TouchableOpacity
                    style={[styles.fertNoteBtn, { backgroundColor: theme.accent }]}
                    onPress={saveNote}
                    disabled={noteSaving}
                  >
                    {noteSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.fertNoteBtnText}>კომენტარის შენახვა</Text>}
                  </TouchableOpacity>
                </View>

                {/* AI advice — appears once today's signals/comment are in */}
                {isTodaySelected && (assistantSupport.loading || assistantSupport.text) && (
                  <View style={[styles.fertBlock, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={styles.fertAdviceHeader}>
                      <View style={[styles.fertAdviceIcon, { backgroundColor: theme.chip }]}>
                        <Image source={ASSISTANT_GUIDE_IMAGE} style={styles.fertAdviceImage} resizeMode="cover" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.fertAdviceEyebrow, { color: theme.accent }]}>დღიური AI</Text>
                        <Text style={[styles.fertBlockTitle, { color: theme.text, marginBottom: 0 }]}>ასისტენტის რჩევა</Text>
                      </View>
                    </View>
                    {assistantSupport.loading ? (
                      <View style={styles.fertAdviceLoading}>
                        <ActivityIndicator color={theme.accent} size="small" />
                        <Text style={[styles.fertTipText, { color: theme.subText, flex: 1 }]}>
                          ასისტენტი ამზადებს შენზე მორგებულ რჩევას...
                        </Text>
                      </View>
                    ) : (
                      <>
                        <Text style={[styles.fertAdviceText, { color: theme.text }]}>{assistantSupport.text}</Text>
                        <Text style={[styles.fertDisclaimer, { color: theme.subText, marginTop: 10, textAlign: "left" }]}>
                          ასისტენტი შეიძლება შეცდეს
                        </Text>
                      </>
                    )}
                  </View>
                )}

                {recommendations.length > 0 && (
                  <View style={[styles.fertBlock, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[styles.fertBlockTitle, { color: theme.text }]}>💡 დღევანდელი რეკომენდაციები</Text>
                    {recommendations.map((tip) => (
                      <View key={tip.id} style={styles.fertTipRow}>
                        <Text style={styles.fertTipIcon}>{tip.icon}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.fertTipTitle, { color: theme.text }]}>{tip.title}</Text>
                          <Text style={[styles.fertTipText, { color: theme.subText }]}>{tip.text}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                <Text style={[styles.fertDisclaimer, { color: theme.subText }]}>
                  ℹ️ ეს მონაცემები ინფორმაციული დანიშნულებისაა და არ ცვლის ექიმის კონსულტაციას.
                </Text>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showMonthPicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.monthPickerCard, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }]}>
            <View style={styles.yearSelector}>
              <TouchableOpacity onPress={() => changeYear(-1)} style={styles.yearBtn}>
                <Text style={[styles.yearBtnText, { color: theme.text }]}>{"<"}</Text>
              </TouchableOpacity>
              <Text style={[styles.yearText, { color: theme.text }]}>{dayjs(currentDate).year()}</Text>
              <TouchableOpacity onPress={() => changeYear(1)} style={styles.yearBtn}>
                <Text style={[styles.yearBtnText, { color: theme.text }]}>{">"}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.monthsGrid}>
              {shortMonths.map((m, i) => {
                const isActive = dayjs(currentDate).month() === i;
                return (
                  <TouchableOpacity
                    key={m}
                    style={[styles.monthBtn, { backgroundColor: isActive ? theme.accent : theme.chip }]}
                    onPress={() => selectMonth(i)}
                  >
                    <Text style={[styles.monthBtnText, { color: isActive ? "#FFF" : theme.text }]}>{m}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={styles.closeModalBtn} onPress={() => setShowMonthPicker(false)}>
              <Text style={styles.closeModalBtnText}>დახურვა</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showGuide} transparent animationType="slide" onRequestClose={() => setShowGuide(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.guideSheet, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.guideTitle, { color: theme.text }]}>როგორ გამოვიყენო ეს გვერდი 🌿</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              {FERTILITY_GUIDE.map((item) => (
                <View key={item.id} style={styles.guideRow}>
                  <Text style={styles.guideIcon}>{item.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.guideItemTitle, { color: theme.text }]}>{item.title}</Text>
                    <Text style={[styles.guideItemText, { color: theme.subText }]}>{item.text}</Text>
                  </View>
                </View>
              ))}
              <Text style={[styles.guideFootnote, { color: theme.subText }]}>
                ℹ️ რაც მეტ დღეს შეავსებ, მით ზუსტდება ოვულაციის შეფასება. ეს ინფორმაციული ხელსაწყოა და არ ცვლის ექიმის კონსულტაციას.
              </Text>
            </ScrollView>
            <TouchableOpacity style={[styles.guideCloseBtn, { backgroundColor: theme.accent }]} onPress={() => setShowGuide(false)}>
              <Text style={styles.guideCloseText}>გასაგებია</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={styles.floatingDiaryAvatar}>
        <DiaryAvatar accent={theme.accent} isDark={isDark} size={46} showHint={false} />
      </View>
    </LinearGradient>
  );
}

const FertChip = ({ label, active, onPress, theme }) => (
  <TouchableOpacity
    activeOpacity={0.8}
    onPress={onPress}
    style={[
      styles.fertChip,
      { backgroundColor: active ? theme.chipActive : theme.chip, borderColor: active ? theme.chipActive : theme.border },
    ]}
  >
    <Text style={[styles.fertChipText, { color: active ? "#fff" : theme.text }]}>{label}</Text>
  </TouchableOpacity>
);

export default function CalendarScreen() {
  const { pregnancyMode } = usePregnancy();
  const { fertilityMode } = useFertility();
  if (pregnancyMode) return <PregnancyCalendarScreen />;
  if (fertilityMode) return <FertilityCalendarScreen />;
  return <RegularCalendarScreen />;
}

const LegendItem = ({ color, label, textColor }) => (
  <View style={styles.legendItem}>
    <View style={[styles.legendColor, { backgroundColor: color }]} />
    <Text style={[styles.legendText, { color: textColor }]}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  // -- Fertility mode ----------------------------------------------
  fertBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  fertBadgeText: { fontSize: 12, fontWeight: "800" },
  fertBlock: { marginTop: 14, borderRadius: 22, borderWidth: 1, padding: 16 },
  fertBlockTitle: { fontSize: 15, fontWeight: "800", marginBottom: 12 },
  fertRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  fertWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  fertHint: { marginTop: 10, fontSize: 13, fontWeight: "700" },
  fertChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1 },
  fertChipText: { fontSize: 13, fontWeight: "700" },
  bbtInput: { flex: 1, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, fontSize: 16, fontWeight: "700" },
  bbtUnit: { fontSize: 15, fontWeight: "800" },
  bbtSaveBtn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14 },
  bbtSaveText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  fertDisclaimer: { marginTop: 18, fontSize: 12, lineHeight: 18, fontWeight: "600", textAlign: "center" },
  fertTipRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  fertTipIcon: { fontSize: 18, marginTop: 1 },
  fertTipTitle: { fontSize: 13, fontWeight: "800", marginBottom: 2 },
  fertTipText: { fontSize: 12, lineHeight: 17, fontWeight: "600" },
  guideBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  guideBtnText: { fontSize: 16, fontWeight: "900" },
  guideSheet: { width: "100%", borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, padding: 22, paddingBottom: 30, position: "absolute", bottom: 0 },
  guideTitle: { fontSize: 19, fontWeight: "900", marginBottom: 16, textAlign: "center" },
  guideRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  guideIcon: { fontSize: 20, marginTop: 1 },
  guideItemTitle: { fontSize: 14, fontWeight: "800", marginBottom: 3 },
  guideItemText: { fontSize: 12.5, lineHeight: 18, fontWeight: "600" },
  guideFootnote: { fontSize: 11.5, lineHeight: 17, fontWeight: "600", marginTop: 4, marginBottom: 6 },
  guideCloseBtn: { borderRadius: 999, paddingVertical: 14, alignItems: "center", marginTop: 14 },
  guideCloseText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  fertNoteInput: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, minHeight: 88, fontSize: 14, fontWeight: "600", textAlignVertical: "top" },
  fertNoteBtn: { borderRadius: 999, paddingVertical: 13, alignItems: "center", marginTop: 12 },
  fertNoteBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  fertAdviceHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  fertAdviceIcon: { width: 42, height: 42, borderRadius: 14, overflow: "hidden" },
  fertAdviceImage: { width: "100%", height: "100%" },
  fertAdviceEyebrow: { fontSize: 9, fontWeight: "900", letterSpacing: 0.9, marginBottom: 3 },
  fertAdviceLoading: { flexDirection: "row", alignItems: "center", gap: 10 },
  fertAdviceText: { fontSize: 13.5, lineHeight: 20, fontWeight: "600" },

  // -- Calendar ----------------------------------------------------
  pageHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingRight: 88, marginBottom: 18 },
  pageEyebrow: { color: "#FF8A6B", fontSize: 10, fontWeight: "900", letterSpacing: 0.8, marginBottom: 6 },
  pageTitle: { fontSize: 25, fontWeight: "900", letterSpacing: -0.4 },
  pageSubtitle: { fontSize: 13, fontWeight: "700", marginTop: 5 },
  pageHeaderIcon: { width: 48, height: 48, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center", shadowColor: "#D98976", shadowOpacity: 0.10, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 4 },
  floatingDiaryAvatar: { position: "absolute", top: 54, right: 18, zIndex: 30, elevation: 30 },
  calendarShell: { marginHorizontal: 20, borderRadius: 30, borderWidth: 1, paddingHorizontal: 5, paddingTop: 5, paddingBottom: 10, elevation: 8, shadowColor: "#D98976", shadowOpacity: 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 14 }, overflow: "hidden" },
  calendarGlowPeach: { position: "absolute", width: 190, height: 190, borderRadius: 95, backgroundColor: "rgba(255,158,125,0.16)", top: -84, right: -48 },
  calendarGlowLavender: { position: "absolute", width: 200, height: 200, borderRadius: 100, backgroundColor: "rgba(184,164,255,0.14)", bottom: -90, left: -68 },
  calHeader: { alignItems: "center", padding: 10, paddingHorizontal: 20 },
  calHeaderText: { fontSize: 17, fontWeight: "800", textTransform: "capitalize" },
  calHeaderChevron: { color: "#FF4D88", fontSize: 14, fontWeight: "900" },
  legend: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginTop: 16, marginHorizontal: 20, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 22, borderWidth: 1, shadowColor: "#D98976", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 7 } },
  legendItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 5, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.30)" },
  legendColor: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  legendText: { fontSize: 10, fontWeight: "800" },
  // -- Shared ------------------------------------------------------
  sectionContainer: { paddingHorizontal: 20, marginTop: 28 },
  sectionTitle: { fontSize: 21, fontWeight: "900", textTransform: "capitalize", letterSpacing: -0.3 },
  card: { borderRadius: 28, padding: 18, elevation: 5, shadowColor: "#D98976", shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 11 }, overflow: "hidden" },
  divider: { borderBottomWidth: 1, marginHorizontal: 20, marginTop: 32, opacity: 0.65 },
  // -- Selected-day card --------------------------------------------
  detailsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  actionBtn: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999 },
  actionBtnText: { fontWeight: "800", fontSize: 12 },
  statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 11 },
  statusLabel: { fontSize: 13, fontWeight: "600" },
  statusValue: { fontSize: 13, fontWeight: "800" },
  countBtn: { width: 32, height: 32, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  symptomsList: { flexDirection: "row", flexWrap: "wrap", marginTop: 15, borderTopWidth: 1, paddingTop: 15 },
  symptomPill: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, marginRight: 7, marginBottom: 7 },
  symptomPillText: { fontSize: 12, fontWeight: "700" },
  noteBox: { marginTop: 10, padding: 13, borderRadius: 13, borderLeftWidth: 3 },
  noteText: { fontStyle: "italic", fontSize: 13, lineHeight: 19 },
  emptyText: { fontSize: 13, marginTop: 15, fontStyle: "italic", borderTopWidth: 1, paddingTop: 15 },
  assistantBox: { marginTop: 18, borderRadius: 26, borderWidth: 1, padding: 16, gap: 10, overflow: "hidden", shadowColor: "#D98976", shadowOpacity: 0.10, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 5 },
  assistantGlowPeach: { position: "absolute", width: 130, height: 130, borderRadius: 65, backgroundColor: "rgba(255,158,125,0.16)", top: -60, right: -42 },
  assistantGlowLavender: { position: "absolute", width: 140, height: 140, borderRadius: 70, backgroundColor: "rgba(184,164,255,0.14)", bottom: -64, left: -48 },
  assistantHeader: { flexDirection: "row", alignItems: "center", gap: 11 },
  assistantIconBubble: { width: 42, height: 42, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.58)", borderWidth: 1, borderColor: "rgba(255,255,255,0.72)" },
  assistantGuideImage: { width: "100%", height: "100%", borderRadius: 18 },
  assistantCopy: { flex: 1 },
  assistantEyebrow: { color: "#FF8A6B", fontSize: 9, fontWeight: "900", letterSpacing: 1, marginBottom: 3 },
  assistantTitle: { fontSize: 16, fontWeight: "900" },
  assistantText: { fontSize: 14, lineHeight: 22, fontWeight: "700" },
  assistantLoadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  assistantHiddenPreview: { minHeight: 120 },
  assistantDisclaimer: { fontSize: 11, textAlign: "right", marginTop: 8, opacity: 0.72, fontWeight: "700" },
  // -- Diary -------------------------------------------------------
  diaryHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  diaryHeadingCopy: { flex: 1, paddingRight: 12 },
  dateSubtitle: { fontSize: 14, fontWeight: "700", textTransform: "capitalize", marginTop: 5 },
  cardLabel: { fontSize: 17, fontWeight: "800", marginBottom: 14 },
  moodGrid: { flexDirection: "row", justifyContent: "space-between" },
  moodItem: { alignItems: "center", width: "19%", paddingVertical: 10, borderRadius: 14 },
  activeMood: { borderWidth: 1 },
  moodEmoji: { fontSize: 26, marginBottom: 5 },
  moodLabel: { fontSize: 10, fontWeight: "600", textAlign: "center" },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", paddingVertical: 11, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
  activeChip: {},
  chipIcon: { marginRight: 6, fontSize: 16 },
  chipText: { fontSize: 13, fontWeight: "600" },
  activeChipText: { color: "#FFF", fontWeight: "800" },
  noteInput: { borderRadius: 17, padding: 16, height: 108, textAlignVertical: "top", fontSize: 14, borderWidth: 1, borderColor: "rgba(150,150,150,0.12)" },
  saveBtn: { minHeight: 56, borderRadius: 18, alignItems: "center", justifyContent: "center", marginTop: 24, elevation: 5, shadowColor: "#D76586", shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 9 } },
  saveBtnText: { color: "#FFF", fontSize: 16, fontWeight: "800" },
  // -- Month picker modal -------------------------------------------
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.68)", justifyContent: "center", padding: 20 },
  monthPickerCard: { borderRadius: 24, padding: 22, elevation: 10, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 15 },
  yearSelector: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  yearText: { fontSize: 22, fontWeight: "800" },
  yearBtn: { paddingVertical: 8, paddingHorizontal: 15, backgroundColor: "rgba(150,150,150,0.1)", borderRadius: 11 },
  yearBtnText: { fontSize: 18, fontWeight: "800" },
  monthsGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  monthBtn: { width: "31%", paddingVertical: 14, borderRadius: 13, alignItems: "center", marginBottom: 10 },
  monthBtnText: { fontSize: 14, fontWeight: "800" },
  closeModalBtn: { marginTop: 10, alignItems: "center", paddingVertical: 15 },
  closeModalBtnText: { fontSize: 16, fontWeight: "700", color: "#888" },
});
