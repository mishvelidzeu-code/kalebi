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
          width: focused ? 58 : 48,
          height: focused ? 58 : 48,
          borderRadius: focused ? 29 : 24,
          alignItems: "center",
          justifyContent: "center",
          marginTop: focused ? -24 : -8,
          backgroundColor: focused ? primary : isDark ? "#1D1D1D" : "#FFF5F8",
          shadowColor: focused ? primary : "#000",
          shadowOpacity: focused ? 0.28 : 0.08,
          shadowRadius: focused ? 14 : 8,
          shadowOffset: { width: 0, height: focused ? 10 : 4 },
          elevation: focused ? 10 : 2,
          borderWidth: 1,
          borderColor: focused ? primary : isDark ? "#2B2B2B" : "#F7D8E4",
        }}
      >
        <Ionicons
          name={name}
          size={focused ? 28 : 24}
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
        tabBarInactiveTintColor: isDark ? "#555555" : "#999999",
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          height: 62 + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 5,
          elevation: 0,
          overflow: "visible",
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
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
