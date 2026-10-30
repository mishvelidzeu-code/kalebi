import dayjs from "dayjs";

import { supabase } from "./supabase";

// The home screen's first read, started by the splash while its animation
// plays, so the home screen opens with its data instead of a spinner. It is
// used once: every later load (focus, pull-to-refresh) reads fresh.

const MAX_AGE_MS = 30 * 1000;

let prefetched = null; // { user, dayKey, startedAt, promise }

export function fetchHomeData(userId, dayKey) {
  return Promise.all([
    supabase.from("cycles").select("*").eq("user_id", userId).order("start_date", { ascending: true }),
    supabase.from("profiles").select("*").eq("id", userId).single(),
    supabase.from("symptoms").select("symptoms, mood, note").eq("user_id", userId).eq("date", dayKey).maybeSingle(),
  ]);
}

export function prefetchHomeData(user) {
  const dayKey = dayjs().format("YYYY-MM-DD");
  prefetched = { user, dayKey, startedAt: Date.now(), promise: fetchHomeData(user.id, dayKey) };
}

// The splash's read, if it is for today and recent enough; null otherwise.
// Taking it clears it.
export function takePrefetchedHomeData() {
  const entry = prefetched;
  prefetched = null;

  if (!entry || entry.dayKey !== dayjs().format("YYYY-MM-DD") || Date.now() - entry.startedAt > MAX_AGE_MS) {
    return null;
  }

  return entry;
}
