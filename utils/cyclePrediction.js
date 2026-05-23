import dayjs from "dayjs";

export function calculateAverageCycle(cycles) {
  // თუ არ გვაქვს საკმარისი ისტორია, ვაბრუნებთ null-ს, რომ პროფილის რიცხვი გამოიყენოს
  if (!cycles || cycles.length < 2) return null;

  let lengths = [];
  for (let i = 1; i < cycles.length; i++) {
    const prev = dayjs(cycles[i - 1].start_date);
    const current = dayjs(cycles[i].start_date);
    const diff = current.diff(prev, "day");

    if (diff >= 21 && diff <= 45) {
      lengths.push(diff);
    }
  }

  // თუ ვალიდური ციკლები არ მოიძებნა, ისევ null
  if (lengths.length === 0) return null;
  
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  return Math.round(avg);
}

export function getPreferredCycleLength(cycles, profile) {
  const profileCycleLength = Number(profile?.cycle_length);
  if (profileCycleLength >= 21 && profileCycleLength <= 45) return profileCycleLength;

  const latestCycleLength = Number(cycles?.[cycles.length - 1]?.cycle_length);
  if (latestCycleLength >= 21 && latestCycleLength <= 45) return latestCycleLength;

  return calculateAverageCycle(cycles) || 28;
}

export function getPreferredPeriodLength(cycles, profile) {
  const profilePeriodLength = Number(profile?.period_length);
  if (profilePeriodLength >= 1 && profilePeriodLength <= 14) return profilePeriodLength;

  const latestPeriodLength = Number(cycles?.[cycles.length - 1]?.period_length);
  if (latestPeriodLength >= 1 && latestPeriodLength <= 14) return latestPeriodLength;

  return calculateAveragePeriod(cycles) || 5;
}

export function calculateAveragePeriod(cycles) {
  // აქაც null-ს ვაბრუნებთ, თუ ისტორია ცარიელია
  if (!cycles || cycles.length === 0) return null;
  
  const periods = cycles.map(c => c.period_length || 5);
  const avg = periods.reduce((a, b) => a + b, 0) / periods.length;
  return Math.round(avg);
}
