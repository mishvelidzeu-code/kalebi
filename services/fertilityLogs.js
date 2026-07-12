import { supabase } from "./supabase";

// Fertility-mode daily log helpers. All fail-silent — a logging hiccup should
// never crash the calendar. See migration 20260713_create_fertility_logs.sql
// for the `value` shape of each type.

export const FERTILITY_LOG_TYPES = {
  intercourse: "intercourse",
  lhTest: "lh_test",
  bbt: "bbt",
  cervicalMucus: "cervical_mucus",
  ovulationSymptom: "ovulation_symptom",
};

// Writes (or overwrites) the single entry for a given day + type.
// Pass value = null to clear that entry for the day.
export async function upsertFertilityLog(date, type, value) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false };

    if (value == null) {
      await supabase
        .from("fertility_logs")
        .delete()
        .eq("user_id", user.id)
        .eq("date", date)
        .eq("type", type);
      return { ok: true, cleared: true };
    }

    const { error } = await supabase
      .from("fertility_logs")
      .upsert(
        {
          user_id: user.id,
          date,
          type,
          value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,date,type" }
      );

    if (error) throw error;
    return { ok: true };
  } catch (error) {
    console.log("upsertFertilityLog skipped:", error);
    return { ok: false, error };
  }
}

// Returns all log rows for one day, keyed by type: { intercourse, lh_test, ... }.
export async function getFertilityLogsForDay(date) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return {};

    const { data, error } = await supabase
      .from("fertility_logs")
      .select("type, value")
      .eq("user_id", user.id)
      .eq("date", date);

    if (error) throw error;

    const byType = {};
    (data || []).forEach((row) => {
      byType[row.type] = row.value || {};
    });
    return byType;
  } catch (error) {
    console.log("getFertilityLogsForDay skipped:", error);
    return {};
  }
}

// Returns raw rows across an inclusive date range, for calendar marks / stats.
export async function getFertilityLogsRange(fromDate, toDate) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from("fertility_logs")
      .select("date, type, value")
      .eq("user_id", user.id)
      .gte("date", fromDate)
      .lte("date", toDate)
      .order("date", { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.log("getFertilityLogsRange skipped:", error);
    return [];
  }
}
