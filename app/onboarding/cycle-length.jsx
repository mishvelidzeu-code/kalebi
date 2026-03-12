import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useContext, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";

import { OnboardingContext } from "../../components/OnboardingContext";

const { width } = Dimensions.get("window");

export default function CycleLength() {
  const router = useRouter();
  const { data, setData } = useContext(OnboardingContext);

  const [cycleSelected, setCycleSelected] = useState(data?.cycle_length || 28);
  const [periodSelected, setPeriodSelected] = useState(data?.period_length || 5);

  const cycleOptions = Array.from({ length: 25 }, (_, i) => i + 21); // 21-დან 45-მდე
  const periodOptions = Array.from({ length: 9 }, (_, i) => i + 2);   // 2-დან 10-მდე

  // --- ScrollView References ავტომატური სქროლისთვის ---
  const cycleScrollRef = useRef(null);
  const periodScrollRef = useRef(null);

  // --- ანიმაციები ---
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;

  // ელემენტის სიგანე (width + margin * 2) -> 70 + (6 * 2) = 82
  const ITEM_WIDTH = 82; 

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 20, friction: 6, useNativeDriver: true })
    ]).start();

    // ვასქროლებთ შერჩეულ ელემენტებზე ეკრანის ჩატვირთვისას
    setTimeout(() => {
      // ციკლის ავტო-სქროლი
      if (cycleScrollRef.current) {
        const index = cycleOptions.indexOf(cycleSelected);
        if (index !== -1) {
          const xPosition = (index * ITEM_WIDTH) - (width / 2) + (ITEM_WIDTH / 2) + 25; // 25 არის scrollPadding
          cycleScrollRef.current.scrollTo({ x: xPosition, animated: true });
        }
      }

      // პერიოდის ავტო-სქროლი
      if (periodScrollRef.current) {
        const index = periodOptions.indexOf(periodSelected);
        if (index !== -1) {
          const xPosition = (index * ITEM_WIDTH) - (width / 2) + (ITEM_WIDTH / 2) + 25;
          periodScrollRef.current.scrollTo({ x: xPosition, animated: true });
        }
      }
    }, 100); // 100ms დაყოვნება აუცილებელია, რომ UI მოასწროს ჩატვირთვა სანამ დასქროლავს

  }, []); // ცარიელი მასივი = მხოლოდ ერთხელ გაშვება

  const handleNext = () => {
    if (!cycleSelected || !periodSelected) return;

    setData({
      ...data,
      cycle_length: cycleSelected,
      period_length: periodSelected
    });

    router.push("/onboarding/last-period");
  };

  return (
    <LinearGradient
      colors={["#FFFFFF", "#FFF0F5", "#FFD6E7"]}
      style={styles.container}
    >
      {/* --- ფონის დეკორაციები --- */}
      <View style={styles.bgCircleTop} />
      <View style={styles.bgCircleBottom} />

      <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        
        <View style={styles.header}>
          <View style={styles.iconBox}>
            <Text style={styles.emoji}>🔄</Text>
          </View>
          <Text style={styles.title}>შენი ციკლი</Text>
          <Text style={styles.subtitle}>
            მონიშნე საშუალო ხანგრძლივობა, რომ შევძლოთ ზუსტი პროგნოზის გაკეთება.
          </Text>
        </View>

        {/* --- ციკლის ამომრჩეველი --- */}
        <View style={styles.selectorSection}>
          <Text style={styles.sectionTitle}>ციკლის ხანგრძლივობა (დღე)</Text>
          <ScrollView 
            ref={cycleScrollRef}
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollPadding}
          >
            {cycleOptions.map((day) => {
              const isSelected = cycleSelected === day;
              return (
                <TouchableOpacity
                  key={`cycle-${day}`}
                  activeOpacity={0.7}
                  style={[styles.numberCard, isSelected && styles.numberCardSelected]}
                  onPress={() => setCycleSelected(day)}
                >
                  <Text style={[styles.numberText, isSelected && styles.numberTextSelected]}>
                    {day}
                  </Text>
                  {isSelected && <Text style={styles.dayLabel}>დღე</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* --- პერიოდის ამომრჩეველი --- */}
        <View style={styles.selectorSection}>
          <Text style={styles.sectionTitle}>პერიოდის ხანგრძლივობა (დღე)</Text>
          <ScrollView 
            ref={periodScrollRef}
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollPadding}
          >
            {periodOptions.map((day) => {
              const isSelected = periodSelected === day;
              return (
                <TouchableOpacity
                  key={`period-${day}`}
                  activeOpacity={0.7}
                  style={[styles.numberCard, isSelected && styles.numberCardSelected]}
                  onPress={() => setPeriodSelected(day)}
                >
                  <Text style={[styles.numberText, isSelected && styles.numberTextSelected]}>
                    {day}
                  </Text>
                  {isSelected && <Text style={styles.dayLabel}>დღე</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

      </Animated.View>

      <Animated.View style={[styles.footer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <TouchableOpacity
          style={[styles.button, (!cycleSelected || !periodSelected) && styles.buttonDisabled]}
          disabled={!cycleSelected || !periodSelected}
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
    justifyContent: "space-between",
    paddingTop: 80,
    paddingBottom: 50,
  },

  // --- ფონის დეკორაციები ---
  bgCircleTop: { position: "absolute", width: width, height: width, borderRadius: width / 2, backgroundColor: "#FFEAF2", top: -width * 0.4, right: -width * 0.3, opacity: 0.7 },
  bgCircleBottom: { position: "absolute", width: width * 0.8, height: width * 0.8, borderRadius: width / 2, backgroundColor: "rgba(255, 214, 231, 0.4)", bottom: -width * 0.2, left: -width * 0.3 },

  content: {
    flex: 1,
    zIndex: 10,
  },

  header: {
    alignItems: "center",
    marginBottom: 40,
    paddingHorizontal: 30,
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
  },

  // --- სელექტორების სექცია ---
  selectorSection: {
    marginBottom: 35,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#555",
    marginBottom: 15,
    paddingHorizontal: 30,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  scrollPadding: {
    paddingHorizontal: 25, // რომ კიდეებზე არ მიეწებოს
    paddingBottom: 20, // ჩრდილები რომ არ მოიჭრას
  },
  
  // --- ციფრების ბარათები ---
  numberCard: {
    width: 70,
    height: 85,
    backgroundColor: "#fff",
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 6,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    borderWidth: 2,
    borderColor: "transparent",
  },
  numberCardSelected: {
    backgroundColor: "#ff4d88",
    borderColor: "#ff4d88",
    transform: [{ scale: 1.05 }], // ოდნავ იზრდება მონიშვნისას
    elevation: 8,
    shadowColor: "#ff4d88",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  numberText: {
    fontSize: 26,
    fontWeight: "700",
    color: "#444",
  },
  numberTextSelected: {
    color: "#fff",
    fontSize: 28,
  },
  dayLabel: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.9)",
    fontWeight: "600",
    marginTop: 2,
  },

  // --- ღილაკი ---
  footer: {
    width: "100%",
    zIndex: 10,
    paddingHorizontal: 30,
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
  buttonDisabled: {
    backgroundColor: "#ffb3c6",
    elevation: 0,
    shadowOpacity: 0,
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});