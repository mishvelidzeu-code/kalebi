import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { useLanguage } from "../../context/LanguageContext";
import { useTheme } from "../../context/ThemeContext";
import { upsertWeightLog } from "../../services/weightLogs";
import dayjs from "../../utils/dayjs";
import { WEIGHT_LIMITS } from "../../utils/weightStats";
import { getWeightTheme } from "./weightTheme";

// Bottom sheet for today's weigh-in. Writing again the same day replaces it.
export default function AddWeightModal({ visible, initialKg, onClose, onSaved }) {
  const { t } = useLanguage();
  const { isDark } = useTheme();
  const theme = getWeightTheme(isDark);

  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setValue(initialKg != null ? String(initialKg) : "");
      setError("");
    }
  }, [visible, initialKg]);

  const handleSave = async () => {
    const kg = Number(String(value).replace(",", "."));
    if (!Number.isFinite(kg) || kg < WEIGHT_LIMITS.minKg || kg > WEIGHT_LIMITS.maxKg) {
      setError(t("weight.addInvalid"));
      return;
    }

    setSaving(true);
    const result = await upsertWeightLog(dayjs().format("YYYY-MM-DD"), Math.round(kg * 10) / 10);
    setSaving(false);

    if (!result.ok) {
      setError(t("weight.saveFailed"));
      return;
    }
    onSaved?.();
    onClose?.();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: isDark ? "#221D33" : "#FFFFFF" }]}>
          <Text style={[styles.title, { color: theme.text }]}>{t("weight.addTitle")}</Text>
          <Text style={[styles.date, { color: theme.subText }]}>{dayjs().format("D MMMM, dddd")}</Text>

          <View style={[styles.inputRow, { borderColor: error ? theme.water : theme.accentBorder, backgroundColor: theme.inputBg }]}>
            <TextInput
              value={value}
              onChangeText={(text) => {
                setValue(text);
                if (error) setError("");
              }}
              placeholder={t("weight.addPlaceholder")}
              placeholderTextColor={theme.subText}
              keyboardType="decimal-pad"
              autoFocus
              maxLength={6}
              style={[styles.input, { color: theme.text }]}
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />
            <Text style={[styles.unit, { color: theme.subText }]}>{t("weight.kg")}</Text>
          </View>
          {!!error && <Text style={[styles.error, { color: theme.water }]}>{error}</Text>}

          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: theme.accent }]} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{t("common.save")}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={[styles.cancelText, { color: theme.subText }]}>{t("common.cancel")}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 36 },
  title: { fontSize: 20, fontWeight: "900" },
  date: { fontSize: 13, fontWeight: "600", marginTop: 4, marginBottom: 18 },
  inputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 18, paddingHorizontal: 18 },
  input: { flex: 1, fontSize: 30, fontWeight: "900", paddingVertical: 14 },
  unit: { fontSize: 18, fontWeight: "800" },
  error: { fontSize: 13, fontWeight: "700", marginTop: 8 },
  saveBtn: { marginTop: 20, borderRadius: 999, paddingVertical: 16, alignItems: "center" },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  cancelBtn: { marginTop: 10, alignItems: "center", paddingVertical: 8 },
  cancelText: { fontSize: 14, fontWeight: "700" },
});
