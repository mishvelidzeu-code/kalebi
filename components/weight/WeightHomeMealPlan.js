import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { getCurrentUser } from "../../services/currentUser";
import { supabase } from "../../services/supabase";
import { getWeightLogsRange, getWeightProfile } from "../../services/weightLogs";
import { calculateCycleState } from "../../utils/cycleEngine";
import { getPreferredCycleLength, getPreferredPeriodLength } from "../../utils/cyclePrediction";
import dayjs from "../../utils/dayjs";
import { getAgeFromBirthDate } from "../../utils/fertilityInsights";
import { annotateWeightLogs, getDailyCalorieTarget, getWeightPhaseGuide, normalizeWeightLogs } from "../../utils/weightStats";
import WeightMealPlanCard from "./WeightMealPlanCard";

// Today's menu on the home screen, under the daily advice. Same card as on the
// weight statistics screen, fed the same numbers (7-day average weight →
// calories, today's cycle stage), so both show one shared menu.
export default function WeightHomeMealPlan() {
  const [inputs, setInputs] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await getCurrentUser();
      if (!user) return;

      const today = dayjs().format("YYYY-MM-DD");
      const [profile, cyclesRes, rows] = await Promise.all([
        getWeightProfile(),
        supabase.from("cycles").select("start_date, cycle_length, period_length").eq("user_id", user.id).order("start_date", { ascending: true }),
        getWeightLogsRange(dayjs().subtract(1, "year").format("YYYY-MM-DD"), today),
      ]);
      if (!profile) return;

      const cycles = cyclesRes.data || [];
      const cycleRows = cycles.length ? cycles : profile.last_period ? [{ start_date: profile.last_period }] : [];
      const cycleLength = getPreferredCycleLength(cycles, profile);
      const periodLength = getPreferredPeriodLength(cycles, profile);
      const annotated = annotateWeightLogs(normalizeWeightLogs(rows), cycleRows, { cycleLength, periodLength });
      const latest = annotated[annotated.length - 1] || null;
      const calories = getDailyCalorieTarget({
        weightKg: latest?.avg ?? null,
        heightCm: profile.height_cm,
        age: getAgeFromBirthDate(profile.birth_date),
        activity: profile.activity_level,
      });
      const lastStart = cycleRows.length ? cycleRows[cycleRows.length - 1].start_date : null;
      const forecast = calculateCycleState({ lastStartDate: lastStart, cycleLength, periodLength });
      const guide = forecast ? getWeightPhaseGuide({ cycleDay: forecast.cycleDay, cycleLength, periodLength }) : null;

      setInputs({
        calories: calories?.target ?? null,
        targetKg: profile.weight_target_kg ?? null,
        phaseKey: guide?.phaseKey ?? null,
      });
    } catch (error) {
      console.log("Weight home meal plan error:", error);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!inputs) return null;

  return <WeightMealPlanCard calories={inputs.calories} targetKg={inputs.targetKg} phaseKey={inputs.phaseKey} />;
}
