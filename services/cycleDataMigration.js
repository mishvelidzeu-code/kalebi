import dayjs from "dayjs";

import { normalizeCycleStartDate } from "../utils/cycleEngine";
import { supabase } from "./supabase";

export async function fixFutureCycleDatesForCurrentUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { fixedProfile: false, fixedCycles: 0 };

  const today = dayjs().startOf("day");
  const [profileRes, cyclesRes] = await Promise.all([
    supabase.from("profiles").select("last_period").eq("id", user.id).maybeSingle(),
    supabase.from("cycles").select("id, start_date").eq("user_id", user.id),
  ]);

  if (profileRes.error) throw profileRes.error;
  if (cyclesRes.error) throw cyclesRes.error;

  let fixedProfile = false;
  const profileLastPeriod = profileRes.data?.last_period;
  const normalizedProfileDate = normalizeCycleStartDate(profileLastPeriod, today);

  if (
    profileLastPeriod &&
    normalizedProfileDate &&
    normalizedProfileDate.format("YYYY-MM-DD") !== dayjs(profileLastPeriod).format("YYYY-MM-DD")
  ) {
    const { error } = await supabase
      .from("profiles")
      .update({ last_period: normalizedProfileDate.format("YYYY-MM-DD") })
      .eq("id", user.id);

    if (error) throw error;
    fixedProfile = true;
  }

  let fixedCycles = 0;
  const futureCycles = (cyclesRes.data || []).filter((cycle) =>
    dayjs(cycle.start_date).startOf("day").isAfter(today, "day")
  );

  for (const cycle of futureCycles) {
    const fixedDate = normalizeCycleStartDate(cycle.start_date, today);
    if (!fixedDate) continue;

    const { error } = await supabase
      .from("cycles")
      .update({ start_date: fixedDate.format("YYYY-MM-DD") })
      .eq("id", cycle.id);

    if (error) throw error;
    fixedCycles += 1;
  }

  return { fixedProfile, fixedCycles };
}
