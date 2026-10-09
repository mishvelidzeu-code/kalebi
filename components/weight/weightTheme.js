// Weight-loss mode palette: violet, so it never reads as the pink cycle screens
// or the green fertility ones, with the brand pink kept for water-retention days.
export function getWeightTheme(isDark) {
  return {
    text: isDark ? "#F3F0FF" : "#2A2140",
    subText: isDark ? "#C9C0EC" : "#6E6390",
    accent: "#7B61FF",
    accentSoft: isDark ? "rgba(123,97,255,0.20)" : "rgba(123,97,255,0.12)",
    accentBorder: isDark ? "rgba(167,139,250,0.38)" : "rgba(123,97,255,0.32)",
    water: "#E5578A",
    waterSoft: isDark ? "rgba(229,87,138,0.18)" : "rgba(229,87,138,0.10)",
    waterBorder: isDark ? "rgba(229,87,138,0.36)" : "rgba(229,87,138,0.28)",
    success: "#0E9F6E",
    warning: "#E07A1F",
    warningSoft: isDark ? "rgba(224,122,31,0.18)" : "rgba(224,122,31,0.10)",
    warningBorder: isDark ? "rgba(224,122,31,0.40)" : "rgba(224,122,31,0.30)",
    border: isDark ? "rgba(167,139,250,0.20)" : "rgba(123,97,255,0.16)",
    divider: isDark ? "rgba(167,139,250,0.14)" : "rgba(123,97,255,0.10)",
    track: isDark ? "rgba(167,139,250,0.14)" : "rgba(123,97,255,0.10)",
    inputBg: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.9)",
    pageGradient: isDark ? ["#1F1A30", "#1A1726", "#16141D"] : ["#FBFAFF", "#F3F0FF", "#FFF2F7"],
    cardGradient: isDark
      ? ["rgba(46,38,72,0.96)", "rgba(30,26,46,0.94)"]
      : ["rgba(255,255,255,0.95)", "rgba(243,240,255,0.88)", "rgba(255,240,246,0.84)"],
    heroGradient: isDark ? ["#40336E", "#33295A", "#2A2140"] : ["#A78BFA", "#8B7CF6", "#F08DB4"],
  };
}
