import { DefaultTheme } from "@react-navigation/native";
import { createContext, useContext, useEffect, useState } from "react";
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
  const [isPremium, setIsPremium] = useState(true);
  const [usePremiumTheme, setUsePremiumTheme] = useState(true);

  useEffect(() => {
    checkPremiumStatus();
  }, []);

  const checkPremiumStatus = async () => {
    setIsPremium(true);
    setUsePremiumTheme(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      await supabase.from("profiles").upsert(
        {
          id: user.id,
          is_premium: true,
        },
        { onConflict: "id" }
      );
    } catch {
      setIsPremium(true);
      setUsePremiumTheme(true);
    }
  };

  const refreshTheme = async () => {
    await checkPremiumStatus();
  };

  const isDark = isPremium && usePremiumTheme;
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

  return <ThemeContext.Provider value={themeContextValue}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
