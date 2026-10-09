import dayjs from "dayjs";

import { getCyclePhaseKey } from "./cycleEngine";

// Pure helpers for weight-loss mode. No UI text here — functions return keys
// and numbers, screens translate them.
//
// Deliberately conservative: every target is floored, every pace is gentle,
// and nothing below the healthy range is ever suggested.

export const WEIGHT_LIMITS = { minKg: 30, maxKg: 250, minHeightCm: 120, maxHeightCm: 220 };
export const MIN_WEIGHT_MODE_AGE = 18;
export const OLDER_ADULT_AGE = 65;
// Absolute daily minimum; the BMR is used instead when it is higher.
export const CALORIE_FLOOR = 1200;
// ~7700 kcal per kg of body fat.
const KCAL_PER_KG = 7700;

// Activity multipliers (Mifflin-St Jeor TDEE). Kept on the low side on purpose:
// people overestimate how much they move.
export const ACTIVITY_FACTORS = { low: 1.2, moderate: 1.375, high: 1.55 };
const DEFAULT_ACTIVITY_FACTOR = ACTIVITY_FACTORS.moderate;

const round1 = (value) => Math.round(value * 10) / 10;

const toNumber = (value) => {
  const number = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value);
  return Number.isFinite(number) ? number : null;
};

// ---------------------------------------------------------------- body metrics

export function computeBmi(weightKg, heightCm) {
  const weight = toNumber(weightKg);
  const height = toNumber(heightCm);
  if (!weight || !height) return null;
  const meters = height / 100;
  return round1(weight / (meters * meters));
}

export function getBmiCategoryKey(bmi) {
  if (bmi == null) return null;
  if (bmi < 18.5) return "underweight";
  if (bmi < 25) return "normal";
  if (bmi < 30) return "overweight";
  return "obese";
}

// Older adults do better with a slightly higher BMI, so the healthy band moves up.
export function getHealthyBmiRange(age) {
  return age != null && age >= OLDER_ADULT_AGE ? { min: 22, max: 27 } : { min: 18.5, max: 24.9 };
}

export function getHealthyWeightRange(heightCm, age) {
  const height = toNumber(heightCm);
  if (!height) return null;
  const meters = height / 100;
  const { min, max } = getHealthyBmiRange(age);
  return { min: round1(min * meters * meters), max: round1(max * meters * meters) };
}

// Mifflin-St Jeor, female. Every year of age lowers it by 5 kcal.
export function computeBmr({ weightKg, heightCm, age }) {
  const weight = toNumber(weightKg);
  const height = toNumber(heightCm);
  if (!weight || !height || age == null) return null;
  return Math.round(10 * weight + 6.25 * height - 5 * age - 161);
}

export function estimateMaintenanceCalories({ weightKg, heightCm, age, activity }) {
  const bmr = computeBmr({ weightKg, heightCm, age });
  if (bmr == null) return null;
  const factor = ACTIVITY_FACTORS[activity] || DEFAULT_ACTIVITY_FACTOR;
  return Math.round(bmr * factor);
}

// Gentle by design: 0.5 kg a week, half that from 65 on.
export function getSafeWeeklyLossKg(age) {
  return age != null && age >= OLDER_ADULT_AGE ? 0.25 : 0.5;
}

// Daily intake for the safe pace, never below the BMR or the absolute floor.
export function getDailyCalorieTarget({ weightKg, heightCm, age, activity }) {
  const bmr = computeBmr({ weightKg, heightCm, age });
  const maintenance = estimateMaintenanceCalories({ weightKg, heightCm, age, activity });
  if (bmr == null || maintenance == null) return null;

  const weeklyLossKg = getSafeWeeklyLossKg(age);
  const deficit = Math.round((weeklyLossKg * KCAL_PER_KG) / 7);
  const floor = Math.max(CALORIE_FLOOR, bmr);
  const raw = maintenance - deficit;
  const target = Math.max(raw, floor);

  return {
    target: Math.round(target / 10) * 10,
    maintenance,
    bmr,
    weeklyLossKg,
    // At the floor the real pace is slower than weeklyLossKg — say so on screen.
    flooredAtMinimum: raw < floor,
  };
}

export function estimateWeeksToGoal(currentKg, targetKg, weeklyLossKg) {
  const current = toNumber(currentKg);
  const target = toNumber(targetKg);
  if (!current || !target || !weeklyLossKg || target >= current) return null;
  return Math.ceil((current - target) / weeklyLossKg);
}

export function getWeightProgress({ startKg, targetKg, currentKg }) {
  const start = toNumber(startKg);
  const target = toNumber(targetKg);
  const current = toNumber(currentKg);
  if (!start || !target || !current || start <= target) return null;

  const lostKg = round1(start - current);
  const remainingKg = round1(Math.max(0, current - target));
  const percent = Math.min(100, Math.max(0, Math.round(((start - current) / (start - target)) * 100)));
  return { lostKg, remainingKg, percent, reached: current <= target };
}

// ------------------------------------------------------------------ validation

export function isWeightModeAllowedForAge(age) {
  return age != null && age >= MIN_WEIGHT_MODE_AGE;
}

// Setup check. Returns the first problem as a key, plus the lowest healthy
// target so the screen can offer it instead.
export function validateWeightGoal({ heightCm, currentKg, targetKg, age }) {
  const height = toNumber(heightCm);
  const current = toNumber(currentKg);
  const target = toNumber(targetKg);

  if (age == null) return { ok: false, errorKey: "ageMissing" };
  if (!isWeightModeAllowedForAge(age)) return { ok: false, errorKey: "underage" };
  if (!height || height < WEIGHT_LIMITS.minHeightCm || height > WEIGHT_LIMITS.maxHeightCm) {
    return { ok: false, errorKey: "heightInvalid" };
  }
  if (!current || current < WEIGHT_LIMITS.minKg || current > WEIGHT_LIMITS.maxKg) {
    return { ok: false, errorKey: "weightInvalid" };
  }

  const healthy = getHealthyWeightRange(height, age);
  // Already at or below the healthy minimum: losing more is not something we support.
  if (current <= healthy.min) {
    return { ok: false, errorKey: "alreadyLowest", minHealthyKg: healthy.min };
  }
  if (!target || target < WEIGHT_LIMITS.minKg || target > WEIGHT_LIMITS.maxKg) {
    return { ok: false, errorKey: "targetInvalid", minHealthyKg: healthy.min };
  }
  if (target >= current) {
    return { ok: false, errorKey: "targetNotLower", minHealthyKg: healthy.min };
  }
  if (target < healthy.min) {
    return { ok: false, errorKey: "targetBelowHealthy", minHealthyKg: healthy.min };
  }
  return { ok: true, minHealthyKg: healthy.min };
}

// ------------------------------------------------------------- logs and trend

// Clean rows from weight_logs: valid numbers only, one per day, oldest first.
export function normalizeWeightLogs(rows = []) {
  const byDate = new Map();
  rows.forEach((row) => {
    const weight = toNumber(row?.weight_kg ?? row?.weight);
    const day = row?.date ? dayjs(row.date) : null;
    if (!weight || !day?.isValid()) return;
    if (weight < 20 || weight > 400) return;
    byDate.set(day.format("YYYY-MM-DD"), weight);
  });
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, weight]) => ({ date, weight }));
}

// Trailing average over the previous `windowDays` calendar days (inclusive).
// Smooths out daily water swings, which are bigger than real fat loss.
export function withMovingAverage(logs = [], windowDays = 7) {
  return logs.map((log, index) => {
    const from = dayjs(log.date).subtract(windowDays - 1, "day");
    const windowLogs = [];
    for (let i = index; i >= 0; i -= 1) {
      if (dayjs(logs[i].date).isBefore(from, "day")) break;
      windowLogs.push(logs[i].weight);
    }
    const avg = windowLogs.reduce((sum, w) => sum + w, 0) / windowLogs.length;
    return { ...log, avg: round1(avg) };
  });
}

// Cycle phase on a past date, from the actual logged period starts. Returns
// null when the date is outside any plausible cycle (missing data).
export function getCyclePhaseOnDate(date, cycles = [], { cycleLength = 28, periodLength = 5 } = {}) {
  const day = dayjs(date).startOf("day");
  const starts = cycles
    .map((c) => (c?.start_date ? dayjs(c.start_date).startOf("day") : null))
    .filter((d) => d?.isValid())
    .sort((a, b) => a.diff(b));

  let index = -1;
  for (let i = 0; i < starts.length; i += 1) {
    if (!starts[i].isAfter(day, "day")) index = i;
  }
  if (index === -1) return null;

  const start = starts[index];
  const next = starts[index + 1];
  const length = next ? next.diff(start, "day") : Number(cycleLength) || 28;
  const cycleDay = day.diff(start, "day") + 1;

  // Well past the expected next period with nothing logged — don't guess.
  if (!next && cycleDay > length + 7) return null;
  if (length < 15 || length > 60) return null;

  return getCyclePhaseKey(Math.min(cycleDay, length), length, Number(periodLength) || 5);
}

export function annotateWeightLogs(logs = [], cycles = [], options = {}) {
  return withMovingAverage(logs).map((log) => ({
    ...log,
    phaseKey: getCyclePhaseOnDate(log.date, cycles, options),
  }));
}

// What the latest weigh-in means. Compared with the days just before it, not
// with yesterday — a single-day jump is almost always water.
//   waterLikely: up, but in the late luteal / period days and within water range
//   gain / loss / stable
export function getLatestWeightInsight(annotatedLogs = []) {
  if (annotatedLogs.length < 2) return null;
  const latest = annotatedLogs[annotatedLogs.length - 1];
  const from = dayjs(latest.date).subtract(7, "day");
  const previous = annotatedLogs
    .slice(0, -1)
    .filter((log) => !dayjs(log.date).isBefore(from, "day"));
  if (previous.length === 0) return null;

  const previousAvg = previous.reduce((sum, log) => sum + log.weight, 0) / previous.length;
  const delta = round1(latest.weight - previousAvg);
  const phaseKey = latest.phaseKey || null;

  let key = "stable";
  if (delta >= 0.3) {
    key = (phaseKey === "luteal" || phaseKey === "period") && delta <= 2.5 ? "waterLikely" : "gain";
  } else if (delta <= -0.3) {
    key = "loss";
  }
  return { key, delta, phaseKey, date: latest.date };
}

// Cycle-to-cycle comparison: the average weight of the current cycle vs the
// previous one. Same hormonal mix on both sides, so it is fairer than week-to-week.
export function compareLastTwoCycles(logs = [], cycles = []) {
  const starts = cycles
    .map((c) => (c?.start_date ? dayjs(c.start_date).startOf("day") : null))
    .filter((d) => d?.isValid())
    .sort((a, b) => a.diff(b));
  if (starts.length < 2) return null;

  const average = (from, to) => {
    const inRange = logs.filter((log) => {
      const day = dayjs(log.date);
      return !day.isBefore(from, "day") && (!to || day.isBefore(to, "day"));
    });
    if (inRange.length < 2) return null;
    return inRange.reduce((sum, log) => sum + log.weight, 0) / inRange.length;
  };

  const last = starts[starts.length - 1];
  const previous = starts[starts.length - 2];
  const currentAvg = average(last, null);
  const previousAvg = average(previous, last);
  if (currentAvg == null || previousAvg == null) return null;

  return {
    currentAvg: round1(currentAvg),
    previousAvg: round1(previousAvg),
    delta: round1(currentAvg - previousAvg),
  };
}

// Safety net: too hard a deficit can stop periods. Since weight mode started,
//   late:    the current cycle runs well past the usual length
//   changed: a completed cycle was far off the pre-diet average
export function detectCycleDisruption({ cycles = [], weightStartedAt, fallbackCycleLength = 28, referenceDate = dayjs() }) {
  if (!weightStartedAt) return null;
  const startedAt = dayjs(weightStartedAt).startOf("day");
  const today = dayjs(referenceDate).startOf("day");
  const starts = cycles
    .map((c) => (c?.start_date ? dayjs(c.start_date).startOf("day") : null))
    .filter((d) => d?.isValid())
    .sort((a, b) => a.diff(b));
  if (starts.length === 0) return null;

  const gapsBefore = [];
  const gapsSince = [];
  for (let i = 1; i < starts.length; i += 1) {
    const gap = starts[i].diff(starts[i - 1], "day");
    if (gap < 15 || gap > 120) continue;
    (starts[i].isAfter(startedAt, "day") ? gapsSince : gapsBefore).push(gap);
  }
  const usual = gapsBefore.length
    ? gapsBefore.reduce((sum, g) => sum + g, 0) / gapsBefore.length
    : Number(fallbackCycleLength) || 28;

  const last = starts[starts.length - 1];
  const daysSinceLast = today.diff(last, "day");
  // Only blame the diet for a delay that happened after it started.
  if (today.isAfter(startedAt, "day") && daysSinceLast > usual + 10) {
    return { key: "late", daysLate: Math.round(daysSinceLast - usual) };
  }
  if (gapsSince.some((gap) => Math.abs(gap - usual) > 10)) {
    return { key: "changed" };
  }
  return null;
}

// Where today sits inside the cycle, for the weight screen's phase card. The
// long phases are split so the advice fits the actual day (early vs late
// luteal behave very differently on the scale), and tipKey rotates daily so
// the card does not repeat itself.
export const WEIGHT_TIP_VARIANTS = 3;
const WEIGH_IN_BY_STAGE = {
  periodEarly: "waterHigh",
  periodLate: "waterLeaving",
  follicularEarly: "reliable",
  follicularLate: "reliable",
  fertile: "normal",
  lutealEarly: "normal",
  lutealLate: "waterHigh",
};

export function getWeightPhaseGuide({ cycleDay, cycleLength = 28, periodLength = 5, date = dayjs() }) {
  const day = Number(cycleDay);
  const length = Number(cycleLength) || 28;
  const period = Number(periodLength) || 5;
  if (!day || day < 1) return null;

  const phaseKey = getCyclePhaseKey(day, length, period);
  const ovulationDay = length - 13;
  let stageKey;
  if (phaseKey === "period") {
    stageKey = day <= Math.min(2, period) ? "periodEarly" : "periodLate";
  } else if (phaseKey === "follicular") {
    const middle = period + Math.ceil((ovulationDay - 5 - period) / 2);
    stageKey = day < middle ? "follicularEarly" : "follicularLate";
  } else if (phaseKey === "fertile") {
    stageKey = "fertile";
  } else {
    // The last five days before the period: water retention and cravings peak.
    stageKey = day > length - 5 ? "lutealLate" : "lutealEarly";
  }

  const dayOfYear = dayjs(date).diff(dayjs(date).startOf("year"), "day");
  return {
    phaseKey,
    stageKey,
    weighInKey: WEIGH_IN_BY_STAGE[stageKey],
    tipKey: `a${(dayOfYear % WEIGHT_TIP_VARIANTS) + 1}`,
  };
}

// What the assistant gets in weight mode: facts and the app's own safe plan,
// so the model never has to invent numbers. Plain values only (JSON-friendly).
export function buildWeightAiContext({ logs = [], cycles = [], profile = {}, age = null, cycleLength = 28, periodLength = 5, referenceDate = dayjs() }) {
  const annotated = annotateWeightLogs(logs, cycles, { cycleLength, periodLength });
  const latest = annotated[annotated.length - 1] || null;
  const heightCm = toNumber(profile.height_cm);
  const currentKg = latest?.avg ?? toNumber(profile.weight_start_kg);
  const insight = getLatestWeightInsight(annotated);
  const progress = getWeightProgress({ startKg: profile.weight_start_kg, targetKg: profile.weight_target_kg, currentKg });
  const calories = getDailyCalorieTarget({ weightKg: currentKg, heightCm, age, activity: profile.activity_level });
  const bmi = computeBmi(currentKg, heightCm);
  const disruption = detectCycleDisruption({ cycles, weightStartedAt: profile.weight_started_at, fallbackCycleLength: cycleLength, referenceDate });
  const comparison = compareLastTwoCycles(logs, cycles);
  const since = dayjs(referenceDate).subtract(30, "day");

  return {
    latest_weight_kg: latest?.weight ?? null,
    latest_weigh_in_date: latest?.date ?? null,
    seven_day_average_kg: latest?.avg ?? null,
    weigh_ins_last_30_days: logs.filter((log) => !dayjs(log.date).isBefore(since, "day")).length,
    start_weight_kg: toNumber(profile.weight_start_kg),
    target_weight_kg: toNumber(profile.weight_target_kg),
    started_on: profile.weight_started_at || null,
    lost_so_far_kg: progress?.lostKg ?? null,
    remaining_kg: progress?.remainingKg ?? null,
    progress_percent: progress?.percent ?? null,
    latest_change: insight
      ? { kind: insight.key, delta_kg: insight.delta, cycle_phase: insight.phaseKey }
      : null,
    this_cycle_vs_last: comparison
      ? { current_avg_kg: comparison.currentAvg, previous_avg_kg: comparison.previousAvg, delta_kg: comparison.delta }
      : null,
    daily_calorie_target_kcal: calories?.target ?? null,
    calorie_target_at_safety_floor: calories?.flooredAtMinimum ?? false,
    safe_weekly_loss_kg: calories?.weeklyLossKg ?? getSafeWeeklyLossKg(age),
    activity_level: profile.activity_level || null,
    age,
    bmi,
    bmi_category: getBmiCategoryKey(bmi),
    healthy_weight_range_kg: getHealthyWeightRange(heightCm, age),
    cycle_warning: disruption?.key ?? null,
    period_days_late: disruption?.daysLate ?? null,
  };
}

// Bar heights (20..100 %) for a small View-based chart. Weights move by a few
// percent at most, so bars are scaled to the visible range, not from zero.
export function scaleWeightsForChart(values = []) {
  const numbers = values.map(toNumber).filter((v) => v != null);
  if (numbers.length === 0) return [];
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const span = max - min;
  return values.map((value) => {
    const number = toNumber(value);
    if (number == null) return 0;
    return span === 0 ? 60 : Math.round(20 + ((number - min) / span) * 80);
  });
}
