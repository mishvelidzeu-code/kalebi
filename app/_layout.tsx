import { ThemeProvider as NavigationThemeProvider } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { OnboardingProvider } from "../components/OnboardingContext";
import { PregnancyProvider } from "../context/PregnancyContext";
import { FertilityProvider } from "../context/FertilityContext";
import { LanguageProvider } from "../context/LanguageContext";
import { ThemeProvider, useTheme } from "../context/ThemeContext";
import { WeightProvider } from "../context/WeightContext";
import { useOtaUpdatePrompt } from "../hooks/useOtaUpdatePrompt";
import { startAppSessionTracking } from "../services/appSessions";
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
  useOtaUpdatePrompt();

  useEffect(() => {
    initializeMetaAppEvents();
    syncProfileEmailForCurrentUser();
    registerPushTokenForCurrentUser();
    const stopAppSessionTracking = startAppSessionTracking();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // The two calls above already cover the session the app starts with, and
      // a token refresh keeps the same user — redoing both on those (hourly,
      // too) only added an Expo token request and two writes.
      if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
        return;
      }

      if (session?.user) {
        syncProfileEmailForUser(session.user);
        registerPushTokenForCurrentUser();
      }
    });

    return () => {
      subscription.unsubscribe();
      stopAppSessionTracking();
    };
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
    <LanguageProvider>
      <ThemeProvider>
        <PregnancyProvider>
          <FertilityProvider>
            <WeightProvider>
              <OnboardingProvider>
                <LayoutContent />
              </OnboardingProvider>
            </WeightProvider>
          </FertilityProvider>
        </PregnancyProvider>
      </ThemeProvider>
    </LanguageProvider>
  );
}
