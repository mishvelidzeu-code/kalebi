import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../../context/ThemeContext";
import { useFertility } from "../../context/FertilityContext";
import { runAdminQuery } from "../../services/adminQuery";

// Instagram-style: flat bar, no labels, outline icon when idle and the solid
// version when active. `name` is the base Ionicons name (e.g. "home") — the
// outline variant is derived, so callers pass one name.
function TabIcon({ name, color, focused, isAssistant = false, primary }) {
  const iconName = focused ? name : `${name}-outline`;
  const size = isAssistant ? 28 : 26;

  return (
    <View style={styles.tabIconWrap}>
      <Ionicons name={iconName} size={size} color={focused ? primary : color} />
      {focused && <View style={[styles.tabActiveDot, { backgroundColor: primary }]} />}
    </View>
  );
}

// ─── Admin Floating Assistant ────────────────────────────────────────────────
function AdminAssistant({ colors, isDark, stats }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [history, setHistory] = useState<{ role: string; text: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();

  const theme = {
    bg: isDark ? "#1A1A1A" : "#FFFFFF",
    text: isDark ? "#FFFFFF" : "#1A1A1A",
    subText: isDark ? "#AAAAAA" : "#777777",
    input: isDark ? "#242424" : "#F5F5F5",
    border: isDark ? "#2A2A2A" : "#EFEFF4",
    userBubble: isDark ? "#2D1240" : "#FFE0EF",
    adminBubble: isDark ? "#1A2E20" : "#E0F7EF",
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    Keyboard.dismiss();
    setHistory((h) => [...h, { role: "user", text }]);
    setLoading(true);
    try {
      const answer = await runAdminQuery(text, stats || {});
      setHistory((h) => [...h, { role: "admin", text: answer }]);
    } catch {
      setHistory((h) => [...h, { role: "admin", text: "შეცდომა. სცადე თავიდან." }]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 150);
    }
  };

  return (
    <>
      {/* Floating button */}
      <TouchableOpacity
        style={[styles.fab, { top: insets.top + 10, backgroundColor: colors.primary }]}
        onPress={() => setOpen(true)}
        activeOpacity={0.82}
      >
        <Ionicons name="sparkles" size={20} color="#fff" />
      </TouchableOpacity>

      {/* Chat modal */}
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <TouchableOpacity style={styles.modalDismiss} activeOpacity={1} onPress={() => setOpen(false)} />

          <View style={[styles.chatPanel, { backgroundColor: theme.bg }]}>
            {/* Header */}
            <View style={styles.chatHeader}>
              <Ionicons name="sparkles" size={16} color={colors.primary} />
              <Text style={[styles.chatTitle, { color: theme.text }]}>ადმინ ასისტენტი</Text>
              <TouchableOpacity onPress={() => setOpen(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={theme.subText} />
              </TouchableOpacity>
            </View>

            {/* Messages */}
            <ScrollView
              ref={scrollRef}
              style={styles.chatScroll}
              contentContainerStyle={styles.chatScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {history.length === 0 && (
                <Text style={[styles.chatHint, { color: theme.subText }]}>
                  კითხე: "დღეს რამდენი დაემატა", "მომეცი მარიამის ნომერი", "ბოლო დამატებული" ...
                </Text>
              )}
              {history.map((msg, i) => (
                <View
                  key={i}
                  style={[
                    styles.bubble,
                    msg.role === "user"
                      ? [styles.bubbleUser, { backgroundColor: theme.userBubble }]
                      : [styles.bubbleAdmin, { backgroundColor: theme.adminBubble }],
                  ]}
                >
                  {msg.role === "admin" && (
                    <Text style={[styles.bubbleRole, { color: "#06D6A0" }]}>ადმინი</Text>
                  )}
                  <Text style={[styles.bubbleText, { color: theme.text }]}>{msg.text}</Text>
                </View>
              ))}
              {loading && (
                <View style={[styles.bubble, styles.bubbleAdmin, { backgroundColor: theme.adminBubble }]}>
                  <ActivityIndicator color={colors.primary} size="small" />
                </View>
              )}
            </ScrollView>

            {/* Input */}
            <View style={[styles.inputRow, { borderColor: theme.border, backgroundColor: theme.input }]}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="შეკითხვა..."
                placeholderTextColor={theme.subText}
                multiline
                blurOnSubmit={false}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                style={[
                  styles.textInput,
                  { color: theme.text },
                  !inputFocused && !input ? styles.textInputCollapsed : styles.textInputExpanded,
                ]}
              />
              <TouchableOpacity
                onPress={send}
                disabled={loading || !input.trim()}
                style={[styles.sendBtn, { backgroundColor: colors.primary }, (loading || !input.trim()) && { opacity: 0.4 }]}
              >
                <Ionicons name="arrow-up" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

export default function TabLayout() {
  const { colors, isDark, isAdmin } = useTheme();
  const { fertilityMode } = useFertility();
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 10);
  // Fertility mode themes the whole app green — the tab bar follows.
  const tabAccent = fertilityMode ? "#0E9F6E" : colors.primary;

  // stats passed from ThemeContext or kept minimal for assistant
  const adminStats = { users: 0, todayUsers: 0, paidPremium: 0, adminPremium: 0, pregnancyPaid: 0, withPhotos: 0 };

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        initialRouteName={isAdmin ? "admin" : "index"}
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarActiveTintColor: tabAccent,
          tabBarInactiveTintColor: isDark ? "rgba(255,255,255,0.55)" : "rgba(60,60,67,0.5)",
          tabBarStyle: {
            backgroundColor: colors.tabBar,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
            height: 58 + bottomInset,
            paddingBottom: bottomInset,
            paddingTop: 8,
            elevation: 0,
            shadowOpacity: 0,
          },
          tabBarItemStyle: { paddingTop: 2 },
        }}
      >
        <Tabs.Screen
          name="admin"
          options={{
            title: "Dashboard",
            href: isAdmin ? undefined : null,
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name="grid" color={color} focused={focused} primary={tabAccent} />
            ),
          }}
        />

        <Tabs.Screen
          name="index"
          options={{
            href: isAdmin ? null : undefined,
            title: "მთავარი",
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name="home" color={color} focused={focused} primary={tabAccent} />
            ),
          }}
        />

        <Tabs.Screen
          name="calendar"
          options={{
            href: isAdmin ? null : undefined,
            title: "კალენდარი",
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name="calendar" color={color} focused={focused} primary={tabAccent} />
            ),
          }}
        />

        <Tabs.Screen
          name="symptoms"
          options={{
            href: isAdmin ? null : undefined,
            title: "ასისტენტი",
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name="chatbubble-ellipses" color={color} focused={focused} primary={tabAccent} isAssistant />
            ),
          }}
        />

        <Tabs.Screen
          name="statistics"
          options={{
            href: isAdmin ? null : undefined,
            title: "სტატისტიკა",
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name="stats-chart" color={color} focused={focused} primary={tabAccent} />
            ),
          }}
        />

        <Tabs.Screen
          name="profile"
          options={{
            title: "პროფილი",
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name="person" color={color} focused={focused} primary={tabAccent} />
            ),
          }}
        />
      </Tabs>

      {isAdmin && <AdminAssistant colors={colors} isDark={isDark} stats={adminStats} />}
    </View>
  );
}

const styles = StyleSheet.create({
  // tab bar
  tabIconWrap: { alignItems: "center", justifyContent: "center", height: 34 },
  tabActiveDot: { width: 4, height: 4, borderRadius: 2, marginTop: 4 },

  // floating button
  fab: {
    position: "absolute",
    right: 18,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
    elevation: 20,
    shadowColor: "#E94560",
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  // modal
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalDismiss: { flex: 1 },
  chatPanel: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingBottom: 30,
    maxHeight: "75%",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 24,
  },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128,128,128,0.12)",
  },
  chatTitle: { flex: 1, fontSize: 16, fontWeight: "900" },
  closeBtn: { padding: 4 },
  chatScroll: { maxHeight: 380 },
  chatScrollContent: { paddingVertical: 12, gap: 8 },
  chatHint: { fontSize: 13, fontWeight: "600", lineHeight: 20, textAlign: "center", paddingVertical: 16 },
  bubble: { borderRadius: 16, padding: 12, maxWidth: "88%" },
  bubbleUser: { alignSelf: "flex-end" },
  bubbleAdmin: { alignSelf: "flex-start" },
  bubbleRole: { fontSize: 10, fontWeight: "900", marginBottom: 3 },
  bubbleText: { fontSize: 13, fontWeight: "600", lineHeight: 19 },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
    marginTop: 12,
  },
  textInput: { flex: 1, fontSize: 14, paddingVertical: 4 },
  textInputCollapsed: { height: 36 },
  textInputExpanded: { minHeight: 36, maxHeight: 110 },
  sendBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});
