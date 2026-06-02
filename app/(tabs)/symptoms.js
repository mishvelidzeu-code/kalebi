import AsyncStorage from "@react-native-async-storage/async-storage";
import dayjs from "dayjs";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useTheme } from "../../context/ThemeContext";
import { usePregnancy } from "../../context/PregnancyContext";
import {
  askAssistant,
  getAssistantScreenSummary,
} from "../../services/assistantOrchestrator";
import { saveAssistantChatHistory } from "../../services/assistantHistory";
import { supabase } from "../../services/supabase";

const QUICK_PROMPTS = [
  "დღეს როგორ მოვუარო თავს?",
  "PMS-ის დროს რას მირჩევ?",
  "ჩემი სიმპტომები ნორმალურია?",
];

const PREGNANCY_QUICK_PROMPTS = [
  "რამდენ კვირაში ვარ?",
  "გულისრევა — რა ვქნა?",
  "ბავშვი ამ კვირას რა ვითარდება?",
  "ზურგის ტკივილი ნორმალურია?",
  "კვება ორსულობაში",
  "როდის არის მშობიარობა?",
];

const EMPTY_SUMMARY = {
  goalLabel: "",
  phaseLabel: "",
  cycleDay: null,
  mood: null,
  symptoms: [],
  note: null,
  hasTodayEntry: false,
  daysUntilNextPeriod: null,
};

const FREE_DAILY_QUESTION_LIMIT = 1;
const PRIME_DAILY_QUESTION_LIMIT = 20;
const DAILY_LIMIT_STORAGE_KEY_PREFIX = "@cycle-care/assistant-daily-limit";

function getAssistantDailyLimitStorageKey(userId) {
  return `${DAILY_LIMIT_STORAGE_KEY_PREFIX}/${userId}`;
}

async function getAssistantDailyUsage(userId) {
  try {
    if (!userId) return 0;

    const rawValue = await AsyncStorage.getItem(
      getAssistantDailyLimitStorageKey(userId)
    );
    const todayKey = dayjs().format("YYYY-MM-DD");

    if (!rawValue) return 0;

    const parsedValue = JSON.parse(rawValue);
    if (parsedValue?.date !== todayKey) return 0;

    return Math.max(0, Number(parsedValue?.count || 0));
  } catch (error) {
    console.log("Assistant daily usage read error:", error);
    return 0;
  }
}

async function setAssistantDailyUsage(userId, count) {
  try {
    if (!userId) return;

    await AsyncStorage.setItem(
      getAssistantDailyLimitStorageKey(userId),
      JSON.stringify({
        date: dayjs().format("YYYY-MM-DD"),
        count,
      })
    );
  } catch (error) {
    console.log("Assistant daily usage save error:", error);
  }
}

const buildWelcomeMessage = (name) => ({
  id: `assistant-welcome-${Date.now()}`,
  role: "assistant",
  synthetic: true,
  text: `გამარჯობა${name ? `, ${name}` : ""}. მე შენი ასისტენტი ვარ. შეგიძლია მკითხო ციკლზე, სიმპტომებზე, თვითმოვლაზე და შენს დღიურზე დაყრდნობით მოკლე რჩევებზეც.`,
});

const formatSymptomsText = (symptoms) =>
  symptoms?.length
    ? symptoms.join(", ")
    : "დღეს ჯერ სიმპტომები არ გაქვს ჩანიშნული";

export default function AssistantScreen() {
  const router = useRouter();
  const { isDark, isPremium, isAdmin } = useTheme();
  const { pregnancyMode, currentWeek, currentTrimester, daysRemaining } = usePregnancy();
  const scrollRef = useRef(null);

  const [userName, setUserName] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [sending, setSending] = useState(false);
  const [questionsUsedToday, setQuestionsUsedToday] = useState(0);
  const [assistantUserId, setAssistantUserId] = useState(null);

  const theme = {
    bg: isDark ? "#0F0F0F" : "#F7F8FA",
    card: isDark ? "#1A1A1A" : "#FFFFFF",
    text: isDark ? "#FFFFFF" : "#1A1A1A",
    subText: isDark ? "#A8A8A8" : "#7A7A7A",
    primary: isDark ? "#E94560" : "#FF4D88",
    input: isDark ? "#202020" : "#F4F5F8",
    border: isDark ? "#2B2B2B" : "#ECECEC",
    quickChip: isDark ? "#262626" : "#FFF1F6",
    userBubble: isDark ? "#E94560" : "#FF4D88",
    assistantBubble: isDark ? "#1E1E1E" : "#FFFFFF",
  };

  const dailyQuestionLimit = isAdmin
    ? 999999
    : isPremium
    ? PRIME_DAILY_QUESTION_LIMIT
    : pregnancyMode ? 10 : FREE_DAILY_QUESTION_LIMIT;
  const remainingQuestions = Math.max(
    0,
    dailyQuestionLimit - questionsUsedToday
  );
  const hasQuestionLeft = remainingQuestions > 0;

  const loadScreenData = useCallback(async () => {
    if (messages.length === 0) {
      setLoadingProfile(true);
    }
    setLoadingSummary(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setAssistantUserId(null);
        setUserName("");
        setSummary(EMPTY_SUMMARY);
        setQuestionsUsedToday(0);
        setMessages((prev) => (prev.length ? prev : [buildWelcomeMessage("")]));
        setLoadingProfile(false);
        setLoadingSummary(false);
        return;
      }

      const [{ data: profile }, usageCount] = await Promise.all([
        supabase
          .from("profiles")
          .select("name")
          .eq("id", user.id)
          .maybeSingle(),
        getAssistantDailyUsage(user.id),
      ]);

      const fallbackName =
        profile?.name || user.email?.split("@")[0] || "";

      setAssistantUserId(user.id);
      setUserName(fallbackName);
      setQuestionsUsedToday(usageCount);
      setMessages((prev) => (prev.length ? prev : [buildWelcomeMessage(fallbackName)]));
      setLoadingProfile(false);

      const summaryData = await getAssistantScreenSummary();
      setSummary(summaryData || EMPTY_SUMMARY);
      if (summaryData?.userName) {
        setUserName(summaryData.userName);
      }
    } catch (error) {
      console.log("Assistant profile load error:", error);
      setAssistantUserId(null);
      setSummary(EMPTY_SUMMARY);
      setMessages((prev) => (prev.length ? prev : [buildWelcomeMessage("")]));
    } finally {
      setLoadingProfile(false);
      setLoadingSummary(false);
    }
  }, [messages.length]);

  useFocusEffect(
    useCallback(() => {
      loadScreenData();
    }, [loadScreenData])
  );

  const sendMessage = async (forcedPrompt = null) => {
    const prompt = (forcedPrompt ?? input).trim();
    if (!prompt || sending) return;
    if (!hasQuestionLeft) {
      Alert.alert(
        "დღის ლიმიტი ამოიწურა",
        isAdmin
          ? "ადმინ ანგარიშზე ასისტენტის ლიმიტი არ მოქმედებს."
          : isPremium
          ? "დღეს Prime ასისტენტთან 20 კითხვა უკვე გამოიყენე. ახალი კითხვები ხვალ განახლდება."
          : pregnancyMode
            ? "დღეს ორსულობის ასისტენტთან 10 კითხვა უკვე გამოიყენე. ახალი კითხვები ხვალ განახლდება."
            : "დღეს ასისტენტთან 1 უფასო კითხვა უკვე გამოიყენე. ახალი კითხვა ხვალ გახდება ხელმისაწვდომი.",
        [
          { text: "კარგი", style: "cancel" },
          ...(!isPremium && !pregnancyMode ? [{ text: "Prime", onPress: () => router.push("/premium") }] : []),
        ]
      );
      return;
    }

    const userMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: prompt,
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setSending(true);

    try {
      const assistantReply = await askAssistant({
        prompt,
        history: nextMessages.filter((message) => !message.synthetic),
      });

      await saveAssistantChatHistory({
        userId: assistantUserId,
        question: prompt,
        answer: assistantReply.text,
        source: assistantReply.source || "ai",
        metadata: {
          isPremium,
          questionsUsedToday,
        },
      });

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: assistantReply.text,
        },
      ]);

      if (assistantReply.source !== "local") {
        const nextUsageCount = questionsUsedToday + 1;
        setQuestionsUsedToday(nextUsageCount);
        await setAssistantDailyUsage(assistantUserId, nextUsageCount);
      }
    } catch (error) {
      console.log("Assistant send error:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          text: "ახლა პასუხის მიღება ვერ მოხერხდა. სცადე თავიდან ცოტა მოგვიანებით.",
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  if (loadingProfile) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View style={[styles.header, { backgroundColor: theme.bg }]}>
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <Text style={styles.headerEyebrow}>PERSONAL HEALTH ASSISTANT</Text>
              <Text style={[styles.headerTitle, { color: theme.text }]}>ასისტენტი</Text>
              <Text style={[styles.headerSubtitle, { color: theme.subText }]}>
                {userName
                  ? `${userName}, მკითხე რაც გაინტერესებს`
                  : "მკითხე რაც გაინტერესებს"}
              </Text>
            </View>
            <View style={styles.headerIcon}>
              <Ionicons name="sparkles-outline" size={22} color={theme.primary} />
            </View>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.chatScroll}
          contentContainerStyle={styles.chatContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() =>
            scrollRef.current?.scrollToEnd({ animated: true })
          }
        >
          <LinearGradient
            colors={isDark ? ["#1D191E", "#151417"] : ["#FFFFFF", "#FFF8FA"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.noticeCard, { borderColor: theme.border }]}
          >
            <View style={styles.noticeHeader}>
              <View>
                <Text style={styles.noticeEyebrow}>{pregnancyMode ? "MATERNITY OVERVIEW" : "DAILY OVERVIEW"}</Text>
                <Text style={[styles.noticeTitle, { color: theme.text }]}>
                  {pregnancyMode ? "შენი ორსულობა 🤰" : "შენი დღევანდელი სურათი"}
                </Text>
              </View>
              <View style={styles.noticeIcon}>
                <Ionicons name={pregnancyMode ? "heart-outline" : "analytics-outline"} size={18} color={theme.primary} />
              </View>
            </View>

            {loadingSummary ? (
              <View style={styles.summaryLoadingRow}>
                <ActivityIndicator size="small" color={theme.primary} />
                <Text style={[styles.noticeText, { color: theme.subText }]}>ვამოწმებ შენს უახლეს მონაცემებს...</Text>
              </View>
            ) : pregnancyMode ? (
              <View style={styles.summaryGrid}>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryLabel, { color: theme.subText }]}>მიმდინარე კვირა</Text>
                  <Text style={[styles.summaryValue, { color: theme.text }]}>{currentWeek ? `${currentWeek}-ე კვირა` : "—"}</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryLabel, { color: theme.subText }]}>ტრიმესტრი</Text>
                  <Text style={[styles.summaryValue, { color: theme.text }]}>
                    {currentTrimester === 1 ? "I ტრიმესტრი" : currentTrimester === 2 ? "II ტრიმესტრი" : currentTrimester === 3 ? "III ტრიმესტრი" : "—"}
                  </Text>
                </View>
                <View style={styles.summaryItemFull}>
                  <Text style={[styles.summaryLabel, { color: theme.subText }]}>მშობიარობამდე</Text>
                  <Text style={[styles.summaryValue, { color: theme.text }]}>{daysRemaining != null ? `${daysRemaining} დღე` : "—"}</Text>
                </View>
                <View style={styles.summaryItemFull}>
                  <Text style={[styles.summaryLabel, { color: theme.subText }]}>დღევანდელი განწყობა</Text>
                  <Text style={[styles.summaryValue, { color: theme.text }]}>{summary.mood || "ჯერ არ შეგივსია"}</Text>
                </View>
              </View>
            ) : (
              <>
                <Text style={[styles.noticeText, { color: theme.subText }]}>
                  {summary.phaseLabel
                    ? `${userName ? `${userName}, ` : ""}ახლა ხარ ${summary.phaseLabel}-ში${summary.cycleDay ? ` და ციკლის ${summary.cycleDay}-ე დღე გაქვს.` : "."}`
                    : "მონაცემები ჯერ ბოლომდე არ ჩანს, მაგრამ შეგიძლია მაინც მკითხო ყველაფერი ციკლზე, სიმპტომებზე და თვითმოვლაზე."}
                </Text>
                <View style={styles.summaryGrid}>
                  <View style={styles.summaryItem}>
                    <Text style={[styles.summaryLabel, { color: theme.subText }]}>მიზანი</Text>
                    <Text style={[styles.summaryValue, { color: theme.text }]}>{summary.goalLabel || "არ არის მითითებული"}</Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={[styles.summaryLabel, { color: theme.subText }]}>შემდეგ პერიოდამდე</Text>
                    <Text style={[styles.summaryValue, { color: theme.text }]}>{summary.daysUntilNextPeriod == null ? "—" : `${summary.daysUntilNextPeriod} დღე`}</Text>
                  </View>
                  <View style={styles.summaryItemFull}>
                    <Text style={[styles.summaryLabel, { color: theme.subText }]}>დღევანდელი განწყობა</Text>
                    <Text style={[styles.summaryValue, { color: theme.text }]}>{summary.mood || "ჯერ არ შეგივსია"}</Text>
                  </View>
                  <View style={styles.summaryItemFull}>
                    <Text style={[styles.summaryLabel, { color: theme.subText }]}>დღევანდელი სიმპტომები</Text>
                    <Text style={[styles.summaryValue, { color: theme.text }]}>{formatSymptomsText(summary.symptoms)}</Text>
                  </View>
                </View>
              </>
            )}
          </LinearGradient>

          <View style={styles.quickHeader}>
            <Text style={[styles.quickTitle, { color: theme.text }]}>სწრაფი კითხვები</Text>
            <Text style={[styles.quickSubtitle, { color: theme.subText }]}>აირჩიე თემა ან დაწერე შენი კითხვა</Text>
          </View>
          <View style={styles.quickRow}>
            {(pregnancyMode ? PREGNANCY_QUICK_PROMPTS : QUICK_PROMPTS).map((prompt) => (
              <TouchableOpacity
                key={prompt}
                style={[styles.quickChip, { backgroundColor: theme.quickChip, borderColor: theme.border }, sending && styles.quickChipDisabled]}
                onPress={() => sendMessage(prompt)}
                disabled={sending}
              >
                <Text style={[styles.quickChipText, { color: theme.primary }]}>{prompt}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {messages.map((message) => {
            const isUser = message.role === "user";

            return (
              <View
                key={message.id}
                style={[
                  styles.messageRow,
                  isUser ? styles.messageRowRight : styles.messageRowLeft,
                ]}
              >
                {!isUser && (
                  <View style={[styles.assistantAvatar, { backgroundColor: `${theme.primary}1A` }]}>
                    <Ionicons name="sparkles-outline" size={14} color={theme.primary} />
                  </View>
                )}
                <View style={{ maxWidth: "80%" }}>
                <View
                  style={[
                    styles.messageBubble,
                    {
                      backgroundColor: isUser
                        ? theme.userBubble
                        : theme.assistantBubble,
                      borderColor: isUser ? theme.userBubble : theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.messageText,
                      { color: isUser ? "#FFFFFF" : theme.text },
                    ]}
                  >
                    {message.text}
                  </Text>
                </View>
                {!isUser && (
                  <Text style={{ fontSize: 11, color: theme.subText, marginTop: 3, marginLeft: 4, opacity: 0.6 }}>
                    ასისტენტი შეიძლება შეცდეს
                  </Text>
                )}
              </View>
              </View>
            );
          })}

          {sending && (
            <View style={styles.typingRow}>
              <View style={[styles.assistantAvatar, { backgroundColor: `${theme.primary}1A` }]}>
                <Ionicons name="sparkles-outline" size={14} color={theme.primary} />
              </View>
              <View
                style={[
                  styles.typingBubble,
                  { backgroundColor: theme.card, borderColor: theme.border },
                ]}
              >
                <Text style={[styles.typingText, { color: theme.subText }]}>
                  ასისტენტი პასუხობს...
                </Text>
              </View>
            </View>
          )}
        </ScrollView>

        <View
          style={[
            styles.composer,
            { backgroundColor: theme.bg, borderTopColor: theme.border },
          ]}
        >
        <View style={styles.composerMeta}>
          {hasQuestionLeft ? (
            <Text style={[styles.limitText, { color: theme.subText }]}>
              {`დღეს დარჩენილი კითხვები: ${remainingQuestions}/${dailyQuestionLimit}`}
            </Text>
          ) : (
            <TouchableOpacity
              onPress={() => !pregnancyMode && !isPremium && router.push("/premium")}
              activeOpacity={pregnancyMode || isPremium ? 1 : 0.8}
              style={styles.limitTextButton}
            >
              <Text style={[styles.limitText, styles.limitTextAction, { color: theme.primary }]}>
                {isAdmin
                  ? "ადმინ ანგარიშზე ასისტენტის ლიმიტი არ მოქმედებს."
                  : isPremium
                  ? "დღეს Prime კითხვები უკვე გამოიყენე. ახალი კითხვები ხვალ განახლდება."
                  : pregnancyMode
                    ? "დღეს 10 კითხვა გამოიყენე. ახალი კითხვები ხვალ განახლდება."
                    : "დღეს უფასო კითხვა უკვე გამოიყენე. ახალი კითხვა ხვალ გახდება ხელმისაწვდომი."}
              </Text>
            </TouchableOpacity>
          )}

          {!isPremium && !pregnancyMode && !hasQuestionLeft ? (
            <TouchableOpacity onPress={() => router.push("/premium")}>
              <Text style={[styles.limitLink, { color: theme.primary }]}>
                Prime
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

          <View
            style={[
              styles.inputWrap,
              { backgroundColor: theme.input, borderColor: theme.border },
            ]}
          >
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={
                hasQuestionLeft
                  ? "დაწერე კითხვა..."
                  : "დღის ლიმიტი ამოიწურა"
              }
              placeholderTextColor={theme.subText}
              multiline
              style={[styles.input, { color: theme.text }]}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                { backgroundColor: theme.primary },
                (!input.trim() || sending) &&
                  styles.sendButtonDisabled,
              ]}
              onPress={() => sendMessage()}
              disabled={!input.trim() || sending}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.sendButtonText}>გაგზავნა</Text>
                  <Ionicons name="arrow-up" size={16} color="#FFFFFF" />
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { paddingTop: 62, paddingHorizontal: 20, paddingBottom: 18 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerCopy: { flex: 1, paddingRight: 14 },
  headerEyebrow: { color: "#E94560", fontSize: 9, fontWeight: "900", letterSpacing: 1.05, marginBottom: 6 },
  headerTitle: { fontSize: 29, fontWeight: "900", letterSpacing: -0.5 },
  headerSubtitle: { marginTop: 6, fontSize: 14, fontWeight: "600", lineHeight: 20 },
  headerIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: "rgba(233,69,96,0.12)", alignItems: "center", justifyContent: "center" },
  chatScroll: { flex: 1 },
  chatContent: { paddingHorizontal: 20, paddingBottom: 20 },
  noticeCard: {
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    marginBottom: 20,
    overflow: "hidden",
    elevation: 3,
  },
  noticeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 11 },
  noticeEyebrow: { color: "#E94560", fontSize: 9, fontWeight: "900", letterSpacing: 0.95, marginBottom: 5 },
  noticeIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: "rgba(233,69,96,0.11)", alignItems: "center", justifyContent: "center" },
  noticeTitle: { fontSize: 17, fontWeight: "900" },
  noticeText: { fontSize: 14, lineHeight: 21 },
  summaryLoadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  summaryGrid: { marginTop: 14, gap: 9 },
  summaryItem: { flex: 1, borderRadius: 13, padding: 11, backgroundColor: "rgba(150,150,150,0.07)" },
  summaryItemFull: { width: "100%", borderRadius: 13, padding: 11, backgroundColor: "rgba(150,150,150,0.07)" },
  summaryLabel: {
    fontSize: 10,
    fontWeight: "800",
    marginBottom: 5,
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  summaryValue: { fontSize: 13, lineHeight: 19, fontWeight: "700" },
  quickHeader: { marginBottom: 10 },
  quickTitle: { fontSize: 15, fontWeight: "800" },
  quickSubtitle: { fontSize: 12, fontWeight: "600", marginTop: 3 },
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 17 },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  quickChipDisabled: { opacity: 0.45 },
  quickChipText: { fontSize: 12, fontWeight: "800" },
  messageRow: { marginBottom: 13, flexDirection: "row", alignItems: "flex-end", gap: 7 },
  messageRowLeft: { justifyContent: "flex-start" },
  messageRowRight: { justifyContent: "flex-end" },
  assistantAvatar: { width: 28, height: 28, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  messageBubble: {
    maxWidth: "84%",
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderWidth: 1,
  },
  messageText: { fontSize: 14, lineHeight: 21 },
  typingRow: { marginTop: 4, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 7 },
  typingBubble: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  typingText: { fontSize: 13, fontWeight: "600" },
  composer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 18,
    borderTopWidth: 1,
  },
  composerMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  limitTextButton: { flex: 1 },
  limitText: { flex: 1, fontSize: 12, fontWeight: "600", lineHeight: 18 },
  limitTextAction: { textDecorationLine: "underline" },
  limitLink: { fontSize: 13, fontWeight: "800" },
  inputWrap: { borderRadius: 20, borderWidth: 1, padding: 7 },
  input: {
    minHeight: 46,
    maxHeight: 120,
    fontSize: 15,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 10,
  },
  sendButton: {
    alignSelf: "flex-end",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginTop: 8,
  },
  sendButtonDisabled: { opacity: 0.5 },
  sendButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
});
