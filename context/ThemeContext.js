import { DefaultTheme } from "@react-navigation/native";
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../services/supabase";

// პრაიმ თემა - მუქი
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

// სტანდარტული თემა - თეთრი
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

  useEffect(() => {
    checkPremiumStatus();
  }, []);

  const checkPremiumStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("profiles")
        .select("is_premium")
        .eq("id", user.id)
        .maybeSingle();

      const premiumStatus = data?.is_premium || false;
      setIsPremium(premiumStatus);
      if (premiumStatus) setUsePremiumTheme(true);
    } catch (e) {
      setIsPremium(false);
    }
  };

  // --- ახალი ფუნქცია: სტატუსის იძულებითი განახლება ყიდვისას ---
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
    navigationTheme: currentTheme, // ამას _layout-ში გამოვიყენებთ
    refreshTheme // <--- გადავცემთ ამ ფუნქციას მთელ აპლიკაციას
  };

  return (
    <ThemeContext.Provider value={themeContextValue}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);