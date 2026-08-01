import dayjs from "dayjs";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";

import { isAdminEmail, isTestAccountEmail } from "../services/adminAccess";
import { supabase } from "../services/supabase";
import { schedulePregnancyNotifications, syncCycleRemindersForUser } from "../services/notifications";
import {
  checkPregnancySubscriptionStatus,
  resolvePregnancyAccessFromProfile,
} from "../services/purchases";

const PregnancyContext = createContext(null);

export function PregnancyProvider({ children }) {
  const [pregnancyMode, setPregnancyMode] = useState(false);
  const [pregnancyStartDate, setPregnancyStartDate] = useState(null);
  const [hasSubscription, setHasSubscription] = useState(false);
  // True when the user is still marked as pregnant in the database but the
  // subscription behind it is gone. Lets the UI explain the switch back to the
  // normal mode instead of silently changing under her.
  const [accessLapsed, setAccessLapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  // Whose data is currently in state. Used to tell a real account switch apart
  // from a routine token refresh, so the screens are not reset for no reason.
  const loadedUserIdRef = useRef(null);

  const loadPregnancyData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        loadedUserIdRef.current = null;
        setPregnancyMode(false);
        setPregnancyStartDate(null);
        setHasSubscription(false);
        setAccessLapsed(false);
        return;
      }

      loadedUserIdRef.current = user.id;

      // iOS: ask the store first, so pregnancy_until reflects renewals and
      // cancellations before we read it. Without this the profile keeps the
      // expiry of the very first billing period forever — a renewing subscriber
      // would lose access after a month and a cancelled one would keep it.
      // Android's source of truth is the profile row itself, so it is skipped.
      if (Platform.OS === "ios") {
        try {
          await checkPregnancySubscriptionStatus();
        } catch (error) {
          // Offline or a store hiccup — fall back to the stored profile values.
          console.log("Pregnancy subscription refresh skipped:", error);
        }
      }

      const { data } = await supabase
        .from("profiles")
        .select("pregnancy_mode, pregnancy_start_date, has_pregnancy_subscription, pregnancy_until")
        .eq("id", user.id)
        .single();

      if (data) {
        // Access comes from the store (or a free-mode account) and never from
        // pregnancy_mode itself. Treating the mode flag as proof of payment is
        // what used to keep cancelled subscriptions alive forever.
        const access =
          isAdminEmail(user.email)
          || isTestAccountEmail(user.email)
          || resolvePregnancyAccessFromProfile(data);

        setHasSubscription(access);
        // The pregnancy_mode column stays untouched, so the whole experience
        // (and its data) comes straight back on renewal — access only gates
        // what the app shows right now.
        setPregnancyMode(Boolean(data.pregnancy_mode) && access);
        setAccessLapsed(Boolean(data.pregnancy_mode) && !access);
        setPregnancyStartDate(data.pregnancy_start_date ?? null);
      }
    } catch (error) {
      console.error("PregnancyContext load error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPregnancyData();
  }, [loadPregnancyData]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        loadPregnancyData();
      }
    });

    return () => subscription.remove();
  }, [loadPregnancyData]);

  // Sign-out and account switches must not leave the previous user's pregnancy
  // state on screen. Token refreshes fire here too, so compare the user id
  // first — clearing on every refresh would remount the pregnancy screens.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id ?? null;
      if (nextUserId === loadedUserIdRef.current) {
        return;
      }

      loadedUserIdRef.current = nextUserId;
      setPregnancyMode(false);
      setPregnancyStartDate(null);
      setHasSubscription(false);
      setAccessLapsed(false);

      if (nextUserId) {
        loadPregnancyData();
      }
    });

    return () => subscription?.unsubscribe?.();
  }, [loadPregnancyData]);

  const enablePregnancyMode = useCallback(async (startDate) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // has_pregnancy_subscription is owned by services/purchases.js — the store
    // is the only thing allowed to grant access. Turning the mode on must never
    // write it, otherwise the mode itself becomes a free, never-expiring pass.
    await supabase.from("profiles").update({
      pregnancy_mode: true,
      pregnancy_start_date: startDate,
    }).eq("id", user.id);

    setPregnancyMode(true);
    setPregnancyStartDate(startDate);
    // Every caller verifies access before reaching this point (paid, restored,
    // or a free-mode account), so mirror it now instead of waiting for a reload.
    setHasSubscription(true);

    // Defer notification scheduling so UI re-render completes first
    setTimeout(() => {
      schedulePregnancyNotifications(startDate).catch(() => {});
    }, 500);
  }, []);

  const updatePregnancyStartDate = useCallback(async (startDate) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("profiles").update({
      pregnancy_start_date: startDate,
    }).eq("id", user.id);

    setPregnancyStartDate(startDate);

    setTimeout(() => {
      schedulePregnancyNotifications(startDate).catch(() => {});
    }, 500);
  }, []);

  const disablePregnancyMode = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Only the mode is switched off. The subscription is deliberately left
    // alone — it lives in the store and is cancelled from App Store →
    // Subscriptions, and re-asserting the flag here would resurrect access that
    // the store has already taken away.
    await supabase.from("profiles").update({ pregnancy_mode: false }).eq("id", user.id);

    setPregnancyMode(false);

    // Defer so UI re-render completes before notification rescheduling
    setTimeout(() => {
      syncCycleRemindersForUser().catch(() => {});
    }, 500);
  }, []);

  const currentWeek = pregnancyStartDate
    ? Math.min(Math.floor(dayjs().diff(dayjs(pregnancyStartDate), "day") / 7) + 1, 40)
    : null;

  const currentTrimester = currentWeek
    ? currentWeek <= 12 ? 1 : currentWeek <= 27 ? 2 : 3
    : null;

  const daysRemaining = pregnancyStartDate
    ? Math.max(0, 280 - dayjs().diff(dayjs(pregnancyStartDate), "day"))
    : null;

  return (
    <PregnancyContext.Provider value={{
      pregnancyMode,
      pregnancyStartDate,
      hasSubscription,
      accessLapsed,
      loading,
      currentWeek,
      currentTrimester,
      daysRemaining,
      enablePregnancyMode,
      updatePregnancyStartDate,
      disablePregnancyMode,
      reload: loadPregnancyData,
    }}>
      {children}
    </PregnancyContext.Provider>
  );
}

export function usePregnancy() {
  const ctx = useContext(PregnancyContext);
  if (!ctx) throw new Error("usePregnancy must be used inside PregnancyProvider");
  return ctx;
}
