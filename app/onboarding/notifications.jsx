import { LinearGradient } from "expo-linear-gradient";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useContext, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Dimensions, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { OnboardingContext } from "../../components/OnboardingContext";
import { useLanguage } from "../../context/LanguageContext";

const { width } = Dimensions.get("window");

export default function NotificationsOnboarding() {
  const router = useRouter();
  const { t } = useLanguage();
  const { data, setData } = useContext(OnboardingContext);

  const [loading, setLoading] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 20, friction: 6, useNativeDriver: true }),
    ]).start();

    const loadPermissionStatus = async () => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        setPermissionGranted(status === "granted");
      } catch (error) {
        console.log("Notification permission load error:", error);
      }
    };

    loadPermissionStatus();
  }, []);

  const continueToRegister = (notificationsEnabled) => {
    setData({
      ...data,
      notifications_enabled: notificationsEnabled,
    });

    router.replace("/auth/register");
  };

  const handleEnableNotifications = async () => {
    try {
      setLoading(true);

      let { status } = await Notifications.getPermissionsAsync();
      if (status !== "granted") {
        const permissionResponse = await Notifications.requestPermissionsAsync();
        status = permissionResponse.status;
      }

      if (status !== "granted") {
        setPermissionGranted(false);
        Alert.alert(t("onboarding.notifications.disabledTitle"), t("onboarding.notifications.disabledBody"));
        continueToRegister(false);
        return;
      }

      setPermissionGranted(true);
      continueToRegister(true);
    } catch (error) {
      console.log("Notification permission request error:", error);
      Alert.alert(t("common.error"), t("onboarding.notifications.enableFailed"));
      continueToRegister(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    continueToRegister(false);
  };

  return (
    <LinearGradient colors={["#FFFFFF", "#FFF0F5", "#FFD6E7"]} style={styles.container}>
      <View style={styles.bgCircleTop} />
      <View style={styles.bgCircleBottom} />

      <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.header}>
          <View style={styles.iconBox}>
            <Text style={styles.emoji}>🔔</Text>
          </View>
          <Text style={styles.title}>{t("onboarding.notifications.title")}</Text>
          <Text style={styles.subtitle}>{t("onboarding.notifications.subtitle")}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("onboarding.notifications.cardTitle")}</Text>
          <Text style={styles.cardItem}>{t("onboarding.notifications.item1")}</Text>
          <Text style={styles.cardItem}>{t("onboarding.notifications.item2")}</Text>
          <Text style={styles.cardItem}>{t("onboarding.notifications.item3")}</Text>
          {permissionGranted && <Text style={styles.enabledText}>{t("onboarding.notifications.alreadyEnabled")}</Text>}
        </View>
      </Animated.View>

      <Animated.View style={[styles.footer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <TouchableOpacity style={styles.primaryButton} onPress={handleEnableNotifications} disabled={loading} activeOpacity={0.8}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{t("onboarding.notifications.enableButton")}</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={handleSkip} disabled={loading} activeOpacity={0.8}>
          <Text style={styles.secondaryButtonText}>{t("onboarding.notifications.skipButton")}</Text>
        </TouchableOpacity>
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 30,
    paddingTop: 80,
    paddingBottom: 50,
  },
  bgCircleTop: {
    position: "absolute",
    width: width,
    height: width,
    borderRadius: width / 2,
    backgroundColor: "#FFEAF2",
    top: -width * 0.4,
    right: -width * 0.3,
    opacity: 0.7,
  },
  bgCircleBottom: {
    position: "absolute",
    width: width * 0.8,
    height: width * 0.8,
    borderRadius: width / 2,
    backgroundColor: "rgba(255, 214, 231, 0.4)",
    bottom: -width * 0.2,
    left: -width * 0.3,
  },
  content: {
    flex: 1,
    alignItems: "center",
    zIndex: 10,
  },
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
  card: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 28,
    padding: 24,
    elevation: 8,
    shadowColor: "#ff4d88",
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1A1A1A",
    marginBottom: 14,
  },
  cardItem: {
    fontSize: 15,
    color: "#5F4954",
    lineHeight: 24,
    marginBottom: 8,
    fontWeight: "500",
  },
  enabledText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: "700",
    color: "#06d6a0",
  },
  footer: {
    width: "100%",
    zIndex: 10,
  },
  primaryButton: {
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
  primaryButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  secondaryButton: {
    paddingVertical: 18,
    borderRadius: 24,
    alignItems: "center",
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.65)",
  },
  secondaryButtonText: {
    color: "#7A5C6A",
    fontSize: 16,
    fontWeight: "700",
  },
});
