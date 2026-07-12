import dayjs from "dayjs";

export function normalizeCycleStartDate(date, referenceDate = dayjs()) {
  if (!date) return null;

  const reference = dayjs(referenceDate).startOf("day");
  let normalized = dayjs(date).startOf("day");

  if (!normalized.isValid()) return null;

  if (normalized.isAfter(reference, "day")) {
    normalized = normalized.subtract(1, "year");
  }

  return normalized;
}

export function formatLastPeriodSelection(month, day, referenceDate = dayjs()) {
  const now = dayjs(referenceDate);
  let selectedDate = dayjs(new Date(now.year(), month - 1, day)).startOf("day");

  if (selectedDate.isAfter(now, "day")) {
    selectedDate = selectedDate.subtract(1, "year");
  }

  return selectedDate.format("YYYY-MM-DD");
}

export function calculateCycleState({
  lastStartDate,
  cycleLength = 28,
  periodLength = 5,
  referenceDate = dayjs(),
}) {
  const safeCycleLength = Number(cycleLength) || 28;
  const safePeriodLength = Number(periodLength) || 5;
  const today = dayjs(referenceDate).startOf("day");
  const start = normalizeCycleStartDate(lastStartDate, today);

  if (!start) return null;

  let nextPeriod = start.add(safeCycleLength, "day").startOf("day");

  while (!nextPeriod.isAfter(today, "day")) {
    nextPeriod = nextPeriod.add(safeCycleLength, "day");
  }

  const elapsedDays = today.diff(start, "day");
  const cycleDay = ((elapsedDays % safeCycleLength) + safeCycleLength) % safeCycleLength + 1;
  const ovulation = nextPeriod.subtract(14, "day").startOf("day");
  const ovulationDay = ovulation.diff(start, "day") + 1;
  const fertileStart = ovulation.subtract(5, "day");
  const fertileEnd = ovulation.add(1, "day");
  const daysLeft = Math.max(0, nextPeriod.diff(today, "day"));
  const phaseKey = getCyclePhaseKey(cycleDay, safeCycleLength, safePeriodLength);

  return {
    start,
    today,
    cycleDay,
    cycleLength: safeCycleLength,
    periodLength: safePeriodLength,
    nextPeriod,
    daysLeft,
    ovulation,
    ovulationDay,
    fertileStart,
    fertileEnd,
    phaseKey,
  };
}

export function getCycleWindowDates(startDate, cycleLength = 28) {
  const start = normalizeCycleStartDate(startDate);
  if (!start) return null;

  const nextPeriod = start.add(Number(cycleLength) || 28, "day").startOf("day");
  const ovulation = nextPeriod.subtract(14, "day").startOf("day");

  return {
    nextPeriod,
    ovulation,
    ovulationDay: ovulation.diff(start, "day") + 1,
    fertileStart: ovulation.subtract(5, "day"),
    fertileEnd: ovulation.add(1, "day"),
  };
}

export function getCyclePhaseKey(cycleDay, cycleLength = 28, periodLength = 5) {
  const ovulationDay = cycleLength - 13;

  if (cycleDay <= periodLength) return "period";
  if (cycleDay < ovulationDay - 5) return "follicular";
  if (cycleDay >= ovulationDay - 5 && cycleDay <= ovulationDay + 1) return "fertile";
  return "luteal";
}

export function getPregnancyChanceKey(cycleDay, cycleLength = 28) {
  const ovulationDay = cycleLength - 13;

  if (cycleDay <= 0) return null;

  // Peak: ovulation day and the day before — highest conception chance.
  if (cycleDay === ovulationDay || cycleDay === ovulationDay - 1) {
    return "veryHigh";
  }

  // Core fertile window (ovulation −5 .. +1 excluding the two peak days).
  if (cycleDay >= ovulationDay - 5 && cycleDay <= ovulationDay + 1) {
    return "high";
  }

  // Approaching / just-past the fertile window — a moderate chance.
  if (cycleDay >= ovulationDay - 7 && cycleDay <= ovulationDay + 3) {
    return "medium";
  }

  return "low";
}
