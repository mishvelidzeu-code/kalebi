import dayjs from "dayjs";
import "dayjs/locale/ka";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { Calendar } from "react-native-calendars";

import { useTheme } from "../../context/ThemeContext";
import { useCycles } from "../../hooks/useCycles";
import { supabase } from "../../services/supabase";

dayjs.locale("ka");

const shortMonths = ["იან", "თებ", "მარ", "აპრ", "მაი", "ივნ", "ივლ", "აგვ", "სექ", "ოქტ", "ნოე", "დეკ"];

export default function CalendarScreen() {
  const router = useRouter();
  const { isPremium, isDark } = useTheme(); 
  const { markedDates, loadData, addCycle, deleteCycle, rawCycles, loading } = useCycles();

  const [currentDate, setCurrentDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [selectedDay, setSelectedDay] = useState(dayjs().format("YYYY-MM-DD"));
  
  // --- დამატებულია calendarKey კალენდრის იძულებითი განახლებისთვის ---
  const [calendarKey, setCalendarKey] = useState(1);
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  const [dayDetails, setDayDetails] = useState({
    symptoms: [],
    note: null,
    mood: null,
    loading: false
  });

  const theme = {
    bg: isDark ? "#0F0F0F" : "#FDFCFD",
    card: isDark ? "#1A1A1A" : "#FFF",
    text: isDark ? "#FFFFFF" : "#1A1A1A",
    subText: isDark ? "#AAAAAA" : "#555",
    pill: isDark ? "#2A2A2A" : "#F8F8F8",
    divider: isDark ? "#333" : "#f0f0f0",
    calendarBg: isDark ? "#1A1A1A" : "#FFF"
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    fetchDayDetails(selectedDay);
  }, [selectedDay]);

  const fetchDayDetails = async (dateStr) => {
    setDayDetails(prev => ({ ...prev, loading: true }));
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("symptoms")
        .select("symptoms, note, mood")
        .eq("user_id", user.id)
        .eq("date", dateStr)
        .maybeSingle();

      if (data) {
        setDayDetails({
          symptoms: data.symptoms || [],
          note: data.note,
          mood: data.mood,
          loading: false
        });
      } else {
        setDayDetails({ symptoms: [], note: null, mood: null, loading: false });
      }
    } catch {
      setDayDetails({ symptoms: [], note: null, mood: null, loading: false });
    }
  };

  const getActiveCycleForDate = (date) => {
    if (!date || !rawCycles) return null;
    const target = dayjs(date);
    return rawCycles.find(c => {
      const start = dayjs(c.start_date);
      const end = start.add((c.period_length || 5) - 1, "day");
      return target.isSame(start, "day") || target.isSame(end, "day") || (target.isAfter(start) && target.isBefore(end));
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

  // --- შესწორებული ფუნქციები წლების და თვეების არჩევისთვის ---
  const changeYear = (amount) => {
    const newDate = dayjs(currentDate).add(amount, 'year').format("YYYY-MM-DD");
    setCurrentDate(newDate);
    setCalendarKey(Date.now()); // Date.now() 100%-ით აიძულებს კალენდარს დახატოს ახალი თვე
  };

  const selectMonth = (index) => {
    const newDate = dayjs(currentDate).month(index).format("YYYY-MM-DD");
    setCurrentDate(newDate);
    setCalendarKey(Date.now()); // Date.now() 100%-ით აიძულებს კალენდარს დახატოს ახალი თვე
    setShowMonthPicker(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          
          <Calendar
            key={`${isDark ? 'dark' : 'light'}-${calendarKey}`} // აი ჯადოქრობა აქ არის! კალენდარი მაშინვე განახლდება.
            current={currentDate}
            onMonthChange={(month) => setCurrentDate(month.dateString)}
            markedDates={calendarMarks}
            firstDay={1}
            enableSwipeMonths
            onDayPress={(day) => setSelectedDay(day.dateString)}
            renderHeader={(date) => (
              <TouchableOpacity 
                style={styles.header} 
                activeOpacity={0.7}
                onPress={() => setShowMonthPicker(true)}
              >
                <Text style={[styles.headerText, { color: theme.text }]}>
                  {dayjs(date).format("MMMM YYYY")} <Text style={{fontSize: 14}}>▾</Text>
                </Text>
              </TouchableOpacity>
            )}
            theme={{
              calendarBackground: theme.calendarBg,
              dayTextColor: theme.text,
              monthTextColor: theme.text,
              todayTextColor: "#48CAE4", 
              arrowColor: isDark ? "#E94560" : "#ff4d88",
              textDisabledColor: isDark ? "#444" : "#d9e1e8",
              selectedDayTextColor: "#ffffff",
            }}
          />

          <View style={styles.legend}>
            <LegendItem color={isDark ? "#E94560" : "#ff4d88"} label="პერიოდი" textColor={theme.text} />
            <LegendItem color="#06d6a0" label="ნაყოფიერი" textColor={theme.text} />
            <LegendItem color="#ffd166" label="ოვულაცია" textColor={theme.text} />
          </View>

          <View style={styles.detailsContainer}>
            <View style={styles.detailsHeader}>
              <Text style={[styles.detailsTitle, { color: theme.text }]}>
                {dayjs(selectedDay).format("D MMMM")}
              </Text>
              <TouchableOpacity
                style={[styles.editButton, { backgroundColor: isDark ? "rgba(233,69,96,0.15)" : "#FFF0F5" }]}
                onPress={() => isPremium ? router.push("/(tabs)/symptoms") : router.push("/premium")}
              >
                <Text style={[styles.editButtonText, { color: isDark ? "#E94560" : "#ff4d88" }]}>რედაქტირება</Text>
              </TouchableOpacity>
            </View>

            {dayDetails.loading ? (
              <ActivityIndicator color={isDark ? "#E94560" : "#ff4d88"} style={{ marginTop: 20 }} />
            ) : (
              <View style={[styles.detailsCard, { backgroundColor: theme.card }]}>
                <View style={styles.statusRow}>
                  <Text style={[styles.statusLabel, { color: theme.subText }]}>მდგომარეობა:</Text>
                  <Text style={[styles.statusValue, { color: theme.text }]}>
                    {activeCycle ? "🩸 პერიოდის დღე" : "თავისუფალი დღე"}
                  </Text>
                </View>

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
                        <Text style={[styles.symptomPillText, { color: theme.text }]}>{s}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={[styles.emptyText, { borderTopColor: theme.divider, color: theme.subText }]}>
                    ამ დღეს სიმპტომები არ ჩაგიწერია.
                  </Text>
                )}

                {dayDetails.note && (
                  <View style={[styles.noteBox, { 
                    backgroundColor: isDark ? "rgba(233,69,96,0.1)" : "#FFF0F5",
                    borderLeftColor: isDark ? "#E94560" : "#ff4d88"
                  }]}>
                    <Text style={[styles.noteText, { color: isDark ? "#E94560" : "#ff4d88" }]}>"{dayDetails.note}"</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </ScrollView>
      </View>

      {/* --- თვეების მოდალი --- */}
      <Modal visible={showMonthPicker} transparent animationType="fade">
        <View style={styles.modalOverlayCenter}>
          <View style={[styles.monthPickerCard, { backgroundColor: theme.card }]}>
            
            {/* წლების გადამრთველი */}
            <View style={styles.yearSelector}>
              <TouchableOpacity onPress={() => changeYear(-1)} style={styles.yearBtn}>
                <Text style={[styles.yearBtnText, { color: theme.text }]}>{"<"}</Text>
              </TouchableOpacity>
              <Text style={[styles.yearText, { color: theme.text }]}>{dayjs(currentDate).year()}</Text>
              <TouchableOpacity onPress={() => changeYear(1)} style={styles.yearBtn}>
                <Text style={[styles.yearBtnText, { color: theme.text }]}>{">"}</Text>
              </TouchableOpacity>
            </View>

            {/* თვეების გრიდი */}
            <View style={styles.monthsGrid}>
              {shortMonths.map((m, i) => {
                const isActive = dayjs(currentDate).month() === i;
                const activeColor = isDark ? "#E94560" : "#ff4d88";
                const idleBg = isDark ? "#252525" : "#F5F5F5";
                return (
                  <TouchableOpacity
                    key={m}
                    style={[styles.monthBtn, { backgroundColor: isActive ? activeColor : idleBg }]}
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
              <Text style={styles.closeModalBtnText}>გაუქმება</Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>

      {!isPremium && (
        <BlurView intensity={7} tint={isDark ? "dark" : "light"} style={styles.premiumOverlay}>
          <TouchableOpacity 
            style={[styles.premiumBadge, { backgroundColor: isDark ? "#E94560" : "#1A1A1A" }]} 
            onPress={() => router.push("/premium")}
          >
            <Text style={styles.premiumBadgeText}>გახდი პრაიმი ✨</Text>
          </TouchableOpacity>
        </BlurView>
      )}
    </View>
  );
}

const LegendItem = ({ color, label, textColor }) => (
  <View style={styles.legendItem}>
    <View style={[styles.legendColor, { backgroundColor: color }]} />
    <Text style={[styles.legendText, { color: textColor }]}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  header: { alignItems: "center", padding: 10, paddingHorizontal: 20 },
  headerText: { fontSize: 18, fontWeight: "700", textTransform: "capitalize" },
  legend: { flexDirection: "row", justifyContent: "space-around", marginTop: 25, paddingHorizontal: 20 },
  legendItem: { flexDirection: "row", alignItems: "center" },
  legendColor: { width: 12, height: 12, borderRadius: 6, marginRight: 6 },
  legendText: { fontSize: 12, fontWeight: "500" },
  detailsContainer: { marginTop: 30, paddingHorizontal: 20 },
  detailsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 15 },
  detailsTitle: { fontSize: 22, fontWeight: "800", textTransform: "capitalize" },
  editButton: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 15 },
  editButtonText: { fontWeight: "700", fontSize: 13 },
  detailsCard: { borderRadius: 24, padding: 20, elevation: 3, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 10 },
  statusRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  statusLabel: { fontSize: 14 },
  statusValue: { fontWeight: "700" },
  symptomsList: { flexDirection: "row", flexWrap: "wrap", marginTop: 15, borderTopWidth: 1, paddingTop: 15 },
  symptomPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, marginRight: 8, marginBottom: 8 },
  symptomPillText: { fontSize: 13, fontWeight: "500" },
  noteBox: { marginTop: 10, padding: 12, borderRadius: 12, borderLeftWidth: 3 },
  noteText: { fontStyle: "italic", fontSize: 13 },
  emptyText: { fontSize: 13, marginTop: 15, fontStyle: "italic", borderTopWidth: 1, paddingTop: 15 },
  
  // --- განახლებული პრაიმის სტილები ---
  premiumOverlay: { 
    ...StyleSheet.absoluteFillObject, 
    justifyContent: "center", 
    alignItems: "center",
    borderRadius: 24
  },
  premiumBadge: { 
    paddingVertical: 12, 
    paddingHorizontal: 24, 
    borderRadius: 16, 
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8
  },
  premiumBadgeText: { 
    color: "#FFF", 
    fontSize: 15, 
    fontWeight: "800" 
  },

  // --- მოდალის სტილები ---
  modalOverlayCenter: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 20 },
  monthPickerCard: { borderRadius: 28, padding: 25, elevation: 10, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 15 },
  yearSelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  yearText: { fontSize: 22, fontWeight: '800' },
  yearBtn: { paddingVertical: 8, paddingHorizontal: 15, backgroundColor: 'rgba(150,150,150,0.1)', borderRadius: 12 },
  yearBtnText: { fontSize: 18, fontWeight: '800' },
  monthsGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  monthBtn: { width: "31%", paddingVertical: 15, borderRadius: 15, alignItems: "center", marginBottom: 12 },
  monthBtnText: { fontSize: 15, fontWeight: "700" },
  closeModalBtn: { marginTop: 10, alignItems: "center", paddingVertical: 15 },
  closeModalBtnText: { fontSize: 16, fontWeight: "700", color: "#888" }
});