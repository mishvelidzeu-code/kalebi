import AsyncStorage from "@react-native-async-storage/async-storage";
import dayjs from "dayjs";

// Client-side mirror of the server's daily chat counter. The server is the
// real gate (ai-assistant edge function); this copy lets the chat screen show
// "N left today" without asking it. Shared because the chat is not the only
// thing that spends chat questions — weight mode's daily menu does too.

export const FREE_DAILY_QUESTION_LIMIT = 1;
export const PRIME_DAILY_QUESTION_LIMIT = 20;
// The shared "pregnancy" subscription — pregnancy mode and fertility mode alike.
export const PREGNANCY_DAILY_QUESTION_LIMIT = 10;

const DAILY_LIMIT_STORAGE_KEY_PREFIX = "@cycle-care/assistant-daily-limit";

function getAssistantDailyLimitStorageKey(userId) {
  return `${DAILY_LIMIT_STORAGE_KEY_PREFIX}/${userId}`;
}

export async function getAssistantDailyUsage(userId) {
  try {
    if (!userId) return 0;

    const rawValue = await AsyncStorage.getItem(
      getAssistantDailyLimitStorageKey(userId)
    );
    const todayKey = dayjs().format("YYYY-MM-DD");

    if (!rawValue) return 0;

    const parsedValue = JSON.parse(rawValue);
    if (parsedValue?.date !== todayKey) return 0;

    return Math.max(0, Number(parsedValue?.count || 0));
  } catch (error) {
    console.log("Assistant daily usage read error:", error);
    return 0;
  }
}

export async function setAssistantDailyUsage(userId, count) {
  try {
    if (!userId) return;

    await AsyncStorage.setItem(
      getAssistantDailyLimitStorageKey(userId),
      JSON.stringify({
        date: dayjs().format("YYYY-MM-DD"),
        count,
      })
    );
  } catch (error) {
    console.log("Assistant daily usage save error:", error);
  }
}

export async function addAssistantDailyUsage(userId, amount = 1) {
  const next = (await getAssistantDailyUsage(userId)) + amount;
  await setAssistantDailyUsage(userId, next);
  return next;
}

// The edge function's error once the day's chat budget is spent.
export function isAssistantDailyLimitError(error) {
  return String(error?.message || "").includes("assistant-daily-limit");
}
