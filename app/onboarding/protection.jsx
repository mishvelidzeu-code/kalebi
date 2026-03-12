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

export default function Protection() {
  const router = useRouter();
  const { data, setData } = useContext(OnboardingContext);

  const [selected, setSelected] = useState(data?.protection || null);

  // ანიმაციები
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 20, friction: 6, useNativeDriver: true })
    ]).start();
  }, []);

  // ვიზუალურად გამდიდრებული ვარიანტები
  const protectionOptions = [
    { id: "კონდომი", label: "კონდომი", icon: "🛡️" },
    { id: "ჰორმონალური კონტრაცეფცია", label: "ჰორმონალური აბები", icon: "💊" },
    { id: "სპირალი", label: "სპირალი (IUD)", icon: "⚕️" },
    { id: "არ ვიყენებ", label: "არ ვიყენებ / ბუნებრივი", icon: "🌿" }
  ];

  const handleNext = () => {
    if (!selected) return;

    setData({
      ...data,
      protection: selected
    });

    router.push("/onboarding/health");
  };

  return (
    <LinearGradient
      colors={["#FFFFFF", "#FFF0F5", "#FFD6E7"]}
      style={styles.container}
    >
      {/* ფონის დეკორაციები */}
      <View style={styles.bgCircleTop} />
      <View style={styles.bgCircleBottom} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          
          <View style={styles.header}>
            <View style={styles.iconBox}>
              <Text style={styles.emoji}>🛡️</Text>
            </View>
            <Text style={styles.title}>რითი იცავ თავს?</Text>
            <Text style={styles.subtitle}>
              ეს ინფორმაცია დაგვეხმარება ოვულაციისა და ნაყოფიერი დღეების უფრო ზუსტად გათვლაში.
            </Text>
          </View>

          <View style={styles.optionsContainer}>
            {protectionOptions.map((item) => {
              const isSelected = selected === item.id;
              
              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.7}
                  style={[
                    styles.card,
                    isSelected && styles.cardSelected
                  ]}
                  onPress={() => setSelected(item.id)}
                >
                  <View style={[styles.cardIconBox, isSelected && styles.cardIconBoxSelected]}>
                    <Text style={styles.cardIcon}>{item.icon}</Text>
                  </View>
                  <Text
                    style={[
                      styles.cardText,
                      isSelected && styles.cardTextSelected
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

        </Animated.View>
      </ScrollView>

      <Animated.View style={[styles.footer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <TouchableOpacity
          style={[styles.button, !selected && styles.buttonDisabled]}
          disabled={!selected}
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
  },
  scrollContent: {
    paddingHorizontal: 30,
    paddingTop: 80,
    paddingBottom: 40,
    flexGrow: 1,
  },

  // ფონის დეკორაციები
  bgCircleTop: { position: "absolute", width: width, height: width, borderRadius: width / 2, backgroundColor: "#FFEAF2", top: -width * 0.4, right: -width * 0.3, opacity: 0.7 },
  bgCircleBottom: { position: "absolute", width: width * 0.8, height: width * 0.8, borderRadius: width / 2, backgroundColor: "rgba(255, 214, 231, 0.4)", bottom: -width * 0.2, left: -width * 0.3 },

  content: {
    alignItems: "center",
    zIndex: 10,
  },

  // სათაურები
  header: {
    alignItems: "center",
    marginBottom: 35,
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
    fontSize: 28,
    fontWeight: "900",
    color: "#ff4d88",
    textAlign: "center",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    color: "#7A5C6A",
    textAlign: "center",
    lineHeight: 24,
    fontWeight: "500",
  },

  // ბარათები
  optionsContainer: {
    width: "100%",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 20,
    marginBottom: 15,
    borderWidth: 2,
    borderColor: "transparent",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  cardSelected: {
    borderColor: "#ff4d88",
    backgroundColor: "#FFF0F5",
    transform: [{ scale: 1.02 }],
    elevation: 8,
    shadowColor: "#ff4d88",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  cardIconBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#F8F8FA",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  cardIconBoxSelected: {
    backgroundColor: "#fff",
  },
  cardIcon: {
    fontSize: 22,
  },
  cardText: {
    flex: 1,
    fontSize: 15,
    color: "#444",
    fontWeight: "600",
  },
  cardTextSelected: {
    color: "#ff4d88",
    fontWeight: "800",
  },

  // ღილაკი
  footer: {
    width: "100%",
    zIndex: 10,
    paddingHorizontal: 30,
    paddingBottom: 50,
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