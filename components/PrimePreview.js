import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useTheme } from "../context/ThemeContext";

export default function PrimePreview({
  children,
  style,
  minHeight = 120,
  message = "სრული შინაარსის სანახავად გახსენი Prime",
  buttonLabel = "Prime",
  concealCompletely = false,
}) {
  const router = useRouter();
  const { isDark, isPremium } = useTheme();

  if (isPremium) {
    return (
      <View style={[styles.wrapper, { minHeight }, style]}>
        {children}
      </View>
    );
  }

  return (
    <View style={[styles.wrapper, { minHeight }, style]}>
      <View style={concealCompletely ? styles.hiddenContent : undefined}>
        {children}
      </View>

      {Platform.OS === "android" ? (
        <View
          style={[
            styles.overlay,
            concealCompletely && styles.overlayFull,
            { backgroundColor: isDark ? "rgba(12, 12, 16, 0.94)" : "rgba(255, 255, 255, 0.96)" },
          ]}
        >
          <LinearGradient
            colors={
              isDark
                ? ["rgba(32, 15, 25, 0.86)", "rgba(12, 12, 16, 0.96)"]
                : ["rgba(255, 245, 248, 0.92)", "rgba(255, 255, 255, 0.98)"]
            }
            style={styles.overlayShade}
          />

          <View style={styles.overlayContent}>
            <View style={styles.primePill}>
              <Ionicons name="sparkles-outline" size={13} color="#E94560" />
              <Text style={styles.primePillText}>PRIME ACCESS</Text>
            </View>

            <Text style={[styles.message, { color: isDark ? "#FFFFFF" : "#34212A" }]}>
              {message}
            </Text>

            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.button}
              onPress={() => router.push("/premium")}
            >
              <Text style={styles.buttonText}>{buttonLabel}</Text>
              <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <BlurView
          intensity={isDark ? 60 : 50}
          tint={isDark ? "dark" : "light"}
          style={[styles.overlay, concealCompletely && styles.overlayFull]}
        >
          <LinearGradient
            colors={
              isDark
                ? ["rgba(32, 15, 25, 0.82)", "rgba(12, 12, 16, 0.96)"]
                : ["rgba(255, 245, 248, 0.90)", "rgba(255, 255, 255, 0.98)"]
            }
            style={styles.overlayShade}
          />

          <View style={styles.overlayContent}>
            <View style={styles.primePill}>
              <Ionicons name="sparkles-outline" size={13} color="#E94560" />
              <Text style={styles.primePillText}>PRIME ACCESS</Text>
            </View>

            <Text style={[styles.message, { color: isDark ? "#FFFFFF" : "#34212A" }]}>
              {message}
            </Text>

            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.button}
              onPress={() => router.push("/premium")}
            >
              <Text style={styles.buttonText}>{buttonLabel}</Text>
              <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </BlurView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 18,
    justifyContent: "flex-start",
  },
  hiddenContent: {
    opacity: 0,
  },
  overlay: {
    position: "absolute",
    top: "32%",
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    borderRadius: 18,
    overflow: "hidden",
  },
  overlayFull: {
    top: 0,
  },
  overlayShade: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 11,
  },
  primePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(233, 69, 96, 0.12)",
    borderColor: "rgba(233, 69, 96, 0.26)",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  primePillText: {
    color: "#E94560",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  message: {
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
    textAlign: "center",
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#E94560",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
});
