import { ThemeProvider as NavigationThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react"; // დამატებულია
import { Platform } from "react-native"; // დამატებულია
import Purchases from "react-native-purchases"; // დამატებულია

import { OnboardingProvider } from "../components/OnboardingContext";
import { ThemeProvider, useTheme } from "../context/ThemeContext";

function LayoutContent() {
  const { isDark, navigationTheme, colors } = useTheme();

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade",
          contentStyle: {
            backgroundColor: colors.background
          }
        }}
      >
        <Stack.Screen name="splash" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
      </Stack>

      <StatusBar style={isDark ? "light" : "dark"} />
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  // RevenueCat-ის ინიციალიზაცია აპლიკაციის ჩართვისთანავე
  useEffect(() => {
    const initPurchases = async () => {
      if (Platform.OS === 'ios') {
        Purchases.configure({ apiKey: "appl_wPnULcgcdhNvUKrWvnGjVjqBeVl" });
      }
    };
    initPurchases();
  }, []);

  return (
    <ThemeProvider>
      <OnboardingProvider>
        <LayoutContent />
      </OnboardingProvider>
    </ThemeProvider>
  );
}