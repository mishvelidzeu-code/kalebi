import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useTheme } from "../context/ThemeContext";
import { isAdminEmail } from "../services/adminAccess";
import { supabase } from "../services/supabase";

const AVATAR_BUCKET = "avatars";

function isProfilePaidPrime(profile) {
  if (!profile?.is_premium) {
    return false;
  }

  if (!profile?.premium_until) {
    return true;
  }

  const timestamp = Date.parse(profile.premium_until);
  return Number.isNaN(timestamp) ? false : timestamp > Date.now();
}

// ─── Admin query engine ──────────────────────────────────────────────────────
async function runAdminQuery(text, stats) {
  const q = text.toLowerCase().trim();

  // ── Today count ──
  if (q.includes("დღეს") && (q.includes("დამ") || q.includes("რამდენ") || q.includes("ახალ"))) {
    const todayStart = dayjs().startOf("day").toISOString();
    const { data } = await supabase
      .from("profiles")
      .select("name, email, phone_number, created_at")
      .gte("created_at", todayStart)
      .order("created_at", { ascending: false });
    const count = data?.length || 0;
    if (count === 0) return "დღეს ჯერ არც ერთი მომხმარებელი არ დამატებულა.";
    const lines = (data || []).map(
      (p) => `• ${p.name || "უსახელო"} — ${p.phone_number || "ნომ. N/A"} (${p.email || ""})`
    );
    return `დღეს ${count} მომხმარებელი დაემატა:\n${lines.join("\n")}`;
  }

  // ── Phone lookup ──
  if (q.includes("ნომ") || q.includes("ტელ") || q.includes("phone") || q.includes("კონტაქ")) {
    // strip common words to get the name
    const cleaned = text
      .replace(/მომეცი|ნომერი|ტელეფონი|ნომ\.?|ტელ\.?|phone|კონტაქტი|სახელი|გვარი|ვისაც|ჰქვია|ამ/gi, "")
      .replace(/[?!.,]/g, "")
      .trim();
    if (cleaned.length >= 2) {
      const pattern = `%${cleaned}%`;
      const { data } = await supabase
        .from("profiles")
        .select("name, phone_number, email")
        .or(`name.ilike.${pattern},email.ilike.${pattern}`)
        .limit(5);
      if (!data?.length) return `"${cleaned}" სახელის მომხმარებელი ვერ მოიძებნა.`;
      return data
        .map((p) => `${p.name || "N/A"}: ${p.phone_number || "ნომ. N/A"} · ${p.email || ""}`)
        .join("\n");
    }
    return `გთხოვ, ჩაწერე სახელი ან გვარი: მაგ. "მომეცი მარიამის ნომერი"`;

  }

  // ── Latest user ──
  if (q.includes("ბოლო") || q.includes("უახლეს") || q.includes("ახალი") || q.includes("last")) {
    const { data } = await supabase
      .from("profiles")
      .select("name, email, phone_number, created_at, is_premium")
      .order("created_at", { ascending: false })
      .limit(3);
    if (!data?.length) return "მომხმარებლები ვერ მოიძებნა.";
    return data
      .map(
        (p) =>
          `${p.name || "უსახელო"} · ${p.email || ""} · ${p.phone_number || "N/A"} · ${dayjs(p.created_at).format("DD.MM.YYYY HH:mm")} · ${p.is_premium ? "Prime" : "Free"}`
      )
      .join("\n");
  }

  // ── Total count ──
  if (q.includes("სულ") || (q.includes("რამდენ") && !q.includes("დღეს"))) {
    return `სულ ${stats.users} მომხმარებელია.\nPaid Prime: ${stats.paidPremium}\nAdmin Prime: ${stats.adminPremium}\nPregnancy Paid: ${stats.pregnancyPaid}\nდღეს: ${stats.todayUsers}`;
  }

  // ── Premium / paid ──
  if (q.includes("prime") || q.includes("premium") || q.includes("გადახდ") || q.includes("paid")) {
    return `Paid Prime: ${stats.paidPremium}\nAdmin Prime: ${stats.adminPremium}\nPregnancy Paid: ${stats.pregnancyPaid}`;
  }

  // ── Email / name / phone lookup (generic) ──
  const safeQ = text.replace(/[(),]/g, " ").trim();
  if (safeQ.length >= 2) {
    const pattern = `%${safeQ}%`;
    const { data } = await supabase
      .from("profiles")
      .select("name, email, phone_number, is_premium, premium_override, goal, created_at")
      .or(`email.ilike.${pattern},name.ilike.${pattern},phone_number.ilike.${pattern}`)
      .limit(5);
    if (data?.length) {
      return data
        .map(
          (p) =>
            `${p.name || "N/A"} · ${p.email || ""} · ${p.phone_number || "N/A"} · ${p.is_premium || p.premium_override ? "Prime" : "Free"}`
        )
        .join("\n");
    }
  }

  return [
    "ვერ ვიპოვე. სცადე:",
    "- დღეს რამდენი დაემატა",
    "- მომეცი მარიამ ბერიძის ნომერი",
    "- სულ რამდენი მომხმარებელია",
    "- ბოლო დამატებული",
    "- ან ჩაწერე სახელი / email",
  ].join("\n");
}
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminScreen() {
  const router = useRouter();
  const { isDark, refreshTheme } = useTheme();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [avatarUrls, setAvatarUrls] = useState({});
  const [stats, setStats] = useState({
    users: 0,
    todayUsers: 0,
    paidPremium: 0,
    adminPremium: 0,
    pregnancyPaid: 0,
    withPhotos: 0,
  });
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [activeListTitle, setActiveListTitle] = useState("");
  const [savingId, setSavingId] = useState("");
  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");
  const [pushTarget, setPushTarget] = useState("me");
  const [pushEmail, setPushEmail] = useState("");
  const [pushSending, setPushSending] = useState(false);

  // image preview
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewName, setPreviewName] = useState("");

  // assistant
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantHistory, setAssistantHistory] = useState([]);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const scrollRef = useRef(null);

  const theme = {
    bg: isDark ? "#0F0F0F" : "#F7F8FA",
    card: isDark ? "#1A1A1A" : "#FFFFFF",
    text: isDark ? "#FFFFFF" : "#1A1A1A",
    subText: isDark ? "#AAAAAA" : "#777777",
    border: isDark ? "#2A2A2A" : "#EFEFF4",
    input: isDark ? "#242424" : "#FFFFFF",
    primary: isDark ? "#E94560" : "#ff4d88",
    good: "#06D6A0",
    assistantBg: isDark ? "#1E1025" : "#FFF0F5",
    assistantBubble: isDark ? "#2D1240" : "#FFE0EF",
    adminBubble: isDark ? "#1A2E20" : "#E0F7EF",
  };

  const checkAccess = useCallback(async () => {
    setCheckingAccess(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const allowed = isAdminEmail(user?.email || "");
      setHasAccess(allowed);
      if (!allowed) {
        Alert.alert("წვდომა შეზღუდულია", "ადმინ პანელი მხოლოდ ადმინისტრატორის ანგარიშისთვისაა.");
      }
    } catch (error) {
      console.log("Admin access check error:", error);
      setHasAccess(false);
    } finally {
      setCheckingAccess(false);
    }
  }, []);

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    try {
      const todayStart = dayjs().startOf("day").toISOString();
      const [
        usersCountRes,
        todayUsersRes,
        paidPremiumRes,
        adminPremiumCountRes,
        pregnancyPaidCountRes,
        withPhotosRes,
      ] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id, is_premium, premium_until").gte("created_at", todayStart),
        supabase.from("profiles").select("id, is_premium, premium_until").eq("is_premium", true),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("premium_override", true),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("has_pregnancy_subscription", true),
        supabase.from("profiles").select("id", { count: "exact", head: true }).not("avatar_path", "is", null).neq("avatar_path", ""),
      ]);

      setProfiles([]);
      setStats({
        users: usersCountRes.count || 0,
        todayUsers: (todayUsersRes.data || []).length,
        paidPremium: (paidPremiumRes.data || []).filter(isProfilePaidPrime).length,
        adminPremium: adminPremiumCountRes.count || 0,
        pregnancyPaid: pregnancyPaidCountRes.count || 0,
        withPhotos: withPhotosRes.count || 0,
      });
    } catch (error) {
      console.log("Admin data load error:", error);
      Alert.alert(
        "ადმინ მონაცემები ვერ ჩაიტვირთა",
        "შეამოწმე Supabase RLS policies. ადმინ პანელს profiles/cycles წაკითხვის უფლება სჭირდება."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAvatarUrls = useCallback(async (profileList) => {
    const withPaths = profileList.filter((p) => p.avatar_path);
    if (!withPaths.length) return;

    try {
      const paths = withPaths.map((p) => p.avatar_path);
      const { data } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrls(paths, 3600);
      if (!data) return;

      const urlMap = {};
      for (const item of data) {
        if (item.signedUrl && item.path) {
          const profile = withPaths.find((p) => p.avatar_path === item.path);
          if (profile) urlMap[profile.id] = item.signedUrl;
        }
      }
      setAvatarUrls((prev) => ({ ...prev, ...urlMap }));
    } catch (err) {
      console.log("Avatar URL batch error:", err);
    }
  }, []);

  useEffect(() => {
    checkAccess();
  }, [checkAccess]);

  useEffect(() => {
    if (hasAccess) {
      loadAdminData();
    }
  }, [hasAccess, loadAdminData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAdminData();
    setRefreshing(false);
  }, [loadAdminData]);

  const searchProfiles = useCallback(async (searchText) => {
    const needle = searchText.trim();
    if (needle.length < 2) {
      return;
    }

    setActiveListTitle("ძებნის შედეგები");
    setSearchLoading(true);
    try {
      const safeNeedle = needle.replace(/[(),]/g, " ").trim();
      const pattern = `%${safeNeedle}%`;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(safeNeedle);
      const queryBuilder = supabase
        .from("profiles")
        .select("id, email, name, phone_number, goal, is_premium, premium_until, premium_override, pregnancy_mode, has_pregnancy_subscription, avatar_path")
        .limit(20);

      const response = isUuid
        ? await queryBuilder.eq("id", safeNeedle)
        : await queryBuilder.or(`email.ilike.${pattern},name.ilike.${pattern},phone_number.ilike.${pattern},goal.ilike.${pattern}`);

      if (response.error) throw response.error;
      const list = response.data || [];
      setProfiles(list);
      loadAvatarUrls(list);
    } catch (error) {
      console.log("Admin search error:", error);
      setProfiles([]);
    } finally {
      setSearchLoading(false);
    }
  }, [loadAvatarUrls]);

  const loadProfileList = useCallback(async (type) => {
    setQuery("");
    setSearchLoading(true);
    try {
      const todayStart = dayjs().startOf("day").toISOString();
      let request = supabase
        .from("profiles")
        .select("id, email, name, phone_number, goal, is_premium, premium_until, premium_override, pregnancy_mode, has_pregnancy_subscription, avatar_path, created_at")
        .limit(50);

      if (type === "paid-prime") {
        request = request.eq("is_premium", true);
        setActiveListTitle("Paid Prime მომხმარებლები");
      } else if (type === "today") {
        request = request.gte("created_at", todayStart).order("created_at", { ascending: false });
        setActiveListTitle("დღეს დამატებული მომხმარებლები");
      } else if (type === "pregnancy-paid") {
        request = request.eq("has_pregnancy_subscription", true);
        setActiveListTitle("Pregnancy Paid მომხმარებლები");
      } else if (type === "with-photos") {
        request = request.not("avatar_path", "is", null).neq("avatar_path", "").order("created_at", { ascending: false });
        setActiveListTitle("სურათი ატვირთეს");
      }

      const { data, error } = await request;
      if (error) throw error;
      const list = type === "paid-prime" ? (data || []).filter(isProfilePaidPrime) : (data || []);
      setProfiles(list);
      loadAvatarUrls(list);
    } catch (error) {
      console.log("Admin list load error:", error);
      setProfiles([]);
    } finally {
      setSearchLoading(false);
    }
  }, [loadAvatarUrls]);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchProfiles(query);
    }, 350);

    return () => clearTimeout(timer);
  }, [query, searchProfiles]);

  const togglePremiumOverride = async (profile, value) => {
    setSavingId(profile.id);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ premium_override: value })
        .eq("id", profile.id);

      if (error) throw error;

      setProfiles((currentProfiles) =>
        currentProfiles.map((item) =>
          item.id === profile.id ? { ...item, premium_override: value } : item
        )
      );

      await refreshTheme();
    } catch (error) {
      console.log("Premium override update error:", error);
      Alert.alert(
        "შენახვა ვერ მოხერხდა",
        "ამ მოქმედებისთვის Supabase-ში admin update policy ან Edge Function დაგჭირდება."
      );
    } finally {
      setSavingId("");
    }
  };

  const sendPushNotification = async () => {
    const title = pushTitle.trim();
    const body = pushBody.trim();

    if (!title || !body) {
      Alert.alert("შეავსე შეტყობინება", "სათაური და ტექსტი აუცილებელია.");
      return;
    }

    setPushSending(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("session-token-not-found");
      }

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const functionUrl = `${supabaseUrl}/functions/v1/send-push-notification`;
      const response = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          title,
          body,
          target: pushTarget,
          email: pushTarget === "email" ? pushEmail.trim() : undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(`${response.status}: ${data?.error || data?.message || JSON.stringify(data)}`);
      }

      Alert.alert(
        "გაიგზავნა",
        `Target: ${data?.target || pushTarget}\nToken: ${data?.tokenCount ?? 0}`
      );
      setPushTitle("");
      setPushBody("");
      setPushEmail("");
      setPushTarget("me");
    } catch (error) {
      console.log("Send push error:", error);
      Alert.alert(
        "გაგზავნა ვერ მოხერხდა",
        error?.message || error?.context?.error || "სცადე თავიდან."
      );
    } finally {
      setPushSending(false);
    }
  };

  const handleAssistantSend = async () => {
    const text = assistantInput.trim();
    if (!text) return;

    setAssistantInput("");
    const userMsg = { role: "user", text };
    setAssistantHistory((prev) => [...prev, userMsg]);
    setAssistantLoading(true);

    try {
      const answer = await runAdminQuery(text, stats);
      setAssistantHistory((prev) => [...prev, { role: "admin", text: answer }]);
    } catch (err) {
      console.log("Assistant error:", err);
      setAssistantHistory((prev) => [
        ...prev,
        { role: "admin", text: "შეცდომა მოხდა. სცადე თავიდან." },
      ]);
    } finally {
      setAssistantLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 150);
    }
  };

  if (checkingAccess) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.primary} size="large" />
      </View>
    );
  }

  if (!hasAccess) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg, padding: 24 }]}>
        <Ionicons name="lock-closed" size={36} color={theme.primary} />
        <Text style={[styles.lockTitle, { color: theme.text }]}>წვდომა შეზღუდულია</Text>
        <Text style={[styles.lockText, { color: theme.subText }]}>
          შედი `mishvelidze.u@gmail.com` ანგარიშით, რომ ადმინ პანელი გაიხსნას.
        </Text>
        <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.primary }]} onPress={() => router.back()}>
          <Text style={styles.primaryBtnText}>უკან დაბრუნება</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.keyboardView, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.text }]}>ადმინ პანელი</Text>
            <Text style={[styles.subtitle, { color: theme.subText }]}>მომხმარებლები და Prime წვდომა</Text>
          </View>
        </View>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          <StatCard label="სულ" value={stats.users} theme={theme} />
          <StatCard label="დღეს დაემატა" value={stats.todayUsers} theme={theme} onPress={() => loadProfileList("today")} />
          <StatCard label="Paid Prime" value={stats.paidPremium} theme={theme} onPress={() => loadProfileList("paid-prime")} />
          <StatCard label="Admin Prime" value={stats.adminPremium} theme={theme} />
          <StatCard label="Pregnancy Paid" value={stats.pregnancyPaid} theme={theme} onPress={() => loadProfileList("pregnancy-paid")} />
          <StatCard
            label="სურათი ატვირთეს"
            value={stats.withPhotos}
            theme={theme}
            onPress={() => loadProfileList("with-photos")}
            accent="#9B59B6"
          />
        </View>

        {/* Search */}
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="ძებნა email-ით, სახელით, ტელეფონით ან user id-ით"
          placeholderTextColor={theme.subText}
          style={[styles.searchInput, { backgroundColor: theme.input, color: theme.text, borderColor: theme.border }]}
          autoCapitalize="none"
        />

        {/* Push notifications */}
        <View style={[styles.pushCard, { backgroundColor: theme.card }]}>
          <Text style={[styles.pushTitle, { color: theme.text }]}>Push შეტყობინება</Text>
          <TextInput
            value={pushTitle}
            onChangeText={setPushTitle}
            placeholder="სათაური"
            placeholderTextColor={theme.subText}
            style={[styles.pushInput, { backgroundColor: theme.input, color: theme.text, borderColor: theme.border }]}
          />
          <TextInput
            value={pushBody}
            onChangeText={setPushBody}
            placeholder="ტექსტი"
            placeholderTextColor={theme.subText}
            style={[styles.pushInput, styles.pushBodyInput, { backgroundColor: theme.input, color: theme.text, borderColor: theme.border }]}
            multiline
          />
          <View style={styles.targetRow}>
            {[
              ["me", "Me"],
              ["email", "Email"],
              ["all", "All"],
              ["paid_prime", "Paid Prime"],
              ["pregnancy_paid", "Pregnancy"],
              ["today_users", "Today"],
            ].map(([value, label]) => (
              <TouchableOpacity
                key={value}
                style={[
                  styles.targetChip,
                  { borderColor: theme.border, backgroundColor: pushTarget === value ? theme.primary : theme.input },
                ]}
                onPress={() => setPushTarget(value)}
              >
                <Text style={[styles.targetChipText, { color: pushTarget === value ? "#FFFFFF" : theme.text }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {pushTarget === "email" && (
            <TextInput
              value={pushEmail}
              onChangeText={setPushEmail}
              placeholder="მომხმარებლის email"
              placeholderTextColor={theme.subText}
              style={[styles.pushInput, { backgroundColor: theme.input, color: theme.text, borderColor: theme.border }]}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          )}
          <TouchableOpacity
            style={[styles.sendPushButton, { backgroundColor: theme.primary }, pushSending && { opacity: 0.65 }]}
            onPress={sendPushNotification}
            disabled={pushSending}
          >
            {pushSending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendPushButtonText}>Send Push</Text>}
          </TouchableOpacity>
        </View>

        {/* User list */}
        {loading ? (
          <ActivityIndicator color={theme.primary} style={{ marginTop: 30 }} />
        ) : (
          <View style={[styles.list, { backgroundColor: theme.card }]}>
            {!!activeListTitle && !searchLoading && profiles.length > 0 && (
              <Text style={[styles.listTitle, { color: theme.text }]}>{activeListTitle}</Text>
            )}

            {query.trim().length < 2 && !activeListTitle && (
              <Text style={[styles.emptyText, { color: theme.subText }]}>
                დააჭირე Paid Prime-ს, დღეს დამატებულს, Pregnancy Paid-ს ან სურათი ატვირთეს-ს, ან ჩაწერე მინიმუმ 2 სიმბოლო ძებნაში.
              </Text>
            )}

            {searchLoading && (
              <View style={styles.searchLoadingRow}>
                <ActivityIndicator color={theme.primary} size="small" />
                <Text style={[styles.searchLoadingText, { color: theme.subText }]}>ძებნა...</Text>
              </View>
            )}

            {!searchLoading &&
              profiles.map((profile, index) => (
                <View key={profile.id}>
                  <View style={styles.userRow}>
                    <TouchableOpacity
                      activeOpacity={avatarUrls[profile.id] ? 0.75 : 1}
                      onPress={() => {
                        if (avatarUrls[profile.id]) {
                          setPreviewUrl(avatarUrls[profile.id]);
                          setPreviewName(profile.name || "");
                        }
                      }}
                    >
                      <View style={[styles.avatarBox, { backgroundColor: theme.primary }]}>
                        {avatarUrls[profile.id] ? (
                          <Image
                            source={{ uri: avatarUrls[profile.id] }}
                            style={styles.avatarImage}
                            contentFit="cover"
                          />
                        ) : (
                          <Text style={styles.avatarText}>{(profile.name || "U").slice(0, 1).toUpperCase()}</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.userName, { color: theme.text }]} numberOfLines={1}>
                        {profile.name || "უსახელო მომხმარებელი"}
                      </Text>
                      <Text style={[styles.userMeta, { color: theme.subText }]} numberOfLines={1}>
                        {profile.email || "email ჯერ არ ჩანს"}
                      </Text>
                      <Text style={[styles.userMeta, { color: theme.subText }]} numberOfLines={1}>
                        {profile.phone_number || "ტელეფონი არ არის"} · {profile.goal || "მიზანი არ არის"}
                        {profile.has_pregnancy_subscription ? " · Pregnancy Paid" : profile.pregnancy_mode ? " · Pregnancy Mode" : ""}
                      </Text>
                      <Text style={[styles.userId, { color: theme.subText }]} numberOfLines={1}>
                        {profile.id}
                      </Text>
                    </View>
                    <View style={styles.switchBox}>
                      {savingId === profile.id ? (
                        <ActivityIndicator color={theme.primary} />
                      ) : (
                        <Switch
                          value={Boolean(profile.premium_override)}
                          onValueChange={(value) => togglePremiumOverride(profile, value)}
                          trackColor={{ true: theme.good, false: "#D5D5D5" }}
                        />
                      )}
                      <Text style={[styles.switchLabel, { color: profile.premium_override ? theme.good : theme.subText }]}>
                        {profile.premium_override ? "Admin Prime" : isProfilePaidPrime(profile) ? "Paid" : "Free"}
                      </Text>
                    </View>
                  </View>
                  {index < profiles.length - 1 && <View style={[styles.divider, { backgroundColor: theme.border }]} />}
                </View>
              ))}

            {!searchLoading && query.trim().length >= 2 && profiles.length === 0 && (
              <Text style={[styles.emptyText, { color: theme.subText }]}>მომხმარებელი ვერ მოიძებნა.</Text>
            )}
          </View>
        )}

        {/* Admin Assistant */}
        <View style={[styles.assistantCard, { backgroundColor: theme.card }]}>
          <View style={styles.assistantHeader}>
            <Ionicons name="sparkles" size={18} color={theme.primary} />
            <Text style={[styles.assistantTitle, { color: theme.text }]}>ადმინ ასისტენტი</Text>
          </View>
          <Text style={[styles.assistantHint, { color: theme.subText }]}>
            კითხე: „დღეს რამდენი დაემატა", „მომეცი მარიამის ნომერი", „სულ რამდენია", „ბოლო დამატებული" ...
          </Text>

          {assistantHistory.length > 0 && (
            <View style={styles.assistantChat}>
              {assistantHistory.map((msg, i) => (
                <View
                  key={i}
                  style={[
                    styles.bubble,
                    msg.role === "user"
                      ? [styles.bubbleUser, { backgroundColor: theme.assistantBubble }]
                      : [styles.bubbleAdmin, { backgroundColor: theme.adminBubble }],
                  ]}
                >
                  {msg.role === "admin" && (
                    <Text style={[styles.bubbleRole, { color: theme.good }]}>ადმინი ·</Text>
                  )}
                  <Text style={[styles.bubbleText, { color: theme.text }]}>{msg.text}</Text>
                </View>
              ))}
              {assistantLoading && (
                <View style={[styles.bubble, styles.bubbleAdmin, { backgroundColor: theme.adminBubble }]}>
                  <ActivityIndicator color={theme.primary} size="small" />
                </View>
              )}
            </View>
          )}

          <View style={[styles.assistantInputRow, { borderColor: theme.border, backgroundColor: theme.input }]}>
            <TextInput
              value={assistantInput}
              onChangeText={setAssistantInput}
              placeholder="შეკითხვა..."
              placeholderTextColor={theme.subText}
              style={[styles.assistantTextInput, { color: theme.text }]}
              onSubmitEditing={handleAssistantSend}
              returnKeyType="send"
              multiline={false}
            />
            <TouchableOpacity
              onPress={handleAssistantSend}
              disabled={assistantLoading || !assistantInput.trim()}
              style={[styles.assistantSendBtn, { backgroundColor: theme.primary }, (assistantLoading || !assistantInput.trim()) && { opacity: 0.4 }]}
            >
              <Ionicons name="arrow-up" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Full-screen image preview */}
      <Modal
        visible={!!previewUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewUrl(null)}
        statusBarTranslucent
      >
        <View style={styles.previewOverlay}>
          <StatusBar hidden />
          <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewUrl(null)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {!!previewName && (
            <Text style={styles.previewName}>{previewName}</Text>
          )}
          {!!previewUrl && (
            <Image
              source={{ uri: previewUrl }}
              style={styles.previewImage}
              contentFit="contain"
            />
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function StatCard({ label, value, theme, onPress, accent }) {
  const Component = onPress ? TouchableOpacity : View;
  const color = accent || theme.primary;
  return (
    <Component style={[styles.statCard, { backgroundColor: theme.card }]} onPress={onPress} activeOpacity={0.82}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.subText }]}>{label}</Text>
      {onPress && <Ionicons name="chevron-forward" size={12} color={theme.subText} style={{ marginTop: 4 }} />}
    </Component>
  );
}

const styles = StyleSheet.create({
  keyboardView: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 20 },
  scrollContent: { paddingTop: 58, paddingBottom: 120 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 22 },
  backButton: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 28, fontWeight: "900" },
  subtitle: { fontSize: 14, marginTop: 3, fontWeight: "600" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 18 },
  statCard: { flexGrow: 1, flexBasis: "47%", borderRadius: 18, paddingVertical: 18, alignItems: "center" },
  statValue: { fontSize: 24, fontWeight: "900" },
  statLabel: { fontSize: 12, fontWeight: "700", marginTop: 4 },
  searchInput: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 15, fontSize: 15, marginBottom: 16 },
  pushCard: { borderRadius: 24, padding: 16, marginBottom: 16 },
  pushTitle: { fontSize: 16, fontWeight: "900", marginBottom: 12 },
  pushInput: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, marginBottom: 10 },
  pushBodyInput: { minHeight: 82, textAlignVertical: "top" },
  targetRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  targetChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  targetChipText: { fontSize: 12, fontWeight: "800" },
  sendPushButton: { borderRadius: 16, paddingVertical: 14, alignItems: "center" },
  sendPushButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  list: { borderRadius: 24, overflow: "hidden", marginBottom: 16 },
  listTitle: { fontSize: 15, fontWeight: "900", paddingHorizontal: 18, paddingTop: 18 },
  userRow: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  avatarBox: { width: 46, height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImage: { width: "100%", height: "100%" },
  avatarText: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" },
  userName: { fontSize: 16, fontWeight: "800" },
  userMeta: { fontSize: 12, marginTop: 3 },
  userId: { fontSize: 10, marginTop: 5 },
  switchBox: { alignItems: "center", minWidth: 82 },
  switchLabel: { fontSize: 11, fontWeight: "800", marginTop: 4 },
  divider: { height: 1, marginLeft: 74 },
  emptyText: { padding: 24, textAlign: "center", fontWeight: "700" },
  searchLoadingRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  searchLoadingText: { fontSize: 14, fontWeight: "700" },
  lockTitle: { fontSize: 22, fontWeight: "900", marginTop: 16 },
  lockText: { textAlign: "center", lineHeight: 22, marginTop: 8, marginBottom: 22 },
  primaryBtn: { borderRadius: 18, paddingHorizontal: 22, paddingVertical: 15 },
  primaryBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  // image preview modal
  previewOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", alignItems: "center", justifyContent: "center" },
  previewClose: { position: "absolute", top: 54, right: 20, zIndex: 10, width: 44, height: 44, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 22 },
  previewName: { position: "absolute", top: 60, alignSelf: "center", color: "#fff", fontSize: 16, fontWeight: "800" },
  previewImage: { width: "100%", height: "80%" },
  // assistant
  assistantCard: { borderRadius: 24, padding: 16, marginBottom: 16 },
  assistantHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  assistantTitle: { fontSize: 16, fontWeight: "900" },
  assistantHint: { fontSize: 12, fontWeight: "600", marginBottom: 12, lineHeight: 18 },
  assistantChat: { gap: 8, marginBottom: 12 },
  bubble: { borderRadius: 16, padding: 12, maxWidth: "90%" },
  bubbleUser: { alignSelf: "flex-end" },
  bubbleAdmin: { alignSelf: "flex-start" },
  bubbleRole: { fontSize: 10, fontWeight: "900", marginBottom: 3 },
  bubbleText: { fontSize: 13, fontWeight: "600", lineHeight: 19 },
  assistantInputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
  },
  assistantTextInput: { flex: 1, fontSize: 14, paddingVertical: 4 },
  assistantSendBtn: { width: 32, height: 32, borderRadius: 999, alignItems: "center", justifyContent: "center" },
});
