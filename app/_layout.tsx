import { ThemeProvider as NavigationThemeProvider } from "@react-navigation/native";
import * as Notifications from "expo-notifications"; // 👈 დამატებულია იმპორტი
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { OnboardingProvider } from "../components/OnboardingContext";
import { PregnancyProvider } from "../context/PregnancyContext";
import { ThemeProvider, useTheme } from "../context/ThemeContext";

// 👈 დამატებულია Foreground Handler (განახლებული ტიპებით)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true, // 👈 შეცვალა shouldShowAlert
    shouldShowList: true,   // 👈 შეცვალა shouldShowAlert
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function LayoutContent() {
  const { isDark, navigationTheme, colors } = useTheme();

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade",
          contentStyle: {
            backgroundColor: colors.background,
          },
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
  return (
    <ThemeProvider>
      <PregnancyProvider>
        <OnboardingProvider>
          <LayoutContent />
        </OnboardingProvider>
      </PregnancyProvider>
    </ThemeProvider>
  );
}