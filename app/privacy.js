import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Linking, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../context/ThemeContext";

export default function PrivacyScreen() {
  const router = useRouter();
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
        <Text style={[styles.headerTitle, { color: theme.text }]}>კონფიდენციალურობა</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: theme.card }]}>

          <Text style={[styles.title, { color: theme.primary }]}>მონაცემთა დაცვა</Text>
          <Text style={[styles.body, { color: theme.text }]}>
            ჩვენთვის თქვენი პირადი ინფორმაციის უსაფრთხოება პრიორიტეტია. თქვენი ჯანმრთელობის მონაცემები ინახება დაცულად და არ გადაეცემა მესამე პირებს.
          </Text>

          <Text style={[styles.title, { color: theme.primary }]}>რა ინფორმაციას ვაგროვებთ?</Text>
          <Text style={[styles.body, { color: theme.text }]}>
            აპლიკაცია ინახავს მხოლოდ იმ მონაცემებს, რომლებსაც თქვენ თავად უთითებთ: ციკლის თარიღები, სიმპტომები, განწყობა და პირადი მიზნები.
            ასევე შეიძლება შევინახოთ თქვენი ელფოსტა ავტორიზაციისთვის.
          </Text>

          <Text style={[styles.title, { color: theme.primary }]}>როგორ ვიყენებთ ინფორმაციას</Text>
          <Text style={[styles.body, { color: theme.text }]}>
            მონაცემები გამოიყენება მხოლოდ აპის ფუნქციონირებისთვის: ციკლის პროგნოზი, ოვულაციის გამოთვლა,
            ნაყოფიერი დღეების განსაზღვრა და შეტყობინებების გაგზავნა.
          </Text>

          <Text style={[styles.title, { color: theme.primary }]}>შეტყობინებები</Text>
          <Text style={[styles.body, { color: theme.text }]}>
            აპი შეიძლება გამოგიგზავნოთ შეტყობინებები ციკლის პროგნოზთან დაკავშირებით
            (პერიოდი, ოვულაცია, ნაყოფიერი დღეები). სურვილის შემთხვევაში შეგიძლიათ გამორთოთ
            შეტყობინებები ტელეფონის პარამეტრებიდან.
          </Text>

          <Text style={[styles.title, { color: theme.primary }]}>მესამე მხარის სერვისები</Text>
          <Text style={[styles.body, { color: theme.text }]}>
            აპი იყენებს უსაფრთხო სერვისებს როგორიცაა Supabase (მონაცემების შენახვა),
            RevenueCat (გამოწერები) და Expo სერვისები აპის ფუნქციონირებისთვის.
          </Text>

          <Text style={[styles.title, { color: theme.primary }]}>მონაცემების მართვა</Text>
          <Text style={[styles.body, { color: theme.text }]}>
            თქვენ ნებისმიერ დროს შეგიძლიათ წაშალოთ თქვენი მონაცემები ან შეწყვიტოთ
            აპის გამოყენება. ჩვენ არ ვიყენებთ თქვენს ინფორმაციას სარეკლამო მიზნებისთვის.
          </Text>

          <Text style={[styles.title, { color: theme.primary }]}>კონტაქტი</Text>
          <Text style={[styles.body, { color: theme.text }]}>
            თუ გაქვთ კითხვები კონფიდენციალურობის პოლიტიკასთან დაკავშირებით,
            დაგვიკავშირდით: mishvelidze.u@gmail.com
          </Text>

          {/* დამატებული Privacy Policy ლინკი */}
          <Text
            style={[styles.link, { color: theme.primary }]}
            onPress={() => Linking.openURL("https://sites.google.com/view/cycle-care-privacy")}
          >
            სრული კონფიდენციალურობის პოლიტიკა
          </Text>

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