import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useContext, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

import { OnboardingContext } from "../../components/OnboardingContext";

const { width } = Dimensions.get("window");

export default function Name() {
  const router = useRouter();
  const { data, setData } = useContext(OnboardingContext);

  const [name, setName] = useState(data?.name || "");
  const [isFocused, setIsFocused] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // --- ანიმაციები ---
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 20, friction: 6, useNativeDriver: true })
    ]).start();

    // კლავიატურის კონტროლი
    const keyboardWillShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true)
    );
    const keyboardWillHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false)
    );

    return () => {
      keyboardWillShowListener.remove();
      keyboardWillHideListener.remove();
    };
  }, []);

  const handleNext = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setData({
      ...data,
      name: trimmedName
    });

    Keyboard.dismiss();
    router.push("/onboarding/birth");
  };

  return (
    <LinearGradient
      colors={["#FFFFFF", "#FFF0F5", "#FFD6E7"]}
      style={styles.container}
    >
      {/* --- ფონის დეკორაციები --- */}
      <View style={styles.bgCircleTop} />
      <View style={styles.bgCircleBottom} />

      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            
            <View style={styles.header}>
              <View style={styles.iconBox}>
                <Text style={styles.emoji}>👋</Text>
              </View>
              <Text style={styles.title}>რა გქვია?</Text>
              <Text style={styles.subtitle}>
                გვითხარი შენი სახელი, რომ აპლიკაციამ უკეთ და უფრო პერსონალურად მოგმართოს.
              </Text>
            </View>

            <View style={styles.inputContainer}>
              <TextInput
                style={[
                  styles.input,
                  isFocused && styles.inputFocused 
                ]}
                placeholder="შეიყვანე სახელი..."
                placeholderTextColor="#aaa"
                value={name}
                onChangeText={setName}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                autoCorrect={false}
                maxLength={30}
              />
            </View>

          </Animated.View>

          {/* დინამიური სტილი: როცა კლავიატურა ამოდის padding იცვლება */}
          <Animated.View 
            style={[
              styles.footer, 
              keyboardVisible ? styles.footerOpen : styles.footerClosed,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
            ]}
          >
            
            <TouchableOpacity
              style={[
                styles.button,
                name.trim().length === 0 && styles.buttonDisabled
              ]}
              disabled={name.trim().length === 0}
              onPress={handleNext}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>შემდეგი ნაბიჯი ✨</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.loginLink}
              onPress={() => {
                Keyboard.dismiss();
                router.push("/auth/login");
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.loginLinkText}>
                უკვე გაქვს ანგარიში? <Text style={styles.loginLinkHighlight}>შესვლა</Text>
              </Text>
            </TouchableOpacity>

          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 30,
    paddingTop: 80,
  },

  // --- ფონის დეკორაციები ---
  bgCircleTop: { position: "absolute", width: width, height: width, borderRadius: width / 2, backgroundColor: "#FFEAF2", top: -width * 0.4, right: -width * 0.3, opacity: 0.7 },
  bgCircleBottom: { position: "absolute", width: width * 0.8, height: width * 0.8, borderRadius: width / 2, backgroundColor: "rgba(255, 214, 231, 0.4)", bottom: -width * 0.2, left: -width * 0.3 },

  content: {
    flex: 1, // ეს აწვება footer-ს ქვემოთ
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

  inputContainer: {
    width: "100%",
  },
  input: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 24,
    paddingVertical: 20,
    paddingHorizontal: 25,
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    borderWidth: 2,
    borderColor: "transparent",
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
  },
  inputFocused: {
    borderColor: "#ff4d88",
    backgroundColor: "#FFF0F5", 
    shadowColor: "#ff4d88",
    shadowOpacity: 0.2,
  },

  footer: {
    width: "100%",
    zIndex: 10,
  },
  
  // როცა კლავიატურა ჩაკეცილია
  footerClosed: {
    paddingBottom: 80, 
  },
  
  // როცა კლავიატურა ამოწეულია
  footerOpen: {
    paddingTop: 20,
    paddingBottom: 20,
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
  loginLink: {
    marginTop: 20,
    alignItems: 'center',
    paddingVertical: 10, 
  },
  loginLinkText: {
    color: '#7A5C6A',
    fontSize: 15,
    fontWeight: '600',
  },
  loginLinkHighlight: {
    color: '#ff4d88',
    fontWeight: '800',
  },
});