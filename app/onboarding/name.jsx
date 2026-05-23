import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useContext, useEffect, useRef, useState } from "react";
import { Alert, Animated, Dimensions, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { OnboardingContext } from "../../components/OnboardingContext";

const { width } = Dimensions.get("window");

export default function Name() {
  const router = useRouter();
  const { data, setData } = useContext(OnboardingContext);
  const scrollViewRef = useRef(null);

  const [name, setName] = useState(data?.name || "");
  const [phoneNumber, setPhoneNumber] = useState(data?.phone_number || "");
  const [isFocused, setIsFocused] = useState(false);
  const [isPhoneFocused, setIsPhoneFocused] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [inputContainerY, setInputContainerY] = useState(0);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;

  const scrollToInputs = () => {
    if (!scrollViewRef.current) {
      return;
    }

    setTimeout(() => {
      scrollViewRef.current?.scrollTo({
        y: Math.max(inputContainerY - 36, 0),
        animated: true,
      });
    }, 120);
  };

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 20, friction: 6, useNativeDriver: true }),
    ]).start();

    const keyboardWillShowListener = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => {
      setKeyboardVisible(true);

      setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          y: Math.max(inputContainerY - 36, 0),
          animated: true,
        });
      }, 120);
    });
    const keyboardWillHideListener = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setKeyboardVisible(false));

    return () => {
      keyboardWillShowListener.remove();
      keyboardWillHideListener.remove();
    };
  }, [inputContainerY]);

  const handleNext = () => {
    const trimmedName = name.trim();
    const trimmedPhoneNumber = phoneNumber.trim();

    if (!trimmedName) {
      return;
    }

    if (!trimmedPhoneNumber) {
      Alert.alert("შეავსე ნომერი", "ტელეფონის ნომერი სავალდებულოა.");
      return;
    }

    setData({
      ...data,
      name: trimmedName,
      phone_number: trimmedPhoneNumber,
    });

    Keyboard.dismiss();
    router.push("/onboarding/birth");
  };

  const isNextDisabled = name.trim().length === 0 || phoneNumber.trim().length === 0;

  return (
    <LinearGradient colors={["#FFFFFF", "#FFF0F5", "#FFD6E7"]} style={styles.container}>
      <View style={styles.bgCircleTop} />
      <View style={styles.bgCircleBottom} />

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.keyboardView}>
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={[styles.scrollContent, keyboardVisible && styles.scrollContentKeyboardOpen]}
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
              <Text style={styles.subtitle}>გვითხარი შენი სახელი და ტელეფონის ნომერი, რომ პროფილი სრულად და სწორად შევქმნათ.</Text>
            </View>

            <View
              style={styles.inputContainer}
              onLayout={(event) => {
                setInputContainerY(event.nativeEvent.layout.y);
              }}
            >
              <TextInput
                style={[styles.input, isFocused && styles.inputFocused]}
                placeholder="შეიყვანე სახელი..."
                placeholderTextColor="#aaa"
                value={name}
                onChangeText={setName}
                onFocus={() => {
                  setIsFocused(true);
                  if (keyboardVisible) {
                    scrollToInputs();
                  }
                }}
                onBlur={() => setIsFocused(false)}
                autoCorrect={false}
                maxLength={30}
                returnKeyType="next"
              />

              <Text style={styles.inputHint}>ტელეფონის ნომერი სავალდებულოა.</Text>

              <TextInput
                style={[styles.input, styles.secondaryInput, isPhoneFocused && styles.inputFocused]}
                placeholder="ტელეფონის ნომერი"
                placeholderTextColor="#aaa"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                onFocus={() => {
                  setIsPhoneFocused(true);
                  if (keyboardVisible) {
                    scrollToInputs();
                  }
                }}
                onBlur={() => setIsPhoneFocused(false)}
                keyboardType="phone-pad"
                autoCorrect={false}
                maxLength={20}
              />
            </View>
          </Animated.View>

          <Animated.View style={[styles.footer, keyboardVisible ? styles.footerOpen : styles.footerClosed, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <TouchableOpacity style={[styles.button, isNextDisabled && styles.buttonDisabled]} disabled={isNextDisabled} onPress={handleNext} activeOpacity={0.8}>
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
  scrollContentKeyboardOpen: {
    paddingBottom: 180,
  },
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
  secondaryInput: {
    marginTop: 14,
  },
  inputHint: {
    marginTop: 14,
    marginLeft: 6,
    color: "#7A5C6A",
    fontSize: 13,
    fontWeight: "600",
  },
  footer: {
    width: "100%",
    zIndex: 10,
  },
  footerClosed: {
    paddingBottom: 80,
  },
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
    alignItems: "center",
    paddingVertical: 10,
  },
  loginLinkText: {
    color: "#7A5C6A",
    fontSize: 15,
    fontWeight: "600",
  },
  loginLinkHighlight: {
    color: "#ff4d88",
    fontWeight: "800",
  },
});
