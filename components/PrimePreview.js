import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";

// Locks its children behind a Prime overlay for free users.
// highlights (optional): what Prime unlocks, shown as chips —
//   [{ key, icon, label, featured?, badge? }]; a featured chip is drawn in the
//   weight-mode violet with an optional badge (e.g. "new").
export default function PrimePreview({
  children,
  style,
  minHeight = 120,
  message,
  buttonLabel = "Prime",
  concealCompletely = false,
  highlights = null,
}) {
  const router = useRouter();
  const { t } = useLanguage();
  const resolvedMessage = message ?? t("primePreview.defaultMessage");
  const { isDark, isPremium } = useTheme();

  if (isPremium) {
    return (
      <View style={[styles.wrapper, { minHeight }, style]}>
        {children}
      </View>
    );
  }

  const shadeColors = isDark
    ? ["rgba(40, 18, 32, 0.84)", "rgba(14, 12, 20, 0.97)"]
    : ["rgba(255, 243, 247, 0.92)", "rgba(250, 247, 255, 0.98)"];

  const overlayContent = (
    <>
      <LinearGradient colors={shadeColors} style={styles.overlayShade} />
      <View style={styles.overlayGlowPink} />
      <View style={styles.overlayGlowViolet} />

      <View style={styles.overlayContent}>
        <LinearGradient
          colors={["#FF8FB1", "#E94560"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.primePill}
        >
          <Ionicons name="sparkles" size={12} color="#FFFFFF" />
          <Text style={styles.primePillText}>PRIME</Text>
        </LinearGradient>

        <Text style={[styles.message, { color: isDark ? "#FFFFFF" : "#34212A" }]}>
          {resolvedMessage}
        </Text>

        {highlights?.length ? (
          <View style={styles.highlights}>
            {highlights.map((item) => (
              <View
                key={item.key}
                style={[
                  styles.chip,
                  item.featured
                    ? { backgroundColor: isDark ? "rgba(123,97,255,0.24)" : "rgba(123,97,255,0.12)", borderColor: "rgba(123,97,255,0.45)" }
                    : { backgroundColor: isDark ? "rgba(233,69,96,0.14)" : "rgba(233,69,96,0.07)", borderColor: "rgba(233,69,96,0.22)" },
                ]}
              >
                <Ionicons name={item.icon} size={13} color={item.featured ? "#7B61FF" : "#E94560"} />
                <Text style={[styles.chipText, { color: item.featured ? (isDark ? "#C4B5FD" : "#5B45D6") : (isDark ? "#FFC2D1" : "#B8304D") }]}>
                  {item.label}
                </Text>
                {item.badge ? (
                  <View style={styles.chipBadge}>
                    <Text style={styles.chipBadgeText}>{item.badge}</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        <TouchableOpacity activeOpacity={0.85} onPress={() => router.push("/premium")}>
          <LinearGradient
            colors={["#FF6B9A", "#E94560"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.button}
          >
            <Text style={styles.buttonText}>{buttonLabel}</Text>
            <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </>
  );

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
          {overlayContent}
        </View>
      ) : (
        <BlurView
          intensity={isDark ? 60 : 50}
          tint={isDark ? "dark" : "light"}
          style={[styles.overlay, concealCompletely && styles.overlayFull]}
        >
          {overlayContent}
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
  overlayGlowPink: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    top: -60,
    right: -40,
    backgroundColor: "rgba(255,107,154,0.16)",
  },
  overlayGlowViolet: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: 75,
    bottom: -70,
    left: -50,
    backgroundColor: "rgba(123,97,255,0.12)",
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
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  primePillText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  message: {
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
    textAlign: "center",
  },
  highlights: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "800",
  },
  chipBadge: {
    backgroundColor: "#7B61FF",
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  chipBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900",
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 999,
    shadowColor: "#E94560",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
});
