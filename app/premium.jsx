import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useTheme } from "../context/ThemeContext";
import {
  getPremiumOfferings,
  purchasePrimePackage,
  restorePrimePurchases,
} from "../services/purchases";

const FALLBACK_PRICE_LABEL = "$0.99 / თვე";

export default function PremiumScreen() {
  const router = useRouter();
  const { refreshTheme, isPremium } = useTheme();

  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [availablePackage, setAvailablePackage] = useState(null);
  const [storeConfigured, setStoreConfigured] = useState(true);

  const features = [
    {
      icon: "sparkles-outline",
      title: "სრული AI რჩევები",
      desc: "ჰოუმისა და დღიურის რჩევები სრულად იხსნება და blur მთლიანად ქრება.",
    },
    {
      icon: "chatbubble-ellipses-outline",
      title: "ულიმიტო ასისტენტი",
      desc: "დღეში 1 კითხვის ნაცვლად, შეგიძლია ასისტენტს შეუზღუდავად ჰკითხო.",
    },
    {
      icon: "heart-outline",
      title: "სრული მხარდაჭერა",
      desc: "კალენდარში დღიურის ანალიზის სრული პასუხი და უფრო ღრმა რეკომენდაციები.",
    },
    {
      icon: "moon-outline",
      title: "ყველა შეზღუდვის მოხსნა",
      desc: "Free ლიმიტები ავტომატურად იხსნება შენს account-ზე, როგორც კი subscription აქტიურდება.",
    },
  ];

  const loadPaywall = useCallback(async () => {
    setLoading(true);

    try {
      const offeringsState = await getPremiumOfferings();
      setStoreConfigured(offeringsState.configured);
      setAvailablePackage(offeringsState.availablePackage);
    } catch (error) {
      console.log("Premium offerings load error:", error);
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

  const handlePurchase = async () => {
    if (!availablePackage) {
      Alert.alert(
        "პროდუქტი ჯერ არაა მზად",
        "Prime subscription ჯერ App Store Connect/RevenueCat-ში ბოლომდე არ არის გამზადებული."
      );
      return;
    }

    setPurchasing(true);

    try {
      const result = await purchasePrimePackage(availablePackage);
      await refreshTheme();

      if (result.isPremium) {
        Alert.alert("წარმატება ✨", "Prime გააქტიურდა. ყველა შეზღუდვა მოიხსნა.", [
          { text: "კარგი", onPress: () => router.replace("/(tabs)") },
        ]);
      } else {
        Alert.alert("ინფორმაცია", "შეძენა დასრულდა, მაგრამ Prime ჯერ არ გააქტიურებულა.");
      }
    } catch (error) {
      console.log("Prime purchase error:", error);
      const code = String(error?.userCancelled || error?.code || "");
      if (code.includes("true") || code.includes("PURCHASE_CANCELLED")) {
        return;
      }

      Alert.alert("შეცდომა", "შეძენა ვერ დასრულდა. სცადე თავიდან.");
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);

    try {
      const result = await restorePrimePurchases();
      await refreshTheme();

      if (result.isPremium) {
        Alert.alert("აღდგენა დასრულდა ✨", "Prime subscription აღდგა შენს account-ზე.");
      } else {
        Alert.alert("ინფორმაცია", "აქტიური Prime subscription ვერ მოიძებნა.");
      }
    } catch (error) {
      console.log("Prime restore error:", error);
      Alert.alert("შეცდომა", "Restore ვერ შესრულდა. სცადე თავიდან.");
    } finally {
      setRestoring(false);
    }
  };

  const storePriceLabel =
    availablePackage?.product?.priceString || FALLBACK_PRICE_LABEL;

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <LinearGradient
        colors={["#2D0B16", "#121212", "#000000"]}
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
          <View style={styles.crownContainer}>
            <LinearGradient
              colors={["#E94560", "#A02A3C"]}
              style={styles.crownGradient}
            >
              <Text style={styles.crownIcon}>👑</Text>
            </LinearGradient>
          </View>

          <Text style={styles.title}>
            Prime <Text style={{ color: "#E94560" }}>გამოწერა</Text>
          </Text>

          <Text style={styles.subtitle}>
            Prime გიხსნის სრულ AI რჩევებს, ულიმიტო ასისტენტს და ყველა free შეზღუდვას.
          </Text>

          <View style={{ width: "100%", marginBottom: 28 }}>
            {features.map((feature) => (
              <View key={feature.title} style={styles.feature}>
                <View style={styles.icon}>
                  <Ionicons name={feature.icon} size={22} color="#E94560" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureTitle}>{feature.title}</Text>
                  <Text style={styles.featureDesc}>{feature.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={[styles.card, styles.cardActive]}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.cardTitle}>Prime Monthly</Text>
              <Text style={styles.cardPrice}>{storePriceLabel}</Text>
              
              {/* შეცვლილი ტექსტი ავტომატური განახლების წესებით Apple-ის მოთხოვნის მიხედვით */}
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
                ამ გვერდის UI უკვე მზადაა, მაგრამ რეალური ყიდვისთვის საჭიროა RevenueCat API key და App Store subscription product.
              </Text>
            </View>
          )}

          {isPremium ? (
            <View style={styles.activeBox}>
              <Text style={styles.activeTitle}>Prime უკვე აქტიურია ✨</Text>
              <Text style={styles.activeText}>
                შენს account-ზე ყველა premium ფუნქცია გახსნილია.
              </Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.button, (loading || purchasing || isPremium) && styles.buttonDisabled]}
            onPress={handlePurchase}
            disabled={loading || purchasing || isPremium}
          >
            {loading || purchasing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {isPremium ? "Prime აქტიურია" : "Prime-ის შეძენა"}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.restoreButton}
            onPress={handleRestore}
            disabled={restoring}
          >
            {restoring ? (
              <ActivityIndicator color="#E94560" />
            ) : (
              <Text style={styles.restoreButtonText}>Restore Purchases</Text>
            )}
          </TouchableOpacity>

          <View style={styles.linksRow}>
            <TouchableOpacity
              onPress={() =>
                Linking.openURL(
                  "https://sites.google.com/view/cycle-care-privacy/მთავარი"
                )
              }
            >
              <Text style={styles.linkText}>Privacy Policy</Text>
            </TouchableOpacity>

            {/* შეცვლილი EULA ლინკი Apple-ის სტანდარტით */}
            <TouchableOpacity
              onPress={() =>
                Linking.openURL("https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")
              }
            >
              <Text style={styles.linkText}>Terms of Use (EULA)</Text>
            </TouchableOpacity>
          </View>
          
          {/* Testflight-ის ტექსტი წაშლილია */}
          
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", paddingHorizontal: 25, paddingBottom: 40 },
  crownContainer: {
    marginBottom: 20,
    elevation: 20,
    shadowColor: "#E94560",
    shadowOpacity: 0.5,
    shadowRadius: 15,
  },
  crownGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  crownIcon: { fontSize: 40 },
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
    backgroundColor: "rgba(233,69,96,0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 18,
    borderWidth: 1,
    borderColor: "rgba(233,69,96,0.15)",
  },
  featureTitle: { color: "white", fontSize: 16, fontWeight: "700" },
  featureDesc: { color: "#777", fontSize: 13, marginTop: 2, lineHeight: 19 },
  card: {
    width: "100%",
    backgroundColor: "rgba(233, 69, 96, 0.08)",
    padding: 22,
    borderRadius: 24,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cardActive: {
    borderColor: "#E94560",
    backgroundColor: "rgba(233, 69, 96, 0.08)",
  },
  cardTitle: { color: "white", fontSize: 19, fontWeight: "800" },
  cardPrice: { color: "#E94560", marginTop: 4, fontWeight: "700", fontSize: 22 },
  autoRenewText: {
    color: "#aaa",
    fontSize: 12,
    marginTop: 6,
    lineHeight: 18,
  },
  best: {
    backgroundColor: "#E94560",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  bestText: {
    color: "white",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  warningBox: {
    width: "100%",
    padding: 18,
    borderRadius: 20,
    backgroundColor: "rgba(255, 209, 102, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 209, 102, 0.25)",
    marginBottom: 14,
  },
  warningTitle: { color: "#FFD166", fontSize: 15, fontWeight: "800", marginBottom: 6 },
  warningText: { color: "#ddd", fontSize: 13, lineHeight: 20 },
  activeBox: {
    width: "100%",
    padding: 18,
    borderRadius: 20,
    backgroundColor: "rgba(6, 214, 160, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(6, 214, 160, 0.25)",
    marginBottom: 14,
  },
  activeTitle: { color: "#06D6A0", fontSize: 15, fontWeight: "800", marginBottom: 6 },
  activeText: { color: "#ddd", fontSize: 13, lineHeight: 20 },
  button: {
    backgroundColor: "#E94560",
    width: "100%",
    padding: 20,
    borderRadius: 22,
    alignItems: "center",
    marginTop: 10,
    shadowColor: "#E94560",
    shadowOpacity: 0.4,
    shadowRadius: 15,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
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
  restoreButtonText: { color: "#E94560", fontSize: 15, fontWeight: "800" },
  linksRow: { flexDirection: "row", marginTop: 18 },
  linkText: {
    color: "#888",
    fontSize: 12,
    marginHorizontal: 10,
    textDecorationLine: "underline",
  },
});