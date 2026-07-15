import dayjs from "dayjs";

// Symptothermal ovulation detection for fertility mode.
//
// Scope note: this NEVER rewrites the shared cycleEngine prediction (which the
// whole app depends on). It produces a *refined, fertility-only* estimate plus
// an explicit confidence level, so the UI can hedge instead of over-promising.
//
// All of this is retrospective evidence, not a medical confirmation.

const BBT_COVERLINE_OFFSET = 0.1; // °C above the prior high, per the classic rule
const BBT_BASELINE_READINGS = 6;
const BBT_HIGH_READINGS = 3;
const BBT_MAX_SPAN_DAYS = 5; // the 3 high readings must be close together

function withinCycle(dateStr, cycleStart, cycleEnd) {
  const d = dayjs(dateStr).startOf("day");
  if (cycleStart && d.isBefore(dayjs(cycleStart).startOf("day"), "day")) return false;
  if (cycleEnd && d.isAfter(dayjs(cycleEnd).startOf("day"), "day")) return false;
  return true;
}

function logsOfType(logs, type, cycleStart, cycleEnd) {
  return (logs || [])
    .filter((l) => l.type === type && withinCycle(l.date, cycleStart, cycleEnd))
    .sort((a, b) => dayjs(a.date).diff(dayjs(b.date)));
}

// Classic "3 over 6" rule: three readings above a coverline drawn just over the
// highest of the previous six. Ovulation is placed the day BEFORE the first
// high reading. Returns null when there simply isn't enough data.
export function detectBbtShift(bbtLogs = []) {
  const readings = bbtLogs
    .map((l) => ({ date: dayjs(l.date).startOf("day"), temp: Number(l.value?.temp) }))
    .filter((r) => !Number.isNaN(r.temp) && r.temp >= 34 && r.temp <= 43)
    .sort((a, b) => a.date.diff(b.date));

  if (readings.length < BBT_BASELINE_READINGS + BBT_HIGH_READINGS) return null;

  for (let i = BBT_BASELINE_READINGS; i <= readings.length - BBT_HIGH_READINGS; i += 1) {
    const baseline = readings.slice(i - BBT_BASELINE_READINGS, i);
    const highs = readings.slice(i, i + BBT_HIGH_READINGS);

    const coverline = Math.max(...baseline.map((r) => r.temp)) + BBT_COVERLINE_OFFSET;
    const allAbove = highs.every((r) => r.temp >= coverline);
    if (!allAbove) continue;

    // Guard against a "shift" stitched together across large logging gaps.
    const span = highs[highs.length - 1].date.diff(highs[0].date, "day");
    if (span > BBT_MAX_SPAN_DAYS) continue;

    return {
      ovulationDate: highs[0].date.subtract(1, "day"),
      coverline: Number(coverline.toFixed(2)),
      firstHighDate: highs[0].date,
    };
  }

  return null;
}

// A positive/peak LH test means ovulation typically follows within 24-36h.
export function detectLhSurgeOvulation(lhLogs = []) {
  const positive = lhLogs.find(
    (l) => l.value?.result === "positive" || l.value?.result === "peak"
  );
  if (!positive) return null;
  return {
    ovulationDate: dayjs(positive.date).startOf("day").add(1, "day"),
    surgeDate: dayjs(positive.date).startOf("day"),
  };
}

// The last day of egg-white / watery mucus ("peak day") sits about a day
// before ovulation.
export function detectMucusPeakOvulation(mucusLogs = []) {
  const fertileMucus = mucusLogs.filter(
    (l) => l.value?.mucus === "eggwhite" || l.value?.mucus === "watery"
  );
  if (fertileMucus.length === 0) return null;

  const peak = fertileMucus[fertileMucus.length - 1];
  return {
    ovulationDate: dayjs(peak.date).startOf("day").add(1, "day"),
    peakDate: dayjs(peak.date).startOf("day"),
  };
}

// Combines the signals for one cycle. BBT is the most reliable *retrospective*
// evidence, so it wins when signals disagree; agreement raises confidence.
export function confirmOvulation({ logs = [], cycleStart = null, cycleEnd = null } = {}) {
  const bbt = detectBbtShift(logsOfType(logs, "bbt", cycleStart, cycleEnd));
  const lh = detectLhSurgeOvulation(logsOfType(logs, "lh_test", cycleStart, cycleEnd));
  const mucus = detectMucusPeakOvulation(logsOfType(logs, "cervical_mucus", cycleStart, cycleEnd));

  const methods = [];
  if (bbt) methods.push("bbt");
  if (lh) methods.push("lh");
  if (mucus) methods.push("mucus");

  if (methods.length === 0) {
    return { confirmed: false, date: null, methods: [], confidence: "none", agreement: null };
  }

  const date = bbt?.ovulationDate || lh?.ovulationDate || mucus?.ovulationDate;

  // Do the independent signals point at roughly the same day?
  const dates = [bbt?.ovulationDate, lh?.ovulationDate, mucus?.ovulationDate].filter(Boolean);
  let agreement = null;
  if (dates.length > 1) {
    const diffs = dates.map((d) => Math.abs(d.diff(date, "day")));
    agreement = Math.max(...diffs) <= 2;
  }

  // BBT + a corroborating signal that agrees = the strongest case we can make.
  let confidence = "low";
  if (bbt && methods.length > 1 && agreement) confidence = "high";
  else if (bbt) confidence = "medium";
  else if (lh && mucus && agreement) confidence = "medium";
  else confidence = "low";

  return { confirmed: true, date, methods, confidence, agreement, bbt, lh, mucus };
}

// Walks the logged cycles and confirms ovulation in each completed one.
export function getConfirmedOvulationsByCycle(cycles = [], logs = []) {
  const sorted = [...cycles]
    .filter((c) => c?.start_date)
    .sort((a, b) => dayjs(a.start_date).diff(dayjs(b.start_date)));

  const results = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const cycleStart = dayjs(sorted[i].start_date).startOf("day");
    const nextStart = sorted[i + 1] ? dayjs(sorted[i + 1].start_date).startOf("day") : null;
    const cycleEnd = nextStart ? nextStart.subtract(1, "day") : null;

    const confirmation = confirmOvulation({
      logs,
      cycleStart: cycleStart.format("YYYY-MM-DD"),
      cycleEnd: cycleEnd ? cycleEnd.format("YYYY-MM-DD") : null,
    });

    if (!confirmation.confirmed) continue;

    results.push({
      cycleStart,
      nextStart,
      ovulationDate: confirmation.date,
      cycleDay: confirmation.date.diff(cycleStart, "day") + 1,
      // Luteal phase only measurable once the next period actually arrived.
      lutealLength: nextStart ? nextStart.diff(confirmation.date, "day") : null,
      methods: confirmation.methods,
      confidence: confirmation.confidence,
    });
  }

  return results;
}

// The 14-day luteal phase is an average, not a personal truth. Once we have
// confirmed ovulations followed by a real period, we can use the user's own.
export function getPersonalizedLutealLength(confirmations = []) {
  const lengths = confirmations
    .map((c) => c.lutealLength)
    .filter((n) => typeof n === "number" && n >= 8 && n <= 18);

  if (lengths.length === 0) return null;

  const avg = lengths.reduce((sum, n) => sum + n, 0) / lengths.length;
  return { days: Math.round(avg), sampleSize: lengths.length };
}

// The fertility-mode ovulation estimate: current-cycle evidence first, then a
// personalized luteal length, then the plain calendar guess.
export function refineOvulationEstimate({
  forecast,
  currentConfirmation = null,
  lutealLength = null,
} = {}) {
  if (!forecast?.ovulation) return null;

  // 1. This cycle's own signals beat any prediction.
  if (currentConfirmation?.confirmed && currentConfirmation.confidence !== "low") {
    return {
      date: currentConfirmation.date,
      source: "signals",
      confidence: currentConfirmation.confidence,
      methods: currentConfirmation.methods,
    };
  }

  // 2. Personalized luteal length, if we have measured it.
  if (lutealLength?.days && lutealLength.sampleSize >= 2) {
    return {
      date: forecast.nextPeriod.subtract(lutealLength.days, "day").startOf("day"),
      source: "personalized",
      confidence: lutealLength.sampleSize >= 3 ? "medium" : "low",
      lutealDays: lutealLength.days,
    };
  }

  // 3. Plain calendar estimate (next period − 14).
  return { date: forecast.ovulation, source: "calendar", confidence: "low" };
}

// Overall "how much should we trust the dates" verdict for the UI.
export function buildPredictionQuality({ regularity, confirmations = [], lutealLength = null } = {}) {
  const confirmedCount = confirmations.length;
  const highConfirmations = confirmations.filter((c) => c.confidence === "high").length;

  let level = "low";
  if (regularity?.isRegular && (highConfirmations >= 1 || confirmedCount >= 2)) level = "high";
  else if (regularity?.isRegular || confirmedCount >= 1) level = "medium";

  const label = level === "high" ? "მაღალი" : level === "medium" ? "საშუალო" : "დაბალი";

  // What the user can do to make it better.
  const suggestions = [];
  if (!regularity?.sampleSize || regularity.sampleSize < 3) {
    suggestions.push("დაამატე მეტი ციკლი — რაც მეტია, მით ზუსტდება პროგნოზი.");
  }
  if (confirmedCount === 0) {
    suggestions.push("გაზომე ბაზალური ტემპერატურა და გააკეთე ოვულაციის ტესტები — ეს ადასტურებს ოვულაციას.");
  }
  if (regularity?.isRegular === false) {
    suggestions.push("არარეგულარულ ციკლზე კალენდარი ნაკლებად სანდოა — ტესტი, ტემპერატურა და ლორწო უფრო ზუსტია.");
  }
  if (!lutealLength) {
    suggestions.push("დადასტურებული ოვულაციები ლუტეალური ფაზის შენს ხანგრძლივობასაც გამოთვლის.");
  }

  return { level, label, confirmedCount, highConfirmations, suggestions };
}
