import dayjs from "dayjs";
import "dayjs/locale/ka";
import DateTimePicker from "@react-native-community/datetimepicker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Notifications from "expo-notifications";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, AppState, Modal, Platform, Pressable, RefreshControl, ScrollView, StatusBar, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";

import { useTheme } from "../../context/ThemeContext";
import { usePregnancy } from "../../context/PregnancyContext";
import { TEMP_FERTILITY_COMING_SOON } from "../../constants/tempFlags";
import { invalidateAssistantContextCache } from "../../services/assistantOrchestrator";
import { disableCycleReminders, getNotificationsEnabled, setNotificationsEnabled, syncCycleRemindersForUser } from "../../services/notifications";
import {
  resetPurchasesIdentity,
  hasAndroidPregnancyCheckoutConfigured,
  getPregnancyOfferings,
  openAndroidPregnancyCheckout,
  purchasePregnancyPackage,
  checkPregnancySubscriptionStatus,
  recordPregnancyPurchaseContext,
} from "../../services/purchases";
import { supabase } from "../../services/supabase";

dayjs.locale("ka");

const getAvatarStorageKey = (userId) => `@cycle-care/avatar/${userId}`;
const AVATAR_BUCKET = "avatars";

const getMimeType = (extension) => {
  switch (extension) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "jpeg":
    case "jpg":
    default:
      return "image/jpeg";
  }
};

const base64ToArrayBuffer = (base64) => {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
};

const getFileExtension = (asset) => {
  const fileName = asset?.fileName || "";
  const fileNameParts = fileName.split(".");
  if (fileNameParts.length > 1) {
    return fileNameParts.pop().toLowerCase();
  }

  const mimeType = asset?.mimeType || "";
  if (mimeType.includes("/")) {
    return mimeType.split("/")[1].toLowerCase();
  }

  return "jpg";
};


export default function ProfileScreen() {
  const router = useRouter();
  const { openFertility } = useLocalSearchParams();
  const { usePremiumTheme, setUsePremiumTheme, isDark, isAdmin, isTestAccount, testPrimeEnabled, setTestPrimeEnabled } = useTheme();
  const { pregnancyMode, pregnancyStartDate, currentWeek, hasSubscription, enablePregnancyMode, updatePregnancyStartDate, disablePregnancyMode, reload: reloadPregnancy } = usePregnancy();
  // Fertility mode reuses the "pregnancy" RevenueCat entitlement — selecting the
  // goal is free, but the tailored AI/advice content stays locked until paid.
  // Test accounts get it without paying; see services/adminAccess.js.
  const freeModeAccess = isAdmin || isTestAccount;
  const fertilityUnlocked = freeModeAccess || hasSubscription;

  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [avatarUri, setAvatarUri] = useState("");
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [cycleLength, setCycleLength] = useState("28");
  const [periodLength, setPeriodLength] = useState("5");
  const [goal, setGoal] = useState("ციკლის კონტროლი");
  const [notifications, setNotifications] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showCycleModal, setShowCycleModal] = useState(false);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [showPregnancyModal, setShowPregnancyModal] = useState(false);
  const [pregnancyModalMode, setPregnancyModalMode] = useState("enable");
  const [showFertilityModal, setShowFertilityModal] = useState(false);
  const [selectedPregnancyDate, setSelectedPregnancyDate] = useState(new Date());
  const [pregnancySaving, setPregnancySaving] = useState(false);
  const [fertilitySaving, setFertilitySaving] = useState(false);
  const [pendingAndroidCheckout, setPendingAndroidCheckout] = useState(null);
  const [tempName, setTempName] = useState("");
  const [tempPhoneNumber, setTempPhoneNumber] = useState("");

  const goalOptions = ["ციკლის კონტროლი", "დაორსულება", "ჯანმრთელობის მონიტორინგი"];
  // Display-only rename — the stored goal value stays "დაორსულება" so existing
  // comparisons/DB rows and the AI's internal goal mapping keep working.
  const FERTILITY_MODE_LABEL = "მინდა დაორსულება";
  const getGoalLabel = (value) => (value === "დაორსულება" ? FERTILITY_MODE_LABEL : value);

  // TEMP: fertility mode is blocked while it is being finished — every entry
  // point shows this alert instead of the paywall (see constants/tempFlags.js).
  const showFertilityComingSoon = () => {
    Alert.alert("მალე დაემატება 🌿", `"${FERTILITY_MODE_LABEL}" რეჟიმი მალე გაეშვება — ცოტაც მოითმინე.`);
  };

  const openFertilityFlow = () => {
    if (TEMP_FERTILITY_COMING_SOON) {
      showFertilityComingSoon();
      return;
    }
    setShowFertilityModal(true);
  };

  // Home-screen "მინდა დაორსულება" banner deep-links here with a timestamp
  // param so each tap re-opens the fertility modal.
  useEffect(() => {
    if (openFertility) {
      openFertilityFlow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openFertility]);

  useEffect(() => {
    loadProfile();
    loadNotificationState();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") {
      return undefined;
    }

    const subscription = AppState.addEventListener("change", async (nextState) => {
      if (nextState !== "active" || !pendingAndroidCheckout) {
        return;
      }

      const pendingCheckout = pendingAndroidCheckout;
      setPendingAndroidCheckout(null);

      try {
        const status = await checkPregnancySubscriptionStatus();
        await Promise.all([reloadPregnancy(), loadProfile()]);

        if (!status.hasSubscription) {
          return;
        }

        // Analytics-only marker for which screen drove this web-checkout purchase.
        await recordPregnancyPurchaseContext(pendingCheckout.type);

        if (pendingCheckout.type === "pregnancy") {
          await enablePregnancyMode(pendingCheckout.dateStr);
          setShowPregnancyModal(false);
          setSelectedPregnancyDate(null);
          Alert.alert("ორსულობის რეჟიმი ჩაირთო", "გადახდა დადასტურდა და ორსულობის რეჟიმი ჩაირთო.");
          return;
        }

        await updateGoalMode("დაორსულება");
        setShowFertilityModal(false);
        Alert.alert(`"${FERTILITY_MODE_LABEL}" ჩაირთო`, "გადახდა დადასტურდა და დაგეგმვის რეჟიმი ჩაირთო.");
      } catch (error) {
        console.log("Android pregnancy checkout refresh error:", error);
        Alert.alert("შეცდომა", "გადახდის სტატუსის განახლება ვერ მოხერხდა. სცადე ხელახლა.");
      }
    });

    return () => subscription.remove();
  }, [enablePregnancyMode, pendingAndroidCheckout, reloadPregnancy]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadProfile(), loadNotificationState(), reloadPregnancy()]);
    setRefreshing(false);
  }, [reloadPregnancy]);

  const startAndroidPregnancyCheckout = useCallback(async (payload) => {
    if (!hasAndroidPregnancyCheckoutConfigured()) {
      throw new Error("android-pregnancy-payment-url-not-configured");
    }

    // payload.type ("fertility" | "pregnancy") doubles as the analytics context.
    await openAndroidPregnancyCheckout({ context: payload?.type || null });
    setPendingAndroidCheckout(payload);
  }, []);

  const loadNotificationState = async () => {
    try {
      const [notificationsEnabled, { status }] = await Promise.all([getNotificationsEnabled(), Notifications.getPermissionsAsync()]);
      const permissionGranted = status === "granted";

      setNotifications(notificationsEnabled && permissionGranted);

      if (notificationsEnabled && permissionGranted) {
        await syncCycleRemindersForUser();
      }
    } catch (error) {
      console.log("Notification state load error:", error);
      setNotifications(false);
    }
  };

  const loadProfile = async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      setUserId(user.id);
      setEmail(user.email);
      const nameFromEmail = user.email.split("@")[0];
      try {
        await supabase.from("profiles").update({ email: user.email }).eq("id", user.id);
      } catch (emailSyncError) {
        console.log("Profile email sync skipped:", emailSyncError);
      }
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();

      if (data) {
        setCycleLength(String(data.cycle_length || 28));
        setPeriodLength(String(data.period_length || 5));
        setUserName(data.name || nameFromEmail);
        setPhoneNumber(data.phone_number || "");
        setTempName(data.name || nameFromEmail);
        setTempPhoneNumber(data.phone_number || "");
        await loadStoredAvatar(user.id, data.avatar_path);
        setGoal(data.goal || "ციკლის კონტროლი");
      }
    } catch (err) {
      console.log("Profile load error:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadStoredAvatar = async (nextUserId, avatarPath = "") => {
    try {
      if (avatarPath) {
        const { data, error } = await supabase.storage
          .from(AVATAR_BUCKET)
          .createSignedUrl(avatarPath, 60 * 60);

        if (error) throw error;

        setAvatarUri(data.signedUrl);
        return;
      }

      const storedAvatarUri = await AsyncStorage.getItem(getAvatarStorageKey(nextUserId));
      if (!storedAvatarUri) {
        setAvatarUri("");
        return;
      }

      const fileInfo = await FileSystem.getInfoAsync(storedAvatarUri);
      if (!fileInfo.exists) {
        await AsyncStorage.removeItem(getAvatarStorageKey(nextUserId));
        setAvatarUri("");
        return;
      }

      setAvatarUri(storedAvatarUri);
    } catch (error) {
      console.log("Avatar load error:", error);
      setAvatarUri("");
    }
  };

  const openProfileEditModal = () => {
    setTempName(userName);
    setTempPhoneNumber(phoneNumber);
    setShowProfileEdit(true);
  };

  const handleAvatarPress = async () => {
    try {
      const targetUserId = userId || (await supabase.auth.getUser()).data.user?.id;
      if (!targetUserId) return;

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("წვდომა საჭიროა", "გთხოვთ, ფოტოების წვდომა ჩართოთ რომ პროფილის სურათი აირჩიოთ.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      setAvatarSaving(true);

      const pickedAsset = result.assets[0];
      const extension = getFileExtension(pickedAsset);
      const avatarPath = `${targetUserId}/avatar.${extension}`;
      const base64 = await FileSystem.readAsStringAsync(pickedAsset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const fileBody = base64ToArrayBuffer(base64);

      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(avatarPath, fileBody, {
          contentType: getMimeType(extension),
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ avatar_path: avatarPath })
        .eq("id", targetUserId);

      if (profileError) throw profileError;

      await AsyncStorage.removeItem(getAvatarStorageKey(targetUserId));
      await loadStoredAvatar(targetUserId, avatarPath);
    } catch (error) {
      console.log('Avatar save error:', error);
      const message = String(error?.message || error?.error_description || error || '');
      if (message.includes('ExponentImagePicker')) {
        Alert.alert('build საჯიროა', 'პროფილის სურათის არჩევისთვის iOS dev build გცირდება.');
      } else if (message.toLowerCase().includes('bucket')) {
        Alert.alert('Storage Bucket', 'avatars bucket არ არსებობს — Supabase → Storage → New Bucket → avatars.');
      } else if (message.includes('row-level') || message.includes('policy') || message.includes('403') || message.includes('permission')) {
        Alert.alert('Storage Policy', 'Supabase → Storage → avatars → Policies → INSERT for authenticated users.');
      } else {
        Alert.alert('შეცდომა', message || 'სურათის ატვირთვა ვერ მოხდა.');
      }
    } finally {
      setAvatarSaving(false);
    }
  };

    const handleNotificationToggle = async (value) => {
    try {
      if (!value) {
        await disableCycleReminders();
        setNotifications(false);
        return;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted") {
        await setNotificationsEnabled(false);
        Alert.alert("წვდომა უარყოფილია", "გთხოვთ, ჩართოთ შეტყობინებები ტელეფონის პარამეტრებიდან.");
        setNotifications(false);
        return;
      }

      await setNotificationsEnabled(true);
      await syncCycleRemindersForUser();
      setNotifications(true);

      /*
      try {

        await Notifications.scheduleNotificationAsync({
          content: {
            title: "შეტყობინებები აქტიურია! ✨",
            body: "თქვენ მიიღებთ შეხსენებებს ციკლის მოახლოების შესახებ.",
          },
          trigger: { seconds: 2 },
        });
      } catch (tokenError) {
        console.log("Push Token Error:", tokenError);
      }
      */
    } catch (e) {
      console.log("Notification Logic Error:", e);
      Alert.alert("შეცდომა", "სისტემური ხარვეზი შეტყობინებების ჩართვისას.");
      setNotifications(false);
    }
  };

  const exportUserData = async () => {
    try {
      setSaving(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: cycles } = await supabase.from("cycles").select("*").eq("user_id", user.id).order("start_date", { ascending: false });
      let reportText = `HEALTH REPORT\nUser: ${userName}\nGoal: ${goal}\nDate: ${new Date().toLocaleDateString()}\n\nCycle History:\n`;

      if (cycles && cycles.length > 0) {
        cycles.forEach((c, i) => {
          reportText += `${i + 1}. Start: ${c.start_date} | Length: ${c.cycle_length} days\n`;
        });
      } else {
        reportText += "No history data found.\n";
      }

      const fileUri = FileSystem.documentDirectory + "Cycle_Report.txt";
      await FileSystem.writeAsStringAsync(fileUri, reportText);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert("შეცდომა", "გაზიარება შეუძლებელია ამ მოწყობილობაზე");
      }
    } catch (error) {
      console.error(error);
      Alert.alert("შეცდომა", "ექსპორტი ვერ განხორციელდა");
    } finally {
      setSaving(false);
    }
  };

  const theme = {
    bg: pregnancyMode ? (isDark ? "#181015" : "#FFF8FA") : isDark ? "#211621" : "#FFFDFC",
    headerBg: pregnancyMode ? (isDark ? "rgba(36,24,31,0.84)" : "rgba(255,255,255,0.72)") : isDark ? "rgba(67,49,72,0.82)" : "rgba(255,255,255,0.78)",
    card: pregnancyMode ? (isDark ? "rgba(36,24,31,0.84)" : "rgba(255,255,255,0.72)") : isDark ? "rgba(55,40,58,0.86)" : "rgba(255,255,255,0.78)",
    text: pregnancyMode ? (isDark ? "#FFF5F8" : "#2F2026") : isDark ? "#FFF7FB" : "#2F2026",
    subText: pregnancyMode ? (isDark ? "#D7B9C4" : "#8E6273") : isDark ? "#E9C7D4" : "#8F6574",
    primary: "#FF4D88",
    divider: pregnancyMode ? (isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.58)") : isDark ? "rgba(255,209,224,0.12)" : "rgba(255,255,255,0.64)",
    input: pregnancyMode ? (isDark ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.62)") : isDark ? "rgba(255,209,224,0.10)" : "rgba(255,255,255,0.68)",
    logoutBg: pregnancyMode ? (isDark ? "rgba(255,77,136,0.10)" : "rgba(255,255,255,0.56)") : isDark ? "rgba(255,77,136,0.10)" : "#FFEBEB",
    switchTrackOff: isDark ? "#34343A" : "#D7DCE4",
    switchThumbOff: isDark ? "#F5F5F7" : "#FFFFFF",
    switchThumbOn: "#FFFFFF",
    pickerBg: pregnancyMode ? (isDark ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.62)") : isDark ? "rgba(255,209,224,0.10)" : "#F8F1F4",
    pickerBorder: pregnancyMode ? (isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.82)") : isDark ? "rgba(255,209,224,0.16)" : "#F3D7E1",
    border: pregnancyMode ? (isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.82)") : isDark ? "rgba(255,209,224,0.16)" : "rgba(255,255,255,0.78)",
    glass: pregnancyMode ? (isDark ? "rgba(44,29,37,0.72)" : "rgba(255,255,255,0.58)") : isDark ? "rgba(67,49,72,0.72)" : "rgba(255,255,255,0.66)",
    activeSoft: pregnancyMode ? (isDark ? "rgba(255,77,136,0.18)" : "rgba(255,77,136,0.12)") : isDark ? "rgba(255,77,136,0.18)" : "rgba(255,77,136,0.12)",
    activeBorder: pregnancyMode ? (isDark ? "rgba(255,144,177,0.35)" : "rgba(255,77,136,0.35)") : isDark ? "rgba(255,144,177,0.35)" : "rgba(255,77,136,0.35)",
    cardGradient: pregnancyMode
      ? isDark ? ["rgba(58,38,48,0.94)", "rgba(28,18,24,0.84)"] : ["rgba(255,255,255,0.9)", "rgba(255,234,241,0.82)"]
      : isDark ? ["rgba(68,48,70,0.96)", "rgba(35,26,42,0.94)"] : ["rgba(255,255,255,0.94)", "rgba(255,240,232,0.84)", "rgba(246,240,255,0.82)"],
    heroGradient: pregnancyMode
      ? isDark ? ["rgba(58,38,48,0.96)", "rgba(35,22,29,0.9)"] : ["rgba(255,255,255,0.94)", "rgba(255,231,239,0.94)"]
      : isDark ? ["rgba(68,48,70,0.96)", "rgba(35,26,42,0.94)"] : ["rgba(255,255,255,0.94)", "rgba(255,242,232,0.9)", "rgba(246,240,255,0.86)"],
  };
  const rootGradient = pregnancyMode
    ? isDark ? ["#25151B", "#140E12", "#120C10"] : ["#FFFDFC", "#FFEFF4", "#F8B5C9"]
    : isDark ? ["#2A1B2A", "#211621", "#17151D"] : ["#FFFDFC", "#FFF1EB", "#F6F0FF"];
  const glassBlockStyle = { backgroundColor: theme.glass, borderColor: theme.border, borderWidth: 1 };

  const saveSettings = async (hideModalCallback = null, specificFields = {}) => {
    const finalName = tempName.trim() !== "" ? tempName : userName;
    const finalPhoneNumber = tempPhoneNumber.trim();

    if (!finalPhoneNumber) {
      Alert.alert("შეავსე ნომერი", "ტელეფონის ნომერი სავალდებულოა.");
      return;
    }

    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const newCycle = Number(cycleLength);
      const newPeriod = Number(periodLength);

      const payload = {
        id: user.id,
        email: user.email,
        name: finalName,
        phone_number: finalPhoneNumber,
        cycle_length: newCycle,
        period_length: newPeriod,
        goal: specificFields.goal || goal,
        ...specificFields,
      };

      const { error: profileError } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
      if (profileError) throw profileError;
      invalidateAssistantContextCache();

      if (!specificFields.goal) {
        const { data: cycles } = await supabase.from("cycles").select("*").eq("user_id", user.id).order("start_date", { ascending: false }).limit(1);
        if (cycles && cycles.length > 0) {
          await supabase.from("cycles").update({ period_length: newPeriod, cycle_length: newCycle }).eq("id", cycles[0].id);
        }

        await syncCycleRemindersForUser();
      }

      setUserName(finalName);
      setPhoneNumber(finalPhoneNumber);
      if (hideModalCallback) hideModalCallback();
      Alert.alert("წარმატება ✨", "მონაცემები განახლდა");
    } catch {
      Alert.alert("შეცდომა", "მონაცემების შენახვა ვერ მოხერხდა");
    } finally {
      setSaving(false);
    }
  };

  const updateGoalMode = async (nextGoal) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("user-not-found");

    const finalName = tempName.trim() !== "" ? tempName : userName;
    const finalPhoneNumber = tempPhoneNumber.trim() || phoneNumber;

    const payload = {
      id: user.id,
      email: user.email,
      name: finalName,
      phone_number: finalPhoneNumber,
      cycle_length: Number(cycleLength),
      period_length: Number(periodLength),
      goal: nextGoal,
    };

    const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
    if (error) throw error;

    setGoal(nextGoal);
    invalidateAssistantContextCache();
  };

  const handlePregnancyEnable = async (overrideStartDate = null) => {
    setPregnancySaving(true);
    try {
      const fallbackDate = selectedPregnancyDate instanceof Date ? selectedPregnancyDate : new Date();
      const dateStr = overrideStartDate || dayjs(fallbackDate).format("YYYY-MM-DD");

      if (freeModeAccess) {
        await enablePregnancyMode(dateStr);
        setShowPregnancyModal(false);
        setSelectedPregnancyDate(null);
        Alert.alert("ორსულობის რეჟიმი ჩაირთო ✨", "წვდომა გააქტიურდა შეზღუდვების გარეშე.");
        return;
      }

      if (hasSubscription) {
        await enablePregnancyMode(dateStr);
        setShowPregnancyModal(false);
        setSelectedPregnancyDate(null);
        Alert.alert("ორსულობის რეჟიმი ჩაირთო ✨", "აპლიკაცია ახლა მორგებულია შენი ორსულობისთვის.");
        return;
      }

      if (Platform.OS === "android") {
        const status = await checkPregnancySubscriptionStatus();
        if (status.hasSubscription) {
          await enablePregnancyMode(dateStr);
          setShowPregnancyModal(false);
          setSelectedPregnancyDate(null);
          Alert.alert("ორსულობის რეჟიმი ჩაირთო", "ანგარიშზე უკვე გაქვს აქტიური წვდომა და რეჟიმი ჩაირთო.");
          return;
        }

        await startAndroidPregnancyCheckout({ type: "pregnancy", dateStr });
        Alert.alert("გადახდა გაიხსნა", "გააგრძელე გადახდა ვებსაიტზე. აპში დაბრუნების შემდეგ სტატუსი ავტომატურად განახლდება.");
        return;
      }

      const { configured, availablePackage } = await getPregnancyOfferings();

      if (!configured) {
        // RevenueCat not set up (dev/simulator) — enable directly for testing
        await enablePregnancyMode(dateStr);
      } else {
        const status = await checkPregnancySubscriptionStatus();
        if (status.hasSubscription) {
          await enablePregnancyMode(dateStr);
        } else if (availablePackage) {
          const result = await purchasePregnancyPackage(availablePackage, { context: "pregnancy" });
          if (result.hasSubscription) {
            await enablePregnancyMode(dateStr);
          } else {
            Alert.alert("შეცდომა", "გადახდა ვერ მოხდა. სცადეთ თავიდან.");
            return;
          }
        } else {
          Alert.alert("შეცდომა", "გამოწერა ვერ მოიძებნა. სცადეთ მოგვიანებით.");
          return;
        }
      }

      setShowPregnancyModal(false);
      setSelectedPregnancyDate(null);
      Alert.alert("ორსულობის რეჟიმი ჩაირთო ✨", "აპლიკაცია ახლა მორგებულია შენი ორსულობისთვის.");
    } catch (error) {
      if (error?.userCancelled || error?.code === "1") {
        // user tapped Cancel on the App Store sheet — silent
      } else {
        Alert.alert("შეცდომა", "ვერ ჩაირთო ორსულობის რეჟიმი.");
      }
    } finally {
      setPregnancySaving(false);
    }
  };

  const handlePregnancyDateUpdate = async () => {
    setPregnancySaving(true);
    try {
      const fallbackDate = pregnancyStartDate ? dayjs(pregnancyStartDate).toDate() : new Date();
      const nextDate = selectedPregnancyDate instanceof Date ? selectedPregnancyDate : fallbackDate;
      const dateStr = dayjs(nextDate).format("YYYY-MM-DD");

      await updatePregnancyStartDate(dateStr);
      invalidateAssistantContextCache();
      setShowPregnancyModal(false);
      Alert.alert("თარიღი განახლდა ✨", "ორსულობის კვირა და კალენდარი ახალი თარიღით გადაითვლება.");
    } catch (error) {
      console.log("Pregnancy date update error:", error);
      Alert.alert("შეცდომა", "ორსულობის თარიღის შეცვლა ვერ მოხერხდა.");
    } finally {
      setPregnancySaving(false);
    }
  };

  const handlePregnancyModalSubmit = () => {
    if (pregnancyModalMode === "edit") {
      handlePregnancyDateUpdate();
      return;
    }

    handlePregnancyEnable();
  };

  const openPregnancyDateEditor = () => {
    setSelectedPregnancyDate(pregnancyStartDate ? dayjs(pregnancyStartDate).toDate() : new Date());
    setPregnancyModalMode("edit");
    setShowPregnancyModal(true);
  };

  const handlePregnancyDisable = () => {
    Alert.alert(
      "ორსულობის რეჟიმის გამორთვა",
      "ნამდვილად გსურს ჩვეულებრივ რეჟიმზე დაბრუნება? ორსულობის მონაცემები შეინახება.\n\nგამოწერის გასაუქმებლად გადადი App Store → გამოწერები.",
      [
        { text: "გაუქმება", style: "cancel" },
        {
          text: "გამორთვა",
          style: "destructive",
          onPress: async () => {
            await disablePregnancyMode();
            Alert.alert("დაბრუნდი ✨", "ჩვეულებრივი ციკლის რეჟიმი ჩაირთო.");
          },
        },
      ]
    );
  };

  const handlePregnancyActivePress = () => {
    Alert.alert(
      "ორსულობის რეჟიმი",
      "შეგიძლია შეცვალო ბოლო მენსტრუაციის თარიღი ან გამორთო ორსულობის რეჟიმი.",
      [
        { text: "გაუქმება", style: "cancel" },
        { text: "თარიღის შეცვლა", onPress: openPregnancyDateEditor },
        { text: "გამორთვა", style: "destructive", onPress: handlePregnancyDisable },
      ]
    );
  };

  const handlePregnancyEntryPress = async () => {
    if (freeModeAccess || hasSubscription) {
      setSelectedPregnancyDate(pregnancyStartDate ? dayjs(pregnancyStartDate).toDate() : new Date());
      setPregnancyModalMode("enable");
      setShowPregnancyModal(true);
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("pregnancy_start_date, has_pregnancy_subscription")
          .eq("id", user.id)
          .maybeSingle();

        if (data?.has_pregnancy_subscription) {
          setSelectedPregnancyDate(data.pregnancy_start_date ? dayjs(data.pregnancy_start_date).toDate() : new Date());
          setPregnancyModalMode("enable");
          setShowPregnancyModal(true);
          return;
        }
      }
    } catch (error) {
      console.log("Pregnancy access check error:", error);
    }

    setSelectedPregnancyDate(new Date());
    setPregnancyModalMode("enable");
    setShowPregnancyModal(true);
  };

  const handleFertilityEnable = async () => {
    // TEMP: hard-blocked for everyone (admin included) while the mode is being
    // finished — no activation, no payment. See constants/tempFlags.js.
    if (TEMP_FERTILITY_COMING_SOON) {
      setShowFertilityModal(false);
      showFertilityComingSoon();
      return;
    }

    setFertilitySaving(true);
    try {
      if (freeModeAccess) {
        await updateGoalMode("დაორსულება");
        setShowFertilityModal(false);
        Alert.alert(`"${FERTILITY_MODE_LABEL}" ჩაირთო ✨`, "წვდომა გააქტიურდა შეზღუდვების გარეშე.");
        return;
      }

      if (Platform.OS === "android") {
        const status = await checkPregnancySubscriptionStatus();
        if (status.hasSubscription) {
          await updateGoalMode("დაორსულება");
          await reloadPregnancy();
          setShowFertilityModal(false);
          Alert.alert(`"${FERTILITY_MODE_LABEL}" ჩაირთო`, "ანგარიშზე უკვე გაქვს აქტიური წვდომა.");
          return;
        }

        await startAndroidPregnancyCheckout({ type: "fertility" });
        Alert.alert("გადახდა გაიხსნა", "გააგრძელე გადახდა ვებსაიტზე. აპში დაბრუნების შემდეგ სტატუსი ავტომატურად განახლდება.");
        return;
      }

      const { configured, availablePackage } = await getPregnancyOfferings();

      if (!configured) {
        // Without offerings we cannot grant access (fertilityUnlocked needs the
        // entitlement), so claiming success here would lock the user out behind
        // a "ჩაირთო ✨" message. Fail honestly instead.
        Alert.alert("დროებით მიუწვდომელია", "გამოწერა ამჟამად ვერ ჩაიტვირთა. სცადე ცოტა ხანში.");
        return;
      } else {
        const status = await checkPregnancySubscriptionStatus();
        if (status.hasSubscription) {
          await updateGoalMode("დაორსულება");
        } else if (availablePackage) {
          const result = await purchasePregnancyPackage(availablePackage, { context: "fertility" });
          if (result.hasSubscription) {
            await updateGoalMode("დაორსულება");
          } else {
            Alert.alert("შეცდომა", "გადახდა ვერ მოხდა. სცადეთ თავიდან.");
            return;
          }
        } else {
          Alert.alert("შეცდომა", "გამოწერა ვერ მოიძებნა. სცადეთ მოგვიანებით.");
          return;
        }
      }

      await reloadPregnancy();
      setShowFertilityModal(false);
      Alert.alert(`"${FERTILITY_MODE_LABEL}" ჩაირთო ✨`, "აპი ახლა მორგებულია ოვულაციის, ნაყოფიერი ფანჯრის და ჩასახვის დაგეგმვისთვის.");
    } catch (error) {
      if (error?.userCancelled || error?.code === "1") {
        // silent cancel
      } else {
        Alert.alert("შეცდომა", `ვერ ჩაირთო "${FERTILITY_MODE_LABEL}".`);
      }
    } finally {
      setFertilitySaving(false);
    }
  };

  const handleFertilityDisable = () => {
    Alert.alert(
      `"${FERTILITY_MODE_LABEL}" გამორთვა`,
      `ნამდვილად გსურს "${FERTILITY_MODE_LABEL}" გამორთვა და ჩვეულებრივ რეჟიმზე დაბრუნება?`,
      [
        { text: "გაუქმება", style: "cancel" },
        {
          text: "გამორთვა",
          style: "destructive",
          onPress: async () => {
            try {
              await updateGoalMode("ციკლის კონტროლი");
              Alert.alert("დაბრუნდი ✨", "ჩვეულებრივი ციკლის რეჟიმი ჩაირთო.");
            } catch {
              Alert.alert("შეცდომა", `ვერ გამოირთო "${FERTILITY_MODE_LABEL}".`);
            }
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert("გასვლა", "ნამდვილად გსურთ ანგარიშიდან გასვლა?", [
      { text: "გაუქმება", style: "cancel" },
      {
        text: "გასვლა",
        style: "destructive",
        onPress: async () => {
          await resetPurchasesIdentity();
          await supabase.auth.signOut();
          router.replace("/auth/login");
        },
      },
    ]);
  };

  if (loading) {
    return (
      <LinearGradient colors={rootGradient} style={styles.center}>
        <ActivityIndicator size="large" color={theme.primary} />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={rootGradient} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={styles.container}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}>
        <LinearGradient colors={theme.heroGradient} style={[styles.header, { borderColor: theme.border, borderWidth: 1, shadowColor: theme.primary }]}>
          <View style={styles.headerGlowTop} />
          <View style={styles.headerGlowBottom} />
          <Text style={[styles.profileEyebrow, { color: theme.primary }]}>{pregnancyMode ? "MATERNITY PROFILE" : "PERSONAL PROFILE"}</Text>
          <TouchableOpacity style={styles.photoFrame} activeOpacity={0.88} onPress={handleAvatarPress}>
            <View style={[styles.photoFrameInner, { backgroundColor: theme.activeSoft, borderColor: theme.activeBorder }]}>
              <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
                {avatarUri ? (
                  <Image source={avatarUri} style={styles.avatarImage} contentFit="cover" />
                ) : (
                  <Text style={styles.avatarText}>{userName[0]?.toUpperCase()}</Text>
                )}
                {avatarSaving && (
                  <View style={styles.avatarLoader}>
                    <ActivityIndicator color="#fff" />
                  </View>
                )}
              </View>
              <View style={styles.photoFrameCopy}>
                <Text style={[styles.photoFrameTitle, { color: theme.text }]}>პროფილის ფოტო</Text>
                <Text style={[styles.photoFrameSubtitle, { color: theme.subText }]}>შეეხე ფოტოს შესაცვლელად</Text>
                <View style={[styles.photoFrameChip, { backgroundColor: theme.primary }]}>
                  <Ionicons name="camera-outline" size={13} color="#FFFFFF" />
                  <Text style={styles.photoFrameChipText}>ატვირთვა</Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>
          <Text style={[styles.userName, { color: theme.text }]}>{userName}</Text>
          <Text style={[styles.emailText, { color: theme.subText }]}>{email}</Text>
          {!!phoneNumber && <Text style={[styles.emailText, { color: theme.subText }]}>{phoneNumber}</Text>}
          <TouchableOpacity style={[styles.inlineEditButton, { backgroundColor: theme.activeSoft, borderColor: theme.activeBorder, borderWidth: 1 }]} onPress={openProfileEditModal} activeOpacity={0.85}>
            <Text style={[styles.inlineEditButtonText, { color: theme.primary }]}>პროფილის რედაქტირება</Text>
          </TouchableOpacity>
        </LinearGradient>

        <Text style={[styles.sectionHeader, { color: theme.subText }]}>იერსახე</Text>
        <View style={[styles.settingsBlock, glassBlockStyle]}>
          <SettingRow
            icon="🎨"
            bgColor={isDark ? "#2c1a4d" : "#F0F4FF"}
            title="მუქი თემა"
            subtitle="ჩართე აპის მუქი ვიზუალი"
            isDarkTheme={isDark}
            rightElement={
              <Switch
                value={usePremiumTheme}
                onValueChange={setUsePremiumTheme}
                trackColor={{ true: theme.primary, false: theme.switchTrackOff }}
                thumbColor={usePremiumTheme ? theme.switchThumbOn : theme.switchThumbOff}
                ios_backgroundColor={theme.switchTrackOff}
              />
            }
          />
        </View>

        <Text style={[styles.sectionHeader, { color: theme.subText }]}>პირადი მონაცემები</Text>
        <View style={[styles.settingsBlock, glassBlockStyle]}>
          <SettingRow icon="📆" bgColor={isDark ? "#3d1e2a" : "#FFF0F5"} title="ციკლი და პერიოდი" value={`${cycleLength} / ${periodLength} დღე`} onPress={() => setShowCycleModal(true)} isDarkTheme={isDark} primaryColor={theme.primary} />
          <View style={[styles.divider, { backgroundColor: theme.divider }]} />
          <SettingRow icon="🎯" bgColor={isDark ? "#1a2a3d" : "#F0F4FF"} title="ჩემი მიზანი" value={getGoalLabel(goal)} onPress={() => setShowGoalModal(true)} isDarkTheme={isDark} primaryColor={theme.primary} />
        </View>

        <Text style={[styles.sectionHeader, { color: theme.subText }]}>ორსულობა</Text>
        <View style={[styles.settingsBlock, glassBlockStyle]}>
          {goal === "დაორსულება" && fertilityUnlocked ? (
            <>
              <SettingRow
                icon="🌿"
                bgColor={isDark ? "#1f2c24" : "#EEF9F4"}
                title={FERTILITY_MODE_LABEL}
                value="$2.99/თვე"
                subtitle="დაჭერით გამოსართავად"
                onPress={handleFertilityDisable}
                isDarkTheme={isDark}
                primaryColor={theme.primary}
              />
              <View style={[styles.divider, { backgroundColor: theme.divider }]} />
            </>
          ) : goal === "დაორსულება" ? (
            <>
              <SettingRow
                icon="🔒"
                bgColor={isDark ? "#1f2c24" : "#EEF9F4"}
                title={FERTILITY_MODE_LABEL}
                subtitle="მიზნად არჩეულია — გახსენი ოვულაციის/ნაყოფიერი ფანჯრის AI რჩევები $2.99/თვე-ად"
                onPress={openFertilityFlow}
                showArrow
                isDarkTheme={isDark}
                primaryColor={theme.primary}
              />
              <View style={[styles.divider, { backgroundColor: theme.divider }]} />
            </>
          ) : (
            <>
              <SettingRow
                icon="🌿"
                bgColor={isDark ? "#1f2c24" : "#EEF9F4"}
                title={FERTILITY_MODE_LABEL}
                subtitle="ოვულაციისა და ნაყოფიერი ფანჯრის ფოკუსირებული რეჟიმი"
                onPress={openFertilityFlow}
                showArrow
                isDarkTheme={isDark}
                primaryColor={theme.primary}
              />
              <View style={[styles.divider, { backgroundColor: theme.divider }]} />
            </>
          )}
          {pregnancyMode ? (
            <SettingRow
              icon="🤰"
              bgColor={isDark ? "#3d1e2a" : "#FFF0F5"}
              title="ორსულობის რეჟიმი"
              value={`კვირა ${currentWeek}`}
              subtitle={pregnancyStartDate ? `ბოლო მენსტრუაცია: ${dayjs(pregnancyStartDate).format("D MMMM YYYY")} · შეცვლა` : "თარიღის შეცვლა"}
              onPress={handlePregnancyActivePress}
              isDarkTheme={isDark}
              primaryColor={theme.primary}
            />
          ) : (
            <SettingRow
              icon="🤰"
              bgColor={isDark ? "#3d1e2a" : "#FFF0F5"}
              title="ორსულობის რეჟიმი"
              subtitle="მორგე აპი შენი ორსულობისთვის"
              onPress={handlePregnancyEntryPress}
              showArrow
              isDarkTheme={isDark}
            />
          )}
        </View>

        <Text style={[styles.sectionHeader, { color: theme.subText }]}>აპლიკაცია</Text>
        <View style={[styles.settingsBlock, glassBlockStyle]}>
          <SettingRow
            icon="🔔"
            bgColor={isDark ? "#3d351a" : "#FFF9E6"}
            title="შეტყობინებები"
            subtitle="შეგახსენებთ პერიოდის დაწყებას"
            isDarkTheme={isDark}
            rightElement={
              <Switch
                value={notifications}
                onValueChange={handleNotificationToggle}
                trackColor={{ true: theme.primary, false: theme.switchTrackOff }}
                thumbColor={notifications ? theme.switchThumbOn : theme.switchThumbOff}
                ios_backgroundColor={theme.switchTrackOff}
              />
            }
          />
          <View style={[styles.divider, { backgroundColor: theme.divider }]} />
          <SettingRow icon="🔒" bgColor={isDark ? "#1e3d2a" : "#E6FFF0"} title="კონფიდენციალურობა" onPress={() => router.push("/privacy")} showArrow isDarkTheme={isDark} />
          <View style={[styles.divider, { backgroundColor: theme.divider }]} />
          <SettingRow icon="✨" bgColor={isDark ? "#3d1e2a" : "#FFF0F5"} title="Prime" subtitle="გამოწერის და უპირატესობების ნახვა" onPress={() => router.push("/premium")} showArrow isDarkTheme={isDark} />
          <View style={[styles.divider, { backgroundColor: theme.divider }]} />
          <SettingRow icon="📤" bgColor={isDark ? "#2a1e3d" : "#F5F0FF"} title="მონაცემების ექსპორტი" subtitle="გაუზიარე ექიმს" onPress={exportUserData} showArrow isDarkTheme={isDark} />
        </View>

        {isTestAccount && (
          <>
            <Text style={[styles.sectionHeader, { color: theme.subText }]}>ტესტირება</Text>
            <View style={[styles.settingsBlock, glassBlockStyle]}>
              <SettingRow
                icon="🧪"
                bgColor={isDark ? "#2a233d" : "#F5F0FF"}
                title="Prime (სატესტო)"
                subtitle={testPrimeEnabled ? "ჩართულია — Prime რეჟიმი" : "გამორთულია — Free რეჟიმი"}
                isDarkTheme={isDark}
                rightElement={
                  <Switch
                    value={testPrimeEnabled}
                    onValueChange={setTestPrimeEnabled}
                    trackColor={{ true: theme.primary, false: theme.switchTrackOff }}
                    thumbColor={testPrimeEnabled ? theme.switchThumbOn : theme.switchThumbOff}
                    ios_backgroundColor={theme.switchTrackOff}
                  />
                }
              />
            </View>
          </>
        )}

        {isAdmin && (
          <>
            <Text style={[styles.sectionHeader, { color: theme.subText }]}>ადმინი</Text>
            <View style={[styles.settingsBlock, glassBlockStyle]}>
              <SettingRow
                icon="🛠️"
                bgColor={isDark ? "#2a233d" : "#F5F0FF"}
                title="ადმინ პანელი"
                subtitle="მომხმარებლები და Prime წვდომა"
                onPress={() => router.push("/(tabs)/admin")}
                showArrow
                isDarkTheme={isDark}
              />
            </View>
          </>
        )}

        <TouchableOpacity style={[styles.logoutBtn, { backgroundColor: theme.logoutBg }]} onPress={handleLogout}>
          <Text style={styles.logoutBtnText}>ანგარიშიდან გასვლა</Text>
        </TouchableOpacity>

        <View style={{ height: 160 }} />
      </ScrollView>

      <Modal visible={showPregnancyModal} transparent animationType="slide" onRequestClose={() => setShowPregnancyModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowPregnancyModal(false)}>
          <Pressable style={[styles.bottomSheet, { backgroundColor: theme.card }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.modalTitle, { color: theme.text }]}>{pregnancyModalMode === "edit" ? "თარიღის შეცვლა 🤰" : "ორსულობის რეჟიმი 🤰"}</Text>
            <Text style={{ color: theme.subText, textAlign: "center", marginBottom: 25, lineHeight: 22 }}>
              {pregnancyModalMode === "edit"
                ? "აირჩიე ბოლო მენსტრუაციის სწორი თარიღი, რომ კვირა, კალენდარი და შეტყობინებები თავიდან გადაითვალოს."
                : "კვირეული განვითარება, ორსულობის კალენდარი, AI ასისტენტი და სიმპტომების ტრეკინგი — ყველაფერი მორგებული შენზე."}
            </Text>
            <Text style={[styles.inputLabel, { color: theme.subText }]}>ბოლო მენსტრუაციის თარიღი</Text>
            <View style={[styles.pickerCard, { backgroundColor: theme.pickerBg, borderColor: theme.pickerBorder }]}>
              {showPregnancyModal && (
                <DateTimePicker
                  value={selectedPregnancyDate instanceof Date ? selectedPregnancyDate : new Date()}
                  mode="date"
                  display="spinner"
                  maximumDate={new Date()}
                  minimumDate={new Date(Date.now() - 280 * 24 * 60 * 60 * 1000)}
                  onChange={(_, date) => { if (date) setSelectedPregnancyDate(date); }}
                  themeVariant={isDark ? "dark" : "light"}
                  accentColor={theme.primary}
                  textColor={Platform.OS === "ios" ? theme.text : undefined}
                  style={{ width: "100%", marginBottom: 0 }}
                />
              )}
            </View>
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.primary }]} onPress={handlePregnancyModalSubmit}>
              {pregnancySaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{pregnancyModalMode === "edit" ? "თარიღის შენახვა" : "ჩართვა — $2.99/თვე"}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowPregnancyModal(false)}>
              <Text style={styles.cancelBtnText}>გაუქმება</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showFertilityModal} transparent animationType="slide" onRequestClose={() => setShowFertilityModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowFertilityModal(false)}>
          <Pressable style={[styles.bottomSheet, { backgroundColor: theme.card }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.modalTitle, { color: theme.text }]}>{FERTILITY_MODE_LABEL} 🌿</Text>
            <Text style={{ color: theme.subText, textAlign: "center", marginBottom: 25, lineHeight: 22 }}>
              ოვულაციის ფანჯარა, ნაყოფიერი დღეები, მიზანზე მორგებული AI რჩევები და უფრო ფოკუსირებული მხარდაჭერა დაორსულების დაგეგმვისთვის.
            </Text>
            <View style={[styles.modalCard, { backgroundColor: theme.input, borderColor: theme.border, borderWidth: 1 }]}>
              <Text style={[styles.modalLabel, { color: theme.subText, marginBottom: 10 }]}>რას მიიღებ</Text>
              <Text style={[styles.fertilityBenefit, { color: theme.text }]}>• ნაყოფიერი ფანჯრის მკაფიო ფოკუსი</Text>
              <Text style={[styles.fertilityBenefit, { color: theme.text }]}>• დაორსულების მიზანზე მორგებული რჩევები</Text>
              <Text style={[styles.fertilityBenefit, { color: theme.text }]}>• ერთი გამოწერა ორივე რეჟიმს ხსნის (ორსულობის ჩათვლით) — $2.99/თვე</Text>
            </View>
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.primary }]} onPress={handleFertilityEnable}>
              {fertilitySaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>ჩართვა — $2.99/თვე</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowFertilityModal(false)}>
              <Text style={styles.cancelBtnText}>გაუქმება</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>


      <Modal visible={showGoalModal} transparent animationType="slide" onRequestClose={() => setShowGoalModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowGoalModal(false)}>
          <View style={[styles.bottomSheet, { backgroundColor: theme.card }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.modalTitle, { color: theme.text }]}>რა არის შენი მიზანი?</Text>
            {goalOptions.map((option) => (
              <TouchableOpacity
                key={option}
                style={[styles.optionCard, { backgroundColor: theme.input, borderColor: theme.border, borderWidth: 1 }, goal === option && { borderColor: theme.primary, borderWidth: 1 }]}
                onPress={() => {
                  setGoal(option);
                  saveSettings(() => setShowGoalModal(false), { goal: option });
                }}
              >
                <Text style={[styles.optionText, { color: theme.text }, goal === option && { color: theme.primary, fontWeight: "700" }]}>{getGoalLabel(option)}</Text>
                {goal === option && <Text>✅</Text>}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowGoalModal(false)}>
              <Text style={styles.cancelBtnText}>გაუქმება</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showCycleModal} transparent animationType="slide" onRequestClose={() => setShowCycleModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowCycleModal(false)}>
          <View style={[styles.bottomSheet, { backgroundColor: theme.card }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.modalTitle, { color: theme.text }]}>ციკლის პარამეტრები</Text>
            <View style={[styles.modalCard, { backgroundColor: theme.input, borderColor: theme.border, borderWidth: 1 }]}>
              <Text style={[styles.modalLabel, { color: theme.subText }]}>ციკლის ხანგრძლივობა</Text>
              <NumberSelector value={cycleLength} setValue={setCycleLength} min={21} max={45} primary={theme.primary} isDark={isDark} />
            </View>
            <View style={[styles.modalCard, { backgroundColor: theme.input, borderColor: theme.border, borderWidth: 1 }]}>
              <Text style={[styles.modalLabel, { color: theme.subText }]}>პერიოდის ხანგრძლივობა</Text>
              <NumberSelector value={periodLength} setValue={setPeriodLength} min={2} max={10} primary={theme.primary} isDark={isDark} />
            </View>
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.primary }]} onPress={() => saveSettings(() => setShowCycleModal(false))}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>შენახვა</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCycleModal(false)}>
              <Text style={styles.cancelBtnText}>გაუქმება</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showProfileEdit} transparent animationType="fade" onRequestClose={() => setShowProfileEdit(false)}>
        <Pressable style={styles.modalOverlayCenter} onPress={() => setShowProfileEdit(false)}>
          <Pressable style={[styles.centerModal, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>პროფილის რედაქტირება</Text>
            <Text style={[styles.inputLabel, { color: theme.subText }]}>შენი სახელი</Text>
            <TextInput style={[styles.textInput, { backgroundColor: theme.input, color: theme.text }]} value={tempName} onChangeText={setTempName} placeholderTextColor={theme.subText} />
            <Text style={[styles.inputLabel, { color: theme.subText }]}>ტელეფონის ნომერი</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: theme.input, color: theme.text }]}
              value={tempPhoneNumber}
              onChangeText={setTempPhoneNumber}
              placeholder="მაგ: +995 5XX XX XX XX"
              placeholderTextColor={theme.subText}
              keyboardType="phone-pad"
              autoCorrect={false}
              maxLength={20}
            />
            <View style={styles.modalRowBtns}>
              <TouchableOpacity style={[styles.halfBtnGray, { backgroundColor: theme.input, borderColor: theme.border, borderWidth: 1 }]} onPress={() => setShowProfileEdit(false)}>
                <Text style={styles.cancelBtnText}>გაუქმება</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.halfBtnPink, { backgroundColor: theme.primary }]} onPress={() => saveSettings(() => setShowProfileEdit(false))}>
                <Text style={styles.primaryBtnText}>შენახვა</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </LinearGradient>
  );
}

function SettingRow({ icon, bgColor, title, subtitle, value, showArrow, onPress, rightElement, isDarkTheme, primaryColor }) {
  const Component = onPress ? TouchableOpacity : View;
  return (
    <Component style={styles.settingRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.iconBox, { backgroundColor: bgColor }]}>
        <Text style={{ fontSize: 20 }}>{icon}</Text>
      </View>
      <View style={styles.settingTextContainer}>
        <Text style={[styles.settingTitle, { color: isDarkTheme ? "#FFF7FA" : "#2F2026" }]}>{title}</Text>
        {subtitle && <Text style={[styles.settingSubtitle, { color: isDarkTheme ? "#D5BFC8" : "#8F6574" }]}>{subtitle}</Text>}
      </View>
      {value && <Text style={[styles.settingValue, { color: primaryColor || "#ff4d88" }]}>{value}</Text>}
      {showArrow && <Ionicons name="chevron-forward" size={18} color="#B8B8BE" style={styles.arrowIcon} />}
      {rightElement && rightElement}
    </Component>
  );
}

function NumberSelector({ value, setValue, min, max, primary, isDark }) {
  const decrease = () => Number(value) > min && setValue(String(Number(value) - 1));
  const increase = () => Number(value) < max && setValue(String(Number(value) + 1));

  return (
    <View style={[styles.selectorContainer, { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "#F8F8F8" }]}>
      <TouchableOpacity style={[styles.selectorBtn, { backgroundColor: isDark ? "rgba(255,255,255,0.10)" : "#fff" }, Number(value) <= min && { opacity: 0.3 }]} onPress={decrease}>
        <Text style={[styles.selectorBtnText, { color: primary }]}>-</Text>
      </TouchableOpacity>
      <Text style={[styles.valueText, { color: isDark ? "#FFF7FA" : "#1A1A1A" }]}>
          {value} <Text style={styles.valueLabel}>დღე</Text>
      </Text>
      <TouchableOpacity style={[styles.selectorBtn, { backgroundColor: isDark ? "rgba(255,255,255,0.10)" : "#fff" }, Number(value) >= max && { opacity: 0.3 }]} onPress={increase}>
        <Text style={[styles.selectorBtnText, { color: primary }]}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { alignItems: "center", paddingTop: 68, paddingBottom: 28, marginHorizontal: 14, marginTop: 8, borderRadius: 34, overflow: "hidden", elevation: 8, shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 12 } },
  headerGlowTop: { position: "absolute", top: -58, right: -34, width: 170, height: 170, borderRadius: 85, backgroundColor: "rgba(255,255,255,0.18)" },
  headerGlowBottom: { position: "absolute", left: -42, bottom: -70, width: 190, height: 190, borderRadius: 95, backgroundColor: "rgba(255,77,136,0.12)" },
  profileEyebrow: { color: "#E94560", fontSize: 9, fontWeight: "900", letterSpacing: 1.2, marginBottom: 15 },
  avatarContainer: { position: "relative" },
  photoFrame: { width: "88%", maxWidth: 360, marginBottom: 18 },
  photoFrameInner: { minHeight: 150, borderRadius: 30, borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "center", overflow: "hidden", shadowColor: "#D76586", shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 7 },
  photoFrameCopy: { flex: 1, marginLeft: 16, alignItems: "flex-start" },
  photoFrameTitle: { fontSize: 17, fontWeight: "900", marginBottom: 5 },
  photoFrameSubtitle: { fontSize: 12, fontWeight: "700", lineHeight: 17, marginBottom: 12 },
  photoFrameChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  photoFrameChipText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  avatarHalo: {
    width: 160,
    height: 160,
    borderRadius: 80,
    padding: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 6,
  },
  avatar: { width: 112, height: 112, borderRadius: 34, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImage: { width: "100%", height: "100%" },
  avatarLoader: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.28)", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 46, fontWeight: "900" },
  editBadge: {
    position: "absolute",
    bottom: 8,
    right: 8,
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 10,
    borderWidth: 3,
  },
  avatarHint: { marginTop: 11, marginBottom: 14, fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },
  userName: { fontSize: 25, fontWeight: "900", letterSpacing: -0.35 },
  emailText: { fontSize: 14, marginTop: 4 },
  inlineEditButton: { marginTop: 15, paddingHorizontal: 17, paddingVertical: 10, borderRadius: 999 },
  inlineEditButtonText: { fontSize: 13, fontWeight: "800" },
  sectionHeader: { fontSize: 11, fontWeight: "900", color: "#888", textTransform: "uppercase", letterSpacing: 1.35, marginTop: 30, marginBottom: 11, paddingHorizontal: 22 },
  settingsBlock: { borderRadius: 24, marginHorizontal: 20, overflow: "hidden", elevation: 5, shadowColor: "#D76586", shadowOpacity: 0.10, shadowRadius: 16, shadowOffset: { width: 0, height: 9 } },
  divider: { height: 1, marginLeft: 70 },
  settingRow: { flexDirection: "row", alignItems: "center", padding: 16, paddingRight: 18 },
  iconBox: { width: 42, height: 42, borderRadius: 13, justifyContent: "center", alignItems: "center", marginRight: 14 },
  settingTextContainer: { flex: 1 },
  settingTitle: { fontSize: 15, fontWeight: "800" },
  settingSubtitle: { fontSize: 12, marginTop: 3 },
  settingValue: { fontSize: 15, fontWeight: "800" },
  arrowIcon: { marginLeft: 10 },
  logoutBtn: { marginHorizontal: 20, marginTop: 30, minHeight: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  logoutBtnText: { color: "#FF3B30", fontSize: 15, fontWeight: "800" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  bottomSheet: { borderTopLeftRadius: 35, borderTopRightRadius: 35, padding: 25, paddingBottom: 50 },
  sheetHandle: { width: 45, height: 6, backgroundColor: "#ddd", borderRadius: 3, alignSelf: "center", marginBottom: 25 },
  modalOverlayCenter: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 20 },
  centerModal: { borderRadius: 32, padding: 30 },
  modalTitle: { fontSize: 24, fontWeight: "900", marginBottom: 25, textAlign: "center" },
  modalCard: { padding: 20, borderRadius: 22, marginBottom: 15 },
  pickerCard: { borderWidth: 1, borderRadius: 22, marginBottom: 12, overflow: "hidden", paddingHorizontal: 6 },
  modalLabel: { fontSize: 14, fontWeight: "700", marginBottom: 18, textAlign: "center" },
  fertilityBenefit: { fontSize: 14, lineHeight: 22, marginBottom: 4, fontWeight: "600" },
  selectorContainer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderRadius: 20, padding: 6 },
  selectorBtn: { width: 55, height: 55, borderRadius: 16, justifyContent: "center", alignItems: "center" },
  selectorBtnText: { fontSize: 28, fontWeight: "600" },
  valueText: { fontSize: 26, fontWeight: "900" },
  valueLabel: { fontSize: 14, color: "#888" },
  inputLabel: { fontSize: 14, fontWeight: "700", marginBottom: 10 },
  textInput: { padding: 18, borderRadius: 18, fontSize: 16, marginBottom: 30 },
  primaryBtn: { paddingVertical: 20, borderRadius: 22, alignItems: "center", marginTop: 10 },
  primaryBtnText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  cancelBtn: { paddingVertical: 20, alignItems: "center", marginTop: 10 },
  cancelBtnText: { color: "#888", fontSize: 16, fontWeight: "700" },
  modalRowBtns: { flexDirection: "row", justifyContent: "space-between" },
  halfBtnGray: { width: "47%", paddingVertical: 18, borderRadius: 18, alignItems: "center" },
  halfBtnPink: { width: "47%", paddingVertical: 18, borderRadius: 18, alignItems: "center" },
  optionCard: { padding: 20, borderRadius: 20, marginBottom: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  optionText: { fontSize: 16 },
});
