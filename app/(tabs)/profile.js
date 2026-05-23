import dayjs from "dayjs";
import "dayjs/locale/ka";
dayjs.locale("ka");
import DateTimePicker from "@react-native-community/datetimepicker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, StatusBar, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";

import { useTheme } from "../../context/ThemeContext";
import { usePregnancy } from "../../context/PregnancyContext";
import { invalidateAssistantContextCache } from "../../services/assistantOrchestrator";
import { disableCycleReminders, getNotificationsEnabled, setNotificationsEnabled, syncCycleRemindersForUser } from "../../services/notifications";
import {
  resetPurchasesIdentity,
  getPregnancyOfferings,
  purchasePregnancyPackage,
  checkPregnancySubscriptionStatus,
} from "../../services/purchases";
import { supabase } from "../../services/supabase";

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
  const { usePremiumTheme, setUsePremiumTheme, isDark } = useTheme();
  const { pregnancyMode, currentWeek, enablePregnancyMode, disablePregnancyMode } = usePregnancy();

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
  const [selectedPregnancyDate, setSelectedPregnancyDate] = useState(new Date());
  const [pregnancySaving, setPregnancySaving] = useState(false);
  const [tempName, setTempName] = useState("");
  const [tempPhoneNumber, setTempPhoneNumber] = useState("");

  const goalOptions = ["ციკლის კონტროლი", "დაორსულება", "ჯანმრთელობის მონიტორინგი"];

  useEffect(() => {
    loadProfile();
    loadNotificationState();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadProfile(), loadNotificationState()]);
    setRefreshing(false);
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
    bg: isDark ? "#0F0F0F" : "#F7F8FA",
    headerBg: isDark ? "#1A1A1A" : "#FFFFFF",
    card: isDark ? "#1A1A1A" : "#FFFFFF",
    text: isDark ? "#FFFFFF" : "#1A1A1A",
    subText: isDark ? "#AAAAAA" : "#888888",
    primary: isDark ? "#E94560" : "#ff4d88",
    divider: isDark ? "#2A2A2A" : "#F0F0F0",
    input: isDark ? "#252525" : "#F5F5F5",
    logoutBg: isDark ? "rgba(255, 59, 48, 0.1)" : "#FFEBEB",
  };

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

  const handlePregnancyEnable = async () => {
    setPregnancySaving(true);
    try {
      const dateStr = dayjs(selectedPregnancyDate).format("YYYY-MM-DD");

      const { configured, availablePackage } = await getPregnancyOfferings();

      if (!configured) {
        // RevenueCat not set up (dev/simulator) — enable directly for testing
        await enablePregnancyMode(dateStr);
      } else {
        const status = await checkPregnancySubscriptionStatus();
        if (status.hasSubscription) {
          await enablePregnancyMode(dateStr);
        } else if (availablePackage) {
          const result = await purchasePregnancyPackage(availablePackage);
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
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}>
        <View style={[styles.header, { backgroundColor: theme.headerBg, shadowColor: theme.primary }]}>
          <View
            style={[
              styles.avatarHero,
              {
                backgroundColor: isDark ? "rgba(233,69,96,0.10)" : "#FFF3F7",
                borderColor: isDark ? "rgba(233,69,96,0.18)" : "#FFD9E5",
              },
            ]}
          >
            <TouchableOpacity style={styles.avatarContainer} activeOpacity={0.88} onPress={handleAvatarPress}>
              <View
                style={[
                  styles.avatarHalo,
                  {
                    backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "#FFFFFF",
                    borderColor: isDark ? "rgba(255,255,255,0.06)" : "#FFE6EE",
                  },
                ]}
              >
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
                <View
                  style={[
                    styles.editBadge,
                    {
                      backgroundColor: theme.primary,
                      borderColor: theme.headerBg,
                    },
                  ]}
                >
              <Text style={{ fontSize: 12 }}>✏️</Text>
            </View>
              </View>
          </TouchableOpacity>
          <Text style={[styles.avatarHint, { color: theme.primary }]}>{"\u10e4\u10dd\u10e2\u10dd\u10e1 \u10e8\u10d4\u10ea\u10d5\u10da\u10d8\u10e1\u10d7\u10d5\u10d8\u10e1 \u10e8\u10d4\u10d4\u10ee\u10d4"}</Text>
          </View>
          <Text style={[styles.userName, { color: theme.text }]}>{userName}</Text>
          <Text style={[styles.emailText, { color: theme.subText }]}>{email}</Text>
          {!!phoneNumber && <Text style={[styles.emailText, { color: theme.subText }]}>{phoneNumber}</Text>}
          <TouchableOpacity style={[styles.inlineEditButton, { backgroundColor: isDark ? "#252525" : "#FFF4F8" }]} onPress={openProfileEditModal} activeOpacity={0.85}>
            <Text style={[styles.inlineEditButtonText, { color: theme.primary }]}>პროფილის რედაქტირება</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionHeader}>იერსახე</Text>
        <View style={[styles.settingsBlock, { backgroundColor: theme.card }]}>
          <SettingRow
            icon="🎨"
            bgColor={isDark ? "#2c1a4d" : "#F0F4FF"}
            title="მუქი თემა"
            subtitle="ჩართე აპის მუქი ვიზუალი"
            isDarkTheme={isDark}
            rightElement={<Switch value={usePremiumTheme} onValueChange={setUsePremiumTheme} trackColor={{ true: theme.primary, false: "#e0e0e0" }} />}
          />
        </View>

        <Text style={styles.sectionHeader}>პირადი მონაცემები</Text>
        <View style={[styles.settingsBlock, { backgroundColor: theme.card }]}>
          <SettingRow icon="📆" bgColor={isDark ? "#3d1e2a" : "#FFF0F5"} title="ციკლი და პერიოდი" value={`${cycleLength} / ${periodLength} დღე`} onPress={() => setShowCycleModal(true)} isDarkTheme={isDark} primaryColor={theme.primary} />
          <View style={[styles.divider, { backgroundColor: theme.divider }]} />
          <SettingRow icon="🎯" bgColor={isDark ? "#1a2a3d" : "#F0F4FF"} title="ჩემი მიზანი" value={goal} onPress={() => setShowGoalModal(true)} isDarkTheme={isDark} primaryColor={theme.primary} />
        </View>

        <Text style={styles.sectionHeader}>ორსულობა</Text>
        <View style={[styles.settingsBlock, { backgroundColor: theme.card }]}>
          {pregnancyMode ? (
            <SettingRow
              icon="🤰"
              bgColor={isDark ? "#3d1e2a" : "#FFF0F5"}
              title="ორსულობის რეჟიმი"
              value={`კვირა ${currentWeek}`}
              subtitle="დაჭერით გამორთვისთვის"
              onPress={handlePregnancyDisable}
              isDarkTheme={isDark}
              primaryColor={theme.primary}
            />
          ) : (
            <SettingRow
              icon="🤰"
              bgColor={isDark ? "#3d1e2a" : "#FFF0F5"}
              title="ორსულობის რეჟიმი"
              subtitle="მორგე აპი შენი ორსულობისთვის"
              onPress={() => setShowPregnancyModal(true)}
              showArrow
              isDarkTheme={isDark}
            />
          )}
        </View>

        <Text style={styles.sectionHeader}>აპლიკაცია</Text>
        <View style={[styles.settingsBlock, { backgroundColor: theme.card }]}>
          <SettingRow
            icon="🔔"
            bgColor={isDark ? "#3d351a" : "#FFF9E6"}
            title="შეტყობინებები"
            subtitle="შეგახსენებთ პერიოდის დაწყებას"
            isDarkTheme={isDark}
            rightElement={<Switch value={notifications} onValueChange={handleNotificationToggle} trackColor={{ true: theme.primary, false: "#e0e0e0" }} />}
          />
          <View style={[styles.divider, { backgroundColor: theme.divider }]} />
          <SettingRow icon="🔒" bgColor={isDark ? "#1e3d2a" : "#E6FFF0"} title="კონფიდენციალურობა" onPress={() => router.push("/privacy")} showArrow isDarkTheme={isDark} />
          <View style={[styles.divider, { backgroundColor: theme.divider }]} />
          <SettingRow icon="✨" bgColor={isDark ? "#3d1e2a" : "#FFF0F5"} title="Prime" subtitle="გამოწერის და უპირატესობების ნახვა" onPress={() => router.push("/premium")} showArrow isDarkTheme={isDark} />
          <View style={[styles.divider, { backgroundColor: theme.divider }]} />
          <SettingRow icon="📤" bgColor={isDark ? "#2a1e3d" : "#F5F0FF"} title="მონაცემების ექსპორტი" subtitle="გაუზიარე ექიმს" onPress={exportUserData} showArrow isDarkTheme={isDark} />
        </View>

        <TouchableOpacity style={[styles.logoutBtn, { backgroundColor: theme.logoutBg }]} onPress={handleLogout}>
          <Text style={styles.logoutBtnText}>ანგარიშიდან გასვლა</Text>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>

      <Modal visible={showPregnancyModal} transparent animationType="slide" onRequestClose={() => setShowPregnancyModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowPregnancyModal(false)}>
          <Pressable style={[styles.bottomSheet, { backgroundColor: theme.card }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.modalTitle, { color: theme.text }]}>ორსულობის რეჟიმი 🤰</Text>
            <Text style={{ color: theme.subText, textAlign: "center", marginBottom: 25, lineHeight: 22 }}>
              კვირეული განვითარება, ორსულობის კალენდარი, AI ასისტენტი და სიმპტომების ტრეკინგი — ყველაფერი მორგებული შენზე.
            </Text>
            <Text style={[styles.inputLabel, { color: theme.subText }]}>ბოლო მენსტრუაციის თარიღი</Text>
            {showPregnancyModal && (
              <DateTimePicker
                value={selectedPregnancyDate instanceof Date ? selectedPregnancyDate : new Date()}
                mode="date"
                display="spinner"
                maximumDate={new Date()}
                minimumDate={new Date(Date.now() - 280 * 24 * 60 * 60 * 1000)}
                onChange={(_, date) => { if (date) setSelectedPregnancyDate(date); }}
                style={{ width: "100%", marginBottom: 10 }}
              />
            )}
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.primary }]} onPress={handlePregnancyEnable}>
              {pregnancySaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>ჩართვა — $3.99/თვე</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowPregnancyModal(false)}>
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
                style={[styles.optionCard, { backgroundColor: isDark ? "#252525" : "#F5F5F5" }, goal === option && { borderColor: theme.primary, borderWidth: 1 }]}
                onPress={() => {
                  setGoal(option);
                  saveSettings(() => setShowGoalModal(false), { goal: option });
                }}
              >
                <Text style={[styles.optionText, { color: theme.text }, goal === option && { color: theme.primary, fontWeight: "700" }]}>{option}</Text>
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
            <View style={[styles.modalCard, { backgroundColor: isDark ? "#252525" : "#fff" }]}>
              <Text style={[styles.modalLabel, { color: theme.subText }]}>ციკლის ხანგრძლივობა</Text>
              <NumberSelector value={cycleLength} setValue={setCycleLength} min={21} max={45} primary={theme.primary} isDark={isDark} />
            </View>
            <View style={[styles.modalCard, { backgroundColor: isDark ? "#252525" : "#fff" }]}>
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
              <TouchableOpacity style={[styles.halfBtnGray, { backgroundColor: isDark ? "#333" : "#F5F5F5" }]} onPress={() => setShowProfileEdit(false)}>
                <Text style={styles.cancelBtnText}>გაუქმება</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.halfBtnPink, { backgroundColor: theme.primary }]} onPress={() => saveSettings(() => setShowProfileEdit(false))}>
                <Text style={styles.primaryBtnText}>შენახვა</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
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
        <Text style={[styles.settingTitle, { color: isDarkTheme ? "#FFF" : "#333" }]}>{title}</Text>
        {subtitle && <Text style={[styles.settingSubtitle, { color: isDarkTheme ? "#888" : "#999" }]}>{subtitle}</Text>}
      </View>
      {value && <Text style={[styles.settingValue, { color: primaryColor || "#ff4d88" }]}>{value}</Text>}
        {showArrow && <Text style={styles.arrowIcon}>›</Text>}
      {rightElement && rightElement}
    </Component>
  );
}

function NumberSelector({ value, setValue, min, max, primary, isDark }) {
  const decrease = () => Number(value) > min && setValue(String(Number(value) - 1));
  const increase = () => Number(value) < max && setValue(String(Number(value) + 1));

  return (
    <View style={[styles.selectorContainer, { backgroundColor: isDark ? "#1A1A1A" : "#F8F8F8" }]}>
      <TouchableOpacity style={[styles.selectorBtn, { backgroundColor: isDark ? "#333" : "#fff" }, Number(value) <= min && { opacity: 0.3 }]} onPress={decrease}>
        <Text style={[styles.selectorBtnText, { color: primary }]}>-</Text>
      </TouchableOpacity>
      <Text style={[styles.valueText, { color: isDark ? "#fff" : "#1A1A1A" }]}>
          {value} <Text style={styles.valueLabel}>დღე</Text>
      </Text>
      <TouchableOpacity style={[styles.selectorBtn, { backgroundColor: isDark ? "#333" : "#fff" }, Number(value) >= max && { opacity: 0.3 }]} onPress={increase}>
        <Text style={[styles.selectorBtnText, { color: primary }]}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { alignItems: "center", paddingTop: 70, paddingBottom: 30, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, elevation: 10, shadowOpacity: 0.15, shadowRadius: 20 },
  avatarHero: { alignItems: "center", paddingHorizontal: 22, paddingVertical: 16, borderRadius: 28, borderWidth: 1, marginBottom: 16 },
  avatarContainer: { position: "relative" },
  avatarHalo: {
    width: 126,
    height: 126,
    borderRadius: 63,
    padding: 9,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 6,
  },
  avatar: { width: 108, height: 108, borderRadius: 54, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImage: { width: "100%", height: "100%" },
  avatarLoader: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.28)", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 36, fontWeight: "800" },
  editBadge: {
    position: "absolute",
    bottom: 6,
    right: 6,
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 10,
    borderWidth: 3,
  },
  editBadgeText: { color: "#FFFFFF", fontSize: 18, lineHeight: 18, fontWeight: "900" },
  avatarHint: { marginTop: 12, fontSize: 12, fontWeight: "800", letterSpacing: 0.2 },
  userName: { fontSize: 24, fontWeight: "800" },
  emailText: { fontSize: 14, marginTop: 4 },
  inlineEditButton: { marginTop: 14, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
  inlineEditButtonText: { fontSize: 13, fontWeight: "800" },
  sectionHeader: { fontSize: 12, fontWeight: "800", color: "#888", textTransform: "uppercase", letterSpacing: 1.5, marginTop: 35, marginBottom: 12, paddingHorizontal: 25 },
  settingsBlock: { borderRadius: 24, marginHorizontal: 20, overflow: "hidden", elevation: 2 },
  divider: { height: 1, marginLeft: 70 },
  settingRow: { flexDirection: "row", alignItems: "center", padding: 18, paddingRight: 20 },
  iconBox: { width: 42, height: 42, borderRadius: 12, justifyContent: "center", alignItems: "center", marginRight: 15 },
  settingTextContainer: { flex: 1 },
  settingTitle: { fontSize: 16, fontWeight: "700" },
  settingSubtitle: { fontSize: 12, marginTop: 2 },
  settingValue: { fontSize: 15, fontWeight: "800" },
  arrowIcon: { fontSize: 24, color: "#ccc", marginLeft: 10 },
  logoutBtn: { marginHorizontal: 20, marginTop: 30, paddingVertical: 20, borderRadius: 24, alignItems: "center" },
  logoutBtnText: { color: "#FF3B30", fontSize: 16, fontWeight: "800" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  bottomSheet: { borderTopLeftRadius: 35, borderTopRightRadius: 35, padding: 25, paddingBottom: 50 },
  sheetHandle: { width: 45, height: 6, backgroundColor: "#ddd", borderRadius: 3, alignSelf: "center", marginBottom: 25 },
  modalOverlayCenter: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 20 },
  centerModal: { borderRadius: 32, padding: 30 },
  modalTitle: { fontSize: 24, fontWeight: "900", marginBottom: 25, textAlign: "center" },
  modalCard: { padding: 20, borderRadius: 22, marginBottom: 15 },
  modalLabel: { fontSize: 14, fontWeight: "700", marginBottom: 18, textAlign: "center" },
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
