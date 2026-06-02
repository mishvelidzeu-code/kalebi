import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useContext, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { OnboardingContext } from "../../components/OnboardingContext";
import { setNotificationsEnabled, syncCycleRemindersForUser } from "../../services/notifications";
import { supabase } from "../../services/supabase";

export default function Register() {
  const router = useRouter();
  const { data: onboardingData } = useContext(OnboardingContext);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleRegister = async () => {
    const trimmedPhoneNumber = onboardingData.phone_number?.trim();
    let postRegistrationNotice = null;

    if (!email || !password) {
      Alert.alert("შეცდომა", "გთხოვთ შეიყვანოთ ელ-ფოსტა და პაროლი");
      return;
    }

    if (!trimmedPhoneNumber) {
      Alert.alert("შეავსე ნომერი", "ტელეფონის ნომერი სავალდებულოა.");
      return;
    }

    setLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (authError) {
        throw authError;
      }

      if (authData?.user) {
        const user = authData.user;

        const profilePayload = {
          id: user.id,
          email: user.email || email.trim(),
          name: onboardingData.name || email.split("@")[0],
          phone_number: trimmedPhoneNumber,
          birth_date: onboardingData.birth_date,
          protection: onboardingData.protection,
          health: onboardingData.health,
          cycle_length: onboardingData.cycle_length || 28,
          period_length: onboardingData.period_length || 5,
          last_period: onboardingData.last_period,
          is_premium: false,
          premium_override: false,
          onboarding_completed: true,
        };

        let { error: profileError } = await supabase.from("profiles").upsert(profilePayload);

        if (profileError && String(profileError.message || "").includes("email")) {
          const fallbackProfilePayload = { ...profilePayload };
          delete fallbackProfilePayload.email;
          const fallbackResult = await supabase.from("profiles").upsert(fallbackProfilePayload);
          profileError = fallbackResult.error;
        }

        if (profileError) {
          throw profileError;
        }

        if (onboardingData.last_period) {
          const { error: cycleError } = await supabase.from("cycles").insert([
            {
              user_id: user.id,
              start_date: onboardingData.last_period.split("T")[0],
              period_length: onboardingData.period_length || 5,
              cycle_length: onboardingData.cycle_length || 28,
            },
          ]);

          if (cycleError) {
            console.error("Initial cycle insert failed during registration:", cycleError);
            postRegistrationNotice =
              "ანგარიში შეიქმნა, მაგრამ საწყისი ციკლის ჩანაწერი სრულად ვერ შეინახა. აპი მაინც იმუშავებს პროფილის მონაცემებით.";
          }
        }

        if (onboardingData.notifications_enabled) {
          await setNotificationsEnabled(true);
          await syncCycleRemindersForUser();
        } else {
          await setNotificationsEnabled(false);
        }

        if (postRegistrationNotice) {
          Alert.alert("რეგისტრაცია დასრულდა", postRegistrationNotice, [
            { text: "გაგრძელება", onPress: () => router.replace("/(tabs)") },
          ]);
          return;
        }

        router.replace("/(tabs)");
      }
    } catch (error) {
      Alert.alert("რეგისტრაცია ვერ მოხერხდა", error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={["#FFFFFF", "#FFF0F5", "#FFD6E7"]} style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.keyboardView}>
        <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.header}>
            <View style={styles.iconBox}>
              <Text style={styles.emoji}>✨</Text>
            </View>
            <Text style={styles.title}>დასასრული და დასაწყისი</Text>
            <Text style={styles.subtitle}>შექმენი ანგარიში, რომ შენი მონაცემები ყოველთვის დაცული და შენახული იყოს.</Text>
          </View>

          <View style={styles.form}>
            <TextInput
              placeholder="ელ-ფოსტა"
              value={email}
              onChangeText={setEmail}
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholderTextColor="#aaa"
            />

            <TextInput placeholder="პაროლი" secureTextEntry value={password} onChangeText={setPassword} style={styles.input} placeholderTextColor="#aaa" />

            <TouchableOpacity style={[styles.button, loading && { opacity: 0.7 }]} onPress={handleRegister} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>რეგისტრაციის დასრულება 🚀</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push("/auth/login")} style={styles.link}>
              <Text style={styles.linkText}>
                უკვე გაქვს ანგარიში? <Text style={styles.linkHighlight}>შესვლა</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardView: { flex: 1, paddingHorizontal: 30, justifyContent: "center" },
  content: { alignItems: "center" },
  header: { alignItems: "center", marginBottom: 40 },
  iconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    elevation: 8,
    shadowColor: "#ff4d88",
    shadowOpacity: 0.2,
    shadowRadius: 15,
  },
  emoji: { fontSize: 36 },
  title: { fontSize: 28, fontWeight: "900", color: "#ff4d88", textAlign: "center", marginBottom: 10 },
  subtitle: { fontSize: 15, color: "#7A5C6A", textAlign: "center", lineHeight: 22 },
  form: { width: "100%" },
  input: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 22,
    marginBottom: 15,
    fontSize: 16,
    fontWeight: "600",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  button: {
    backgroundColor: "#ff4d88",
    padding: 20,
    borderRadius: 22,
    alignItems: "center",
    marginTop: 10,
    elevation: 8,
    shadowColor: "#ff4d88",
    shadowOpacity: 0.4,
    shadowRadius: 15,
  },
  buttonText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  link: { marginTop: 25, alignItems: "center" },
  linkText: { color: "#7A5C6A", fontSize: 15, fontWeight: "600" },
  linkHighlight: { color: "#ff4d88", fontWeight: "800" },
});
