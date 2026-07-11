import AsyncStorage from "@react-native-async-storage/async-storage";
import dayjs from "dayjs";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Image,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../../context/ThemeContext";
import { usePregnancy } from "../../context/PregnancyContext";
import {
  askAssistant,
  getAssistantScreenSummary,
} from "../../services/assistantOrchestrator";
import { saveAssistantChatHistory } from "../../services/assistantHistory";
import { supabase } from "../../services/supabase";
const ASSISTANT_GUIDE_IMAGE = require("../../assets/images/assistant-guide.png");

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
  const insets = useSafeAreaInsets();
  const { isDark, isPremium, isAdmin } = useTheme();
  const { pregnancyMode, currentWeek, currentTrimester, daysRemaining } = usePregnancy();
  const scrollRef = useRef(null);

  const [userName, setUserName] = useState("");
  const [input, setInput] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [messages, setMessages] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [sending, setSending] = useState(false);
  const [questionsUsedToday, setQuestionsUsedToday] = useState(0);
  const [assistantUserId, setAssistantUserId] = useState(null);
  const [userAvatarUri, setUserAvatarUri] = useState("");

  const theme = {
    bg: isDark ? "#211621" : "#FFFDFC",
    card: isDark ? "rgba(55,40,58,0.86)" : "rgba(255,255,255,0.78)",
    text: isDark ? "#FFF7FB" : "#2F2026",
    subText: isDark ? "#E9C7D4" : "#8F6574",
    primary: "#FF4D88",
    peach: "#FF9E7D",
    lavender: "#B8A4FF",
    input: isDark ? "rgba(255,209,224,0.10)" : "rgba(255,255,255,0.72)",
    border: isDark ? "rgba(255,209,224,0.16)" : "rgba(255,255,255,0.78)",
    quickChip: isDark ? "rgba(255,209,224,0.10)" : "rgba(255,255,255,0.62)",
    userBubble: "#FF8A6B",
    assistantBubble: isDark ? "rgba(67,49,72,0.82)" : "rgba(255,255,255,0.78)",
    noticeGradient: pregnancyMode
      ? isDark ? ["rgba(56,37,46,0.94)", "rgba(24,15,20,0.86)"] : ["rgba(255,255,255,0.92)", "rgba(255,234,241,0.86)"]
      : isDark ? ["rgba(68,48,70,0.96)", "rgba(35,26,42,0.94)"] : ["rgba(255,255,255,0.96)", "rgba(255,242,232,0.9)", "rgba(246,240,255,0.86)"],
    composerBg: isDark ? "rgba(55,40,58,0.86)" : "rgba(255,255,255,0.74)",
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
  const tabBarClearance = Math.max(insets.bottom, 10) + 84;

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
        setUserAvatarUri("");
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
          .select("name, avatar_path")
          .eq("id", user.id)
          .maybeSingle(),
        getAssistantDailyUsage(user.id),
      ]);

      const fallbackName =
        profile?.name || user.email?.split("@")[0] || "";
      let avatarUrl = "";
      if (profile?.avatar_path) {
        const { data: signedUrl, error: signedUrlError } = await supabase.storage
          .from("avatars")
          .createSignedUrl(profile.avatar_path, 60 * 60);
        if (!signedUrlError && signedUrl?.signedUrl) {
          avatarUrl = signedUrl.signedUrl;
        }
      }

      setAssistantUserId(user.id);
      setUserName(fallbackName);
      setUserAvatarUri(avatarUrl);
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
      setUserAvatarUri("");
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

  useEffect(() => {
    const show = Keyboard.addListener("keyboardWillShow", () => {
      setKeyboardVisible(true);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    });
    const hide = Keyboard.addListener("keyboardWillHide", () => {
      setKeyboardVisible(false);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

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
    Keyboard.dismiss();
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
      const isDailyLimitError = String(error?.message || "").includes("assistant-daily-limit");

      if (isDailyLimitError) {
        // Server says the daily budget is spent — sync the local counter so the
        // limit alert shows immediately on the next attempt.
        setQuestionsUsedToday(dailyQuestionLimit);
        await setAssistantDailyUsage(assistantUserId, dailyQuestionLimit);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          text: isDailyLimitError
            ? "დღევანდელი კითხვების ლიმიტი უკვე ამოწურულია. ახალი კითხვები ხვალ განახლდება."
            : "ახლა პასუხის მიღება ვერ მოხერხდა. სცადე თავიდან ცოტა მოგვიანებით.",
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
    <LinearGradient
      colors={pregnancyMode
        ? isDark ? ["#25151B", "#140E12", "#120C10"] : ["#FFFDFC", "#FFEFF4", "#F8B5C9"]
        : isDark ? ["#2A1B2A", "#211621", "#17151D"] : ["#FFFDFC", "#FFF1EB", "#F6F0FF"]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={{ flex: 1 }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
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
            <View style={[styles.headerAssistantPortrait, { borderColor: theme.border }]}>
              <Image source={ASSISTANT_GUIDE_IMAGE} style={styles.headerAssistantImage} resizeMode="cover" />
            </View>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.chatScroll}
          contentContainerStyle={[styles.chatContent, { paddingBottom: 18 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() =>
            scrollRef.current?.scrollToEnd({ animated: true })
          }
        >
          <LinearGradient
            colors={theme.noticeGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.noticeCard, { borderColor: theme.border }]}
          >
            <View style={styles.noticeGlowPeach} />
            <View style={styles.noticeGlowLavender} />
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
                    <Image source={ASSISTANT_GUIDE_IMAGE} style={styles.assistantAvatarImage} resizeMode="cover" />
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
                      shadowColor: pregnancyMode && !isUser ? "#E48AA8" : undefined,
                      shadowOpacity: pregnancyMode && !isUser ? 0.08 : undefined,
                      shadowRadius: pregnancyMode && !isUser ? 10 : undefined,
                      shadowOffset: pregnancyMode && !isUser ? { width: 0, height: 6 } : undefined,
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
                {isUser && (
                  <View style={[styles.userMessageAvatar, { backgroundColor: `${theme.primary}18`, borderColor: `${theme.primary}40` }]}>
                    {userAvatarUri ? (
                      <Image source={{ uri: userAvatarUri }} style={styles.userMessageAvatarImage} resizeMode="cover" />
                    ) : userName ? (
                      <Text style={[styles.userMessageAvatarInitial, { color: theme.primary }]}>{userName.trim().charAt(0).toUpperCase()}</Text>
                    ) : (
                      <Ionicons name="person-outline" size={16} color={theme.primary} />
                    )}
                  </View>
                )}
              </View>
            );
          })}

          {sending && (
            <View style={styles.typingRow}>
              <View style={[styles.assistantAvatar, { backgroundColor: `${theme.primary}1A` }]}>
                <Image source={ASSISTANT_GUIDE_IMAGE} style={styles.assistantAvatarImage} resizeMode="cover" />
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
            {
              backgroundColor: pregnancyMode
                ? theme.composerBg
                : theme.composerBg,
              borderColor: theme.border,
              paddingBottom: keyboardVisible ? 8 : Math.max(insets.bottom, 8),
            },
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
              {
                backgroundColor: pregnancyMode
                  ? theme.input
                  : theme.input,
                borderColor: theme.border,
              },
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
              blurOnSubmit={false}
              onFocus={() => {
                setInputFocused(true);
                setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
              }}
              onBlur={() => setInputFocused(false)}
              style={[
                styles.input,
                { color: theme.text },
                !inputFocused && !input ? styles.inputCollapsed : styles.inputExpanded,
              ]}
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
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { paddingTop: 62, paddingHorizontal: 20, paddingBottom: 18, backgroundColor: "transparent" },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerCopy: { flex: 1, paddingRight: 14 },
  headerEyebrow: { color: "#FF8A6B", fontSize: 10, fontWeight: "900", letterSpacing: 0.8, marginBottom: 6 },
  headerTitle: { fontSize: 29, fontWeight: "900", letterSpacing: -0.5 },
  headerSubtitle: { marginTop: 6, fontSize: 14, fontWeight: "600", lineHeight: 20 },
  headerIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: "rgba(233,69,96,0.12)", alignItems: "center", justifyContent: "center" },
  headerAvatar: {
    shadowColor: "#D98976",
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  headerAssistantPortrait: {
    width: 58,
    height: 58,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.14)",
    shadowColor: "#D98976",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  headerAssistantImage: { width: "100%", height: "100%" },
  chatScroll: { flex: 1 },
  chatContent: { paddingHorizontal: 20, paddingBottom: 20 },
  noticeCard: {
    borderRadius: 26,
    padding: 18,
    borderWidth: 1,
    marginBottom: 20,
    overflow: "hidden",
    elevation: 5,
    shadowColor: "#D98976",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  noticeGlowPeach: { position: "absolute", width: 160, height: 160, borderRadius: 80, backgroundColor: "rgba(255,158,125,0.16)", top: -70, right: -48 },
  noticeGlowLavender: { position: "absolute", width: 170, height: 170, borderRadius: 85, backgroundColor: "rgba(184,164,255,0.14)", bottom: -78, left: -58 },
  noticeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 11 },
  noticeEyebrow: { color: "#FF8A6B", fontSize: 9, fontWeight: "900", letterSpacing: 0.95, marginBottom: 5 },
  noticeIcon: { width: 40, height: 40, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.72)", alignItems: "center", justifyContent: "center" },
  noticeTitle: { fontSize: 17, fontWeight: "900" },
  noticeText: { fontSize: 14, lineHeight: 21 },
  summaryLoadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  summaryGrid: { marginTop: 14, gap: 9 },
  summaryItem: { flex: 1, borderRadius: 16, padding: 12, backgroundColor: "rgba(255,255,255,0.34)", borderWidth: 1, borderColor: "rgba(255,255,255,0.44)" },
  summaryItemFull: { width: "100%", borderRadius: 16, padding: 12, backgroundColor: "rgba(255,255,255,0.34)", borderWidth: 1, borderColor: "rgba(255,255,255,0.44)" },
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
    shadowColor: "#D98976",
    shadowOpacity: 0.07,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 5 },
  },
  quickChipDisabled: { opacity: 0.45 },
  quickChipText: { fontSize: 12, fontWeight: "800" },
  messageRow: { marginBottom: 13, flexDirection: "row", alignItems: "flex-end", gap: 7 },
  messageRowLeft: { justifyContent: "flex-start" },
  messageRowRight: { justifyContent: "flex-end" },
  assistantAvatar: { width: 34, height: 34, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0, borderWidth: 1, borderColor: "rgba(255,255,255,0.45)", overflow: "hidden" },
  assistantAvatarImage: { width: "100%", height: "100%" },
  userMessageAvatar: {
    width: 34,
    height: 34,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderWidth: 1,
    overflow: "hidden",
  },
  userMessageAvatarImage: { width: "100%", height: "100%" },
  userMessageAvatarInitial: { fontSize: 14, fontWeight: "900" },
  messageBubble: {
    maxWidth: "84%",
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderWidth: 1,
    shadowColor: "#D98976",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
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
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 18,
    borderWidth: 1,
    borderRadius: 28,
    shadowColor: "#D98976",
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 14,
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
  inputWrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 6,
    shadowColor: "#D98976",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  inputCollapsed: {
    height: 40,
  },
  inputExpanded: {
    minHeight: 40,
    maxHeight: 120,
  },
  sendButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginBottom: 0,
  },
  sendButtonDisabled: { opacity: 0.5 },
  sendButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
});
