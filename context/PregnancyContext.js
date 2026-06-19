import dayjs from "dayjs";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AppState } from "react-native";

import { supabase } from "../services/supabase";
import { schedulePregnancyNotifications, syncCycleRemindersForUser } from "../services/notifications";
import { resolvePregnancyAccessFromProfile } from "../services/purchases";

const PregnancyContext = createContext(null);

export function PregnancyProvider({ children }) {
  const [pregnancyMode, setPregnancyMode] = useState(false);
  const [pregnancyStartDate, setPregnancyStartDate] = useState(null);
  const [hasSubscription, setHasSubscription] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadPregnancyData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("profiles")
        .select("pregnancy_mode, pregnancy_start_date, has_pregnancy_subscription, pregnancy_until")
        .eq("id", user.id)
        .single();

      if (data) {
        const hasPaidAccess = resolvePregnancyAccessFromProfile(data);
        const nextPregnancyMode = data.pregnancy_mode ?? false;
        const nextStartDate = data.pregnancy_start_date ?? null;
        const nextHasSubscription = Boolean(hasPaidAccess || nextPregnancyMode);

        if (nextHasSubscription && !data.has_pregnancy_subscription) {
          await supabase
            .from("profiles")
            .update({ has_pregnancy_subscription: true })
            .eq("id", user.id);
        }

        if (!hasPaidAccess && data.has_pregnancy_subscription) {
          await supabase
            .from("profiles")
            .update({ has_pregnancy_subscription: false })
            .eq("id", user.id);
        }

        setPregnancyMode(nextPregnancyMode);
        setPregnancyStartDate(nextStartDate);
        setHasSubscription(nextHasSubscription);
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

  const enablePregnancyMode = useCallback(async (startDate) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("profiles").update({
      pregnancy_mode: true,
      pregnancy_start_date: startDate,
      has_pregnancy_subscription: true,
    }).eq("id", user.id);

    setPregnancyMode(true);
    setPregnancyStartDate(startDate);
    setHasSubscription(true);

    // Defer notification scheduling so UI re-render completes first
    setTimeout(() => {
      schedulePregnancyNotifications(startDate).catch(() => {});
    }, 500);
  }, []);

  const disablePregnancyMode = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const updatePayload = {
      pregnancy_mode: false,
    };

    if (hasSubscription) {
      updatePayload.has_pregnancy_subscription = true;
    }

    await supabase.from("profiles").update(updatePayload).eq("id", user.id);

    setPregnancyMode(false);

    // Defer so UI re-render completes before notification rescheduling
    setTimeout(() => {
      syncCycleRemindersForUser().catch(() => {});
    }, 500);
  }, [hasSubscription]);

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
      loading,
      currentWeek,
      currentTrimester,
      daysRemaining,
      enablePregnancyMode,
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
