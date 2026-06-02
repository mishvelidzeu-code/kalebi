import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { usePregnancy } from "../context/PregnancyContext";
import {
  checkPregnancySubscriptionStatus,
  getPregnancyOfferings,
  purchasePregnancyPackage,
  restorePregnancyPurchases,
} from "../services/purchases";

const ACCENT = "#06D6A0";
const FALLBACK_PRICE_LABEL = "$2.99 / თვე";

const features = [
  {
    icon: "heart-outline",
    title: "ყოველკვირეული AI რჩევა",
    desc: "ყოველ კვირას ნაყოფის განვითარებისა და ამ კვირის სიმპტომების შესახებ პირადი AI რჩევა.",
  },
  {
    icon: "notifications-outline",
    title: "ორსულობის ნოტიფიკაციები",
    desc: "კვირის მილსტოუნები, ექიმის ვიზიტების შეხსენება და დღიური ყოველ 2 დღეში.",
  },
  {
    icon: "calendar-outline",
    title: "ორსულობის კალენდარი",
    desc: "სრული ორსულობის კალენდარი ტრიმესტრებით, კვირის პროგრესით და სავარაუდო მშობიარობის თარიღით.",
  },
  {
    icon: "image-outline",
    title: "ნაყოფის ვიზუალიზაცია",
    desc: "კვირის მიხედვით ნაყოფის სურათები — გახსენი და ნახე, სად არის ახლა შენი ბავშვი.",
  },
];

export default function PregnancyPremiumScreen() {
  const router = useRouter();
  const { pregnancyMode, enablePregnancyMode } = usePregnancy();

  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [availablePackage, setAvailablePackage] = useState(null);
  const [storeConfigured, setStoreConfigured] = useState(true);

  const today = new Date();
  const minDate = new Date(today.getFullYear(), today.getMonth() - 9, today.getDate());
  const [lmpDate, setLmpDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 28);
    return d;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);

  const loadPaywall = useCallback(async () => {
    setLoading(true);
    try {
      const offeringsState = await getPregnancyOfferings();
      setStoreConfigured(offeringsState.configured);
      setAvailablePackage(offeringsState.availablePackage);
    } catch {
      setStoreConfigured(false);
      setAvailablePackage(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPaywall();
    }, [loadPaywall])
  );

  const lmpDateStr = lmpDate.toISOString().split("T")[0];

  const handlePurchase = async () => {
    if (!availablePackage && storeConfigured) {
      Alert.alert("პროდუქტი ჯერ არაა მზად", "ორსულობის გამოწერა ჯერ App Store-ში გამოქვეყნებული არ არის.");
      return;
    }

    setPurchasing(true);
    try {
      if (!storeConfigured) {
        // Dev/simulator bypass
        await enablePregnancyMode(lmpDateStr);
        Alert.alert("წარმატება 🤰", "ორსულობის რეჟიმი ჩაირთო.", [
          { text: "კარგი", onPress: () => router.replace("/(tabs)") },
        ]);
        return;
      }

      const status = await checkPregnancySubscriptionStatus();
      if (status.hasSubscription) {
        await enablePregnancyMode(lmpDateStr);
        Alert.alert("წარმატება 🤰", "ორსულობის რეჟიმი ჩაირთო.", [
          { text: "კარგი", onPress: () => router.replace("/(tabs)") },
        ]);
        return;
      }

      const result = await purchasePregnancyPackage(availablePackage);
      if (result.hasSubscription) {
        await enablePregnancyMode(lmpDateStr);
        Alert.alert("წარმატება 🤰", "ორსულობის რეჟიმი ჩაირთო. კეთილი იყოს შენი ორსულობა!", [
          { text: "კარგი", onPress: () => router.replace("/(tabs)") },
        ]);
      } else {
        Alert.alert("ინფორმაცია", "შეძენა დასრულდა, მაგრამ ორსულობის რეჟიმი ჯერ არ გააქტიურდა.");
      }
    } catch (error) {
      const code = String(error?.userCancelled || error?.code || "");
      if (code.includes("true") || code.includes("PURCHASE_CANCELLED")) return;
      Alert.alert("შეცდომა", "შეძენა ვერ დასრულდა. სცადე თავიდან.");
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const result = await restorePregnancyPurchases();
      if (result.hasSubscription) {
        await enablePregnancyMode(lmpDateStr);
        Alert.alert("აღდგენა დასრულდა 🤰", "ორსულობის გამოწერა აღდგა შენს account-ზე.", [
          { text: "კარგი", onPress: () => router.replace("/(tabs)") },
        ]);
      } else {
        Alert.alert("ინფორმაცია", "აქტიური ორსულობის გამოწერა ვერ მოიძებნა.");
      }
    } catch {
      Alert.alert("შეცდომა", "Restore ვერ შესრულდა. სცადე თავიდან.");
    } finally {
      setRestoring(false);
    }
  };

  const storePriceLabel = availablePackage?.product?.priceString || FALLBACK_PRICE_LABEL;

  const formattedLmp = lmpDate.toLocaleDateString("ka-GE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <LinearGradient
        colors={["#062818", "#121212", "#000000"]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={{ flex: 1 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 20 }}>
          <Ionicons name="close" size={28} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>

        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.iconContainer}>
            <LinearGradient
              colors={["#06D6A0", "#059669"]}
              style={styles.iconGradient}
            >
              <Text style={styles.iconEmoji}>🤰</Text>
            </LinearGradient>
          </View>

          <Text style={styles.title}>
            ორსულობის{" "}
            <Text style={{ color: ACCENT }}>რეჟიმი</Text>
          </Text>

          <Text style={styles.subtitle}>
            სპეციალური რეჟიმი ორსული ქალებისთვის — ყოველკვირეული AI რჩევა, ნოტიფიკაციები და ნაყოფის ვიზუალიზაცია.
          </Text>

          <View style={{ width: "100%", marginBottom: 28 }}>
            {features.map((feature) => (
              <View key={feature.title} style={styles.feature}>
                <View style={styles.icon}>
                  <Ionicons name={feature.icon} size={22} color={ACCENT} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureTitle}>{feature.title}</Text>
                  <Text style={styles.featureDesc}>{feature.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* LMP Date Picker */}
          <View style={styles.dateSectionCard}>
            <Text style={styles.dateSectionTitle}>ბოლო მენსტრუაციის პირველი დღე</Text>
            <Text style={styles.dateSectionHint}>
              ეს თარიღი გამოიყენება ორსულობის კვირის გამოსათვლელად.
            </Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowDatePicker(true)}
            >
              <Ionicons name="calendar-outline" size={18} color={ACCENT} />
              <Text style={styles.dateButtonText}>{formattedLmp}</Text>
              <Ionicons name="chevron-down-outline" size={16} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                value={lmpDate}
                mode="date"
                display={Platform.OS === "ios" ? "inline" : "default"}
                maximumDate={today}
                minimumDate={minDate}
                onChange={(event, selectedDate) => {
                  if (Platform.OS === "android") setShowDatePicker(false);
                  if (event.type === "dismissed") { setShowDatePicker(false); return; }
                  if (selectedDate) setLmpDate(selectedDate);
                  if (Platform.OS === "ios" && event.type === "set") setShowDatePicker(false);
                }}
                themeVariant="dark"
                accentColor={ACCENT}
              />
            )}
          </View>

          {/* Price card */}
          <View style={[styles.card, styles.cardActive]}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.cardTitle}>Pregnancy Monthly</Text>
              <Text style={styles.cardPrice}>{storePriceLabel}</Text>
              <Text style={styles.autoRenewText}>
                გამოწერა ავტომატურად განახლდება ყოველთვიურად. თანხა ჩამოიჭრება თქვენი Apple ID ანგარიშიდან. გამოწერის გაუქმება შესაძლებელია მიმდინარე პერიოდის დასრულებამდე მინიმუმ 24 საათით ადრე App Store-ის პარამეტრებიდან.
              </Text>
            </View>
            <View style={styles.best}>
              <Text style={styles.bestText}>BEST</Text>
            </View>
          </View>

          {!storeConfigured && (
            <View style={styles.warningBox}>
              <Text style={styles.warningTitle}>RevenueCat ჯერ არაა მიბმული</Text>
              <Text style={styles.warningText}>
                ამ გვერდის UI მზადაა, მაგრამ Simulator-ში ყიდვა იმუშავებს პირდაპირ.
              </Text>
            </View>
          )}

          {pregnancyMode && (
            <View style={styles.activeBox}>
              <Text style={styles.activeTitle}>ორსულობის რეჟიმი უკვე აქტიურია 🤰</Text>
              <Text style={styles.activeText}>
                შენს account-ზე ორსულობის ყველა ფუნქცია გახსნილია.
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.button, (loading || purchasing || pregnancyMode) && styles.buttonDisabled]}
            onPress={handlePurchase}
            disabled={loading || purchasing || pregnancyMode}
          >
            {loading || purchasing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {pregnancyMode ? "ორსულობის რეჟიმი აქტიურია" : "ორსულობის რეჟიმის ჩართვა"}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.restoreButton}
            onPress={handleRestore}
            disabled={restoring}
          >
            {restoring ? (
              <ActivityIndicator color={ACCENT} />
            ) : (
              <Text style={styles.restoreButtonText}>Restore Purchases</Text>
            )}
          </TouchableOpacity>

          <View style={styles.linksRow}>
            <TouchableOpacity
              onPress={() =>
                Linking.openURL("https://sites.google.com/view/cycle-care-privacy/მთავარი")
              }
            >
              <Text style={styles.linkText}>Privacy Policy</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() =>
                Linking.openURL("https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")
              }
            >
              <Text style={styles.linkText}>Terms of Use (EULA)</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", paddingHorizontal: 25, paddingBottom: 40 },
  iconContainer: {
    marginBottom: 20,
    elevation: 20,
    shadowColor: ACCENT,
    shadowOpacity: 0.5,
    shadowRadius: 15,
  },
  iconGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  iconEmoji: { fontSize: 40 },
  title: {
    fontSize: 34,
    fontWeight: "900",
    color: "white",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  subtitle: {
    color: "#999",
    fontSize: 15,
    marginTop: 10,
    marginBottom: 35,
    textAlign: "center",
    paddingHorizontal: 15,
    lineHeight: 22,
  },
  feature: { flexDirection: "row", marginBottom: 22, alignItems: "center" },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "rgba(6,214,160,0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 18,
    borderWidth: 1,
    borderColor: "rgba(6,214,160,0.15)",
  },
  featureTitle: { color: "white", fontSize: 16, fontWeight: "700" },
  featureDesc: { color: "#777", fontSize: 13, marginTop: 2, lineHeight: 19 },
  dateSectionCard: {
    width: "100%",
    backgroundColor: "rgba(6,214,160,0.06)",
    borderRadius: 20,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "rgba(6,214,160,0.18)",
  },
  dateSectionTitle: { color: "white", fontSize: 15, fontWeight: "700", marginBottom: 4 },
  dateSectionHint: { color: "#777", fontSize: 13, lineHeight: 18, marginBottom: 14 },
  dateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(6,214,160,0.25)",
  },
  dateButtonText: { flex: 1, color: "white", fontSize: 15, fontWeight: "600" },
  card: {
    width: "100%",
    backgroundColor: "rgba(6,214,160,0.08)",
    padding: 22,
    borderRadius: 24,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cardActive: {
    borderColor: ACCENT,
    backgroundColor: "rgba(6,214,160,0.08)",
  },
  cardTitle: { color: "white", fontSize: 19, fontWeight: "800" },
  cardPrice: { color: ACCENT, marginTop: 4, fontWeight: "700", fontSize: 22 },
  autoRenewText: { color: "#aaa", fontSize: 12, marginTop: 6, lineHeight: 18 },
  best: {
    backgroundColor: ACCENT,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  bestText: { color: "white", fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  warningBox: {
    width: "100%",
    padding: 18,
    borderRadius: 20,
    backgroundColor: "rgba(255,209,102,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,209,102,0.25)",
    marginBottom: 14,
  },
  warningTitle: { color: "#FFD166", fontSize: 15, fontWeight: "800", marginBottom: 6 },
  warningText: { color: "#ddd", fontSize: 13, lineHeight: 20 },
  activeBox: {
    width: "100%",
    padding: 18,
    borderRadius: 20,
    backgroundColor: "rgba(6,214,160,0.12)",
    borderWidth: 1,
    borderColor: "rgba(6,214,160,0.25)",
    marginBottom: 14,
  },
  activeTitle: { color: ACCENT, fontSize: 15, fontWeight: "800", marginBottom: 6 },
  activeText: { color: "#ddd", fontSize: 13, lineHeight: 20 },
  button: {
    backgroundColor: ACCENT,
    width: "100%",
    padding: 20,
    borderRadius: 22,
    alignItems: "center",
    marginTop: 10,
    shadowColor: ACCENT,
    shadowOpacity: 0.4,
    shadowRadius: 15,
  },
  buttonDisabled: { opacity: 0.65 },
  buttonText: { color: "white", fontSize: 18, fontWeight: "800" },
  restoreButton: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 20,
    alignItems: "center",
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  restoreButtonText: { color: ACCENT, fontSize: 15, fontWeight: "800" },
  linksRow: { flexDirection: "row", marginTop: 18 },
  linkText: {
    color: "#888",
    fontSize: 12,
    marginHorizontal: 10,
    textDecorationLine: "underline",
  },
});
