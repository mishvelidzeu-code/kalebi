import dayjs from "dayjs";

import { getCycleWindowDates } from "./cycleEngine";

// Pure stats helpers for fertility ("მინდა დაორსულება") mode.
// Everything here is derived from logged data — no promises of accuracy.

// Observed cycle lengths = gaps between consecutive logged period starts.
// More honest than the stored cycle_length, which is often just a default.
export function getObservedCycleGaps(cycles = []) {
  const sorted = [...cycles]
    .filter((c) => c?.start_date)
    .sort((a, b) => dayjs(a.start_date).diff(dayjs(b.start_date)));

  const gaps = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = dayjs(sorted[i].start_date).diff(dayjs(sorted[i - 1].start_date), "day");
    // Ignore nonsense gaps (double-logged days, or year-long holes).
    if (gap >= 15 && gap <= 60) gaps.push(gap);
  }
  return gaps;
}

// Regularity + how much the prediction can be trusted.
export function analyzeCycleRegularity(cycles = [], fallbackCycleLength = 28) {
  const gaps = getObservedCycleGaps(cycles);

  if (gaps.length === 0) {
    return {
      avgCycle: fallbackCycleLength,
      shortest: null,
      longest: null,
      spread: null,
      isRegular: null,
      accuracyKey: "unknown",
      accuracyLabel: "ჯერ ცოტა მონაცემია",
      sampleSize: 0,
    };
  }

  const avgCycle = Math.round(gaps.reduce((sum, g) => sum + g, 0) / gaps.length);
  const shortest = Math.min(...gaps);
  const longest = Math.max(...gaps);
  const spread = longest - shortest;

  // Clinically, a variation of up to ~7-8 days is still considered regular.
  const isRegular = spread <= 7;

  let accuracyKey = "low";
  if (gaps.length >= 3 && spread <= 3) accuracyKey = "high";
  else if (gaps.length >= 2 && spread <= 7) accuracyKey = "medium";

  const accuracyLabel =
    accuracyKey === "high" ? "მაღალი" : accuracyKey === "medium" ? "საშუალო" : "დაბალი";

  return { avgCycle, shortest, longest, spread, isRegular, accuracyKey, accuracyLabel, sampleSize: gaps.length };
}

// Fertile windows for every logged cycle, used to test whether a logged day
// (e.g. an intercourse entry) landed inside the fertile window.
export function buildFertileWindows(cycles = [], avgCycle = 28) {
  return cycles
    .filter((c) => c?.start_date)
    .map((c) => {
      const window = getCycleWindowDates(c.start_date, c.cycle_length || avgCycle);
      if (!window) return null;
      return { start: window.fertileStart, end: window.fertileEnd, ovulation: window.ovulation };
    })
    .filter(Boolean);
}

export function isDateInFertileWindows(dateStr, windows = []) {
  const date = dayjs(dateStr).startOf("day");
  return windows.some(
    (w) => !date.isBefore(w.start, "day") && !date.isAfter(w.end, "day")
  );
}

// When a pregnancy test starts to make sense, relative to this cycle's
// estimated ovulation. Deliberately conservative wording upstream.
export function computePregnancyTestTiming(forecast) {
  if (!forecast?.ovulation) return null;

  const today = dayjs().startOf("day");
  const earliest = forecast.ovulation.add(11, "day").startOf("day");
  const reliable = forecast.ovulation.add(14, "day").startOf("day");
  const daysToReliable = reliable.diff(today, "day");
  const daysToEarliest = earliest.diff(today, "day");

  return {
    earliest,
    reliable,
    daysToEarliest: Math.max(0, daysToEarliest),
    daysToReliable: Math.max(0, daysToReliable),
    canTestNow: daysToEarliest <= 0,
    isReliableNow: daysToReliable <= 0,
  };
}

// Aggregates the fertility_logs rows into the numbers the stats screen shows.
export function summarizeFertilityLogs(logs = [], fertileWindows = []) {
  const intercourse = logs.filter((l) => l.type === "intercourse");
  const lhTests = logs.filter((l) => l.type === "lh_test");
  const bbt = logs.filter((l) => l.type === "bbt");
  const mucus = logs.filter((l) => l.type === "cervical_mucus");
  const symptomLogs = logs.filter((l) => l.type === "ovulation_symptom");

  const intercourseInFertile = intercourse.filter((l) =>
    isDateInFertileWindows(l.date, fertileWindows)
  ).length;

  const lhPositive = lhTests.filter(
    (l) => l.value?.result === "positive" || l.value?.result === "peak"
  );

  const bbtValues = bbt
    .map((l) => ({ date: l.date, temp: Number(l.value?.temp) }))
    .filter((b) => !Number.isNaN(b.temp))
    .sort((a, b) => dayjs(a.date).diff(dayjs(b.date)));

  const symptomCounts = {};
  symptomLogs.forEach((l) => {
    (l.value?.symptoms || []).forEach((s) => {
      symptomCounts[s] = (symptomCounts[s] || 0) + 1;
    });
  });

  const topSymptoms = Object.entries(symptomCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4)
    .map(([id, count]) => ({ id, count }));

  return {
    intercourseCount: intercourse.length,
    intercourseInFertile,
    lhTestCount: lhTests.length,
    lhPositiveCount: lhPositive.length,
    lastLhPositive: lhPositive.length
      ? lhPositive.map((l) => l.date).sort().slice(-1)[0]
      : null,
    bbtCount: bbtValues.length,
    bbtValues,
    mucusCount: mucus.length,
    topSymptoms,
  };
}

// "How long have I been trying" — anchored on the first tracked signal we have.
export function computeTryingHistory(cycles = [], logs = [], fertileWindows = []) {
  const cycleDates = cycles.map((c) => c?.start_date).filter(Boolean);
  const logDates = logs.map((l) => l.date).filter(Boolean);
  const all = [...cycleDates, ...logDates].sort();

  if (all.length === 0) {
    return { startedOn: null, monthsTrying: 0, cyclesCount: cycles.length, fertileDaysTracked: 0 };
  }

  const startedOn = dayjs(all[0]).startOf("day");
  const monthsTrying = Math.max(0, dayjs().startOf("day").diff(startedOn, "month"));

  // Fertile days that have already passed since tracking began.
  const today = dayjs().startOf("day");
  let fertileDaysTracked = 0;
  fertileWindows.forEach((w) => {
    if (w.end.isBefore(startedOn, "day")) return;
    const from = w.start.isBefore(startedOn, "day") ? startedOn : w.start;
    const to = w.end.isAfter(today, "day") ? today : w.end;
    const days = to.diff(from, "day") + 1;
    if (days > 0) fertileDaysTracked += days;
  });

  return { startedOn, monthsTrying, cyclesCount: cycles.length, fertileDaysTracked };
}
