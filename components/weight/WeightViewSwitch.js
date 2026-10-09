import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useLanguage } from "../../context/LanguageContext";
import { useTheme } from "../../context/ThemeContext";
import { getWeightTheme } from "./weightTheme";

// "Weight | Cycle" switch at the top of the statistics tab in weight mode.
// The cycle side is the regular statistics screen, unchanged.
export default function WeightViewSwitch({ value, onChange }) {
  const { t } = useLanguage();
  const { isDark } = useTheme();
  const theme = getWeightTheme(isDark);

  const options = [
    { id: "weight", label: t("weight.viewWeight"), activeBg: theme.accentSoft, activeText: theme.accent },
    { id: "cycle", label: t("weight.viewCycle"), activeBg: theme.waterSoft, activeText: theme.water },
  ];

  return (
    <View style={[styles.wrap, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
      {options.map((option) => {
        const active = option.id === value;
        return (
          <TouchableOpacity
            key={option.id}
            activeOpacity={0.85}
            style={[styles.option, active && { backgroundColor: option.activeBg }]}
            onPress={() => onChange(option.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.label, { color: active ? option.activeText : theme.subText }]}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Centered and narrow enough to stay clear of the floating diary avatar in
  // the top-right corner, even on the smallest iPhones.
  wrap: { flexDirection: "row", alignSelf: "center", width: 230, borderWidth: 1, borderRadius: 16, padding: 4, marginBottom: 18 },
  option: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 12 },
  label: { fontSize: 14, fontWeight: "800" },
});
