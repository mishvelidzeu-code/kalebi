import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Linking, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";

export default function PrivacyScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const { isDark } = useTheme();

  const theme = {
    bg: isDark ? "#0F0F0F" : "#F7F8FA",
    text: isDark ? "#FFFFFF" : "#1A1A1A",
    card: isDark ? "#1A1A1A" : "#FFFFFF",
    primary: isDark ? "#E94560" : "#ff4d88",
    subText: isDark ? "#AAAAAA" : "#666666",
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t("privacy.title")}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: theme.card }]}>

          <Text style={[styles.title, { color: theme.primary }]}>{t("privacy.s1Title")}</Text>
          <Text style={[styles.body, { color: theme.text }]}>{t("privacy.s1Body")}</Text>

          <Text style={[styles.title, { color: theme.primary }]}>{t("privacy.s2Title")}</Text>
          <Text style={[styles.body, { color: theme.text }]}>{t("privacy.s2Body")}</Text>

          <Text style={[styles.title, { color: theme.primary }]}>{t("privacy.s3Title")}</Text>
          <Text style={[styles.body, { color: theme.text }]}>{t("privacy.s3Body")}</Text>

          <Text style={[styles.title, { color: theme.primary }]}>{t("privacy.s4Title")}</Text>
          <Text style={[styles.body, { color: theme.text }]}>{t("privacy.s4Body")}</Text>

          <Text style={[styles.title, { color: theme.primary }]}>{t("privacy.s5Title")}</Text>
          <Text style={[styles.body, { color: theme.text }]}>{t("privacy.s5Body")}</Text>

          <Text style={[styles.title, { color: theme.primary }]}>{t("privacy.s6Title")}</Text>
          <Text style={[styles.body, { color: theme.text }]}>{t("privacy.s6Body")}</Text>

          <Text style={[styles.title, { color: theme.primary }]}>{t("privacy.s7Title")}</Text>
          <Text style={[styles.body, { color: theme.text }]}>{t("privacy.s7Body")}</Text>

          {/* დამატებული Privacy Policy ლინკი */}
          <Text
            style={[styles.link, { color: theme.primary }]}
            onPress={() => Linking.openURL("https://sites.google.com/view/cycle-care-privacy")}
          >{t("privacy.fullPolicy")}</Text>

        </View>

        <View style={{ height: 50 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", padding: 20, paddingTop: 10 },
  backBtn: { padding: 8, borderRadius: 12, marginRight: 10 },
  headerTitle: { fontSize: 20, fontWeight: "800" },
  content: { padding: 20 },
  card: { borderRadius: 28, padding: 25, elevation: 2, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10 },
  title: { fontSize: 17, fontWeight: "700", marginBottom: 12, marginTop: 20 },
  body: { fontSize: 14, lineHeight: 22, opacity: 0.9 },

  link: {
    marginTop: 25,
    fontSize: 14,
    textDecorationLine: "underline",
    fontWeight: "600"
  }
});