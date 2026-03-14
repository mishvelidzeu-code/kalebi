import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
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
  View
} from "react-native";
import Purchases from "react-native-purchases";

import { useTheme } from "../context/ThemeContext";
import { supabase } from "../services/supabase";

export default function PremiumScreen() {
  const router = useRouter();
  const { refreshTheme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [currentPackage, setCurrentPackage] = useState(null);

  const features = [
    {
      icon: "calendar-outline",
      title: "სრული კალენდარი",
      desc: "ციკლის ისტორიის მართვა და რედაქტირება შეზღუდვების გარეშე",
    },
    {
      icon: "analytics-outline",
      title: "ღრმა ანალიტიკა",
      desc: "ციკლის დინამიკის გრაფიკები და სიმპტომების სიხშირის ანალიზი",
    },
    {
      icon: "sparkles-outline",
      title: "ჭკვიანი პროგნოზი",
      desc: "ოვულაციისა და ნაყოფიერი დღეების პერსონალური გათვლა",
    },
    {
      icon: "heart-outline",
      title: "დეტალური დღიური",
      desc: "ყოველდღიური განწყობისა და სიმპტომების სრული ისტორია",
    },
    {
      icon: "sync-circle-outline",
      title: "ციკლის კონტროლი",
      desc: "მართე შენი ციკლი და მიიღე დროული შეტყობინებები",
    },
  ];

  useEffect(() => {
    const setupRevenueCat = async () => {
      try {
        if (Platform.OS === "ios") {
          Purchases.configure({ apiKey: "appl_wPnULcgcdhNvUKrWvnGjVjqBeVl" });
        }

        const offerings = await Purchases.getOfferings();
        if (offerings.current !== null && offerings.current.monthly !== null) {
          setCurrentPackage(offerings.current.monthly);
        }
      } catch (e) {
        console.log("RevenueCat შეცდომა:", e);
      }
    };

    setupRevenueCat();
  }, []);

  const handleUpgrade = async () => {
    if (!currentPackage) {
      Alert.alert("შეცდომა", "ფასები ვერ ჩაიტვირთა. სცადე მოგვიანებით.");
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert("შეცდომა", "გთხოვ გაიარო ავტორიზაცია");
        setLoading(false);
        return;
      }

      const { customerInfo } = await Purchases.purchasePackage(currentPackage);

      if (
        typeof customerInfo.entitlements.active["kalebi Pro"] !== "undefined" ||
        Object.keys(customerInfo.entitlements.active).length > 0
      ) {
        const { error } = await supabase
          .from("profiles")
          .update({
            is_premium: true,
            premium_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          })
          .eq("id", user.id);

        if (error) throw error;

        await refreshTheme();

        Alert.alert(
          "გილოცავ ✦",
          "პრაიმ სტატუსი გააქტიურდა. ისიამოვნე სრული წვდომით!",
          [{ text: "მშვენიერია", onPress: () => router.replace("/(tabs)") }]
        );
      }
    } catch (err) {
      if (!err.userCancelled) {
        Alert.alert("შეცდომა", "გადახდა ან აქტივაცია ვერ მოხერხდა");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    setLoading(true);
    try {
      const customerInfo = await Purchases.restorePurchases();
      
      if (
        typeof customerInfo.entitlements.active["kalebi Pro"] !== "undefined" ||
        Object.keys(customerInfo.entitlements.active).length > 0
      ) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { error } = await supabase
            .from("profiles")
            .update({
              is_premium: true,
              premium_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            })
            .eq("id", user.id);
          
          if (error) throw error;
        }

        await refreshTheme();
        Alert.alert("წარმატება", "თქვენი პრემიუმ სტატუსი აღდგენილია!");
        router.replace("/(tabs)");
      } else {
        Alert.alert("ინფორმაცია", "აქტიური გამოწერა ვერ მოიძებნა.");
      }
    } catch (e) {
      Alert.alert("შეცდომა", "აღდგენა ვერ მოხერხდა.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <LinearGradient
        colors={["#2D0B16", "#121212", "#000000"]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={{ flex: 1 }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ padding: 20 }}
        >
          <Ionicons name="close" size={28} color="rgba(255,255,255,0.4)" />
        </TouchableOpacity>

        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          <View style={styles.crownContainer}>
            <LinearGradient
              colors={["#E94560", "#A02A3C"]}
              style={styles.crownGradient}
            >
              <Text style={styles.crownIcon}>👑</Text>
            </LinearGradient>
          </View>

          <Text style={styles.title}>
            გახდი <Text style={{ color: "#E94560" }}>პრაიმი</Text>
          </Text>

          <Text style={styles.subtitle}>
            აღმოაჩინე შენი სხეულის ენა ყოველგვარი შეზღუდვების გარეშე
          </Text>

          <View style={{ width: "100%", marginBottom: 30 }}>
            {features.map((f, i) => (
              <View key={i} style={styles.feature}>
                <View style={styles.icon}>
                  <Ionicons name={f.icon} size={22} color="#E94560" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureTitle}>{f.title}</Text>
                  <Text style={styles.featureDesc}>{f.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={[styles.card, styles.cardActive]}>
            <View>
              <Text style={styles.cardTitle}>1 თვე</Text>
              <Text style={styles.cardPrice}>
                {currentPackage ? `${currentPackage.product.priceString} / თვეში` : "ფასი იტვირთება..."}
              </Text>
              <Text style={styles.autoRenewText}>
                გამოწერა ავტომატურად განახლდება ყოველ თვეში სანამ არ გაუქმდება.
              </Text>
            </View>
            <View style={styles.best}>
              <Text style={styles.bestText}>პრემიუმი</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.button}
            onPress={handleUpgrade}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>გააქტიურება</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={handleRestore} style={styles.restoreButton}>
            <Text style={styles.restoreText}>Restore Purchases</Text>
          </TouchableOpacity>

          {/* Apple მოთხოვნილი ლინკები */}
          <View style={styles.linksRow}>
            <TouchableOpacity onPress={() => Linking.openURL("https://sites.google.com/view/cycle-care-privacy/მთავარი")}>
              <Text style={styles.linkText}>Privacy Policy</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => Linking.openURL("https://sites.google.com/view/cycle-care-terms")}>
              <Text style={styles.linkText}>Terms of Use</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.footer}>
            გამოწერის გაუქმება შესაძლებელია ნებისმიერ დროს App Store პარამეტრებიდან.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", paddingHorizontal: 25, paddingBottom: 40 },
  crownContainer: { marginBottom: 20, elevation: 20, shadowColor: "#E94560", shadowOpacity: 0.5, shadowRadius: 15 },
  crownGradient: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  crownIcon: { fontSize: 40 },
  title: { fontSize: 34, fontWeight: "900", color: "white", textAlign: "center", letterSpacing: -0.5 },
  subtitle: { color: "#999", fontSize: 15, marginTop: 10, marginBottom: 35, textAlign: "center", paddingHorizontal: 15 },
  feature: { flexDirection: "row", marginBottom: 22, alignItems: 'center' },
  icon: { width: 48, height: 48, borderRadius: 16, backgroundColor: "rgba(233,69,96,0.1)", justifyContent: "center", alignItems: "center", marginRight: 18, borderWidth: 1, borderColor: 'rgba(233,69,96,0.15)' },
  featureTitle: { color: "white", fontSize: 16, fontWeight: "700" },
  featureDesc: { color: "#777", fontSize: 13, marginTop: 2 },
  card: { width: "100%", backgroundColor: "rgba(233, 69, 96, 0.08)", padding: 22, borderRadius: 24, marginBottom: 15, borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.08)", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardActive: { borderColor: "#E94560", backgroundColor: "rgba(233, 69, 96, 0.08)" },
  cardTitle: { color: "white", fontSize: 19, fontWeight: "800" },
  cardPrice: { color: "#E94560", marginTop: 4, fontWeight: '600' },
  autoRenewText: { color: "#aaa", fontSize: 12, marginTop: 6, fontStyle: "italic" },
  best: { backgroundColor: "#E94560", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  bestText: { color: "white", fontSize: 11, fontWeight: "900", textTransform: 'uppercase' },
  button: { backgroundColor: "#E94560", width: "100%", padding: 20, borderRadius: 22, alignItems: "center", marginTop: 15, shadowColor: "#E94560", shadowOpacity: 0.4, shadowRadius: 15 },
  buttonText: { color: "white", fontSize: 18, fontWeight: "800" },
  restoreButton: { marginTop: 20, padding: 10 },
  restoreText: { color: "rgba(255,255,255,0.4)", fontSize: 13, textDecorationLine: 'underline' },
  linksRow:{ flexDirection:"row", marginTop:15 },
  linkText:{ color:"#888", fontSize:12, marginHorizontal:10, textDecorationLine:"underline" },
  footer: { marginTop: 20, color: "#444", fontSize: 12, textAlign:"center" },
});
