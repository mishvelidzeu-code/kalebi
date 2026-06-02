import dayjs from "dayjs";
import "dayjs/locale/ka";
import { Ionicons } from "@expo/vector-icons";
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
import { useCycles } from "../../hooks/useCycles";
import { supabase } from "../../services/supabase";

dayjs.locale("ka");

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
  marks[todayStr] = { selected: true, selectedColor: "#48CAE4", marked: false };

  return marks;
}

function PregnancyCalendarScreen() {
  const { isDark, isPremium } = useTheme();
  const { pregnancyStartDate, currentWeek, daysRemaining } = usePregnancy();

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
    calendarMarks[selectedDay] = { ...calendarMarks[selectedDay], selected: true, selectedColor: "#48CAE4" };
  }

  const theme = {
    bg: isDark ? "#0F0F0F" : "#FDFCFD",
    card: isDark ? "#1A1A1A" : "#FFF",
    text: isDark ? "#FFFFFF" : "#1A1A1A",
    subText: isDark ? "#AAAAAA" : "#555",
    chip: isDark ? "#2A2A2A" : "#F2F2F2",
    inputBg: isDark ? "#252525" : "#F9F9F9",
    accent: "#ff4d88",
    divider: isDark ? "#333" : "#f0f0f0",
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
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120, paddingTop: 60 }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#06d6a0" />}>

          <View style={styles.pageHeader}>
            <View>
              <Text style={styles.pageEyebrow}>MATERNITY CALENDAR</Text>
              <Text style={[styles.pageTitle, { color: theme.text }]}>ორსულობის კალენდარი</Text>
              <Text style={[styles.pageSubtitle, { color: theme.subText }]}>თვალი ადევნე კვირებს და მნიშვნელოვან ეტაპებს</Text>
            </View>
            <View style={styles.pageHeaderIcon}>
              <Ionicons name="heart-outline" size={21} color="#06D6A0" />
            </View>
          </View>

          <LinearGradient
            colors={isDark ? ["#1A1D1D", "#141717"] : ["#FFFFFF", "#F5FCFA"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.calendarShell}
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
              theme={{ calendarBackground: "transparent", dayTextColor: theme.text, monthTextColor: theme.text, todayTextColor: "#48CAE4", arrowColor: theme.accent, textDisabledColor: isDark ? "#444" : "#d9e1e8" }}
            />
          </LinearGradient>

          <View style={styles.legend}>
            <LegendItem color={TRIMESTER_COLORS[1]} label="I ტრიმ." textColor={theme.text} />
            <LegendItem color={TRIMESTER_COLORS[2]} label="II ტრიმ." textColor={theme.text} />
            <LegendItem color={TRIMESTER_COLORS[3]} label="III ტრიმ." textColor={theme.text} />
            <LegendItem color="#48CAE4" label="დღეს" textColor={theme.text} />
            <LegendItem color="#ff4d88" label="მშობ. თარ." textColor={theme.text} />
          </View>

          <View style={styles.sectionContainer}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{dayjs(selectedDay).format("D MMMM")}</Text>
            <View style={[styles.card, { backgroundColor: theme.card, marginTop: 15 }]}>
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
                    <View style={[styles.noteBox, { backgroundColor: isDark ? "rgba(255,77,136,0.1)" : "#FFF0F5", borderLeftColor: trimesterColor, marginTop: 10 }]}>
                      <Text style={[styles.noteText, { color: trimesterColor }]}>{milestone}</Text>
                    </View>
                  )}
                </>
              ) : (
                <Text style={[styles.emptyText, { color: theme.subText, borderTopWidth: 0 }]}>ეს თარიღი ორსულობამდეა.</Text>
              )}
            </View>

            {/* Assistant advice — shown after diary is ever saved */}
            {diaryEverSaved && (
              <View style={[styles.assistantBox, { backgroundColor: isDark ? "rgba(6,214,160,0.1)" : "#F0FDF8", borderColor: isDark ? "rgba(6,214,160,0.25)" : "#B7EDD9", marginTop: 16 }]}>
                <Text style={[styles.assistantTitle, { color: theme.text }]}>ასისტენტის რჩევა 🤰✨</Text>
                {assistantSupport.loading && !assistantSupport.text ? (
                  <View style={styles.assistantLoadingRow}>
                    <ActivityIndicator color="#06d6a0" size="small" />
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

              <View style={[styles.card, { backgroundColor: theme.card, marginTop: 16 }]}>
                <Text style={[styles.cardLabel, { color: theme.text }]}>როგორ გრძნობ თავს</Text>
                <View style={styles.moodGrid}>
                  {moodOptions.map((m) => {
                    const active = mood === m.label;
                    return (
                      <TouchableOpacity key={m.label} style={[styles.moodItem, active && styles.activeMood]} onPress={() => setMood(m.label)}>
                        <Text style={styles.moodEmoji}>{m.emoji}</Text>
                        <Text style={[styles.moodLabel, { color: theme.subText }, active && { color: theme.accent, fontWeight: "700" }]}>{m.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {pregnancySymptomCategories.map((cat, idx) => (
                <View key={idx} style={{ marginTop: 24 }}>
                  <Text style={[styles.cardLabel, { color: theme.text }]}>{cat.title}</Text>
                  <View style={styles.chipGrid}>
                    {cat.items.map((item) => {
                      const active = selectedSymptoms.includes(item.id);
                      return (
                        <TouchableOpacity key={item.id} style={[styles.chip, { backgroundColor: theme.chip }, active && styles.activeChip]} onPress={() => toggleSymptom(item.id)}>
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
                <TextInput style={[styles.noteInput, { backgroundColor: theme.inputBg, color: theme.text }]} placeholder="როგორ ჩაიარა დღემ..." placeholderTextColor={isDark ? "#666" : "#999"} multiline value={note} onChangeText={setNote} />
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
          <View style={[styles.monthPickerCard, { backgroundColor: theme.card }]}>
            <View style={styles.yearSelector}>
              <TouchableOpacity onPress={() => changeYear(-1)} style={styles.yearBtn}><Text style={[styles.yearBtnText, { color: theme.text }]}>{"<"}</Text></TouchableOpacity>
              <Text style={[styles.yearText, { color: theme.text }]}>{dayjs(currentDate).year()}</Text>
              <TouchableOpacity onPress={() => changeYear(1)} style={styles.yearBtn}><Text style={[styles.yearBtnText, { color: theme.text }]}>{">"}</Text></TouchableOpacity>
            </View>
            <View style={styles.monthsGrid}>
              {shortMonths.map((m, i) => {
                const isActive = dayjs(currentDate).month() === i;
                return (
                  <TouchableOpacity key={m} style={[styles.monthBtn, { backgroundColor: isActive ? theme.accent : isDark ? "#252525" : "#F5F5F5" }]} onPress={() => selectMonth(i)}>
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
    </View>
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
    bg: isDark ? "#0F0F0F" : "#FDFCFD",
    card: isDark ? "#1A1A1A" : "#FFF",
    text: isDark ? "#FFFFFF" : "#1A1A1A",
    subText: isDark ? "#AAAAAA" : "#555",
    pill: isDark ? "#2A2A2A" : "#F8F8F8",
    divider: isDark ? "#333" : "#f0f0f0",
    calendarBg: isDark ? "#1A1A1A" : "#FFF",
    chip: isDark ? "#2A2A2A" : "#F2F2F2",
    inputBg: isDark ? "#252525" : "#F9F9F9",
    accent: isDark ? "#E94560" : "#ff4d88",
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
      selectedColor: "#48CAE4",
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
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
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
              <Text style={styles.pageEyebrow}>CYCLE CALENDAR</Text>
              <Text style={[styles.pageTitle, { color: theme.text }]}>შენი კალენდარი</Text>
              <Text style={[styles.pageSubtitle, { color: theme.subText }]}>მართე ციკლი და დღიური ერთ სივრცეში</Text>
            </View>
            <View style={styles.pageHeaderIcon}>
              <Ionicons name="calendar-outline" size={21} color="#E94560" />
            </View>
          </View>

          <LinearGradient
            colors={isDark ? ["#1D191E", "#151417"] : ["#FFFFFF", "#FFF8FA"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.calendarShell}
          >
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
                todayTextColor: "#48CAE4",
                arrowColor: theme.accent,
                textDisabledColor: isDark ? "#444" : "#d9e1e8",
                selectedDayTextColor: "#ffffff",
              }}
            />
          </LinearGradient>

          {/* Legend */}
          <View style={styles.legend}>
            <LegendItem color={theme.accent} label="პერიოდი" textColor={theme.text} />
            <LegendItem color="#06d6a0" label="ნაყოფიერი" textColor={theme.text} />
            <LegendItem color="#ffd166" label="ოვულაცია" textColor={theme.text} />
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
              <View style={[styles.card, { backgroundColor: theme.card }]}>
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
                  <View
                    style={[
                      styles.assistantBox,
                      {
                        backgroundColor: isDark ? "rgba(72,202,228,0.12)" : "#EEF9FD",
                        borderColor: isDark ? "rgba(72,202,228,0.25)" : "#CDEFF7",
                      },
                    ]}
                  >
                    <Text style={[styles.assistantTitle, { color: theme.text }]}>
                      როგორ გრძნობ დღეს თავს?
                    </Text>
                    <Text style={[styles.assistantText, { color: theme.subText }]}>
                      შეავსე დღიური ქვემოთ და ასისტენტი შენზე მორგებულ რჩევას მოგცემს.
                    </Text>
                  </View>
                )}
              </View>
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
                <View
                  style={[
                    styles.assistantBox,
                    {
                      backgroundColor: isDark ? "rgba(233,69,96,0.12)" : "#FFF5F8",
                      borderColor: isDark ? "rgba(233,69,96,0.25)" : "#FFD8E5",
                      marginTop: 16,
                    },
                  ]}
                >
                  <Text style={[styles.assistantTitle, { color: theme.text }]}>ასისტენტის რჩევა ✨</Text>

                  {!isPremium ? (
                    <PrimePreview
                      minHeight={80}
                      concealCompletely
                      message="სრული მხარდაჭერის სანახავად გახსენი Prime"
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
                    <Text style={{ fontSize: 11, color: "#aaa", textAlign: "right", marginTop: 8, opacity: 0.7 }}>ასისტენტი შეიძლება შეცდეს</Text>
                  ) : null}
                </View>
              )}

              {/* Mood */}
              <View style={[styles.card, { backgroundColor: theme.card, marginTop: 16 }]}>
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
              </View>

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
                  placeholderTextColor={isDark ? "#666" : "#999"}
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
          <View style={[styles.monthPickerCard, { backgroundColor: theme.card }]}>
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
                      { backgroundColor: isActive ? theme.accent : isDark ? "#252525" : "#F5F5F5" },
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
    </View>
  );
}

export default function CalendarScreen() {
  const { pregnancyMode } = usePregnancy();
  return pregnancyMode ? <PregnancyCalendarScreen /> : <RegularCalendarScreen />;
}

const LegendItem = ({ color, label, textColor }) => (
  <View style={styles.legendItem}>
    <View style={[styles.legendColor, { backgroundColor: color }]} />
    <Text style={[styles.legendText, { color: textColor }]}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  // -- Calendar ----------------------------------------------------
  pageHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 18 },
  pageEyebrow: { color: "#E94560", fontSize: 9, fontWeight: "900", letterSpacing: 1.1, marginBottom: 6 },
  pageTitle: { fontSize: 25, fontWeight: "900", letterSpacing: -0.4 },
  pageSubtitle: { fontSize: 13, fontWeight: "600", marginTop: 5 },
  pageHeaderIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: "rgba(233,69,96,0.12)", alignItems: "center", justifyContent: "center" },
  calendarShell: { marginHorizontal: 20, borderRadius: 26, paddingHorizontal: 5, paddingTop: 5, paddingBottom: 10, elevation: 5, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 14, overflow: "hidden" },
  calHeader: { alignItems: "center", padding: 10, paddingHorizontal: 20 },
  calHeaderText: { fontSize: 17, fontWeight: "800", textTransform: "capitalize" },
  calHeaderChevron: { color: "#E94560", fontSize: 14, fontWeight: "900" },
  legend: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 9, marginTop: 16, marginHorizontal: 20, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 16, backgroundColor: "rgba(150,150,150,0.08)" },
  legendItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 2 },
  legendColor: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  legendText: { fontSize: 11, fontWeight: "700" },
  // -- Shared ------------------------------------------------------
  sectionContainer: { paddingHorizontal: 20, marginTop: 28 },
  sectionTitle: { fontSize: 21, fontWeight: "900", textTransform: "capitalize", letterSpacing: -0.3 },
  card: { borderRadius: 22, padding: 18, elevation: 3, shadowColor: "#000", shadowOpacity: 0.07, shadowRadius: 12 },
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
  assistantBox: { marginTop: 18, borderRadius: 18, borderWidth: 1, padding: 15, gap: 8 },
  assistantTitle: { fontSize: 15, fontWeight: "800" },
  assistantText: { fontSize: 14, lineHeight: 21 },
  assistantLoadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  assistantHiddenPreview: { minHeight: 92 },
  // -- Diary -------------------------------------------------------
  diaryHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  diaryHeadingCopy: { flex: 1, paddingRight: 12 },
  dateSubtitle: { fontSize: 14, fontWeight: "700", textTransform: "capitalize", marginTop: 5 },
  cardLabel: { fontSize: 17, fontWeight: "800", marginBottom: 14 },
  moodGrid: { flexDirection: "row", justifyContent: "space-between" },
  moodItem: { alignItems: "center", width: "19%", paddingVertical: 10, borderRadius: 14 },
  activeMood: { backgroundColor: "rgba(233,69,96,0.10)", borderWidth: 1, borderColor: "rgba(233,69,96,0.55)" },
  moodEmoji: { fontSize: 26, marginBottom: 5 },
  moodLabel: { fontSize: 10, fontWeight: "600", textAlign: "center" },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", paddingVertical: 11, paddingHorizontal: 14, borderRadius: 999 },
  activeChip: { backgroundColor: "#E94560" },
  chipIcon: { marginRight: 6, fontSize: 16 },
  chipText: { fontSize: 13, fontWeight: "600" },
  activeChipText: { color: "#FFF", fontWeight: "800" },
  noteInput: { borderRadius: 17, padding: 16, height: 108, textAlignVertical: "top", fontSize: 14, borderWidth: 1, borderColor: "rgba(150,150,150,0.12)" },
  saveBtn: { minHeight: 56, borderRadius: 17, alignItems: "center", justifyContent: "center", marginTop: 24, elevation: 3 },
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
