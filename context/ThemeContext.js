import { DefaultTheme } from "@react-navigation/native";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AppState } from "react-native";
import { syncPremiumStatusFromPurchases } from "../services/purchases";
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

export const ThemeProvider = ({ children }) => {
  const [isPremium, setIsPremium] = useState(false);
  const [usePremiumTheme, setUsePremiumTheme] = useState(true);

  const checkPremiumStatus = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setIsPremium(false);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("is_premium, premium_override")
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;

      const premiumOverride = Boolean(data?.premium_override);
      if (premiumOverride) {
        setIsPremium(true);
        return;
      }

      const profilePremiumStatus = Boolean(data?.is_premium);
      const syncedStatus = await syncPremiumStatusFromPurchases();
      if (syncedStatus.source === "revenuecat") {
        setIsPremium(Boolean(syncedStatus.isPremium));
        return;
      }

      setIsPremium(profilePremiumStatus);
    } catch (error) {
      console.log("Premium status check error:", error);
      setIsPremium(false);
    }
  }, []);

  useEffect(() => {
    checkPremiumStatus();
  }, [checkPremiumStatus]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsPremium(false);

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

  const isDark = usePremiumTheme;
  const currentTheme = isDark ? PremiumTheme : StandardTheme;

  const themeContextValue = {
    isPremium,
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
