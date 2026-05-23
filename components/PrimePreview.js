import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

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

      <BlurView
        intensity={isDark ? 60 : 50}
        tint={isDark ? "dark" : "light"}
        style={[styles.overlay, concealCompletely && styles.overlayFull]}
      >
        <View
          style={[
            styles.overlayShade,
            {
              backgroundColor: isDark
                ? "rgba(15, 15, 15, 0.32)"
                : "rgba(255, 255, 255, 0.42)",
            },
          ]}
        />

        <View style={styles.overlayContent}>
          <Text style={styles.message}>{message}</Text>

          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.button}
            onPress={() => router.push("/premium")}
          >
            <Text style={styles.buttonText}>{buttonLabel}</Text>
          </TouchableOpacity>
        </View>
      </BlurView>
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
    paddingVertical: 18,
    gap: 16,
  },
  message: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.18)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  button: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 999,
  },
  buttonText: {
    color: "#E94560",
    fontSize: 13,
    fontWeight: "800",
  },
});
