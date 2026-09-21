import dayjs from "dayjs";

import { t } from "../services/i18n";

// Builds today's personal plan for fertility ("მინდა დაორსულება") mode.
// Pure: takes the cycle forecast + today's logs, returns display-ready items.

// Labels live in locales/*.fertility.supplements.<id>; screens translate by id.
export const SUPPLEMENT_OPTIONS = [
  { id: "folic", icon: "🌿" },
  { id: "vitamin_d", icon: "☀️" },
  { id: "omega3", icon: "🐟" },
  { id: "iron", icon: "🩸" },
  { id: "iodine", icon: "🧂" },
  { id: "other", icon: "💊" },
];

// LH tests are worth doing in the run-up to ovulation, not all month.
export function getLhTestWindow(forecast) {
  if (!forecast?.ovulation) return null;
  return {
    start: forecast.ovulation.subtract(5, "day").startOf("day"),
    end: forecast.ovulation.add(1, "day").startOf("day"),
  };
}

function isWithin(date, window) {
  if (!window) return false;
  const d = dayjs(date).startOf("day");
  return !d.isBefore(window.start, "day") && !d.isAfter(window.end, "day");
}

// `todayLogs` is the by-type map from getFertilityLogsForDay().
export function buildDailyPlan({ forecast, todayLogs = {}, referenceDate = dayjs() } = {}) {
  const today = dayjs(referenceDate).startOf("day");
  const items = [];

  const ovulation = forecast?.ovulation || null;
  const daysToOvulation = ovulation ? ovulation.startOf("day").diff(today, "day") : null;
  const lhWindow = getLhTestWindow(forecast);
  const inLhWindow = isWithin(today, lhWindow);

  const fertileWindow = forecast?.fertileStart && forecast?.fertileEnd
    ? { start: forecast.fertileStart.startOf("day"), end: forecast.fertileEnd.startOf("day") }
    : null;
  const inFertileWindow = isWithin(today, fertileWindow);
  // Peak = ovulation day and the day before.
  const isPeakDay = daysToOvulation === 0 || daysToOvulation === 1;

  // 1. LH test — only inside the testing window.
  if (inLhWindow) {
    items.push({
      id: "lh_test",
      icon: "🧪",
      title: t("fertility.plan.lhTitle"),
      subtitle: isPeakDay
        ? t("fertility.plan.lhPeak")
        : t("fertility.plan.lhWindow"),
      done: Boolean(todayLogs.lh_test),
      priority: isPeakDay ? 1 : 2,
    });
  }

  // 2. Intercourse — highlighted only inside the fertile window.
  if (inFertileWindow) {
    items.push({
      id: "intercourse",
      icon: "❤️",
      title: isPeakDay ? t("fertility.plan.intercoursePeakTitle") : t("fertility.plan.intercourseTitle"),
      subtitle: isPeakDay
        ? t("fertility.plan.intercoursePeak")
        : t("fertility.plan.intercourseWindow"),
      done: Boolean(todayLogs.intercourse),
      priority: isPeakDay ? 1 : 3,
    });
  }

  // 3. BBT — every morning, before getting up.
  items.push({
    id: "bbt",
    icon: "🌡️",
    title: t("fertility.plan.bbtTitle"),
    subtitle: t("fertility.plan.bbtSubtitle"),
    done: Boolean(todayLogs.bbt),
    priority: 4,
  });

  // 4. Supplements — daily.
  items.push({
    id: "supplement",
    icon: "💊",
    title: t("fertility.plan.supplementsTitle"),
    subtitle: (todayLogs.supplement?.taken?.length)
      ? t("fertility.plan.supplementsTaken", { count: todayLogs.supplement.taken.length })
      : t("fertility.plan.supplementsHint"),
    done: Boolean(todayLogs.supplement?.taken?.length),
    priority: 5,
  });

  // 5. Symptoms / mucus — daily signal logging.
  items.push({
    id: "ovulation_symptom",
    icon: "🌸",
    title: t("fertility.plan.signsTitle"),
    subtitle: t("fertility.plan.signsSubtitle"),
    done: Boolean(todayLogs.ovulation_symptom || todayLogs.cervical_mucus),
    priority: 6,
  });

  items.sort((a, b) => a.priority - b.priority);

  const doneCount = items.filter((i) => i.done).length;

  return {
    items,
    doneCount,
    totalCount: items.length,
    inFertileWindow,
    isPeakDay,
    daysToOvulation,
  };
}
