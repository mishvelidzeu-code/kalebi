import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

import { useTheme } from "../context/ThemeContext"; // გლობალური თემის შემოტანა
import { supabase } from "../services/supabase";

export default function PremiumScreen() {
  const router = useRouter();
  const { refreshTheme } = useTheme(); // მოგვაქვს ჩვენი განახლების ფუნქცია 🚀
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("year");

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
  ];

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert("შეცდომა", "გთხოვ გაიარო ავტორიზაცია");
        return;
      }

      const days = selectedPlan === "year" ? 365 : 30;

      const { error } = await supabase
        .from("profiles")
        .update({
          is_premium: true,
          premium_until: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq("id", user.id);

      if (error) throw error;

      // ვაიძულებთ მთელ აპლიკაციას წამიერად გაიგოს, რომ მომხმარებელი პრაიმი გახდა!
      await refreshTheme();

      Alert.alert(
        "გილოცავ ✦",
        "პრაიმ სტატუსი გააქტიურდა. ისიამოვნე სრული წვდომით!",
        [{ text: "მშვენიერია", onPress: () => router.replace("/(tabs)") }]
      );
    } catch (err) {
      Alert.alert("შეცდომა", "აქტივაცია ვერ მოხერხდა");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      {/* ახალი გრადიენტი: მუქი შინდისფერიდან შავში */}
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

          <TouchableOpacity
            style={[styles.card, selectedPlan === "year" && styles.cardActive]}
            onPress={() => setSelectedPlan("year")}
          >
            <View>
              <Text style={styles.cardTitle}>12 თვე</Text>
              <Text style={styles.cardPrice}>4.16 ₾ / თვეში</Text>
            </View>
            <View style={styles.best}>
              <Text style={styles.bestText}>საუკეთესო</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.card, selectedPlan === "month" && styles.cardActive]}
            onPress={() => setSelectedPlan("month")}
          >
            <View>
              <Text style={styles.cardTitle}>1 თვე</Text>
              <Text style={styles.cardPrice}>7.99 ₾</Text>
            </View>
          </TouchableOpacity>

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

          <Text style={styles.footer}>
            გაუქმება შესაძლებელია ნებისმიერ დროს
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
  card: { width: "100%", backgroundColor: "rgba(255, 255, 255, 0.03)", padding: 22, borderRadius: 24, marginBottom: 15, borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.08)", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardActive: { borderColor: "#E94560", backgroundColor: "rgba(233, 69, 96, 0.08)" },
  cardTitle: { color: "white", fontSize: 19, fontWeight: "800" },
  cardPrice: { color: "#E94560", marginTop: 4, fontWeight: '600' },
  best: { backgroundColor: "#E94560", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  bestText: { color: "white", fontSize: 11, fontWeight: "900", textTransform: 'uppercase' },
  button: { backgroundColor: "#E94560", width: "100%", padding: 20, borderRadius: 22, alignItems: "center", marginTop: 15, shadowColor: "#E94560", shadowOpacity: 0.4, shadowRadius: 15 },
  buttonText: { color: "white", fontSize: 18, fontWeight: "800" },
  footer: { marginTop: 20, color: "#444", fontSize: 12 },
});