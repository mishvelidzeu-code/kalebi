import { DefaultTheme } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AppState } from "react-native";
import { isAdminEmail } from "../services/adminAccess";
import {
  resolvePremiumAccessFromProfile,
  syncPremiumStatusFromPurchases,
} from "../services/purchases";
import { supabase } from "../services/supabase";

const PremiumTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: "#E94560",
    background: "#0F0F0F",
    card: "#121212",
    text: "#FFFFFF",
    border: "#2A2A2A",
    notification: "#E94560",
    tabBar: "#121212",
  },
};

const StandardTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: "#ff4d88",
    background: "#FDFCFD",
    card: "#FFFFFF",
    text: "#1A1A1A",
    border: "#F0F0F0",
    tabBar: "#FFFFFF",
  },
};

const ThemeContext = createContext();
const THEME_PREFERENCE_KEY = "cycle_app_use_premium_theme";

export const ThemeProvider = ({ children }) => {
  const [isPremium, setIsPremium] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [usePremiumTheme, setUsePremiumThemeState] = useState(false);

  const checkPremiumStatus = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setIsPremium(false);
        setIsAdmin(false);
        return;
      }

      const adminAccess = isAdminEmail(user.email || "");
      setIsAdmin(adminAccess);
      if (adminAccess) {
        setIsPremium(true);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("is_premium, premium_override, premium_until")
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;

      const premiumOverride = Boolean(data?.premium_override);
      if (premiumOverride) {
        setIsPremium(true);
        return;
      }

      const profilePremiumStatus = resolvePremiumAccessFromProfile(data);
      const syncedStatus = await syncPremiumStatusFromPurchases();
      if (syncedStatus.source === "revenuecat" || syncedStatus.source === "supabase") {
        setIsPremium(Boolean(syncedStatus.isPremium));
        return;
      }

      setIsPremium(profilePremiumStatus);
    } catch (error) {
      console.log("Premium status check error:", error);
      setIsPremium(false);
      setIsAdmin(false);
    }
  }, []);

  useEffect(() => {
    checkPremiumStatus();
  }, [checkPremiumStatus]);

  useEffect(() => {
    const loadSavedThemePreference = async () => {
      try {
        const savedPreference = await AsyncStorage.getItem(THEME_PREFERENCE_KEY);
        if (savedPreference != null) {
          setUsePremiumThemeState(savedPreference === "true");
        }
      } catch (error) {
        console.log("Theme preference load error:", error);
      }
    };

    loadSavedThemePreference();
  }, []);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsPremium(false);
      setIsAdmin(false);

      if (session?.user) {
        checkPremiumStatus();
      }
    });

    return () => subscription.remove();
  }, [checkPremiumStatus]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        checkPremiumStatus();
      }
    });

    return () => subscription.remove();
  }, [checkPremiumStatus]);

  const refreshTheme = useCallback(async () => {
    await checkPremiumStatus();
  }, [checkPremiumStatus]);

  const setUsePremiumTheme = useCallback(async (nextValue) => {
    const resolvedValue =
      typeof nextValue === "function" ? nextValue(usePremiumTheme) : nextValue;

    setUsePremiumThemeState(Boolean(resolvedValue));

    try {
      await AsyncStorage.setItem(THEME_PREFERENCE_KEY, String(Boolean(resolvedValue)));
    } catch (error) {
      console.log("Theme preference save error:", error);
    }
  }, [usePremiumTheme]);

  const isDark = usePremiumTheme;
  const currentTheme = isDark ? PremiumTheme : StandardTheme;

  const themeContextValue = {
    isPremium,
    isAdmin,
    usePremiumTheme,
    setUsePremiumTheme,
    isDark,
    colors: currentTheme.colors,
    navigationTheme: currentTheme,
    refreshTheme,
  };

  return (
    <ThemeContext.Provider value={themeContextValue}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
