import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../../context/ThemeContext";

function TabIcon({ name, color, focused, isAssistant = false, primary, isDark }) {
  if (isAssistant) {
    return (
      <View
        style={{
          width: focused ? 64 : 54,
          height: focused ? 64 : 54,
          borderRadius: focused ? 32 : 27,
          alignItems: "center",
          justifyContent: "center",
          marginTop: focused ? -32 : -16,
          backgroundColor: focused ? primary : isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.78)",
          shadowColor: focused ? primary : "#000",
          shadowOpacity: focused ? 0.34 : 0.12,
          shadowRadius: focused ? 20 : 14,
          shadowOffset: { width: 0, height: focused ? 12 : 6 },
          elevation: focused ? 14 : 4,
          borderWidth: 1,
          borderColor: focused ? "rgba(255,255,255,0.72)" : isDark ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.82)",
          transform: [{ translateY: focused ? -3 : -1 }],
        }}
      >
        <Ionicons
          name={name}
          size={focused ? 30 : 26}
          color={focused ? "#FFFFFF" : color}
        />
      </View>
    );
  }

  return <Ionicons name={name} size={24} color={color} />;
}

export default function TabLayout() {
  const { colors, isDark, isAdmin } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 10);

  return (
    <Tabs
      initialRouteName={isAdmin ? "admin" : "index"}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: isDark ? "#D0B9C2" : "#9A6A79",
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          height: 68 + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 8,
          marginHorizontal: 14,
          marginBottom: 8,
          borderRadius: 28,
          position: "absolute",
          shadowColor: "#D76586",
          shadowOpacity: isDark ? 0.18 : 0.14,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 10 },
          elevation: 12,
          overflow: "visible",
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "800",
        },
      }}
    >
      <Tabs.Screen
        name="admin"
        options={{
          title: "Dashboard",
          href: isAdmin ? undefined : null,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="grid" color={color} focused={focused} primary={colors.primary} isDark={isDark} />
          ),
        }}
      />

      <Tabs.Screen
        name="index"
        options={{
          href: isAdmin ? null : undefined,
          title: "მთავარი",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="home" color={color} focused={focused} primary={colors.primary} isDark={isDark} />
          ),
        }}
      />

      <Tabs.Screen
        name="calendar"
        options={{
          href: isAdmin ? null : undefined,
          title: "კალენდარი",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="calendar" color={color} focused={focused} primary={colors.primary} isDark={isDark} />
          ),
        }}
      />

      <Tabs.Screen
        name="symptoms"
        options={{
          title: "ასისტენტი",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="chatbubble-ellipses" color={color} focused={focused} primary={colors.primary} isDark={isDark} isAssistant />
          ),
        }}
      />

      <Tabs.Screen
        name="statistics"
        options={{
          href: isAdmin ? null : undefined,
          title: "სტატისტიკა",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="stats-chart" color={color} focused={focused} primary={colors.primary} isDark={isDark} />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "პროფილი",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="person" color={color} focused={focused} primary={colors.primary} isDark={isDark} />
          ),
        }}
      />
    </Tabs>
  );
}
