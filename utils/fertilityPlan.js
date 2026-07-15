import dayjs from "dayjs";

// Builds today's personal plan for fertility ("მინდა დაორსულება") mode.
// Pure: takes the cycle forecast + today's logs, returns display-ready items.

export const SUPPLEMENT_OPTIONS = [
  { id: "folic", label: "ფოლიუმის მჟავა", icon: "🌿" },
  { id: "vitamin_d", label: "ვიტამინი D", icon: "☀️" },
  { id: "omega3", label: "ომეგა 3", icon: "🐟" },
  { id: "iron", label: "რკინა", icon: "🩸" },
  { id: "iodine", label: "იოდი", icon: "🧂" },
  { id: "other", label: "სხვა დამატება", icon: "💊" },
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
      title: "გაიკეთე ოვულაციის ტესტი",
      subtitle: isPeakDay
        ? "პიკის დღეებია — ტესტი დღეს განსაკუთრებით მნიშვნელოვანია"
        : "ტესტირების ფანჯარაშია — დღეში ერთხელ საკმარისია",
      done: Boolean(todayLogs.lh_test),
      priority: isPeakDay ? 1 : 2,
    });
  }

  // 2. Intercourse — highlighted only inside the fertile window.
  if (inFertileWindow) {
    items.push({
      id: "intercourse",
      icon: "❤️",
      title: isPeakDay ? "დღეს საუკეთესო დღეა ურთიერთობისთვის" : "ნაყოფიერი ფანჯარაა",
      subtitle: isPeakDay
        ? "ჩასახვის შანსი მაქსიმალურია"
        : "ყოველ მეორე დღეს ურთიერთობა ზრდის შანსს",
      done: Boolean(todayLogs.intercourse),
      priority: isPeakDay ? 1 : 3,
    });
  }

  // 3. BBT — every morning, before getting up.
  items.push({
    id: "bbt",
    icon: "🌡️",
    title: "გაზომე ბაზალური ტემპერატურა",
    subtitle: "დილით, ადგომამდე, ერთსა და იმავე დროს",
    done: Boolean(todayLogs.bbt),
    priority: 4,
  });

  // 4. Supplements — daily.
  items.push({
    id: "supplement",
    icon: "💊",
    title: "მიიღე ვიტამინები",
    subtitle: (todayLogs.supplement?.taken?.length)
      ? `დღეს მიღებული: ${todayLogs.supplement.taken.length}`
      : "ფოლიუმის მჟავა ყოველდღიურად რეკომენდებულია",
    done: Boolean(todayLogs.supplement?.taken?.length),
    priority: 5,
  });

  // 5. Symptoms / mucus — daily signal logging.
  items.push({
    id: "ovulation_symptom",
    icon: "🌸",
    title: "შეავსე დღევანდელი ნიშნები",
    subtitle: "ლორწო და სიმპტომები აზუსტებს ოვულაციის შეფასებას",
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
