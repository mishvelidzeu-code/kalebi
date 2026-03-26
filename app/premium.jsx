import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Linking, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function PremiumScreen() {
  const router = useRouter();

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

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <LinearGradient colors={["#2D0B16", "#121212", "#000000"]} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={{ flex: 1 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 20 }}>
          <Ionicons name="close" size={28} color="rgba(255,255,255,0.4)" />
        </TouchableOpacity>

        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          <View style={styles.crownContainer}>
            <LinearGradient colors={["#E94560", "#A02A3C"]} style={styles.crownGradient}>
              <Text style={styles.crownIcon}>👑</Text>
            </LinearGradient>
          </View>

          <Text style={styles.title}>
            ყველა ფუნქცია <Text style={{ color: "#E94560" }}>უკვე ღიაა</Text>
          </Text>

          <Text style={styles.subtitle}>
            ამ ვერსიაში ყველა მომხმარებელი იღებს აპის სრულ შესაძლებლობებს დამატებითი გადახდის გარეშე.
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
              <Text style={styles.cardTitle}>სრული წვდომა</Text>
              <Text style={styles.cardPrice}>აქტიურია ყველა მომხმარებლისთვის</Text>
              <Text style={styles.autoRenewText}>
                გამოწერა დროებით გამორთულია. მომავალში დამატება შესაძლებელი იქნება ახალ აფდეითში.
              </Text>
            </View>
            <View style={styles.best}>
              <Text style={styles.bestText}>ღიაა</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.button} onPress={() => router.replace("/(tabs)")}>
            <Text style={styles.buttonText}>განაგრძე აპში</Text>
          </TouchableOpacity>

          <View style={styles.linksRow}>
            <TouchableOpacity onPress={() => Linking.openURL("https://sites.google.com/view/cycle-care-privacy/მთავარი")}>
              <Text style={styles.linkText}>Privacy Policy</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => Linking.openURL("https://sites.google.com/view/cycle-care-terms")}>
              <Text style={styles.linkText}>Terms of Use</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.footer}>ამ გვერდს ვტოვებთ მხოლოდ სერვისული ინფორმაციისთვის.</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", paddingHorizontal: 25, paddingBottom: 40 },
  crownContainer: { marginBottom: 20, elevation: 20, shadowColor: "#E94560", shadowOpacity: 0.5, shadowRadius: 15 },
  crownGradient: { width: 80, height: 80, borderRadius: 40, justifyContent: "center", alignItems: "center" },
  crownIcon: { fontSize: 40 },
  title: { fontSize: 34, fontWeight: "900", color: "white", textAlign: "center", letterSpacing: -0.5 },
  subtitle: { color: "#999", fontSize: 15, marginTop: 10, marginBottom: 35, textAlign: "center", paddingHorizontal: 15 },
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
  featureDesc: { color: "#777", fontSize: 13, marginTop: 2 },
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
    alignItems: "center",
  },
  cardActive: { borderColor: "#E94560", backgroundColor: "rgba(233, 69, 96, 0.08)" },
  cardTitle: { color: "white", fontSize: 19, fontWeight: "800" },
  cardPrice: { color: "#E94560", marginTop: 4, fontWeight: "600" },
  autoRenewText: { color: "#aaa", fontSize: 12, marginTop: 6, fontStyle: "italic" },
  best: { backgroundColor: "#E94560", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  bestText: { color: "white", fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  button: {
    backgroundColor: "#E94560",
    width: "100%",
    padding: 20,
    borderRadius: 22,
    alignItems: "center",
    marginTop: 15,
    shadowColor: "#E94560",
    shadowOpacity: 0.4,
    shadowRadius: 15,
  },
  buttonText: { color: "white", fontSize: 18, fontWeight: "800" },
  linksRow: { flexDirection: "row", marginTop: 15 },
  linkText: { color: "#888", fontSize: 12, marginHorizontal: 10, textDecorationLine: "underline" },
  footer: { marginTop: 20, color: "#444", fontSize: 12, textAlign: "center" },
});
