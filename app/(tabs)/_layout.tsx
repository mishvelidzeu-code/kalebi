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
import { runAdminQuery } from "../../services/adminQuery";

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
        <Ionicons name={name} size={focused ? 30 : 26} color={focused ? "#FFFFFF" : color} />
      </View>
    );
  }
  return <Ionicons name={name} size={24} color={color} />;
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
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 10);

  // stats passed from ThemeContext or kept minimal for assistant
  const adminStats = { users: 0, todayUsers: 0, paidPremium: 0, adminPremium: 0, pregnancyPaid: 0, withPhotos: 0 };

  return (
    <View style={{ flex: 1 }}>
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
            href: isAdmin ? null : undefined,
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

      {isAdmin && <AdminAssistant colors={colors} isDark={isDark} stats={adminStats} />}
    </View>
  );
}

const styles = StyleSheet.create({
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
