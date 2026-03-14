import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as LocalAuthentication from "expo-local-authentication";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

import { supabase } from "../../services/supabase";

export default function Login() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 800, useNativeDriver: true })
    ]).start();

    checkBiometrics();
  }, []);

  const checkBiometrics = async () => {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setIsBiometricSupported(compatible && enrolled);
    } catch (e) {
      console.log("Biometric check error", e);
    }
  };

  const login = async () => {
    if (!email || !password) {
      Alert.alert("შეცდომა", "გთხოვთ შეიყვანოთ ელფოსტა და პაროლი");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setLoading(false);
        Alert.alert("შეცდომა", error.message);
        return;
      }

      // მონაცემების შენახვა
      await SecureStore.setItemAsync("saved_email", email.trim());
      await SecureStore.setItemAsync("saved_password", password);

      setLoading(false);
      router.replace("/(tabs)");
    } catch (e) {
      setLoading(false);
      Alert.alert("შეცდომა", "სისტემური ხარვეზი ლოგინისას");
    }
  };

  // --- განახლებული დიაგნოსტიკური ფუნქცია ---
  const handleBiometricAuth = async () => {
    try {
      // 1. ჯერ ამოვიღოთ მონაცემები
      const savedEmail = await SecureStore.getItemAsync("saved_email");
      const savedPassword = await SecureStore.getItemAsync("saved_password");

      if (!savedEmail || !savedPassword) {
        Alert.alert("ყურადღება", "ბიომეტრიის გასააქტიურებლად, ჯერ ერთხელ უნდა შეხვიდეთ პაროლით.");
        return;
      }

      // 2. შევამოწმოთ, ხომ არ არის სკანერი უკვე ჩართული (რომ არ გაიჭედოს)
      const isScanning = await LocalAuthentication.hasHardwareAsync();
      if (!isScanning) return;

      // 3. პირდაპირ გამოვიძახოთ სკანერი (ყოველგვარი წინასწარი ალერტის გარეშე)
      // ალერტმა შეიძლება დააბნიოს iOS-ის Face ID ინტერფეისი
      const authResult = await LocalAuthentication.authenticateAsync({
        promptMessage: "შესვლა Face ID-ით",
        fallbackLabel: "გამოიყენეთ პინ-კოდი", 
        disableDeviceFallback: false, // მივცეთ უფლება პინ-კოდი გამოიყენოს, თუ სახე ვერ იცნო
        cancelLabel: "გაუქმება"
      });

      if (authResult.success) {
        setLoading(true);
        const { error } = await supabase.auth.signInWithPassword({
          email: savedEmail,
          password: savedPassword,
        });

        if (error) {
          setLoading(false);
          Alert.alert("შეცდომა", "ავტორიზაცია ვერ მოხერხდა.");
        } else {
          setLoading(false);
          router.replace("/(tabs)");
        }
      }
    } catch (error) {
      console.log("Biometric error:", error);
      // თუ გაიჭედა, მომხმარებელს მაინც მივცეთ საშუალება ხელით შევიდეს
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={["#FFFFFF", "#FFF0F5", "#FFD6E7"]} style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }], width: '100%' }]}>
          
          <View style={styles.header}>
            <View style={styles.iconBox}>
              <Text style={styles.emoji}>🔐</Text>
            </View>
            <Text style={styles.title}>შესვლა</Text>
            <Text style={styles.subtitle}>შეიყვანე შენი ელ-ფოსტა და პაროლი რომ შეხვიდე ანგარიშში.</Text>
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

            <TextInput
              placeholder="პაროლი"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              style={styles.input}
              placeholderTextColor="#aaa"
            />

            <TouchableOpacity
              style={[styles.button, loading && { opacity: 0.7 }]}
              onPress={login}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>შესვლა</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push("/auth/register")} style={styles.link}>
              <Text style={styles.linkText}>არ გაქვს ანგარიში? <Text style={styles.linkHighlight}>რეგისტრაცია</Text></Text>
            </TouchableOpacity>

            {isBiometricSupported && (
              <View style={styles.biometricContainer}>
                <Text style={styles.biometricText}>ან სწრაფად შესვლა</Text>
                <TouchableOpacity
                  style={styles.biometricButtonBottom}
                  onPress={handleBiometricAuth}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="face-recognition" size={35} color="#ff4d88" />
                </TouchableOpacity>
              </View>
            )}
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
    width: 80, height: 80, borderRadius: 40, backgroundColor: "#fff",
    justifyContent: "center", alignItems: "center", marginBottom: 20,
    elevation: 8, shadowColor: "#ff4d88", shadowOpacity: 0.2, shadowRadius: 15,
  },
  emoji: { fontSize: 36 },
  title: { fontSize: 28, fontWeight: "900", color: "#ff4d88", textAlign: "center", marginBottom: 10 },
  subtitle: { fontSize: 15, color: "#7A5C6A", textAlign: "center", lineHeight: 22 },
  form: { width: "100%", zIndex: 10 },
  input: {
    backgroundColor: "#fff", padding: 20, borderRadius: 22, marginBottom: 15,
    fontSize: 16, fontWeight: "600", elevation: 4, shadowColor: "#000",
    shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }
  },
  button: {
    backgroundColor: "#ff4d88", padding: 20, borderRadius: 22,
    alignItems: "center", elevation: 8, shadowColor: "#ff4d88", shadowOpacity: 0.4, shadowRadius: 15, width: "100%", marginTop: 10,
  },
  buttonText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  link: { marginTop: 25, marginBottom: 10, alignItems: "center" },
  linkText: { color: "#7A5C6A", fontSize: 15, fontWeight: "600" },
  linkHighlight: { color: "#ff4d88", fontWeight: "800" },
  biometricContainer: { 
    marginTop: 20, 
    alignItems: "center",
    paddingBottom: 20,
    zIndex: 100
  },
  biometricText: { 
    color: "#7A5C6A", 
    fontSize: 14, 
    marginBottom: 15, 
    fontWeight: "600" 
  },
  biometricButtonBottom: {
    backgroundColor: "#fff", 
    width: 80, 
    height: 80, 
    borderRadius: 25,
    justifyContent: "center", 
    alignItems: "center", 
    elevation: 10,
    shadowColor: "#ff4d88", 
    shadowOpacity: 0.3, 
    shadowRadius: 15, 
    borderWidth: 2, 
    borderColor: "#FFF0F5",
    zIndex: 1000,
  }
});