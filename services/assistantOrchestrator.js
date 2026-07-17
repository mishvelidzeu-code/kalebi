import dayjs from "dayjs";

import { calculateCycleState, getPregnancyChanceKey } from "../utils/cycleEngine";
import { getPreferredCycleLength, getPreferredPeriodLength } from "../utils/cyclePrediction";
import { buildFertilityAiContext } from "../utils/fertilityInsights";
import {
  analyzeCycleRegularity,
  buildFertileWindows,
  computeTryingHistory,
  summarizeFertilityLogs,
} from "../utils/fertilityStats";
import {
  confirmOvulation,
  getConfirmedOvulationsByCycle,
  getPersonalizedLutealLength,
  refineOvulationEstimate,
} from "../utils/ovulationDetection";
import { isAdminEmail, isTestAccountEmail } from "./adminAccess";
import { generateAiResponse } from "./ai";
import { getFertilityLogsForDay, getFertilityLogsRange } from "./fertilityLogs";
import { supabase } from "./supabase";

const DEFAULT_GOAL_LABEL = "ციკლის კონტროლი";

const GOAL_MAP = {
  "ციკლის კონტროლი": "Cycle Control",
  "დაორსულება": "Get Pregnant",
  "ჯანმრთელობის მონიტორინგი": "Health Monitoring",
};

GOAL_MAP["ციკლის კონტროლი"] = "Cycle Control";
GOAL_MAP["დაორსულება"] = "Get Pregnant";
GOAL_MAP["ჯანმრთელობის მონიტორინგი"] = "Health Monitoring";
GOAL_MAP["Cycle Control"] = "Cycle Control";
GOAL_MAP["Get Pregnant"] = "Get Pregnant";
GOAL_MAP["Health Monitoring"] = "Health Monitoring";

const PHASE_LABELS = {
  period: "Period (პერიოდი)",
  follicular: "Follicular Phase (ფოლიკულური ფაზა)",
  fertile: "Fertile Window (ნაყოფიერი პერიოდი)",
  luteal: "Luteal Phase (ლუტეალური ფაზა)",
};

const PHASE_DISPLAY_LABELS = {
  period: "პერიოდი",
  follicular: "ფოლიკულური ფაზა",
  fertile: "ნაყოფიერი პერიოდი",
  luteal: "ლუტეალური ფაზა",
};

const SYMPTOM_LABELS = {
  headache: "თავის ტკივილი",
  cramps: "მუცლის ტკივილი",
  fatigue: "დაღლილობა",
  bloating: "შეშუპება",
  backache: "წელის ტკივილი",
  irritable: "გაღიზიანება",
  sad: "სევდა",
  anxious: "შფოთვა",
  happy: "ბედნიერი",
};

const ASSISTANT_CONTEXT_CACHE_TTL_MS = 45 * 1000;

let assistantContextCache = {
  userId: null,
  expiresAt: 0,
  value: null,
};

const PREGNANCY_SYSTEM_PROMPT = `
# SYSTEM ROLE & IDENTITY
You are a warm, highly empathetic AI companion embedded in a pregnancy tracking application. You are a blend of a knowledgeable pregnancy expert, a supportive best friend, and a psychological guide for expecting mothers.
CRITICAL RULE: You must communicate with the user EXCLUSIVELY in natural, modern, and warm GEORGIAN language.

# OBJECTIVES
1. Support and educate the user through their pregnancy journey week by week.
2. Provide emotional validation and psychological support adapted to their current pregnancy stage.
3. Answer questions about fetal development, pregnancy symptoms, nutrition, and preparation for birth.

# DYNAMIC CONTEXT (User State)
- User Name: {{user_name}}
- Pregnancy Week: {{pregnancy_week}}
- Trimester: {{trimester}}
- Days Until Due Date: {{days_remaining}}
- Logged Symptoms Today: {{symptoms}}
- Current Mood: {{mood}}

# BEHAVIORAL RULES & TONE
- EMPATHY FIRST: Always validate feelings before offering advice.
- EDUCATIONAL: Share relevant weekly development milestones and what the user can expect.
- TONE: Warm, motherly, reassuring, non-judgmental, and scientifically accurate. Use emojis to keep it friendly. 💗
- Never diagnose. If symptoms are severe (bleeding, severe pain, fever), always advise consulting a doctor immediately.

# SAFETY & BOUNDARIES (STRICT)
- You are an AI assistant, NOT a certified doctor or midwife.
- For any serious or concerning symptoms, always recommend consulting a healthcare professional.

# RESPONSE FORMAT
- Keep responses concise, engaging, and scannable for mobile screens.
- Use short paragraphs and emojis where appropriate.
`.trim();

const ASSISTANT_SYSTEM_PROMPT = `
# SYSTEM ROLE & IDENTITY
You are an advanced, highly empathetic AI companion embedded in a women's health and cycle-tracking application. You are a blend of a knowledgeable fertility expert, a supportive best friend, and a psychological guide.
CRITICAL RULE: You must communicate with the user EXCLUSIVELY in natural, modern, and warm GEORGIAN language.

# OBJECTIVES
1. Educate and guide the user through their menstrual cycle phases.
2. Provide emotional validation and psychological support adapted to their current hormonal state.
3. Align all advice, insights, and reminders strictly with the user's PRIMARY GOAL.

# DYNAMIC CONTEXT (User State)
Use the real-time data provided by the app to personalize every response. Treat this data as the saved app profile, not as a reason to ignore the user's newest message.
- User Name: {{user_name}}
- Primary Goal: {{user_goal}} (Options: "Cycle Control", "Get Pregnant", "Health Monitoring")
- Current Cycle Phase: {{current_phase}}
- Cycle Day: {{cycle_day}}
- Logged Symptoms Today: {{symptoms}}
- Current Mood: {{mood}}

# DATE AND CYCLE ACCURACY (CRITICAL)
- The user's newest message is the strongest source of truth when it contains a period date, missed-period statement, pregnancy concern, or correction.
- If the user says a period has not come since a specific date, treat that date as user-provided and do not replace it with the saved profile date.
- Never invent or shift dates by one day. If the user's date is ambiguous, say "თუ ეს იყო ბოლო მენსტრუაციის პირველი დღე..." and explain the estimate.
- For missed-period questions, clearly state whether the estimate is based on the user's message or the saved app data.

# GOAL-ORIENTED BEHAVIOR (CRITICAL)
Your entire approach, tone, and advice MUST adapt to the {{user_goal}}:
- IF "Cycle Control" (ციკლის კონტროლი): Focus on accurate period predictions, managing PMS, and explaining how daily hormonal shifts affect energy and mood. Help them feel prepared and comfortable.
- IF "Get Pregnant" (დაორსულება): Shift focus entirely to the fertile window, ovulation tracking, basal body temperature (if logged), and maximizing chances of conception. Be highly encouraging, delicate, and supportive. Explain how current symptoms relate to fertility, but DO NOT give false medical hope. If a period starts, be extremely empathetic and comforting.
- IF "Health Monitoring" (ჯანმრთელობის მონიტორინგი): Focus on holistic wellness, identifying symptom patterns over time, and detecting potential anomalies (e.g., irregular cycles). Encourage healthy habits, stress reduction, and remind them that their logged data is great for sharing with a doctor.

# BEHAVIORAL RULES & TONE
- EMPATHY FIRST: Never sound like a robotic medical dictionary. Validate feelings first before offering advice.
- PROACTIVE CARE: Anticipate their needs. If they are trying to get pregnant and approaching ovulation, gently encourage intimacy or ovulation testing.
- PSYCHOLOGICAL SUPPORT: Use subtle Cognitive Behavioral Therapy (CBT) techniques. If the user feels anxious, ask grounding questions or suggest small self-care actions.
- TONE: Sisterly, warm, reassuring, non-judgmental, and scientifically accurate. Use emojis to keep it friendly.

# TODAY VS HISTORY
- Treat todayEntry and currentCycle as the strongest source of truth for what is happening right now.
- If todayEntry has no symptoms or mood, clearly say that today's specific entry is not logged yet.
- Use recent history only for pattern analysis, NEVER describe old symptoms as if they are today's symptoms.

# FERTILITY TRACKING DATA (only when context.fertilityTracking exists)
When the user is in fertility mode ("მინდა დაორსულება"), context.fertilityTracking holds what they actually logged. Use it — it is stronger evidence than the calendar estimate alone.
- today.lh_test: "negative" | "weak" | "positive" | "peak". A positive/peak surge means ovulation typically follows within 24-36 hours — this is the single most useful same-day signal.
- today.cervical_mucus: "dry" | "sticky" | "creamy" | "watery" | "eggwhite". Egg-white mucus indicates peak fertility.
- today.bbt_celsius: basal body temperature. A sustained rise SUGGESTS ovulation has already happened; a single reading proves nothing.
- cycle_regularity.prediction_confidence: "high" | "medium" | "low". If it is "low" or is_regular is false, you MUST hedge: give ranges, not exact dates, and lean on LH/mucus/BBT over the calendar.
- confirmed_ovulation: set only when this cycle's own signals (BBT shift / LH surge / mucus peak) point to a day. It is RETROSPECTIVE EVIDENCE, not proof — say "ნიშნების მიხედვით სავარაუდოდ", never "დადასტურდა" as a medical fact. If signals_agree is false, mention that the signals disagree.
- best_ovulation_estimate.source: "signals" (this cycle's own data — trust most), "personalized" (their measured luteal phase), or "calendar" (generic 14-day assumption — weakest, hedge accordingly).
- personal_luteal_phase_days: their measured luteal length. Prefer it over the textbook 14 days when present.
- trying_history.months_trying: if it is long, be extra gentle and never imply they are doing something wrong.
- If a signal is null, say it is not logged yet instead of guessing.

# FERTILITY SAFETY (STRICT)
- NEVER promise conception, predict a pregnancy outcome, or interpret a pregnancy test result as definitive.
- Advise a pregnancy test only from ~11 days past ovulation, and note that earlier tests are often falsely negative.
- Do not diagnose infertility. If they have been trying 12+ months (or 6+ if 35 or older), gently suggest a specialist as a routine next step, not as alarming news.

# SAFETY & BOUNDARIES (STRICT)
- You are an AI assistant, NOT a certified doctor. You cannot diagnose diseases or prescribe medication.
- If the user reports severe, acute, or dangerous symptoms (e.g., unbearable pain, excessive bleeding), you MUST kindly but firmly advise them to consult a healthcare professional.

# RESPONSE FORMAT
- Keep responses concise, engaging, and scannable for mobile screens.
- Use short paragraphs.
`.trim();

function mapGoalToAssistantGoal(goal) {
  return GOAL_MAP[String(goal || "").trim()] || "Cycle Control";
}

function normalizeSymptoms(symptoms) {
  return (symptoms || []).map((symptom) => SYMPTOM_LABELS[symptom] || symptom);
}

function sortCyclesAscending(cycles = []) {
  return [...cycles].sort((a, b) => dayjs(a.start_date).valueOf() - dayjs(b.start_date).valueOf());
}

function sortCyclesDescending(cycles = []) {
  return [...cycles].sort((a, b) => dayjs(b.start_date).valueOf() - dayjs(a.start_date).valueOf());
}

function summarizeSymptoms(rows) {
  const flattened = rows.flatMap((row) => row.symptoms || []);
  const counts = flattened.reduce((accumulator, symptom) => {
    accumulator[symptom] = (accumulator[symptom] || 0) + 1;
    return accumulator;
  }, {});

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([symptom, count]) => ({
      symptom,
      label: SYMPTOM_LABELS[symptom] || symptom,
      count,
    }));
}

function getCurrentCycle(cycles, profile) {
  const chronologicalCycles = sortCyclesAscending(cycles);
  const latestFirstCycles = sortCyclesDescending(cycles);
  const preferredCycleLength = getPreferredCycleLength(chronologicalCycles, profile);
  const preferredPeriodLength = getPreferredPeriodLength(chronologicalCycles, profile);
  const lastStartDate = latestFirstCycles.length > 0 ? latestFirstCycles[0].start_date : profile?.last_period;

  if (!lastStartDate) {
    return {
      cycle_length: preferredCycleLength,
      period_length: preferredPeriodLength,
      last_period: null,
      cycle_day: null,
      current_phase: "Unknown",
      phase_key: null,
      pregnancy_chance: null,
      days_until_next_period: null,
    };
  }

  const cycleState = calculateCycleState({
    lastStartDate,
    cycleLength: preferredCycleLength,
    periodLength: preferredPeriodLength,
  });

  if (!cycleState) {
    return {
      cycle_length: preferredCycleLength,
      period_length: preferredPeriodLength,
      last_period: lastStartDate,
      cycle_day: null,
      current_phase: "Unknown",
      phase_key: null,
      pregnancy_chance: null,
      days_until_next_period: null,
    };
  }

  const cycleDay = cycleState.cycleDay;
  const ovulation = cycleState.ovulationDay;
  const daysUntilNextPeriod = cycleState.daysLeft;

  if (cycleDay <= preferredPeriodLength) {
    return {
      cycle_length: preferredCycleLength,
      period_length: preferredPeriodLength,
      last_period: lastStartDate,
      cycle_day: cycleDay,
      current_phase: PHASE_LABELS.period,
      phase_key: "period",
      pregnancy_chance: "Very Low",
      days_until_next_period: daysUntilNextPeriod,
    };
  }

  if (cycleDay < ovulation - 5) {
    return {
      cycle_length: preferredCycleLength,
      period_length: preferredPeriodLength,
      last_period: lastStartDate,
      cycle_day: cycleDay,
      current_phase: PHASE_LABELS.follicular,
      phase_key: "follicular",
      pregnancy_chance: "Low",
      days_until_next_period: daysUntilNextPeriod,
    };
  }

  if (cycleDay >= ovulation - 5 && cycleDay <= ovulation + 1) {
    return {
      cycle_length: preferredCycleLength,
      period_length: preferredPeriodLength,
      last_period: lastStartDate,
      cycle_day: cycleDay,
      current_phase: PHASE_LABELS.fertile,
      phase_key: "fertile",
      pregnancy_chance: getPregnancyChanceKey(cycleDay, preferredCycleLength) === "veryHigh" ? "Very High" : "High",
      days_until_next_period: daysUntilNextPeriod,
    };
  }

  return {
    cycle_length: preferredCycleLength,
    period_length: preferredPeriodLength,
    last_period: lastStartDate,
    cycle_day: cycleDay,
    current_phase: PHASE_LABELS.luteal,
    phase_key: "luteal",
    pregnancy_chance: "Low",
    days_until_next_period: daysUntilNextPeriod,
  };
}

async function getAssistantContext({ forceRefresh = false } = {}) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("მომხმარებელი ვერ მოიძებნა.");
  }

  if (
    !forceRefresh &&
    assistantContextCache.userId === user.id &&
    assistantContextCache.value &&
    assistantContextCache.expiresAt > Date.now()
  ) {
    return assistantContextCache.value;
  }

  const today = dayjs().format("YYYY-MM-DD");
  const [profileResponse, cyclesResponse, symptomsResponse, todaySymptomsResponse] = await Promise.all([
    supabase.from("profiles").select("name, goal, cycle_length, period_length, last_period, pregnancy_mode, pregnancy_start_date, has_pregnancy_subscription, birth_date").eq("id", user.id).maybeSingle(),
    supabase.from("cycles").select("start_date, cycle_length, period_length").eq("user_id", user.id).order("start_date", { ascending: false }).limit(6),
    supabase.from("symptoms").select("date, symptoms, mood, note").eq("user_id", user.id).order("date", { ascending: false }).limit(10),
    supabase.from("symptoms").select("date, symptoms, mood, note").eq("user_id", user.id).eq("date", today).maybeSingle(),
  ]);

  const profile = profileResponse.data || {};
  const cycles = cyclesResponse.data || [];
  const symptoms = symptomsResponse.data || [];
  const currentCycle = getCurrentCycle(cycles, profile);
  const todayEntry = todaySymptomsResponse.data || null;
  const recentEntries = symptoms.filter((entry) => entry.date !== today).slice(0, 3);

  const pregnancyStartDate = profile.pregnancy_start_date || null;
  const pregnancyWeek = pregnancyStartDate
    ? Math.min(Math.floor(dayjs().diff(dayjs(pregnancyStartDate), "day") / 7) + 1, 40)
    : null;
  const pregnancyTrimester = pregnancyWeek
    ? pregnancyWeek <= 12 ? 1 : pregnancyWeek <= 27 ? 2 : 3
    : null;
  const daysRemaining = pregnancyStartDate
    ? Math.max(0, 280 - dayjs().diff(dayjs(pregnancyStartDate), "day"))
    : null;

  // Fertility ("დაორსულება") is a paid tier of the same "pregnancy" entitlement —
  // picking it as a goal is free, but the tailored AI content stays locked until paid.
  const fertilityUnlocked =
    isAdminEmail(user.email)
    || isTestAccountEmail(user.email)
    || Boolean(profile.has_pregnancy_subscription);
  const effectiveGoal = profile.goal === "დაორსულება" && !fertilityUnlocked ? DEFAULT_GOAL_LABEL : profile.goal;

  // Fertility mode injects the tracked signals (LH / BBT / mucus) so answers
  // can reason about what the user actually logged, not just the calendar.
  const isFertilityMode = effectiveGoal === "დაორსულება" && !profile.pregnancy_mode;
  let fertilityTracking = null;

  if (isFertilityMode) {
    try {
      const chronological = [...cycles].sort((a, b) => dayjs(a.start_date).diff(dayjs(b.start_date)));
      const forecast = calculateCycleState({
        lastStartDate: currentCycle.last_period,
        cycleLength: currentCycle.cycle_length,
        periodLength: currentCycle.period_length,
      });

      const [todayLogs, rangeLogs] = await Promise.all([
        getFertilityLogsForDay(today),
        getFertilityLogsRange(dayjs().subtract(6, "month").format("YYYY-MM-DD"), today),
      ]);

      const regularity = analyzeCycleRegularity(chronological, currentCycle.cycle_length);
      const fertileWindows = buildFertileWindows(chronological, regularity.avgCycle || currentCycle.cycle_length);
      const logSummary = summarizeFertilityLogs(rangeLogs, fertileWindows);
      const trying = computeTryingHistory(chronological, rangeLogs, fertileWindows);

      // Symptothermal evidence, so answers can lean on real signals.
      const confirmations = getConfirmedOvulationsByCycle(chronological, rangeLogs);
      const lutealLength = getPersonalizedLutealLength(confirmations);
      const currentConfirmation = currentCycle.last_period
        ? confirmOvulation({ logs: rangeLogs, cycleStart: currentCycle.last_period, cycleEnd: null })
        : null;
      const refinedOvulation = refineOvulationEstimate({ forecast, currentConfirmation, lutealLength });

      fertilityTracking = buildFertilityAiContext({
        logSummary,
        regularity,
        trying,
        todayLogs,
        forecast,
        currentConfirmation,
        refinedOvulation,
        lutealLength,
      });
    } catch (error) {
      // Never let the fertility extras break the base assistant context.
      console.log("Fertility AI context skipped:", error);
    }
  }

  const context = {
    user_name: profile.name || user.email?.split("@")[0] || "მომხმარებელი",
    user_goal: mapGoalToAssistantGoal(effectiveGoal),
    user_goal_label: String(effectiveGoal || DEFAULT_GOAL_LABEL).trim() || DEFAULT_GOAL_LABEL,
    pregnancy_mode: profile.pregnancy_mode ?? false,
    pregnancy_week: pregnancyWeek,
    pregnancy_trimester: pregnancyTrimester,
    days_remaining: daysRemaining,
    current_phase: currentCycle.current_phase,
    current_phase_label: PHASE_DISPLAY_LABELS[currentCycle.phase_key] || "უცნობი ფაზა",
    cycle_day: currentCycle.cycle_day,
    symptoms: normalizeSymptoms(todayEntry?.symptoms || []),
    mood: todayEntry?.mood || "Not logged today",
    todayEntry: {
      exists: Boolean(todayEntry),
      date: today,
      symptoms: normalizeSymptoms(todayEntry?.symptoms || []),
      mood: todayEntry?.mood || null,
      note: todayEntry?.note || null,
    },
    currentCycle,
    cycleHistory: {
      cycle_length: currentCycle.cycle_length,
      period_length: currentCycle.period_length,
      last_period: currentCycle.last_period,
      days_until_next_period: currentCycle.days_until_next_period,
      pregnancy_chance: currentCycle.pregnancy_chance,
      recent_cycles: cycles,
    },
    recentPatterns: {
      recent_entries: recentEntries.map((entry) => ({
        ...entry,
        symptoms: normalizeSymptoms(entry.symptoms || []),
      })),
      top_symptoms: summarizeSymptoms(symptoms),
    },
    ...(fertilityTracking ? { fertilityTracking } : {}),
  };

  assistantContextCache = {
    userId: user.id,
    expiresAt: Date.now() + ASSISTANT_CONTEXT_CACHE_TTL_MS,
    value: context,
  };

  return context;
}

function buildTodayOverride({ symptoms = [], mood = null, note = "" } = {}) {
  const cleanNote = typeof note === "string" ? note.trim() : "";
  const normalizedSymptoms = normalizeSymptoms(symptoms);
  const hasTodayData = Boolean(normalizedSymptoms.length || mood || cleanNote);

  return {
    symptoms: normalizedSymptoms,
    mood: mood || "Not logged today",
    todayEntry: {
      exists: hasTodayData,
      date: dayjs().format("YYYY-MM-DD"),
      symptoms: normalizedSymptoms,
      mood: mood || null,
      note: cleanNote || null,
    },
  };
}

export function invalidateAssistantContextCache() {
  assistantContextCache = {
    userId: null,
    expiresAt: 0,
    value: null,
  };
}

function normalizePromptText(prompt) {
  return String(prompt || "")
    .trim()
    .toLowerCase()
    .replace(/[?!.,;:()"']/g, "")
    .replace(/\s+/g, " ");
}

function hasAny(text, words) {
  return words.some((word) => text.includes(word));
}

const GEORGIAN_MONTHS = {
  იანვარი: 1,
  იანვარს: 1,
  თებერვალი: 2,
  თებერვალს: 2,
  მარტი: 3,
  მარტს: 3,
  აპრილი: 4,
  აპრილს: 4,
  მაისი: 5,
  მაისს: 5,
  ივნისი: 6,
  ივნისს: 6,
  ივლისი: 7,
  ივლისს: 7,
  აგვისტო: 8,
  აგვისტოს: 8,
  სექტემბერი: 9,
  სექტემბერს: 9,
  ოქტომბერი: 10,
  ოქტომბერს: 10,
  ნოემბერი: 11,
  ნოემბერს: 11,
  დეკემბერი: 12,
  დეკემბერს: 12,
};

const GEORGIAN_MONTH_NAMES = [
  "იანვარი",
  "თებერვალი",
  "მარტი",
  "აპრილი",
  "მაისი",
  "ივნისი",
  "ივლისი",
  "აგვისტო",
  "სექტემბერი",
  "ოქტომბერი",
  "ნოემბერი",
  "დეკემბერი",
];

function parseUserProvidedCycleDate(prompt, referenceDate = dayjs()) {
  const text = String(prompt || "").toLowerCase();
  const monthPattern = Object.keys(GEORGIAN_MONTHS).join("|");
  const match = text.match(new RegExp(`(?:^|\\s)(\\d{1,2})(?:-|\\s)*(${monthPattern})(?:\\s+(\\d{4}))?`));

  if (!match) return null;

  const day = Number(match[1]);
  const month = GEORGIAN_MONTHS[match[2]];
  const year = match[3] ? Number(match[3]) : dayjs(referenceDate).year();
  let parsedDate = dayjs(new Date(year, month - 1, day)).startOf("day");

  if (!parsedDate.isValid() || parsedDate.date() !== day || parsedDate.month() !== month - 1) {
    return null;
  }

  if (!match[3] && parsedDate.isAfter(dayjs(referenceDate).startOf("day"), "day")) {
    parsedDate = parsedDate.subtract(1, "year");
  }

  return parsedDate;
}

function isMissedPeriodQuestion(normalizedPrompt) {
  return hasAny(normalizedPrompt, [
    "არ მომსვლია",
    "არ მომივიდა",
    "არ მომდის",
    "გადამიცდა",
    "გადაცდა",
    "დამაგვიანდა",
    "მენსტრუაცია არ",
    "period late",
    "late period",
  ]);
}

function formatGeorgianDate(date) {
  const parsedDate = dayjs(date);
  const monthName = GEORGIAN_MONTH_NAMES[parsedDate.month()];
  return `${parsedDate.date()} ${monthName}`;
}

function buildMissedPeriodResponseFromPrompt(prompt, context) {
  const normalizedPrompt = normalizePromptText(prompt);

  if (!isMissedPeriodQuestion(normalizedPrompt)) return null;

  const userDate = parseUserProvidedCycleDate(prompt);

  if (!userDate) {
    return null;
  }

  const cycleLength = Number(context.currentCycle?.cycle_length || context.cycleHistory?.cycle_length || 28) || 28;
  const today = dayjs().startOf("day");
  const nextPeriod = userDate.add(cycleLength, "day").startOf("day");
  const daysLate = today.diff(nextPeriod, "day");
  const daysUntil = nextPeriod.diff(today, "day");
  const cycleDay = today.diff(userDate, "day") + 1;
  const dateLabel = formatGeorgianDate(userDate);
  const nextPeriodLabel = formatGeorgianDate(nextPeriod);

  if (daysLate > 0) {
    return [
      `${context.user_name ? `${context.user_name}, ` : ""}მესმის, ასეთი დაგვიანება მართლა ნერვიულობას იწვევს.`,
      "",
      `თუ ${dateLabel} იყო ბოლო მენსტრუაციის პირველი დღე, შენს დაახლოებით ${cycleLength}-დღიან ციკლზე შემდეგი პერიოდი მოსალოდნელი იყო დაახლოებით ${nextPeriodLabel}-ს.`,
      "",
      `დღევანდელი მონაცემით ეს ნიშნავს, რომ მენსტრუაცია დაახლოებით ${daysLate} დღით არის გადაცდენილი და ახლა ციკლის ${cycleDay}-ე დღე გამოდის.`,
      "",
      "თუ ორსულობის შანსი იყო, ყველაზე პრაქტიკული ნაბიჯია ორსულობის ტესტი დილის პირველი შარდით. თუ ტესტი უარყოფითია და მენსტრუაცია კიდევ რამდენიმე დღეში არ დაიწყება, ტესტი გაიმეორე ან გინეკოლოგს დაეკითხე. ძლიერი ტკივილის, უჩვეულო სისხლდენის ან ძალიან ცუდად ყოფნის შემთხვევაში ექიმთან დაკავშირება ჯობს.",
    ].join("\n");
  }

  if (daysUntil === 0) {
    return [
      `${context.user_name ? `${context.user_name}, ` : ""}თუ ${dateLabel} იყო ბოლო მენსტრუაციის პირველი დღე, შენს დაახლოებით ${cycleLength}-დღიან ციკლზე პერიოდი დღეს, დაახლოებით ${nextPeriodLabel}-ს არის მოსალოდნელი.`,
      "",
      "დღესვე გადაცდენად ჩათვლა ცოტა ადრეა. თუ ორსულობის შანსი იყო და მენსტრუაცია არ დაიწყება, ტესტი შეგიძლია ხვალიდან ან რამდენიმე დღეში გაიკეთო.",
    ].join("\n");
  }

  return [
    `${context.user_name ? `${context.user_name}, ` : ""}თუ ${dateLabel} იყო ბოლო მენსტრუაციის პირველი დღე, შენს დაახლოებით ${cycleLength}-დღიან ციკლზე შემდეგი პერიოდი მოსალოდნელია დაახლოებით ${nextPeriodLabel}-ს.`,
    "",
    `ამ გამოთვლით გადაცდენა ჯერ არ ჩანს: დარჩენილია დაახლოებით ${daysUntil} დღე. თუ თარიღი ბოლო დღის შესახებ თქვი და არა პირველი დღის შესახებ, მითხარი პირველი დღე და უფრო ზუსტად დაგითვლი.`,
  ].join("\n");
}

function buildPregnancyLocalResponse(prompt, context) {
  const normalizedPrompt = normalizePromptText(prompt);
  const week = context.pregnancy_week;
  const trimester = context.pregnancy_trimester;
  const daysLeft = context.days_remaining;
  const name = context.user_name ? `${context.user_name}, ` : "";
  const symptoms = context.todayEntry?.symptoms || [];
  const mood = context.todayEntry?.mood;

  if (!normalizedPrompt) return null;

  // მისალმება
  if (hasAny(normalizedPrompt, ["გამარჯობა", "სალამი", "hello", "hi"]) && normalizedPrompt.length <= 20) {
    return `გამარჯობა${context.user_name ? `, ${context.user_name}` : ""} 💗 მე შენი ორსულობის ასისტენტი ვარ. გკითხე რაც გაინტერესებს — კვირეული განვითარება, სიმპტომები, ან უბრალოდ ისაუბრე როგორ გრძნობ თავს.`;
  }

  // რამდენ კვირაში ვარ
  if (hasAny(normalizedPrompt, ["რამდენ კვირ", "რომელ კვირ", "კვირაში ვარ", "კვირა ვარ"])) {
    if (!week) return "ორსულობის კვირის გამოსათვლელად ბოლო მენსტრუაციის თარიღი გჭირდება — შეავსე პროფილში.";
    return `${name}ახლა ხარ ორსულობის ${week}-ე კვირაში, ${trimester === 1 ? "I" : trimester === 2 ? "II" : "III"} ტრიმესტრში. 🤰`;
  }

  // როდის არის მშობიარობა
  if (hasAny(normalizedPrompt, ["როდის გაჩნდება", "მშობიარობა", "სავარაუდო თარიღ", "ძე დ", "ბავშვი როდის", "due date"])) {
    if (!daysLeft) return "მშობიარობის სავარაუდო თარიღი გამოიანგარიშება ბოლო მენსტრუაციის პირველი დღიდან.";
    return `${name}მშობიარობის სავარაუდო თარიღამდე დარჩენილია დაახლოებით ${daysLeft} დღე. 🎊 გახსოვდეს — ნორმალურია 37-42 კვირას შორის ნებისმიერ დღეს.`;
  }

  // ბავშვის ზომა / განვითარება
  if (hasAny(normalizedPrompt, ["ბავშვ", "ნაყოფ", "რა ზომ", "რა ვითარდ", "ამ კვირ"])) {
    if (!week) return null;
    const trimLabel = trimester === 1 ? "I ტრიმესტრი — ყველა ძირითადი ორგანო ვითარდება." : trimester === 2 ? "II ტრიმესტრი — ბავშვი მოძრაობს და სმენა ვითარდება." : "III ტრიმესტრი — ბავშვი სწრაფად მძიმდება და მზადაა.";
    return `${name}ახლა ხარ ${week}-ე კვირაში. ${trimLabel} კვირეული დეტალები კალენდარში ნახე! 👶`;
  }

  // გულისრევა
  if (hasAny(normalizedPrompt, ["გულისრევ", "რებობ", "გული ამრევ"])) {
    return `გულისრევა განსაკუთრებით ${week && week <= 12 ? "I ტრიმესტრში ძალიან" : "ორსულობის დროს"} გავრცელებულია. 🤢 სცადე: პატარა, ხშირი კვება; ჯინჯერის ჩაი; ცივი, სუფთა ჰაერი; და კვება საწოლიდან ადგომამდე. თუ ძალიან ძლიერია და ვერ სვამ წყალს, ექიმს დაუკავშირდი.`;
  }

  // ზურგის ტკივილი
  if (hasAny(normalizedPrompt, ["ზურგ", "წელ"])) {
    return "ზურგის ტკივილი ორსულობაში ნორმალურია, განსაკუთრებით II-III ტრიმესტრში. 💆 სცადე: ბალიში მუხლებს შორის ძილისას; ბარძაყის კუნთების გაჭიმვა; და ხერხემლის ზეწოლის შემცირება. თუ ტკივილი ძლიერი ან მუდმივია, ექიმს ეკითხე.";
  }

  // ძილი
  if (hasAny(normalizedPrompt, ["ძილ", "ვერ ვძინ", "უძილობ"])) {
    return "ძილის სირთულე ორსულობაში ძალიან გავრცელებულია 🌙 სცადე: გვერდით ძილი (მარცხნივ უკეთესია), ბალიში მუხლებს შორის, ოთახის გაგრილება. მოერიდე ეკრანებს ძილამდე 30 წუთით ადრე.";
  }

  // შფოთვა / შიში
  if (hasAny(normalizedPrompt, ["შფოთ", "მეშინ", "ნერვიულ", "შემეშინ", "ვნერვიულობ"])) {
    return `${name}შფოთვა ორსულობაში სრულიად ნორმალურია 💗 სხეული ძალიან სწრაფად იცვლება და ეს ბევრ კითხვას ბადებს. ღრმა სუნთქვა, პარტნიორთან ან ახლობელთან საუბარი ძალიან ეხმარება. თუ შფოთვა ძლიერია, ექიმს შეატყობინე — ეს მნიშვნელოვანია.`;
  }

  // დღევანდელი სიმპტომები
  if (hasAny(normalizedPrompt, ["ჩემი სიმპტომ", "დღეს რა", "დღევანდელი სიმპტომ"])) {
    if (!symptoms.length && !mood) return "დღეს ჯერ სიმპტომები ან განწყობა არ გაქვს ჩანიშნული. შეავსე დღიური კალენდარში! 📝";
    return `დღეს ჩანიშნულია: ${symptoms.length ? symptoms.join(", ") : "სიმპტომები არაა"}${mood ? `; განწყობა: ${mood}` : ""}. თუ რამე უჩვეულოა, ნუ მოგერიდება ექიმთან კონსულტაცია.`;
  }

  // კვება / ვიტამინები
  if (hasAny(normalizedPrompt, ["კვებ", "ვჭამ", "ვიტამინ", "ფოლიუმ", "რკინ", "კალციუმ"])) {
    return "ორსულობაში განსაკუთრებით მნიშვნელოვანია: 🥗 ფოლიუმის მჟავა (განსაკუთრებით I ტრიმ.), რკინა, კალციუმი, ომეგა-3. მოერიდე: ნედლ თევზს, დაუმუშავებელ ხორცს, ძლიერ ყავას. ორსულობის ვიტამინები ყოველდღიურად მიიღე.";
  }

  return null;
}

function buildLocalAssistantResponse(prompt, context) {
  const normalizedPrompt = normalizePromptText(prompt);
  const cycleDay = context.currentCycle?.cycle_day || context.cycle_day;
  const phaseLabel = context.current_phase_label;
  const daysUntilNextPeriod = context.currentCycle?.days_until_next_period;
  const symptoms = context.todayEntry?.symptoms || [];
  const mood = context.todayEntry?.mood;

  if (!normalizedPrompt) return null;

  // ორსულობის რეჟიმში — ლოკალური ორსულობის პასუხები
  if (context.pregnancy_mode) {
    return buildPregnancyLocalResponse(prompt, context);
  }

  const missedPeriodResponse = buildMissedPeriodResponseFromPrompt(prompt, context);
  if (missedPeriodResponse) return missedPeriodResponse;

  if (hasAny(normalizedPrompt, ["გამარჯობა", "სალამი", "hello", "hi"]) && normalizedPrompt.length <= 20) {
    return `გამარჯობა${context.user_name ? `, ${context.user_name}` : ""} 💗 მკითხე რაც გაინტერესებს ციკლზე, სიმპტომებზე ან დღევანდელ მდგომარეობაზე.`;
  }

  if (hasAny(normalizedPrompt, ["რა ფაზ", "რომელ ფაზ", "ფაზაში", "ციკლის დღე"]) || normalizedPrompt === "სად ვარ ციკლში") {
    if (!cycleDay || !phaseLabel) return "ჯერ საკმარისი ციკლის მონაცემი არ ჩანს, რომ ფაზა ზუსტად გითხრა. შეავსე ბოლო პერიოდის პირველი დღე და ციკლის ხანგრძლივობა.";
    return `ახლა ხარ ${phaseLabel}-ში და ციკლის ${cycleDay}-ე დღე გაქვს. ეს პროგნოზია შენს ბოლო პერიოდსა და ციკლის საშუალო ხანგრძლივობაზე დაყრდნობით.`;
  }

  if (hasAny(normalizedPrompt, ["როდის მომივა", "შემდეგ პერიოდ", "რამდენი დღე დარჩ", "პერიოდამდე"])) {
    if (daysUntilNextPeriod == null) return "შემდეგ პერიოდამდე დღეების დასათვლელად ჯერ ბოლო პერიოდის თარიღი მჭირდება. თუ შეავსებ კალენდარში, უფრო ზუსტად გიჩვენებ.";
    return `სავარაუდოდ შემდეგ პერიოდამდე დარჩენილია ${daysUntilNextPeriod} დღე. თუ ციკლი არარეგულარულია, ეს თარიღი შეიძლება ოდნავ შეიცვალოს.`;
  }

  if (hasAny(normalizedPrompt, ["დღეს როგორ მოვუარო თავს", "როგორ მოვუარო თავს", "დღეს რა ვქნა"])) {
    if (context.currentCycle?.phase_key === "period") return "დღეს ნაზი რეჟიმი აირჩიე: სითბო მუცელზე, წყალი, მსუბუქი მოძრაობა და ცოტა მეტი დასვენება. თუ ტკივილი ძალიან ძლიერია ან უჩვეულო სისხლდენაა, ექიმთან კონსულტაცია ჯობს.";
    if (context.currentCycle?.phase_key === "fertile") return "დღეს ენერგია შეიძლება უფრო მაღალი გქონდეს. კარგი დღეა მსუბუქი აქტივობისთვის, წყლისთვის და სხეულის სიგნალებზე დაკვირვებისთვის. თუ დაორსულებას ცდილობ, ეს ფანჯარა განსაკუთრებით მნიშვნელოვანია.";
    return "დღეს პატარა, რეალისტური თვითმოვლა აირჩიე: წყალი, 10 წუთი გასეირნება ან სუნთქვის მოკლე პაუზა. თუ დღიურსაც შეავსებ, რჩევა უფრო ზუსტი გახდება.";
  }

  if (hasAny(normalizedPrompt, ["pms", "პმს", "გაღიზიან", "შფოთ", "ხასიათი"])) {
    return "PMS-ის დროს გაღიზიანება, მგრძნობელობა ან შფოთვა ბევრ ადამიანს ემართება. სცადე კოფეინის შემცირება, წყალი, მსუბუქი მოძრაობა და პატარა დასვენების ბლოკები. თუ სიმპტომები ყოველდღიურ ცხოვრებას ძლიერ გიშლის, ექიმთან საუბარი კარგი ნაბიჯია.";
  }

  if (hasAny(normalizedPrompt, ["ჩემი სიმპტომები", "რა სიმპტომ", "დღევანდელი სიმპტომ"])) {
    if (!symptoms.length && !mood) return "დღეს ჯერ სიმპტომები ან განწყობა არ გაქვს ჩანიშნული. შეავსე დღიური და მერე უფრო ზუსტად გეტყვი, რას შეიძლება უკავშირდებოდეს.";
    return `დღეს ჩანიშნულია: ${symptoms.length ? symptoms.join(", ") : "სიმპტომები არაა"}${mood ? `; განწყობა: ${mood}` : ""}. თუ ეს შენთვის ჩვეულებრივია, უბრალოდ დააკვირდი; თუ ძლიერია, უცნაურია ან უარესდება, ექიმთან კონსულტაცია ჯობს.`;
  }

  return null;
}

export async function askAssistant({ prompt, history = [], allowAi = true }) {
  const context = await getAssistantContext();

  if (!context.pregnancy_mode) {
    const localResponse = buildLocalAssistantResponse(prompt, context);
    if (localResponse) {
      return { text: localResponse, context, source: "local" };
    }
  }

  if (!allowAi) {
    throw new Error("assistant-limit-exhausted");
  }

  const recentHistory = history.slice(-6).map((message) => ({
    role: message.role,
    text: message.text,
  }));

  const systemPrompt = context.pregnancy_mode ? PREGNANCY_SYSTEM_PROMPT : ASSISTANT_SYSTEM_PROMPT;

  const response = await generateAiResponse({
    prompt,
    systemPrompt,
    context: {
      ...context,
      recentHistory,
    },
    maxOutputTokens: 500,
    metadata: {
      feature: context.pregnancy_mode ? "assistant-chat-pregnancy" : "assistant-chat",
    },
  });

  return {
    text: response.text,
    context,
  };
}

export async function getDiaryAssistantSupport({ symptoms = [], mood = null, note = "" } = {}) {
  const context = await getAssistantContext();
  const todayOverride = buildTodayOverride({ symptoms, mood, note });

  const isPregnancy = Boolean(context.pregnancy_mode);
  const fertility = context.fertilityTracking || null;
  // In fertility mode a logged signal is content in itself — without this,
  // ticking only a test would produce an empty card. This must accept ANY log
  // the calendar can write, because the calendar triggers advice on any of
  // them; a narrower rule here would flash a loader and then show nothing.
  const hasFertilitySignals = Boolean(
    fertility &&
      (fertility.today?.lh_test ||
        fertility.today?.bbt_celsius != null ||
        fertility.today?.cervical_mucus ||
        fertility.today?.intercourse_logged ||
        fertility.today?.ovulation_symptoms?.length ||
        fertility.today?.supplements_taken?.length)
  );

  if (!todayOverride.todayEntry.exists && !hasFertilitySignals) {
    return {
      text: "",
      context: {
        ...context,
        ...todayOverride,
      },
    };
  }

  const fertilityPrompt = [
    "The user is tracking to conceive and has just updated today's fertility entry.",
    "Interpret what today's logged signals (LH test, basal temperature, cervical mucus) suggest about where she is in her fertile window.",
    "Be warm and encouraging, and acknowledge her note if there is one.",
    "Give one concrete, useful next step for today (for example testing again, timing intimacy, or measuring temperature tomorrow).",
    "A positive LH test means ovulation typically follows within 24-36 hours.",
    "Never promise conception, never diagnose, and hedge when the signals are unclear.",
    "Keep it concise for a mobile card.",
  ].join(" ");

  const prompt = isPregnancy
    ? [
        `The user is pregnant (week ${context.pregnancy_week || "?"}, trimester ${context.pregnancy_trimester || "?"}).`,
        "She has just saved today's pregnancy diary entry.",
        "Give a short, warm, evidence-based message tailored to her current symptoms and mood.",
        "Acknowledge how she feels today with compassion.",
        "Offer one practical tip relevant to her pregnancy week and today's symptoms.",
        "If she logged baby movement, respond with warmth about that milestone.",
        "Keep it concise and encouraging for a mobile card.",
      ].join(" ")
    : fertility
    ? fertilityPrompt
    : [
        "The user has just saved today's diary entry.",
        "Give a short, warm psychological support message tailored to today's mood, symptoms, and note.",
        "Start with emotional validation.",
        "Reflect today's state gently and naturally.",
        "If there is a note, briefly acknowledge what it suggests emotionally.",
        "Offer one or two small self-care or grounding suggestions for today.",
        "Do not diagnose and keep it concise for a mobile card.",
      ].join(" ");

  // Use a minimal context to keep the request payload small
  const sendContext = isPregnancy
    ? {
        user_name: context.user_name || null,
        pregnancy_week: context.pregnancy_week || null,
        pregnancy_trimester: context.pregnancy_trimester || null,
        days_remaining: context.days_remaining || null,
        symptoms: todayOverride.symptoms,
        mood: todayOverride.mood,
        note: todayOverride.todayEntry.note,
      }
    : {
        user_name: context.user_name || null,
        current_phase_label: context.current_phase_label || null,
        cycle_day: context.cycle_day || null,
        symptoms: todayOverride.symptoms,
        mood: todayOverride.mood,
        note: todayOverride.todayEntry.note,
        // Fertility advice is useless without the signals it is meant to read.
        ...(fertility
          ? {
              fertility_today: fertility.today,
              days_to_ovulation: fertility.days_to_ovulation,
              best_ovulation_estimate: fertility.best_ovulation_estimate,
              confirmed_ovulation: fertility.confirmed_ovulation,
              cycle_regularity: fertility.cycle_regularity,
            }
          : {}),
      };

  const response = await generateAiResponse({
    prompt,
    systemPrompt: isPregnancy ? PREGNANCY_SYSTEM_PROMPT : ASSISTANT_SYSTEM_PROMPT,
    context: sendContext,
    maxOutputTokens: 220,
    metadata: {
      feature: isPregnancy ? "calendar-diary-support-pregnancy" : "calendar-diary-support",
    },
  });

  return {
    text: response.text,
    context: {
      ...context,
      ...todayOverride,
    },
  };
}

export async function getHomeAssistantAdvice() {
  const context = await getAssistantContext();

  const prompt = context.pregnancy_mode
    ? [
        `The user is pregnant, currently at week ${context.pregnancy_week}, trimester ${context.pregnancy_trimester}.`,
        `There are ${context.days_remaining} days until the due date.`,
        "Create today's home-screen advice card focused on this week's pregnancy development.",
        "Mention what is happening with the baby this week in one warm sentence.",
        "Add one practical self-care tip for this stage of pregnancy.",
        "If today's diary is logged, acknowledge their current mood or symptoms warmly.",
        "Keep it concise, warm, and mobile-friendly — at most 2 short paragraphs.",
      ].join(" ")
    : [
        "Create today's home-screen advice card for the user.",
        "Use the current cycle phase, cycle day, primary goal, and today's mood or symptoms if they exist.",
        "If today's diary is not logged yet, gently encourage the user to log how they feel today.",
        "If today's diary exists, personalize the advice around their current emotional and physical state.",
        "Start warmly, keep it psychologically supportive, and include one practical suggestion for today.",
        "Keep the answer concise and mobile-friendly, with at most 2 short paragraphs.",
      ].join(" ");

  const response = await generateAiResponse({
    prompt,
    systemPrompt: context.pregnancy_mode ? PREGNANCY_SYSTEM_PROMPT : ASSISTANT_SYSTEM_PROMPT,
    context: { ...context, recentHistory: [] },
    maxOutputTokens: 220,
    metadata: {
      feature: context.pregnancy_mode ? "home-daily-advice-pregnancy" : "home-daily-advice",
    },
  });

  return { text: response.text, context };
}

export async function getPregnancyWeeklyAdvice() {
  const context = await getAssistantContext();

  const week = context.pregnancy_week || 1;
  const trimester = context.pregnancy_trimester || 1;
  const daysRemaining = context.days_remaining || 0;
  const trimesterLabel = trimester === 1 ? "I" : trimester === 2 ? "II" : "III";

  const prompt = `
The user is in week ${week} of pregnancy (Trimester ${trimesterLabel}), with ${daysRemaining} days until the due date.

Write a detailed, warm weekly pregnancy card in Georgian. Use EXACTLY this structure:

🍼 ნაყოფის განვითარება
Describe in detail what is happening with the baby specifically in week ${week}. Include: exact current size (compare to a fruit or object), which body parts are forming or growing this week (ears, eyes, fingers, brain, lungs, etc.), whether movements can be felt, what senses are developing. Write 4-5 detailed sentences. Be specific to week ${week}, not generic.

💗 ამ კვირის რჩევა
Give 4-5 sentences of practical advice specific to week ${week}: what physical symptoms are normal this week, what to eat or supplement, any important doctor visits or tests due around this week, and one warm emotional encouragement for the mother.

Write entirely in natural Georgian. Be warm, specific, and scientifically accurate.
`.trim();

  const response = await generateAiResponse({
    prompt,
    systemPrompt: PREGNANCY_SYSTEM_PROMPT,
    context: {
      user_name: context.user_name,
      pregnancy_week: week,
      pregnancy_trimester: trimester,
      trimester: trimesterLabel,
      days_remaining: daysRemaining,
      symptoms: [],
      mood: null,
    },
    maxOutputTokens: 700,
    metadata: { feature: "pregnancy-weekly-advice", week: String(week) },
  });

  return { text: response.text };
}

export async function getAssistantScreenSummary() {
  const context = await getAssistantContext();

  return {
    userName: context.user_name,
    goalLabel: context.user_goal_label || DEFAULT_GOAL_LABEL,
    phaseLabel: context.current_phase_label || "უცნობი ფაზა",
    cycleDay: context.cycle_day,
    mood: context.todayEntry?.mood || null,
    symptoms: context.todayEntry?.symptoms || [],
    note: context.todayEntry?.note || null,
    hasTodayEntry: Boolean(context.todayEntry?.exists),
    daysUntilNextPeriod: context.currentCycle?.days_until_next_period ?? null,
  };
}
