import { Audio } from "expo-av"; // 👈 დამატებულია ხმა
import * as Haptics from "expo-haptics"; // 👈 დამატებულია ვიბრაცია
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, Dimensions, StyleSheet, Text, View } from "react-native";
import { supabase } from "../services/supabase";

const { width, height } = Dimensions.get("window");

export default function Splash() {
  const router = useRouter();

  // --- ანიმაციების სტეიტები ---
  const mainOpacity = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(0)).current;
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
        const { data: profile } = await supabase
          .from("profiles")
          .select("onboarding_completed")
          .eq("id", user.id)
          .single();

        if (profile?.onboarding_completed) {
          nextRoute = "/(tabs)"; // თუ ყველაფერი გავლილი აქვს, მიდის მთავარ ეკრანზე
        }
      }

      // 3. ნელი გაქრობა სხვა ეკრანზე გადასვლამდე
      Animated.timing(mainOpacity, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }).start(() => {
        router.replace(nextRoute);
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
  }, []);

  // --- მაგიური ანიმაციის გამოთვლები ---
  const starLeft = magicAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 240, 240] });
  const tailLeft = magicAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 0, 240] });
  const tailWidth = magicAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 240, 0] });
  const glowOpacity = glowAnim.interpolate({ inputRange: [1, 1.6], outputRange: [0.5, 0] });
  const translateY1 = floatAnim1.interpolate({ inputRange: [0, 1], outputRange: [0, -30] });
  const translateY2 = floatAnim2.interpolate({ inputRange: [0, 1], outputRange: [0, 40] });

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
            <Animated.View style={[styles.glowRing, { transform: [{ scale: glowAnim }], opacity: glowOpacity }]} />
            <Animated.View style={[styles.glowRing2, { transform: [{ scale: glowAnim }], opacity: glowOpacity }]} />

            <Animated.View style={[styles.logoContainer, { transform: [{ scale: logoScale }] }]}>
              <Text style={styles.logo}>✨</Text>
            </Animated.View>
          </View>

          <Animated.View style={{ opacity: textOpacity, transform: [{ translateY: textTranslateY }], alignItems: "center" }}>
            <Text style={styles.title}>შენი რიტმი</Text>
            <Text style={styles.subtitle}>აღმოაჩინე შენი სხეულის ჰარმონია</Text>
          </Animated.View>
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
  logoWrapper: { justifyContent: "center", alignItems: "center", marginBottom: 40, width: 160, height: 160 },
  glowRing: { position: "absolute", width: 120, height: 120, borderRadius: 60, backgroundColor: "#ff4d88" },
  glowRing2: { position: "absolute", width: 150, height: 150, borderRadius: 75, backgroundColor: "rgba(255, 77, 136, 0.5)" },
  logoContainer: { width: 110, height: 110, borderRadius: 55, backgroundColor: "#ff4d88", justifyContent: "center", alignItems: "center", elevation: 15, shadowColor: "#ff4d88", shadowOpacity: 0.6, shadowRadius: 25, shadowOffset: { width: 0, height: 12 }, borderWidth: 3, borderColor: "rgba(255, 255, 255, 0.6)" },
  logo: { fontSize: 50 },
  title: { fontSize: 42, fontWeight: "900", color: "#ff4d88", letterSpacing: 1, textShadowColor: "rgba(255, 77, 136, 0.2)", textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 10 },
  subtitle: { marginTop: 12, fontSize: 16, color: "#7A5C6A", fontWeight: "600", textAlign: "center", letterSpacing: 0.5 },
  blurCircle: { position: "absolute", borderRadius: width, opacity: 0.6 },
  circle1: { width: width * 1.2, height: width * 1.2, backgroundColor: "#FFEAF2", top: -width * 0.5, right: -width * 0.3 },
  circle2: { width: width, height: width, backgroundColor: "#FFF0F5", bottom: -width * 0.4, left: -width * 0.3 },
  circle3: { width: width * 0.8, height: width * 0.8, backgroundColor: "rgba(255, 214, 231, 0.5)", top: height * 0.3, left: -width * 0.4 },
});