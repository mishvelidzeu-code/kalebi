import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { useCallback, useMemo, useState } from "react";
import { Alert, DeviceEventEmitter } from "react-native";

import { invalidateAssistantContextCache } from "../services/assistantOrchestrator";
import { syncCycleRemindersForUser } from "../services/notifications";
import { supabase } from "../services/supabase";
import { getCycleWindowDates } from "../utils/cycleEngine";
import {
  getPreferredCycleLength,
  getPreferredPeriodLength,
} from "../utils/cyclePrediction";

dayjs.extend(customParseFormat);
dayjs.extend(utc);
dayjs.extend(timezone);

export const useCycles = () => {
  const [rawCycles, setRawCycles] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const [cyclesRes, profileRes] = await Promise.all([
        supabase
          .from("cycles")
          .select("*")
          .eq("user_id", user.id)
          .order("start_date", { ascending: true }),
        supabase.from("profiles").select("*").eq("id", user.id).single(),
      ]);

      let fetchedCycles = cyclesRes.data || [];
      const profData = profileRes.data;

      if (fetchedCycles.length === 0 && profData?.last_period) {
        fetchedCycles = [
          {
            id: "profile_fallback",
            start_date: profData.last_period,
            period_length: profData.period_length || 5,
            cycle_length: profData.cycle_length || 28,
            isProfileFallback: true,
          },
        ];
      }

      setRawCycles(fetchedCycles);
      setProfile(profData);
    } catch (error) {
      console.error("Data error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const addCycle = async (dateString) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const avgPeriod = getPreferredPeriodLength(rawCycles, profile);
      const avgCycle = getPreferredCycleLength(rawCycles, profile);
      const formattedDate = dayjs(dateString).format("YYYY-MM-DD");

      const { error } = await supabase.from("cycles").insert([
        {
          user_id: user.id,
          start_date: formattedDate,
          period_length: avgPeriod,
          cycle_length: avgCycle,
        },
      ]);

      if (error) throw error;

      invalidateAssistantContextCache();
      await loadData();
      await syncCycleRemindersForUser();
      DeviceEventEmitter.emit("cycleUpdated");
    } catch (error) {
      console.error("Error adding cycle:", error);
    }
  };

  const deleteCycle = async (cycleObj) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      if (!cycleObj.isProfileFallback && cycleObj.id !== "profile_fallback") {
        const { error: deleteError } = await supabase
          .from("cycles")
          .delete()
          .eq("id", cycleObj.id);

        if (deleteError) throw deleteError;
      }

      const { data: remainingCycles, error: remainingCyclesError } =
        await supabase
          .from("cycles")
          .select("start_date")
          .eq("user_id", user.id)
          .order("start_date", { ascending: false })
          .limit(1);

      if (remainingCyclesError) throw remainingCyclesError;

      const nextLastPeriod = remainingCycles?.[0]?.start_date ?? null;

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ last_period: nextLastPeriod })
        .eq("id", user.id);

      if (profileError) throw profileError;

      invalidateAssistantContextCache();
      await syncCycleRemindersForUser();
      DeviceEventEmitter.emit("cycleUpdated");
      await loadData();

      Alert.alert("წარმატება", "მონაცემები წარმატებით წაიშალა ✨");
    } catch (error) {
      console.error("Error deleting cycle:", error);
      Alert.alert("შეცდომა", "წაშლა ვერ მოხერხდა.");
    }
  };

  const markedDates = useMemo(() => {
    const marks = {};
    if (!profile && rawCycles.length === 0) return {};

    const avgCycle = getPreferredCycleLength(rawCycles, profile);
    const avgPeriod = getPreferredPeriodLength(rawCycles, profile);
    const lastStart =
      rawCycles.length > 0
        ? rawCycles[rawCycles.length - 1].start_date
        : profile?.last_period;

    if (!lastStart) return {};

    const allCycles = rawCycles.map((cycle) => ({
      ...cycle,
      isPrediction: false,
    }));
    let nextStart = dayjs(lastStart, "YYYY-MM-DD");

    for (let i = 0; i < 6; i += 1) {
      nextStart = nextStart.add(avgCycle, "day");
      allCycles.push({
        start_date: nextStart.format("YYYY-MM-DD"),
        period_length: avgPeriod,
        cycle_length: avgCycle,
        isPrediction: true,
      });
    }

    allCycles.forEach((cycle) => {
      const start = dayjs(cycle.start_date, "YYYY-MM-DD");
      const isPred = cycle.isPrediction;
      const cyclePeriodLength = cycle.period_length || avgPeriod;
      const cycleLength = cycle.cycle_length || avgCycle;

      for (let i = 0; i < cyclePeriodLength; i += 1) {
        const date = start.add(i, "day").format("YYYY-MM-DD");
        marks[date] = {
          selected: true,
          selectedColor: isPred ? "#ff4d8880" : "#ff4d88",
          startingDay: i === 0,
          endingDay: i === cyclePeriodLength - 1,
        };
      }

      const cycleWindow = getCycleWindowDates(cycle.start_date, cycleLength);
      if (!cycleWindow) return;

      const ovulation = cycleWindow.ovulation;
      const ovDateStr = ovulation.format("YYYY-MM-DD");

      if (!marks[ovDateStr]) {
        marks[ovDateStr] = {
          selected: true,
          selectedColor: isPred ? "#ffd16680" : "#ffd166",
        };
      }

      const fertileDays = cycleWindow.fertileEnd.diff(cycleWindow.fertileStart, "day");
      for (let i = 0; i <= fertileDays; i += 1) {
        const fertileDate = cycleWindow.fertileStart.add(i, "day").format("YYYY-MM-DD");
        if (!marks[fertileDate]) {
          marks[fertileDate] = {
            selected: true,
            selectedColor: isPred ? "#06d6a080" : "#06d6a0",
          };
        }
      }
    });

    return marks;
  }, [rawCycles, profile]);

  return { markedDates, loadData, addCycle, deleteCycle, rawCycles, loading };
};
