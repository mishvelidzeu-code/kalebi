import dayjs from "dayjs";

import { t } from "../services/i18n";

// The advice texts live in locales/*.dailyAdvice — three per phase and goal
// (a1..a3) plus four "special day" texts. The pool is picked by phase/goal and
// the entry by a stable per-day hash, exactly as before; only the strings moved.

const DEFAULT_GOAL = "ციკლის კონტროლი";

// Stored profile.goal values (Georgian) → dictionary goal keys.
const GOAL_MAP = {
  "ციკლის კონტროლი": "control",
  "დაორსულება": "pregnancy",
  "ჯანმრთელობის მონიტორინგი": "health",
};

const PHASE_KEYS = ["period", "follicular", "fertile", "luteal"];
const POOL_SIZE = 3;

const SPECIAL_ADVICE = [
  {
    matches: ({ phaseKey, cycleDay }) => phaseKey === "period" && cycleDay === 1,
    key: "dailyAdvice.special.firstDay",
  },
  {
    matches: ({ phaseKey, cycleDay, periodLength }) => phaseKey === "period" && cycleDay === periodLength,
    key: "dailyAdvice.special.lastDay",
  },
  {
    matches: ({ phaseKey, cycleDay, cycleLength }) => phaseKey === "fertile" && cycleDay === cycleLength - 14,
    key: "dailyAdvice.special.ovulation",
  },
  {
    matches: ({ phaseKey, cycleDay, cycleLength }) => phaseKey === "luteal" && cycleDay >= cycleLength - 3,
    key: "dailyAdvice.special.pms",
  },
];

function normalizeGoal(goal) {
  return GOAL_MAP[goal] || "control";
}

function hashString(value) {
  return Array.from(value).reduce((accumulator, character) => accumulator + character.charCodeAt(0), 0);
}

export function getDailyAdvice({ phaseKey, goal = DEFAULT_GOAL, cycleDay, cycleLength, periodLength, date = new Date() }) {
  const specialAdvice = SPECIAL_ADVICE.find((item) =>
    item.matches({
      phaseKey,
      cycleDay,
      cycleLength,
      periodLength,
    })
  );

  if (specialAdvice) {
    return t(specialAdvice.key);
  }

  const goalKey = normalizeGoal(goal);
  const poolPhase = PHASE_KEYS.includes(phaseKey) ? phaseKey : "luteal";
  const poolGoal = PHASE_KEYS.includes(phaseKey) ? goalKey : "control";
  const dateKey = dayjs(date).format("YYYY-MM-DD");
  const adviceIndex = hashString(`${dateKey}-${phaseKey}-${goalKey}-${cycleDay}`) % POOL_SIZE;

  return t(`dailyAdvice.phases.${poolPhase}.${poolGoal}.a${adviceIndex + 1}`);
}
