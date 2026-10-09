import { supabase } from "./supabase";
import dayjs from "../utils/dayjs";

// Weight-loss mode data helpers. Reads fail silent (a hiccup must never crash a
// screen); writes report { ok } so the screen can tell the user. See migration
// 20261009_create_weight_tracking.sql.

// Weight setup plus what the cycle-phase math needs.
export const WEIGHT_PROFILE_FIELDS =
  "weight_mode, height_cm, weight_start_kg, weight_target_kg, activity_level, weight_started_at, birth_date, cycle_length, period_length, last_period";

// Whether weight mode is on right now, as decided by WeightContext (Prime,
// fertility goal, pregnancy, release flag). Kept here so plain services
// without React — the assistant orchestrator and the reminder scheduler — act
// on weight mode exactly when the screens show it, never otherwise.
let weightModeActiveNow = false;

export function setWeightModeActive(active) {
  weightModeActiveNow = Boolean(active);
}

export function isWeightModeActive() {
  return weightModeActiveNow;
}

async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}

// One weigh-in per day: writing the same day again replaces it.
export async function upsertWeightLog(date, weightKg) {
  try {
    const userId = await getUserId();
    if (!userId) return { ok: false };

    const { error } = await supabase
      .from("weight_logs")
      .upsert(
        { user_id: userId, date, weight_kg: weightKg, updated_at: new Date().toISOString() },
        { onConflict: "user_id,date" }
      );
    if (error) throw error;
    return { ok: true };
  } catch (error) {
    console.log("upsertWeightLog failed:", error);
    return { ok: false, error };
  }
}

export async function deleteWeightLog(date) {
  try {
    const userId = await getUserId();
    if (!userId) return { ok: false };

    const { error } = await supabase.from("weight_logs").delete().eq("user_id", userId).eq("date", date);
    if (error) throw error;
    return { ok: true };
  } catch (error) {
    console.log("deleteWeightLog failed:", error);
    return { ok: false, error };
  }
}

// Raw rows across an inclusive date range, oldest first.
export async function getWeightLogsRange(fromDate, toDate) {
  try {
    const userId = await getUserId();
    if (!userId) return [];

    const { data, error } = await supabase
      .from("weight_logs")
      .select("date, weight_kg")
      .eq("user_id", userId)
      .gte("date", fromDate)
      .lte("date", toDate)
      .order("date", { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.log("getWeightLogsRange skipped:", error);
    return [];
  }
}

export async function getWeightProfile() {
  try {
    const userId = await getUserId();
    if (!userId) return null;

    const { data, error } = await supabase.from("profiles").select(WEIGHT_PROFILE_FIELDS).eq("id", userId).maybeSingle();
    if (error) throw error;
    return data || null;
  } catch (error) {
    console.log("getWeightProfile skipped:", error);
    return null;
  }
}

// Setup screen save: profile values + the mode flag + today's weigh-in.
// keepStartedAt (editing the goal while the mode is on) keeps the original start
// date and weight, so progress and the cycle-disruption check keep measuring
// from the real start; switching the mode on again starts fresh.
export async function saveWeightSetup({ heightCm, currentKg, targetKg, activity, birthDate, keepStartedAt }) {
  try {
    const userId = await getUserId();
    if (!userId) return { ok: false };

    const today = dayjs().format("YYYY-MM-DD");
    const payload = {
      weight_mode: true,
      height_cm: heightCm,
      weight_target_kg: targetKg,
      activity_level: activity,
    };
    if (!keepStartedAt) {
      payload.weight_started_at = today;
      payload.weight_start_kg = currentKg;
    }
    if (birthDate) payload.birth_date = birthDate;

    const { error } = await supabase.from("profiles").update(payload).eq("id", userId);
    if (error) throw error;

    const logResult = await upsertWeightLog(today, currentKg);
    if (!logResult.ok) return { ok: false, error: logResult.error };
    return { ok: true };
  } catch (error) {
    console.log("saveWeightSetup failed:", error);
    return { ok: false, error };
  }
}

export async function setWeightModeFlag(enabled) {
  try {
    const userId = await getUserId();
    if (!userId) return { ok: false };

    const { error } = await supabase.from("profiles").update({ weight_mode: Boolean(enabled) }).eq("id", userId);
    if (error) throw error;
    return { ok: true };
  } catch (error) {
    console.log("setWeightModeFlag failed:", error);
    return { ok: false, error };
  }
}
