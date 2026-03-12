import "dayjs/locale/ka";
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';
import { useRouter } from "expo-router";
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { useTheme } from "../../context/ThemeContext";
import { scheduleCycleReminders } from "../../services/notifications";
import { supabase } from "../../services/supabase";

// კონფიგურაცია, რომ შეხსენებები გამოჩნდეს მაშინაც, როცა აპლიკაცია ღიაა
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function ProfileScreen() {
  const router = useRouter();

  const { isPremium, usePremiumTheme, setUsePremiumTheme, isDark } = useTheme();

  const [email, setEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [cycleLength, setCycleLength] = useState("28");
  const [periodLength, setPeriodLength] = useState("5");
  const [goal, setGoal] = useState("ციკლის კონტროლი");
  const [notifications, setNotifications] = useState(true);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showCycleModal, setShowCycleModal] = useState(false);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [tempName, setTempName] = useState("");

  const goalOptions = ["ციკლის კონტროლი", "დაორსულება", "ჯანმრთელობის მონიტორინგი"];

 useEffect(() => {
  loadProfile();
  checkNotificationStatus();
}, []);

const checkNotificationStatus = async () => {
  const { status } = await Notifications.getPermissionsAsync();
  setNotifications(status === "granted");
};

  const loadProfile = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setEmail(user.email);
      const nameFromEmail = user.email.split('@')[0];

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (data) {
        setCycleLength(String(data.cycle_length || 28));
        setPeriodLength(String(data.period_length || 5));
        setUserName(data.name || nameFromEmail);
        setTempName(data.name || nameFromEmail);
        setGoal(data.goal || "ციკლის კონტროლი");
      }
    } catch (err) {
      console.log("Profile load error:", err);
    } finally {
      setLoading(false);
    }
  };

  // --- შეტყობინებების გამართული ფუნქცია ---
  const handleNotificationToggle = async (value) => {
    try {
      setNotifications(value);
      if (value) {
        // 1. პროექტის ID-ს Fallback (შენი ID საიტიდან)
        const projectId = Constants.expoConfig?.extra?.eas?.projectId || "90082f78-6f14-4632-9c3f-7a609964a196";

        // 2. Android-ისთვის არხის შექმნა
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
          });
        }

        // 3. ნებართვების მოთხოვნა
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        
        if (finalStatus !== 'granted') {
          Alert.alert("წვდომა უარყოფილია", "გთხოვთ, ჩართოთ შეტყობინებები ტელეფონის პარამეტრებიდან.");
          setNotifications(false);
          return;
        }

        // 4. რეგისტრაცია და ტესტური შეტყობინება
        const token = await Notifications.getExpoPushTokenAsync({
  projectId
});

console.log("Push token:", token);
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "შეტყობინებები აქტიურია! ✨",
            body: "თქვენ მიიღებთ შეხსენებებს ციკლის მოახლოების შესახებ.",
          },
          trigger: { seconds: 2 },
        });
      } else {
        await Notifications.cancelAllScheduledNotificationsAsync();
      }
    } catch (e) {
      console.log(e);
      Alert.alert("შეცდომა", "სისტემას არ აქვს წვდომა ნოთიფიკაციაზე.");
    }
  };

  // --- ექსპორტის ფუნქცია ---
  const exportUserData = async () => {
    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: cycles } = await supabase
        .from("cycles")
        .select("*")
        .eq("user_id", user.id)
        .order("start_date", { ascending: false });

      let reportText = `HEALTH REPORT\nUser: ${userName}\nGoal: ${goal}\nDate: ${new Date().toLocaleDateString()}\n\nCycle History:\n`;
      if (cycles && cycles.length > 0) {
        cycles.forEach((c, i) => {
          reportText += `${i + 1}. Start: ${c.start_date} | Length: ${c.cycle_length} days\n`;
        });
      } else {
        reportText += `No history data found.\n`;
      }

      const fileUri = FileSystem.documentDirectory + "Cycle_Report.txt";
      await FileSystem.writeAsStringAsync(fileUri, reportText);

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert("შეცდომა", "გაზიარება შეუძლებელია ამ მოწყობილობაზე");
      }
    } catch (error) {
      console.error(error);
      Alert.alert("შეცდომა", "ექსპორტის მოდული ვერ ჩაიტვირთა");
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
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const newCycle = Number(cycleLength);
      const newPeriod = Number(periodLength);
      const finalName = tempName.trim() !== "" ? tempName : userName;

      const payload = {
        id: user.id,
        name: finalName,
        cycle_length: newCycle,
        period_length: newPeriod,
        goal: specificFields.goal || goal,
        ...specificFields
      };

      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "id" });

      if (profileError) throw profileError;

      if (!specificFields.goal) {
          const { data: cycles } = await supabase
            .from("cycles")
            .select("*")
            .eq("user_id", user.id)
            .order("start_date", { ascending: false })
            .limit(1);

          if (cycles && cycles.length > 0) {
  const lastStart = cycles[0].start_date;

  await supabase
    .from("cycles")
    .update({ period_length: newPeriod, cycle_length: newCycle })
    .eq("id", cycles[0].id);

  // 🔔 დავგეგმოთ ნოტიფიკაციები
  await scheduleCycleReminders(lastStart, newCycle);
}
      }

      setUserName(finalName);
      if (hideModalCallback) hideModalCallback();
      Alert.alert("წარმატება ✨", "მონაცემები განახლდა");
    } catch (err) {
      Alert.alert("შეცდომა", "მონაცემების შენახვა ვერ მოხერხდა");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("გასვლა", "ნამდვილად გსურთ ანგარიშიდან გასვლა?", [
      { text: "გაუქმება", style: "cancel" },
      { 
        text: "გასვლა", 
        style: "destructive",
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace("/auth/login");
        } 
      }
    ]);
  };

  if (loading) return <View style={[styles.center, {backgroundColor: theme.bg}]}><ActivityIndicator size="large" color={theme.primary} /></View>;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <ScrollView showsVerticalScrollIndicator={false}>
        
        <View style={[styles.header, { backgroundColor: theme.headerBg, shadowColor: theme.primary }]}>
          <TouchableOpacity 
            style={styles.avatarContainer} 
            activeOpacity={0.8}
            onPress={() => setShowProfileEdit(true)}
          >
            <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
              <Text style={styles.avatarText}>{userName[0]?.toUpperCase()}</Text>
            </View>
            <View style={[styles.editBadge, {backgroundColor: theme.headerBg}]}>
              <Text style={{fontSize: 12}}>✏️</Text>
            </View>
          </TouchableOpacity>
          <Text style={[styles.userName, { color: theme.text }]}>{userName}</Text>
          <Text style={[styles.emailText, { color: theme.subText }]}>{email}</Text>
          
          {isPremium && (
            <View style={styles.primeBadge}>
              <Text style={styles.primeBadgeText}>👑 PRIME</Text>
            </View>
          )}
        </View>

        {isPremium && (
          <>
            <Text style={styles.sectionHeader}>პრაიმ პარამეტრები</Text>
            <View style={[styles.settingsBlock, { backgroundColor: theme.card }]}>
              <SettingRow 
                icon="🎨" 
                bgColor={isDark ? "#2c1a4d" : "#F0F4FF"} 
                title="პრაიმ ვიზუალი" 
                subtitle="გამოიყენე მუქი პრემიუმ თემა"
                isDarkTheme={isDark}
                rightElement={
                  <Switch 
                    value={usePremiumTheme} 
                    onValueChange={setUsePremiumTheme}
                    trackColor={{ true: theme.primary, false: "#e0e0e0" }} 
                  />
                }
              />
            </View>
          </>
        )}

        <Text style={styles.sectionHeader}>პირადი მონაცემები</Text>
        <View style={[styles.settingsBlock, { backgroundColor: theme.card }]}>
          <SettingRow 
            icon="📅" 
            bgColor={isDark ? "#3d1e2a" : "#FFF0F5"} 
            title="ციკლი და პერიოდი" 
            value={`${cycleLength} / ${periodLength} დღე`}
            onPress={() => setShowCycleModal(true)}
            isDarkTheme={isDark}
            primaryColor={theme.primary}
          />
          <View style={[styles.divider, { backgroundColor: theme.divider }]} />
          <SettingRow 
            icon="🎯" 
            bgColor={isDark ? "#1a2a3d" : "#F0F4FF"} 
            title="ჩემი მიზანი" 
            value={goal}
            onPress={() => setShowGoalModal(true)}
            isDarkTheme={isDark}
            primaryColor={theme.primary}
          />
        </View>

        <Text style={styles.sectionHeader}>აპლიკაცია</Text>
        <View style={[styles.settingsBlock, { backgroundColor: theme.card }]}>
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
                trackColor={{ true: theme.primary, false: "#e0e0e0" }} 
              />
            }
          />
          <View style={[styles.divider, { backgroundColor: theme.divider }]} />
          <SettingRow 
            icon="🔒" 
            bgColor={isDark ? "#1e3d2a" : "#E6FFF0"} 
            title="კონფიდენციალურობა" 
            onPress={() => router.push("/privacy")}
            showArrow
            isDarkTheme={isDark}
          />
          <View style={[styles.divider, { backgroundColor: theme.divider }]} />
          <SettingRow 
            icon="📤" 
            bgColor={isDark ? "#2a1e3d" : "#F5F0FF"} 
            title="მონაცემების ექსპორტი" 
            subtitle="გაუზიარე ექიმს"
            onPress={exportUserData}
            showArrow
            isDarkTheme={isDark}
          />
        </View>

        <TouchableOpacity style={[styles.logoutBtn, { backgroundColor: theme.logoutBg }]} onPress={handleLogout}>
          <Text style={styles.logoutBtnText}>ანგარიშიდან გასვლა</Text>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* --- MODALS --- */}
      
      <Modal visible={showGoalModal} transparent animationType="slide" onRequestClose={() => setShowGoalModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowGoalModal(false)}>
          <View style={[styles.bottomSheet, { backgroundColor: theme.card }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.modalTitle, { color: theme.text }]}>რა არის შენი მიზანი?</Text>
            {goalOptions.map((option) => (
              <TouchableOpacity 
                key={option}
                style={[styles.optionCard, {backgroundColor: isDark ? "#252525" : "#F5F5F5"}, goal === option && {borderColor: theme.primary, borderWidth: 1}]}
                onPress={() => {
                  setGoal(option);
                  saveSettings(() => setShowGoalModal(false), { goal: option });
                }}
              >
                <Text style={[styles.optionText, {color: theme.text}, goal === option && {color: theme.primary, fontWeight: '700'}]}>{option}</Text>
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
            <TextInput 
              style={[styles.textInput, { backgroundColor: theme.input, color: theme.text }]}
              value={tempName}
              onChangeText={setTempName}
              placeholderTextColor={theme.subText}
            />
            <View style={styles.modalRowBtns}>
              <TouchableOpacity style={[styles.halfBtnGray, {backgroundColor: isDark ? "#333" : "#F5F5F5"}]} onPress={() => setShowProfileEdit(false)}>
                <Text style={styles.cancelBtnText}>გაუქმება</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.halfBtnPink, {backgroundColor: theme.primary}]} onPress={() => saveSettings(() => setShowProfileEdit(false))}>
                <Text style={styles.primaryBtnText}>შენახვა</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

    </View>
  );
}

// --- REUSABLE COMPONENTS ---

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
      <TouchableOpacity style={[styles.selectorBtn, {backgroundColor: isDark ? "#333" : "#fff"}, Number(value) <= min && { opacity: 0.3 }]} onPress={decrease}>
        <Text style={[styles.selectorBtnText, { color: primary }]}>-</Text>
      </TouchableOpacity>
      <Text style={[styles.valueText, { color: isDark ? "#fff" : "#1A1A1A" }]}>{value} <Text style={styles.valueLabel}>დღე</Text></Text>
      <TouchableOpacity style={[styles.selectorBtn, {backgroundColor: isDark ? "#333" : "#fff"}, Number(value) >= max && { opacity: 0.3 }]} onPress={increase}>
        <Text style={[styles.selectorBtnText, { color: primary }]}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { alignItems: "center", paddingTop: 70, paddingBottom: 30, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, elevation: 10, shadowOpacity: 0.15, shadowRadius: 20 },
  avatarContainer: { position: 'relative', marginBottom: 15 },
  avatar: { width: 90, height: 90, borderRadius: 45, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 36, fontWeight: "800" },
  editBadge: { position: 'absolute', bottom: 0, right: 0, width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: "#000", shadowOpacity: 0.1 },
  userName: { fontSize: 24, fontWeight: "800" },
  emailText: { fontSize: 14, marginTop: 4 },
  primeBadge: { marginTop: 12, backgroundColor: '#E94560', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10 },
  primeBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  sectionHeader: { fontSize: 12, fontWeight: "800", color: "#888", textTransform: "uppercase", letterSpacing: 1.5, marginTop: 35, marginBottom: 12, paddingHorizontal: 25 },
  settingsBlock: { borderRadius: 24, marginHorizontal: 20, overflow: 'hidden', elevation: 2 },
  divider: { height: 1, marginLeft: 70 },
  settingRow: { flexDirection: 'row', alignItems: 'center', padding: 18, paddingRight: 20 },
  iconBox: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  settingTextContainer: { flex: 1 },
  settingTitle: { fontSize: 16, fontWeight: "700" },
  settingSubtitle: { fontSize: 12, marginTop: 2 },
  settingValue: { fontSize: 15, fontWeight: "800" },
  arrowIcon: { fontSize: 24, color: "#ccc", marginLeft: 10 },
  logoutBtn: { marginHorizontal: 20, marginTop: 30, paddingVertical: 20, borderRadius: 24, alignItems: 'center' },
  logoutBtnText: { color: '#FF3B30', fontSize: 16, fontWeight: '800' },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  bottomSheet: { borderTopLeftRadius: 35, borderTopRightRadius: 35, padding: 25, paddingBottom: 50 },
  sheetHandle: { width: 45, height: 6, backgroundColor: "#ddd", borderRadius: 3, alignSelf: "center", marginBottom: 25 },
  modalOverlayCenter: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 20 },
  centerModal: { borderRadius: 32, padding: 30 },
  modalTitle: { fontSize: 24, fontWeight: "900", marginBottom: 25, textAlign: "center" },
  modalCard: { padding: 20, borderRadius: 22, marginBottom: 15 },
  modalLabel: { fontSize: 14, fontWeight: "700", marginBottom: 18, textAlign: 'center' },
  selectorContainer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderRadius: 20, padding: 6 },
  selectorBtn: { width: 55, height: 55, borderRadius: 16, justifyContent: "center", alignItems: "center" },
  selectorBtnText: { fontSize: 28, fontWeight: "600" },
  valueText: { fontSize: 26, fontWeight: "900" },
  valueLabel: { fontSize: 14, color: '#888' },
  inputLabel: { fontSize: 14, fontWeight: "700", marginBottom: 10 },
  textInput: { padding: 18, borderRadius: 18, fontSize: 16, marginBottom: 30 },
  primaryBtn: { paddingVertical: 20, borderRadius: 22, alignItems: "center", marginTop: 10 },
  primaryBtnText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  cancelBtn: { paddingVertical: 20, alignItems: "center", marginTop: 10 },
  cancelBtnText: { color: "#888", fontSize: 16, fontWeight: "700" },
  modalRowBtns: { flexDirection: 'row', justifyContent: 'space-between' },
  halfBtnGray: { width: '47%', paddingVertical: 18, borderRadius: 18, alignItems: 'center' },
  halfBtnPink: { width: '47%', paddingVertical: 18, borderRadius: 18, alignItems: 'center' },
  optionCard: { padding: 20, borderRadius: 20, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  optionText: { fontSize: 16 },
});