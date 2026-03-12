import DateTimePicker from "@react-native-community/datetimepicker";
import dayjs from "dayjs";
import "dayjs/locale/ka";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useContext, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";

import { OnboardingContext } from "../../components/OnboardingContext";

dayjs.locale("ka");
const { width } = Dimensions.get("window");

export default function Birth() {
  const router = useRouter();
  const { data, setData } = useContext(OnboardingContext);

  const [date, setDate] = useState(new Date(2000, 0, 1)); // საწყისად 2000 წელი ჯობს, უფრო მოსახერხებელია
  const [show, setShow] = useState(false);

  // --- ანიმაციები ---
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 20, friction: 6, useNativeDriver: true })
    ]).start();
  }, []);

  const onChange = (event, selectedDate) => {
    if (selectedDate) {
      setDate(selectedDate);
    }
    // Android ხურავს მოდალს არჩევისთანავე
    if (Platform.OS === "android") {
      setShow(false);
    }
  };

  const handleNext = () => {
    setData({
      ...data,
      birth_date: date.toISOString()
    });
    router.push("/onboarding/protection");
  };

  return (
    <LinearGradient
      colors={["#FFFFFF", "#FFF0F5", "#FFD6E7"]}
      style={styles.container}
    >
      {/* --- დეკორატიული ფონის ელემენტები --- */}
      <View style={styles.bgCircleTop} />
      <View style={styles.bgCircleBottom} />

      <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        
        <View style={styles.header}>
          <View style={styles.iconBox}>
            <Text style={styles.emoji}>🎂</Text>
          </View>
          <Text style={styles.title}>როდის დაიბადე?</Text>
          <Text style={styles.subtitle}>
            ეს დაგვეხმარება, რომ შენი ციკლის პროგნოზი კიდევ უფრო ზუსტი და პერსონალური გავხადოთ.
          </Text>
        </View>

        {/* --- თარიღის არჩევის ბარათი --- */}
        <TouchableOpacity
          activeOpacity={0.8}
          style={styles.dateCard}
          onPress={() => setShow(true)}
        >
          <Text style={styles.dateLabel}>დაბადების თარიღი</Text>
          <Text style={styles.dateText}>
            {dayjs(date).format("D MMMM, YYYY")}
          </Text>
        </TouchableOpacity>

        {/* --- DatePicker --- */}
        {show && (
          <View style={styles.pickerContainer}>
            <DateTimePicker
              value={date}
              mode="date"
              display="spinner"
              onChange={onChange}
              maximumDate={new Date()}
              textColor="#ff4d88"
            />
            {Platform.OS === "ios" && (
              <TouchableOpacity style={styles.confirmBtn} onPress={() => setShow(false)}>
                <Text style={styles.confirmBtnText}>დადასტურება</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

      </Animated.View>

      <Animated.View style={[styles.footer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <TouchableOpacity
          style={styles.button}
          onPress={handleNext}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>შემდეგი ნაბიჯი ✨</Text>
        </TouchableOpacity>
      </Animated.View>

    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 30,
    justifyContent: "space-between",
    paddingTop: 80,
    paddingBottom: 50,
  },

  // --- ფონის დეკორაციები ---
  bgCircleTop: { position: "absolute", width: width, height: width, borderRadius: width / 2, backgroundColor: "#FFEAF2", top: -width * 0.4, right: -width * 0.3, opacity: 0.7 },
  bgCircleBottom: { position: "absolute", width: width * 0.8, height: width * 0.8, borderRadius: width / 2, backgroundColor: "rgba(255, 214, 231, 0.4)", bottom: -width * 0.2, left: -width * 0.3 },

  content: {
    flex: 1,
    alignItems: "center",
    zIndex: 10,
  },

  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  iconBox: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 25,
    elevation: 10,
    shadowColor: "#ff4d88",
    shadowOpacity: 0.2,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
  },
  emoji: { fontSize: 42 },
  title: {
    fontSize: 32,
    fontWeight: "900",
    color: "#ff4d88",
    textAlign: "center",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: "#7A5C6A",
    textAlign: "center",
    lineHeight: 24,
    fontWeight: "500",
    paddingHorizontal: 10,
  },

  // --- თარიღის ბარათი ---
  dateCard: {
    width: "100%",
    backgroundColor: "#fff",
    paddingVertical: 22,
    paddingHorizontal: 25,
    borderRadius: 24,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FFF0F5",
    elevation: 8,
    shadowColor: "#ff4d88",
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  dateLabel: {
    fontSize: 13,
    color: "#999",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  dateText: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1A1A1A",
  },

  // --- Picker (IOS) ---
  pickerContainer: {
    marginTop: 20,
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 15,
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  confirmBtn: {
    backgroundColor: "#FFF0F5",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 10,
  },
  confirmBtnText: {
    color: "#ff4d88",
    fontSize: 16,
    fontWeight: "700",
  },

  // --- ღილაკი ---
  footer: {
    width: "100%",
    zIndex: 10,
  },
  button: {
    backgroundColor: "#ff4d88",
    paddingVertical: 20,
    borderRadius: 24,
    alignItems: "center",
    elevation: 8,
    shadowColor: "#ff4d88",
    shadowOpacity: 0.4,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});