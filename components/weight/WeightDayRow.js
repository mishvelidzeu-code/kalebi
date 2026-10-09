import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useLanguage } from "../../context/LanguageContext";
import { useTheme } from "../../context/ThemeContext";
import { getWeightLogsRange } from "../../services/weightLogs";
import dayjs from "../../utils/dayjs";
import AddWeightModal from "./AddWeightModal";
import { getWeightTheme } from "./weightTheme";

// "Weight" row inside the calendar's selected-day card, in weight mode only.
// Lets past days be filled in or corrected; nothing is shown for future days.
export default function WeightDayRow({ date }) {
  const { t } = useLanguage();
  const { isDark } = useTheme();
  const theme = getWeightTheme(isDark);
  const isFuture = dayjs(date).isAfter(dayjs(), "day");

  const [weightKg, setWeightKg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    if (isFuture) return;
    setLoading(true);
    const rows = await getWeightLogsRange(date, date);
    setWeightKg(rows.length ? Number(rows[0].weight_kg) : null);
    setLoading(false);
  }, [date, isFuture]);

  useEffect(() => {
    load();
  }, [load]);

  if (isFuture) return null;

  return (
    <>
      <TouchableOpacity style={styles.row} onPress={() => setShowModal(true)} activeOpacity={0.75} disabled={loading}>
        <View style={styles.labelWrap}>
          <Ionicons name="scale-outline" size={16} color={theme.accent} />
          <Text style={[styles.label, { color: theme.subText }]}>{t("weight.viewWeight")}</Text>
        </View>
        {loading ? (
          <ActivityIndicator size="small" color={theme.accent} />
        ) : weightKg != null ? (
          <View style={styles.valueWrap}>
            <Text style={[styles.value, { color: theme.text }]}>{weightKg} {t("weight.kg")}</Text>
            <Ionicons name="create-outline" size={15} color={theme.accent} />
          </View>
        ) : (
          <View style={[styles.addPill, { backgroundColor: theme.accentSoft }]}>
            <Ionicons name="add" size={14} color={theme.accent} />
            <Text style={[styles.addText, { color: theme.accent }]}>{t("common.add")}</Text>
          </View>
        )}
      </TouchableOpacity>

      <AddWeightModal
        visible={showModal}
        date={date}
        initialKg={weightKg}
        canDelete={weightKg != null}
        onClose={() => setShowModal(false)}
        onSaved={load}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 11, minHeight: 28 },
  labelWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  label: { fontSize: 13, fontWeight: "600" },
  valueWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  value: { fontSize: 13, fontWeight: "800" },
  addPill: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  addText: { fontSize: 12, fontWeight: "800" },
});
