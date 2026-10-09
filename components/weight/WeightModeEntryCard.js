import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useLanguage } from "../../context/LanguageContext";
import { useTheme } from "../../context/ThemeContext";
import { useWeight } from "../../context/WeightContext";
import { getWeightTheme } from "./weightTheme";

// Device-local on purpose: "no thanks" is a display preference, not data.
const DISMISS_KEY = "cycle_app_weight_card_dismissed";

// Entry point on the regular statistics screen:
//   free         → locked teaser, opens the Prime paywall
//   Prime        → "turn on", opens the setup screen
//   Prime lapsed → the mode was on: data is kept, renew to continue
// Hidden when the mode is on, blocked (fertility goal / pregnancy) or dismissed.
export default function WeightModeEntryCard() {
  const router = useRouter();
  const { t } = useLanguage();
  const { isDark, isPremium } = useTheme();
  const { weightMode, weightModeChosen, featureVisible, blockedBy } = useWeight();
  const theme = getWeightTheme(isDark);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(DISMISS_KEY)
      .then((saved) => active && setDismissed(saved === "true"))
      .catch(() => active && setDismissed(false));
    return () => {
      active = false;
    };
  }, []);

  if (!featureVisible || weightMode || blockedBy) return null;

  const lapsed = weightModeChosen && !isPremium;
  if (dismissed && !lapsed) return null;

  const handleDismiss = async () => {
    setDismissed(true);
    try {
      await AsyncStorage.setItem(DISMISS_KEY, "true");
    } catch (error) {
      console.log("Weight card dismiss save error:", error);
    }
  };

  const title = lapsed ? t("weight.entry.lapsedTitle") : t("weight.entry.title");
  const body = lapsed ? t("weight.entry.lapsedBody") : isPremium ? t("weight.entry.bodyUnlocked") : t("weight.entry.bodyLocked");
  const cta = lapsed ? t("weight.entry.renew") : isPremium ? t("weight.entry.enable") : t("weight.entry.unlock");
  const onPress = () => router.push(isPremium ? "/weight-setup" : "/premium");

  return (
    <LinearGradient colors={theme.cardGradient} style={[styles.card, { borderColor: theme.accentBorder }]}>
      <View style={styles.headerRow}>
        <View style={[styles.icon, { backgroundColor: theme.accentSoft }]}>
          <Ionicons name={isPremium || lapsed ? "scale-outline" : "lock-closed"} size={18} color={theme.accent} />
        </View>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      </View>
      <Text style={[styles.body, { color: theme.subText }]}>{body}</Text>
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.cta, { backgroundColor: theme.accent }]} onPress={onPress} activeOpacity={0.85}>
          <Text style={styles.ctaText}>{cta}</Text>
        </TouchableOpacity>
        {!lapsed && (
          <TouchableOpacity onPress={handleDismiss} activeOpacity={0.7} style={styles.dismiss}>
            <Text style={[styles.dismissText, { color: theme.subText }]}>{t("weight.entry.dismiss")}</Text>
          </TouchableOpacity>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 26, borderWidth: 1, padding: 19, marginBottom: 18 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  icon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 16, fontWeight: "900" },
  body: { fontSize: 13, lineHeight: 19, fontWeight: "600" },
  actions: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 14 },
  cta: { borderRadius: 999, paddingVertical: 11, paddingHorizontal: 20 },
  ctaText: { color: "#fff", fontSize: 14, fontWeight: "900" },
  dismiss: { paddingVertical: 8 },
  dismissText: { fontSize: 13, fontWeight: "700" },
});
