import dayjs from "dayjs";
import "dayjs/locale/ka";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { useTheme } from "../../context/ThemeContext";
import { supabase } from "../../services/supabase";

dayjs.locale("ka");

export default function SymptomsScreen() {
  const { isDark } = useTheme();

  const [selectedSymptoms, setSelectedSymptoms] = useState([]);
  const [mood, setMood] = useState(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const todayStr = dayjs().format("YYYY-MM-DD");

  const dynamicColors = {
    bg: isDark ? "#0F0F0F" : "#FDFCFD",
    card: isDark ? "#1A1A1A" : "#FFF",
    text: isDark ? "#FFFFFF" : "#1A1A1A",
    subText: isDark ? "#AAAAAA" : "#999999",
    inputBg: isDark ? "#252525" : "#F9F9F9",
    chip: isDark ? "#2A2A2A" : "#F2F2F2",
    shadow: "#000",
  };

  const categories = [
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

  const moods = [
    { emoji: "🤩", label: "არაჩვეულებრივი" },
    { emoji: "😊", label: "კარგი" },
    { emoji: "😐", label: "ნორმალური" },
    { emoji: "😔", label: "ცუდი" },
    { emoji: "😫", label: "საშინელი" },
  ];

  useEffect(() => {
    loadTodayData();
  }, []);

  const loadTodayData = async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase.from("symptoms").select("*").eq("user_id", user.id).eq("date", todayStr).maybeSingle();

      if (data) {
        setSelectedSymptoms(data.symptoms || []);
        setMood(data.mood || null);
        setNote(data.note || "");
      }
    } catch (error) {
      console.log("Load error:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSymptom = (id) => {
    setSelectedSymptoms((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const saveSymptoms = async () => {
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
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
      Alert.alert("წარმატება", "დღიური განახლდა ✨");
    } catch {
      Alert.alert("შეცდომა", "მონაცემების შენახვა ვერ მოხერხდა");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: dynamicColors.bg }]}>
        <ActivityIndicator size="large" color="#E94560" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: dynamicColors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView style={[styles.container, { backgroundColor: dynamicColors.bg }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: dynamicColors.text }]}>დღევანდელი დღიური</Text>
            <Text style={styles.dateText}>{dayjs().format("dddd, D MMMM")}</Text>
          </View>

          <View style={[styles.card, { backgroundColor: dynamicColors.card, shadowColor: dynamicColors.shadow }]}>
            <Text style={[styles.sectionTitle, { color: dynamicColors.text }]}>როგორ გრძნობ თავს?</Text>
            <View style={styles.moodGrid}>
              {moods.map((m) => {
                const active = mood === m.label;
                return (
                  <TouchableOpacity key={m.label} style={[styles.moodItem, active && styles.activeMood]} onPress={() => setMood(m.label)}>
                    <Text style={styles.moodEmoji}>{m.emoji}</Text>
                    <Text style={[styles.moodLabel, { color: dynamicColors.subText }, active && styles.activeMoodText]}>{m.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {categories.map((cat, index) => (
            <View key={index} style={styles.section}>
              <Text style={[styles.sectionTitle, { color: dynamicColors.text }]}>{cat.title}</Text>
              <View style={styles.symptomGrid}>
                {cat.items.map((item) => {
                  const active = selectedSymptoms.includes(item.id);
                  return (
                    <TouchableOpacity key={item.id} style={[styles.chip, { backgroundColor: dynamicColors.chip }, active && styles.activeChip]} onPress={() => toggleSymptom(item.id)}>
                      <Text style={styles.chipIcon}>{item.icon}</Text>
                      <Text style={[styles.chipText, { color: dynamicColors.text }, active && styles.activeChipText]}>{item.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: dynamicColors.text }]}>დამატებითი ჩანაწერი</Text>
            <TextInput
              style={[styles.noteInput, { backgroundColor: dynamicColors.inputBg, color: dynamicColors.text }]}
              placeholder="როგორ ჩაიარა დღემ?.."
              placeholderTextColor={isDark ? "#666" : "#999"}
              multiline
              value={note}
              onChangeText={setNote}
            />
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={saveSymptoms} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>მონაცემების შენახვა</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 60 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { marginBottom: 25 },
  title: { fontSize: 28, fontWeight: "800" },
  dateText: { fontSize: 16, color: "#E94560", fontWeight: "600", textTransform: "capitalize" },
  card: { borderRadius: 24, padding: 20, marginBottom: 25, elevation: 4, shadowOpacity: 0.05, shadowRadius: 10 },
  section: { marginBottom: 25 },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginBottom: 15 },
  moodGrid: { flexDirection: "row", justifyContent: "space-between" },
  moodItem: { alignItems: "center", width: "19%", paddingVertical: 10, borderRadius: 15 },
  activeMood: { backgroundColor: "rgba(233, 69, 96, 0.1)", borderWidth: 1, borderColor: "#E94560" },
  moodEmoji: { fontSize: 26, marginBottom: 5 },
  moodLabel: { fontSize: 10, textAlign: "center" },
  activeMoodText: { color: "#E94560", fontWeight: "700" },
  symptomGrid: { flexDirection: "row", flexWrap: "wrap" },
  chip: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 16, borderRadius: 20, marginRight: 10, marginBottom: 10 },
  activeChip: { backgroundColor: "#E94560" },
  chipIcon: { marginRight: 6, fontSize: 16 },
  chipText: { fontSize: 14 },
  activeChipText: { color: "#FFF", fontWeight: "600" },
  noteInput: { borderRadius: 20, padding: 18, height: 100, textAlignVertical: "top", fontSize: 15 },
  saveBtn: { backgroundColor: "#E94560", padding: 20, borderRadius: 22, alignItems: "center" },
  saveBtnText: { color: "#FFF", fontSize: 18, fontWeight: "700" },
});
