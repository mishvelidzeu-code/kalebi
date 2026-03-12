import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useTheme } from "../../context/ThemeContext";

export default function TabLayout() {
  // ვიღებთ დინამიურ ფერებს და თემის სტატუსს გლობალური კონტექსტიდან
  const { colors, isDark } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: isDark ? "#555555" : "#999999",
        tabBarStyle: {
          backgroundColor: colors.tabBar, // ფონი იცვლება ავტომატურად
          borderTopWidth: 1,
          borderTopColor: colors.border, // ზოლის ფერი იცვლება ავტომატურად
          height: 65,
          paddingBottom: 10,
          paddingTop: 5,
          elevation: 0, // ჩრდილის მოცილება მუქი თემისთვის
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "მთავარი",
          tabBarIcon: ({ color }) => (
            <Ionicons name="home" size={24} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="calendar"
        options={{
          title: "კალენდარი",
          tabBarIcon: ({ color }) => (
            <Ionicons name="calendar" size={24} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="symptoms"
        options={{
          title: "სიმპტომები",
          tabBarIcon: ({ color }) => (
            <Ionicons name="medkit" size={24} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="statistics"
        options={{
          title: "სტატისტიკა",
          tabBarIcon: ({ color }) => (
            <Ionicons name="stats-chart" size={24} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "პროფილი",
          tabBarIcon: ({ color }) => (
            <Ionicons name="person" size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}