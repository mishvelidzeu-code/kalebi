import dayjs from "dayjs";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { supabase } from "../services/supabase";
import { schedulePregnancyNotifications, syncCycleRemindersForUser } from "../services/notifications";

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
        .select("pregnancy_mode, pregnancy_start_date, has_pregnancy_subscription")
        .eq("id", user.id)
        .single();

      if (data) {
        setPregnancyMode(data.pregnancy_mode ?? false);
        setPregnancyStartDate(data.pregnancy_start_date ?? null);
        setHasSubscription(data.has_pregnancy_subscription ?? false);
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

    await supabase.from("profiles").update({
      pregnancy_mode: false,
    }).eq("id", user.id);

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
