import { Audio } from "expo-av"; // 👈 დამატებულია ხმა
import * as Haptics from "expo-haptics"; // 👈 დამატებულია ვიბრაცია
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { TEMP_LANGUAGE_PICKER_ENABLED } from "../constants/tempFlags";
import { useLanguage } from "../context/LanguageContext";
import { fixFutureCycleDatesForCurrentUser } from "../services/cycleDataMigration";
import { syncCycleRemindersForUser } from "../services/notifications";
import { translate } from "../services/i18n";
import { supabase } from "../services/supabase";

const { width, height } = Dimensions.get("window");
const SPLASH_IMAGE = require("../assets/images/splash-hero.png");

export default function Splash() {
  const router = useRouter();
  const { t, languages, setLanguage, hasChosenLanguage, isLanguageLoaded } = useLanguage();

  // The language picker shows once, to fresh installs only (no session and no
  // stored choice). Signed-in users never see it — they keep Georgian unless
  // they change it in the profile. Behind TEMP_LANGUAGE_PICKER_ENABLED.
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const pickerOpacity = useRef(new Animated.Value(0)).current;
  const pendingRouteRef = useRef("/onboarding/name");
  const languageStateRef = useRef({ hasChosenLanguage, isLanguageLoaded });
  languageStateRef.current = { hasChosenLanguage, isLanguageLoaded };

  // A fresh install (no session, no stored language) is about to be asked for
  // its language, so the splash copy itself is shown in English rather than
  // Georgian. Signed-in users keep their language. The session read is a local
  // storage lookup and resolves long before the title fades in.
  const [hasSession, setHasSession] = useState(null);
  useEffect(() => {
    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => mounted && setHasSession(Boolean(data?.session)))
      .catch(() => mounted && setHasSession(false));
    return () => {
      mounted = false;
    };
  }, []);
  const freshInstall = TEMP_LANGUAGE_PICKER_ENABLED && hasSession === false && !hasChosenLanguage;
  const splashText = (key) => (freshInstall ? translate("en", key) : t(key));

  // --- ანიმაციების სტეიტები ---
  const mainOpacity = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(0)).current;
  const imageZoom = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslateY = useRef(new Animated.Value(20)).current;

  // ლოგოს ძლიერი პულსაცია
  const glowAnim = useRef(new Animated.Value(1)).current;

  // ფონის ანიმაციები
  const floatAnim1 = useRef(new Animated.Value(0)).current;
  const floatAnim2 = useRef(new Animated.Value(0)).current;

  // --- ახალი: ვარსკვლავის და ხაზის ანიმაცია ---
  const magicAnim = useRef(new Animated.Value(0)).current; // აკონტროლებს მოძრაობას და ხაზს
  const starPulse = useRef(new Animated.Value(1)).current; // აკონტროლებს ვარსკვლავის ციმციმს

  // ხმის დაკვრის ფუნქცია
  const playMagicSound = async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(
        require("../assets/sounds/magic.mp3")
      );
      await sound.playAsync();
      // მეხსიერების გასუფთავება დაკვრის დასრულებისას
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          sound.unloadAsync();
        }
      });
    } catch (error) {
      console.log("ხმის დაკვრა ვერ მოხერხდა:", error);
    }
  };

  useEffect(() => {
    // 1. პატარა ვიბრაცია აპლიკაციის გახსნისთანავე
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const initUser = async () => {
      // 1. ვაყოვნებთ 4.5 წამი, რომ მთელი ეს მაგია კარგად გამოჩნდეს
      await new Promise((resolve) => setTimeout(resolve, 4500));

      const { data: sessionData } = await supabase.auth.getSession();

      // დეფოლტად (თუ არ არის სესია) მიდის ონბორდინგზე
      let nextRoute = "/onboarding/name";

      // 2. ვამოწმებთ, აქვს თუ არა სესია და გავლილი ონბორდინგი
      if (sessionData?.session) {
        const user = sessionData.session.user;
        try {
          const migrationResult = await fixFutureCycleDatesForCurrentUser();
          if (migrationResult.fixedProfile || migrationResult.fixedCycles > 0) {
            await syncCycleRemindersForUser();
          }
        } catch (migrationError) {
          console.log("Cycle date migration failed:", migrationError);
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("onboarding_completed")
          .eq("id", user.id)
          .single();

        if (profile?.onboarding_completed) {
          nextRoute = "/(tabs)"; // თუ ყველაფერი გავლილი აქვს, მიდის მთავარ ეკრანზე
        }
      }

      const shouldAskLanguage =
        TEMP_LANGUAGE_PICKER_ENABLED &&
        !sessionData?.session &&
        languageStateRef.current.isLanguageLoaded &&
        !languageStateRef.current.hasChosenLanguage;

      if (shouldAskLanguage) {
        pendingRouteRef.current = nextRoute;
        setShowLanguagePicker(true);
        Animated.timing(pickerOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start();
        return;
      }

      leaveTo(nextRoute);
    };

    // 3. ნელი გაქრობა სხვა ეკრანზე გადასვლამდე
    const leaveTo = (route) => {
      Animated.timing(mainOpacity, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }).start(() => {
        router.replace(route);
      });
    };

    initUser();

    // --- 1. ლოგოს და ტექსტის შემოსვლა ---
    Animated.sequence([
      Animated.spring(logoScale, {
        toValue: 1,
        tension: 15,
        friction: 4,
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.timing(textOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(textTranslateY, { toValue: 0, duration: 800, useNativeDriver: true }),
      ]),
    ]).start();

    Animated.timing(imageZoom, {
      toValue: 1,
      duration: 4500,
      useNativeDriver: true,
    }).start();

    // --- 2. ლოგოს გაძლიერებული ფეთქვა (1.6-მდე იზრდება) ---
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1.6, duration: 1200, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    ).start();

    // --- 3. ვარსკვლავის მაგიური ხაზი + ხმა და ვიბრაცია ---
    Animated.sequence([
      Animated.delay(600), // ოდნავ იცდის დასაწყისში
      // ეტაპი 1: ვარსკვლავი მიდის მარჯვნივ და ტოვებს ხაზს (1.5 წამი)
      Animated.timing(magicAnim, { toValue: 1, duration: 1500, useNativeDriver: false }),
    ]).start(() => {
      // 👈 როცა ვარსკვლავი პირველ ეტაპს დაასრულებს, ჩაირთოს ხმა და ვიბრაცია
      playMagicSound();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // ეტაპი 2: ვარსკვლავი რჩება და ციმციმებს, ხაზი კი მარცხნიდან ნელ-ნელა ქრება (2 წამი)
      Animated.timing(magicAnim, { toValue: 2, duration: 2000, useNativeDriver: false }).start();
    });

    // ვარსკვლავის მუდმივი ციმციმი (Pulse)
    Animated.loop(
      Animated.sequence([
        Animated.timing(starPulse, { toValue: 1.6, duration: 400, useNativeDriver: true }),
        Animated.timing(starPulse, { toValue: 1, duration: 400, useNativeDriver: true }),
      ])
    ).start();

    // --- 4. ფონის ჰაეროვანი მოძრაობა ---
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim1, { toValue: 1, duration: 4000, useNativeDriver: true }),
        Animated.timing(floatAnim1, { toValue: 0, duration: 4000, useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim2, { toValue: 1, duration: 5000, useNativeDriver: true }),
        Animated.timing(floatAnim2, { toValue: 0, duration: 5000, useNativeDriver: true }),
      ])
    ).start();
  }, [floatAnim1, floatAnim2, glowAnim, imageZoom, logoScale, magicAnim, mainOpacity, pickerOpacity, router, starPulse, textOpacity, textTranslateY]);

  const handlePickLanguage = async (code) => {
    await setLanguage(code);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.timing(mainOpacity, { toValue: 0, duration: 600, useNativeDriver: true }).start(() => {
      router.replace(pendingRouteRef.current);
    });
  };

  // --- მაგიური ანიმაციის გამოთვლები ---
  const starLeft = magicAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 240, 240] });
  const tailLeft = magicAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 0, 240] });
  const tailWidth = magicAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 240, 0] });
  const translateY1 = floatAnim1.interpolate({ inputRange: [0, 1], outputRange: [0, -30] });
  const translateY2 = floatAnim2.interpolate({ inputRange: [0, 1], outputRange: [0, 40] });
  const splashImageScale = imageZoom.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.02] });
  const splashImageTranslateY = imageZoom.interpolate({ inputRange: [0, 1], outputRange: [6, -6] });

  return (
    <Animated.View style={{ flex: 1, opacity: mainOpacity }}>
      <LinearGradient colors={["#FFFFFF", "#FFF0F5", "#FFD6E7"]} style={styles.container}>
        {/* ფონის წრეები */}
        <Animated.View style={[styles.blurCircle, styles.circle1, { transform: [{ translateY: translateY1 }] }]} />
        <Animated.View style={[styles.blurCircle, styles.circle2, { transform: [{ translateY: translateY2 }] }]} />
        <Animated.View style={[styles.blurCircle, styles.circle3, { transform: [{ translateY: translateY1 }] }]} />

        <View style={styles.center}>
          {/* --- ვარსკვლავი და ხაზი ლოგოს თავზე --- */}
          <View style={styles.magicContainer}>
            {/* ვარდისფერი ხაზი (კუდი) */}
            <Animated.View style={[styles.magicTrail, { left: tailLeft, width: tailWidth }]} />

            {/* მბზინავი ვარსკვლავი */}
            <Animated.View style={[styles.magicStarWrapper, { left: starLeft }]}>
              <Animated.Text style={[styles.pinkStar, { transform: [{ scale: starPulse }] }]}>
                ✦
              </Animated.Text>
            </Animated.View>
          </View>

          <View style={styles.logoWrapper}>
            <Animated.View style={[styles.splashImageFrame, { transform: [{ scale: logoScale }] }]}>
              <Animated.View
                style={[
                  styles.splashImageMotion,
                  {
                    transform: [
                      { scale: splashImageScale },
                      { translateY: splashImageTranslateY },
                    ],
                  },
                ]}
              >
                <Image
                  source={SPLASH_IMAGE}
                  style={styles.splashImage}
                  contentFit="contain"
                  transition={180}
                  onError={(error) => console.log("Splash image error:", error)}
                />
              </Animated.View>
            </Animated.View>
          </View>

          <Animated.View style={{ opacity: textOpacity, transform: [{ translateY: textTranslateY }], alignItems: "center" }}>
            <Text style={styles.title}>{splashText("splash.title")}</Text>
            <Text style={styles.subtitle}>{splashText("splash.subtitle")}</Text>
          </Animated.View>

          {showLanguagePicker && (
            <Animated.View style={[styles.languagePicker, { opacity: pickerOpacity }]}>
              <Text style={styles.languageTitle}>{splashText("language.title")}</Text>
              <View style={styles.languageRow}>
                {languages.map((item) => (
                  <TouchableOpacity
                    key={item.code}
                    style={styles.languageButton}
                    onPress={() => handlePickLanguage(item.code)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.languageFlag}>{item.flag}</Text>
                    <Text style={styles.languageLabel}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.languageSubtitle}>{splashText("language.subtitle")}</Text>
            </Animated.View>
          )}
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", overflow: "hidden" },
  center: { alignItems: "center", zIndex: 10 },
  magicContainer: { position: "absolute", top: -80, width: 240, height: 40, justifyContent: "center", zIndex: 20 },
  magicTrail: { position: "absolute", height: 3, backgroundColor: "#ff4d88", borderRadius: 2, shadowColor: "#ff4d88", shadowOpacity: 1, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  magicStarWrapper: { position: "absolute", transform: [{ translateX: -12 }, { translateY: -17 }] },
  pinkStar: { color: "#ff4d88", fontSize: 28, textShadowColor: "rgba(255, 77, 136, 0.8)", textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10 },
  logoWrapper: { justifyContent: "center", alignItems: "center", marginBottom: 18, width: width, height: height * 0.48, transform: [{ translateY: -50 }] },
  glowRing: { position: "absolute", width: 170, height: 170, borderRadius: 85, backgroundColor: "#ff4d88" },
  glowRing2: { position: "absolute", width: 210, height: 210, borderRadius: 105, backgroundColor: "rgba(255, 77, 136, 0.5)" },
  splashImageFrame: { width: width * 0.92, height: height * 0.44, overflow: "visible" },
  splashImageMotion: { width: "100%", height: "100%" },
  splashImage: { width: "100%", height: "100%" },
  logoContainer: { width: 110, height: 110, borderRadius: 55, backgroundColor: "#ff4d88", justifyContent: "center", alignItems: "center", elevation: 15, shadowColor: "#ff4d88", shadowOpacity: 0.6, shadowRadius: 25, shadowOffset: { width: 0, height: 12 }, borderWidth: 3, borderColor: "rgba(255, 255, 255, 0.6)" },
  logo: { fontSize: 50 },
  title: { fontSize: 42, fontWeight: "900", color: "#ff4d88", letterSpacing: 1, textShadowColor: "rgba(255, 77, 136, 0.2)", textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 10 },
  subtitle: { marginTop: 12, fontSize: 16, color: "#7A5C6A", fontWeight: "600", textAlign: "center", letterSpacing: 0.5 },
  languagePicker: { marginTop: 28, alignItems: "center", width: width - 60 },
  languageTitle: { fontSize: 15, fontWeight: "800", color: "#ff4d88", letterSpacing: 0.5, marginBottom: 14 },
  languageRow: { flexDirection: "row", justifyContent: "center", gap: 10 },
  languageButton: { flex: 1, backgroundColor: "#fff", borderRadius: 18, paddingVertical: 12, alignItems: "center", borderWidth: 2, borderColor: "#FFD6E7", elevation: 6, shadowColor: "#ff4d88", shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  languageFlag: { fontSize: 26, marginBottom: 4 },
  languageLabel: { fontSize: 13, fontWeight: "700", color: "#7A5C6A" },
  languageSubtitle: { marginTop: 12, fontSize: 12, color: "#A08494", fontWeight: "500", textAlign: "center" },
  blurCircle: { position: "absolute", borderRadius: width, opacity: 0.6 },
  circle1: { width: width * 1.2, height: width * 1.2, backgroundColor: "#FFEAF2", top: -width * 0.5, right: -width * 0.3 },
  circle2: { width: width, height: width, backgroundColor: "#FFF0F5", bottom: -width * 0.4, left: -width * 0.3 },
  circle3: { width: width * 0.8, height: width * 0.8, backgroundColor: "rgba(255, 214, 231, 0.5)", top: height * 0.3, left: -width * 0.4 },
});
