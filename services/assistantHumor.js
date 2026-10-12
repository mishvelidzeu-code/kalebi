import AsyncStorage from "@react-native-async-storage/async-storage";

// Chat humor dial (paid users only). Kept on the device per account: it is a
// tone preference, and "low" — the default — is exactly the classic chat tone.
export const HUMOR_LEVELS = ["low", "medium", "high"];
export const DEFAULT_HUMOR_LEVEL = "low";

const HUMOR_STORAGE_KEY_PREFIX = "cycle_app_assistant_humor";

export function normalizeHumorLevel(level) {
  return HUMOR_LEVELS.includes(level) ? level : DEFAULT_HUMOR_LEVEL;
}

export async function getAssistantHumorLevel(userId) {
  try {
    if (!userId) return DEFAULT_HUMOR_LEVEL;
    return normalizeHumorLevel(await AsyncStorage.getItem(`${HUMOR_STORAGE_KEY_PREFIX}/${userId}`));
  } catch (error) {
    console.log("Assistant humor read error:", error);
    return DEFAULT_HUMOR_LEVEL;
  }
}

export async function setAssistantHumorLevel(userId, level) {
  try {
    if (!userId) return;
    await AsyncStorage.setItem(`${HUMOR_STORAGE_KEY_PREFIX}/${userId}`, normalizeHumorLevel(level));
  } catch (error) {
    console.log("Assistant humor write error:", error);
  }
}
