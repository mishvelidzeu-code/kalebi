import { ThemeProvider as NavigationThemeProvider } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { OnboardingProvider } from "../components/OnboardingContext";
import { PregnancyProvider } from "../context/PregnancyContext";
import { FertilityProvider } from "../context/FertilityContext";
import { ThemeProvider, useTheme } from "../context/ThemeContext";
import { initializeMetaAppEvents } from "../services/metaAppEvents";
import { registerPushTokenForCurrentUser } from "../services/notifications";
import { syncProfileEmailForCurrentUser, syncProfileEmailForUser } from "../services/profileSync";
import { supabase } from "../services/supabase";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function LayoutContent() {
  const { isDark, navigationTheme, colors } = useTheme();

  useEffect(() => {
    initializeMetaAppEvents();
    syncProfileEmailForCurrentUser();
    registerPushTokenForCurrentUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        syncProfileEmailForUser(session.user);
        registerPushTokenForCurrentUser();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

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
        <Stack.Screen name="admin" />
      </Stack>

      <StatusBar style={isDark ? "light" : "dark"} />
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <PregnancyProvider>
        <FertilityProvider>
          <OnboardingProvider>
            <LayoutContent />
          </OnboardingProvider>
        </FertilityProvider>
      </PregnancyProvider>
    </ThemeProvider>
  );
}
