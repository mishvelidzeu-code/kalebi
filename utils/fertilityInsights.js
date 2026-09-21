import dayjs from "dayjs";

import { t } from "../services/i18n";

// Contextual recommendations, doctor-visit signals and partner/lifestyle
// content for fertility ("მინდა დაორსულება") mode. Pure functions.
//
// Deliberately conservative: these are informational nudges, never diagnoses,
// and nothing here promises a conception outcome.

// All copy lives in locales/*.fertility.{mucusHints,partnerTips,lifestyleTips}.
// Getters (not constants) so the text follows the language chosen at runtime.
const MUCUS_KEYS = ["dry", "sticky", "creamy", "watery", "eggwhite"];
export const getMucusHint = (mucus) => (MUCUS_KEYS.includes(mucus) ? t(`fertility.mucusHints.${mucus}`) : null);

const PARTNER_TIP_ICONS = { together: "🤝", pressure: "💗", checkup: "🩺" };
export const getPartnerTips = () =>
  Object.entries(PARTNER_TIP_ICONS).map(([id, icon]) => ({
    id,
    icon,
    title: t(`fertility.partnerTips.${id}.title`),
    text: t(`fertility.partnerTips.${id}.text`),
  }));

const LIFESTYLE_TIP_ICONS = { smoking: "🚭", sleep: "😴", food: "🥗", activity: "🏃‍♀️" };
export const getLifestyleTips = () =>
  Object.entries(LIFESTYLE_TIP_ICONS).map(([id, icon]) => ({
    id,
    icon,
    title: t(`fertility.lifestyleTips.${id}.title`),
    text: t(`fertility.lifestyleTips.${id}.text`),
  }));

// Age matters for when specialists suggest seeking help.
export function getAgeFromBirthDate(birthDate) {
  if (!birthDate) return null;
  const born = dayjs(birthDate);
  if (!born.isValid()) return null;
  const age = dayjs().diff(born, "year");
  return age > 0 && age < 120 ? age : null;
}

// Standard guidance: seek help after 12 months of trying (6 if 35+).
export function getTryingThresholdMonths(age) {
  if (age == null) return 12;
  return age >= 35 ? 6 : 12;
}

// Today's contextual tips, driven by what has actually been logged.
export function buildFertilityRecommendations({ forecast, todayLogs = {}, referenceDate = dayjs() } = {}) {
  const tips = [];
  const today = dayjs(referenceDate).startOf("day");
  const ovulation = forecast?.ovulation ? forecast.ovulation.startOf("day") : null;
  const daysToOvulation = ovulation ? ovulation.diff(today, "day") : null;

  const lhResult = todayLogs.lh_test?.result || null;
  const mucus = todayLogs.cervical_mucus?.mucus || null;
  const phaseKey = forecast?.phaseKey || null;

  // 1. LH test result — the strongest same-day signal.
  if (lhResult === "positive" || lhResult === "peak") {
    tips.push({
      id: "lh_positive",
      icon: "🔥",
      title: t("fertility.tips.lhPositiveTitle"),
      text: t("fertility.tips.lhPositive"),
    });
  } else if (lhResult === "weak") {
    tips.push({
      id: "lh_weak",
      icon: "🌗",
      title: t("fertility.tips.lhWeakTitle"),
      text: t("fertility.tips.lhWeak"),
    });
  } else if (lhResult === "negative" && daysToOvulation != null && daysToOvulation <= 5 && daysToOvulation >= 0) {
    tips.push({
      id: "lh_negative",
      icon: "🧪",
      title: t("fertility.tips.lhNegativeTitle"),
      text: t("fertility.tips.lhNegative"),
    });
  }

  // 2. Cervical mucus.
  const mucusHint = getMucusHint(mucus);
  if (mucusHint) {
    tips.push({ id: `mucus_${mucus}`, icon: "💧", title: t("fertility.tips.mucusTitle"), text: mucusHint });
  }

  // 3. Cycle-phase framing when there is no stronger signal today.
  if (!lhResult && !mucus && phaseKey) {
    if (phaseKey === "period") {
      tips.push({ id: "phase_period", icon: "🫶", title: t("fertility.tips.periodTitle"), text: t("fertility.tips.period") });
    } else if (phaseKey === "follicular") {
      tips.push({ id: "phase_follicular", icon: "🌱", title: t("fertility.tips.follicularTitle"), text: t("fertility.tips.follicular") });
    } else if (phaseKey === "fertile") {
      tips.push({ id: "phase_fertile", icon: "🌿", title: t("fertility.tips.fertileTitle"), text: t("fertility.tips.fertile") });
    } else if (phaseKey === "luteal") {
      tips.push({ id: "phase_luteal", icon: "🍵", title: t("fertility.tips.lutealTitle"), text: t("fertility.tips.luteal") });
    }
  }

  // 4. Nudge toward BBT if it is not being tracked today.
  if (!todayLogs.bbt) {
    tips.push({
      id: "bbt_missing",
      icon: "🌡️",
      title: t("fertility.tips.bbtMissingTitle"),
      text: t("fertility.tips.bbtMissing"),
    });
  }

  return tips;
}

// Reasons it may be worth talking to a doctor. Each is informational — the
// copy always frames it as "worth discussing", never as a diagnosis.
export function evaluateDoctorVisitSignals({ regularity, trying, logSummary, age } = {}) {
  const signals = [];
  const threshold = getTryingThresholdMonths(age);

  if (trying?.monthsTrying != null && trying.monthsTrying >= threshold) {
    signals.push({
      id: "duration",
      icon: "⏳",
      title: t("fertility.doctor.durationTitle", { months: trying.monthsTrying }),
      text: age != null && age >= 35
        ? t("fertility.doctor.duration35")
        : t("fertility.doctor.duration12"),
    });
  }

  if (regularity?.isRegular === false) {
    signals.push({
      id: "irregular",
      icon: "🔄",
      title: t("fertility.doctor.irregularTitle"),
      text: t("fertility.doctor.irregular", { shortest: regularity.shortest, longest: regularity.longest }),
    });
  }

  if (regularity?.avgCycle != null && regularity.sampleSize > 0) {
    if (regularity.avgCycle < 21 || regularity.avgCycle > 35) {
      signals.push({
        id: "cycle_length",
        icon: "📏",
        title: t("fertility.doctor.cycleLengthTitle"),
        text: t("fertility.doctor.cycleLength", { avg: regularity.avgCycle }),
      });
    }
  }

  // Testing consistently but never catching a surge is worth mentioning.
  if ((logSummary?.lhTestCount || 0) >= 8 && (logSummary?.lhPositiveCount || 0) === 0) {
    signals.push({
      id: "no_lh_surge",
      icon: "🧪",
      title: t("fertility.doctor.noSurgeTitle"),
      text: t("fertility.doctor.noSurge"),
    });
  }

  return signals;
}

// Compact fertility summary injected into the AI context.
export function buildFertilityAiContext({
  logSummary,
  regularity,
  trying,
  todayLogs = {},
  forecast,
  currentConfirmation = null,
  refinedOvulation = null,
  lutealLength = null,
} = {}) {
  const ovulation = forecast?.ovulation || null;

  return {
    is_fertility_mode: true,
    // Evidence from the user's own signals beats the calendar estimate.
    confirmed_ovulation: currentConfirmation?.confirmed
      ? {
          date: dayjs(currentConfirmation.date).format("YYYY-MM-DD"),
          based_on: currentConfirmation.methods,
          confidence: currentConfirmation.confidence,
          signals_agree: currentConfirmation.agreement,
        }
      : null,
    best_ovulation_estimate: refinedOvulation
      ? {
          date: dayjs(refinedOvulation.date).format("YYYY-MM-DD"),
          source: refinedOvulation.source,
          confidence: refinedOvulation.confidence,
        }
      : null,
    personal_luteal_phase_days: lutealLength?.days ?? null,
    today: {
      lh_test: todayLogs.lh_test?.result || null,
      bbt_celsius: todayLogs.bbt?.temp ?? null,
      cervical_mucus: todayLogs.cervical_mucus?.mucus || null,
      intercourse_logged: Boolean(todayLogs.intercourse),
      supplements_taken: todayLogs.supplement?.taken || [],
      ovulation_symptoms: todayLogs.ovulation_symptom?.symptoms || [],
    },
    estimated_ovulation_date: ovulation ? ovulation.format("YYYY-MM-DD") : null,
    days_to_ovulation: ovulation ? ovulation.startOf("day").diff(dayjs().startOf("day"), "day") : null,
    cycle_regularity: regularity
      ? {
          average_cycle_days: regularity.avgCycle,
          is_regular: regularity.isRegular,
          prediction_confidence: regularity.accuracyKey,
          cycles_analyzed: regularity.sampleSize,
        }
      : null,
    trying_history: trying
      ? { months_trying: trying.monthsTrying, cycles_tracked: trying.cyclesCount }
      : null,
    tracking_totals: logSummary
      ? {
          intercourse_in_fertile_window: logSummary.intercourseInFertile,
          positive_lh_tests: logSummary.lhPositiveCount,
          bbt_entries: logSummary.bbtCount,
          last_positive_lh: logSummary.lastLhPositive,
        }
      : null,
  };
}
