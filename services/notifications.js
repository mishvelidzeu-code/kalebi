import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { isAdminEmail, isTestAccountEmail } from "./adminAccess";
import { t } from "./i18n";
import { resolvePregnancyAccessFromProfile } from "./purchases";
import { supabase } from "./supabase";

const NOTIFICATIONS_ENABLED_KEY = "@cycle-care/notifications-enabled";
const DEFAULT_NOTIFICATION_HOUR = 10;
const CYCLES_TO_SCHEDULE = 6;
const WELLNESS_CHECKIN_INTERVAL_DAYS = 4;
const WELLNESS_CHECKINS_TO_SCHEDULE = 12;
const DIARY_REMINDER_INTERVAL_DAYS = 3;
const DIARY_REMINDERS_TO_SCHEDULE = 12;

function getExpoProjectId() {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId ||
    null
  );
}

export async function registerPushTokenForCurrentUser() {
  try {
    if (!Device.isDevice) return null;

    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return null;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const projectId = getExpoProjectId();
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const expoPushToken = tokenResponse.data;

    if (!expoPushToken) return null;

    const { error } = await supabase.from("push_tokens").upsert(
      {
        user_id: user.id,
        expo_push_token: expoPushToken,
        platform: Platform.OS,
      },
      { onConflict: "expo_push_token" }
    );

    if (error) throw error;
    return expoPushToken;
  } catch (error) {
    console.log("Push token registration error:", error);
    return null;
  }
}

// Texts live in locales/*.notifications — sizes.w5..w40 (genitive/accusative
// as the sentence needs), milestones.w12/20/28/36/40. Only the emoji stays here.
const PREGNANCY_WEEK_EMOJI = {
  5: "🌱", 6: "🫘", 7: "🫐", 8: "🍓", 9: "🍇", 10: "🍑", 11: "🍋", 12: "🍋", 13: "🍑", 14: "🍎", 15: "🍊", 16: "🥑", 17: "🍐", 18: "🥕",
  19: "🥭", 20: "🍌", 21: "🥕", 22: "🥥", 23: "🍈", 24: "🌽", 25: "🥦", 26: "🥬", 27: "🥬", 28: "🍆", 29: "🥒", 30: "🎃", 31: "🥥", 32: "🍍",
  33: "🍈", 34: "🍈", 35: "🥦", 36: "🥬", 37: "🍈", 38: "🌿", 39: "🎃", 40: "👶",
};
const PREGNANCY_MILESTONE_WEEKS = [12, 20, 28, 36, 40];

const DOCTOR_VISIT_WEEKS = [8, 12, 16, 20, 24, 28, 32, 36, 38, 40];

function parseCycleDate(dateValue) {
  if (!dateValue) return null;

  if (dateValue instanceof Date) {
    const parsedDate = new Date(dateValue);
    parsedDate.setHours(DEFAULT_NOTIFICATION_HOUR, 0, 0, 0);
    return parsedDate;
  }

  const rawDate = String(dateValue).split("T")[0];
  const [year, month, day] = rawDate.split("-").map(Number);
  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day, DEFAULT_NOTIFICATION_HOUR, 0, 0, 0);
}

function addDays(dateValue, days) {
  const nextDate = new Date(dateValue);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function isFutureTrigger(triggerDate) {
  return triggerDate instanceof Date && triggerDate.getTime() > Date.now();
}

function getAlignedCycleStart(lastPeriodDate, cycleLength) {
  let cycleStart = parseCycleDate(lastPeriodDate);
  if (!cycleStart) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let safetyCounter = 0;
  while (addDays(cycleStart, cycleLength) <= today && safetyCounter < 60) {
    cycleStart = addDays(cycleStart, cycleLength);
    cycleStart.setHours(DEFAULT_NOTIFICATION_HOUR, 0, 0, 0);
    safetyCounter += 1;
  }

  return cycleStart;
}

async function scheduleLocalNotification(title, body, triggerDate) {
  if (!isFutureTrigger(triggerDate)) return null;

  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: "default",
    },
    trigger: triggerDate,
  });
}

export async function setupNotificationChannel() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
}

export async function getNotificationsEnabled() {
  try {
    const storedValue = await AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
    if (storedValue === null) {
      const { status } = await Notifications.getPermissionsAsync();
      return status === "granted";
    }

    return storedValue === "true";
  } catch (error) {
    console.log("Notification preference read error:", error);
    return false;
  }
}

export async function setNotificationsEnabled(enabled) {
  await AsyncStorage.setItem(
    NOTIFICATIONS_ENABLED_KEY,
    enabled ? "true" : "false"
  );
}

export async function disableCycleReminders() {
  await setNotificationsEnabled(false);
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export function calculateCycleDates(cycleStartDate, cycleLength) {
  const startDate = parseCycleDate(cycleStartDate);
  if (!startDate) return null;

  const nextPeriod = addDays(startDate, cycleLength);
  const ovulation = addDays(startDate, cycleLength - 14);
  const fertileStart = addDays(ovulation, -5);
  const fertileEnd = addDays(ovulation, 1);

  return {
    startDate,
    nextPeriod,
    ovulation,
    fertileStart,
    fertileEnd,
  };
}

export async function schedulePeriodNotification(nextPeriodDate) {
  const triggerDate = addDays(parseCycleDate(nextPeriodDate), -2);
  return scheduleLocalNotification(
    t("notifications.periodTitle"),
    t("notifications.periodBody"),
    triggerDate
  );
}

export async function scheduleOvulationNotification(ovulationDate) {
  const triggerDate = addDays(parseCycleDate(ovulationDate), -1);
  return scheduleLocalNotification(
    t("notifications.ovulationTitle"),
    t("notifications.ovulationBody"),
    triggerDate
  );
}

export async function scheduleFertileNotification(fertileStartDate) {
  const triggerDate = parseCycleDate(fertileStartDate);
  return scheduleLocalNotification(
    t("notifications.fertileTitle"),
    t("notifications.fertileBody"),
    triggerDate
  );
}

export async function scheduleWellnessCheckinNotification(checkinDate) {
  const triggerDate = parseCycleDate(checkinDate);
  return scheduleLocalNotification(
    t("notifications.checkinTitle"),
    t("notifications.checkinBody"),
    triggerDate
  );
}

async function scheduleWellnessCheckins() {
  const scheduledIds = [];
  let nextCheckinDate = new Date();
  nextCheckinDate.setHours(DEFAULT_NOTIFICATION_HOUR, 0, 0, 0);

  if (nextCheckinDate.getTime() <= Date.now()) {
    nextCheckinDate = addDays(nextCheckinDate, 1);
  }

  for (let i = 0; i < WELLNESS_CHECKINS_TO_SCHEDULE; i += 1) {
    const notificationId =
      await scheduleWellnessCheckinNotification(nextCheckinDate);
    if (notificationId) {
      scheduledIds.push(notificationId);
    }

    nextCheckinDate = addDays(
      nextCheckinDate,
      WELLNESS_CHECKIN_INTERVAL_DAYS
    );
  }

  return scheduledIds;
}

// -- Fertility ("მინდა დაორსულება") reminders ----------------------
// iOS only keeps 64 pending local notifications, so the daily nudges use
// repeating triggers (1 slot each) and the dated ones cover 2 cycles.
const FERTILITY_CYCLES_TO_SCHEDULE = 2;

// Resolved at schedule time so the text follows the current language.
const getFertilityDailyReminders = () => [
  { hour: 7, minute: 0, title: t("notifications.bbtTitle"), body: t("notifications.bbtBody") },
  { hour: 10, minute: 0, title: t("notifications.vitaminsTitle"), body: t("notifications.vitaminsBody") },
  { hour: 15, minute: 0, title: t("notifications.waterTitle"), body: t("notifications.waterBody") },
];

async function scheduleDailyRepeatingNotification({ hour, minute, title, body }) {
  return Notifications.scheduleNotificationAsync({
    content: { title, body, sound: "default" },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

export async function scheduleFertilityReminders(lastPeriodDate, cycleLength) {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await setupNotificationChannel();

    const alignedCycleStart = getAlignedCycleStart(lastPeriodDate, cycleLength);
    if (!alignedCycleStart) return [];

    const scheduledIds = [];

    for (const reminder of getFertilityDailyReminders()) {
      const id = await scheduleDailyRepeatingNotification(reminder);
      if (id) scheduledIds.push(id);
    }

    let cycleStart = new Date(alignedCycleStart);

    for (let i = 0; i < FERTILITY_CYCLES_TO_SCHEDULE; i += 1) {
      const cycleDates = calculateCycleDates(cycleStart, cycleLength);
      if (!cycleDates) break;

      const ovulation = parseCycleDate(cycleDates.ovulation);

      // LH testing ramp-up: the 3 days before ovulation.
      for (let offset = -4; offset <= -2; offset += 1) {
        const id = await scheduleLocalNotification(
          t("notifications.lhTitle"),
          t("notifications.lhBody"),
          addDays(ovulation, offset)
        );
        if (id) scheduledIds.push(id);
      }

      // Peak days: the day before ovulation and ovulation itself.
      for (let offset = -1; offset <= 0; offset += 1) {
        const id = await scheduleLocalNotification(
          t("notifications.peakTitle"),
          t("notifications.peakBody"),
          addDays(ovulation, offset)
        );
        if (id) scheduledIds.push(id);
      }

      const [fertileId, periodId] = await Promise.all([
        scheduleFertileNotification(cycleDates.fertileStart),
        schedulePeriodNotification(cycleDates.nextPeriod),
      ]);
      scheduledIds.push(fertileId, periodId);

      cycleStart = cycleDates.nextPeriod;
    }

    return scheduledIds.filter(Boolean);
  } catch (error) {
    console.log("Schedule fertility reminders error:", error);
    return [];
  }
}

export async function scheduleCycleReminders(lastPeriodDate, cycleLength) {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await setupNotificationChannel();

    const alignedCycleStart = getAlignedCycleStart(lastPeriodDate, cycleLength);
    if (!alignedCycleStart) return [];

    const scheduledIds = [];
    let cycleStart = new Date(alignedCycleStart);

    for (let i = 0; i < CYCLES_TO_SCHEDULE; i += 1) {
      const cycleDates = calculateCycleDates(cycleStart, cycleLength);
      if (!cycleDates) break;

      const [periodId, ovulationId, fertileId] = await Promise.all([
        schedulePeriodNotification(cycleDates.nextPeriod),
        scheduleOvulationNotification(cycleDates.ovulation),
        scheduleFertileNotification(cycleDates.fertileStart),
      ]);

      scheduledIds.push(periodId, ovulationId, fertileId);
      cycleStart = cycleDates.nextPeriod;
    }

    const wellnessIds = await scheduleWellnessCheckins();
    scheduledIds.push(...wellnessIds);

    return scheduledIds.filter(Boolean);
  } catch (error) {
    console.log("Schedule reminders error:", error);
    return [];
  }
}

export async function schedulePregnancyNotifications(lmpDate) {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await setupNotificationChannel();

    const lmp = parseCycleDate(lmpDate);
    if (!lmp) return [];

    const scheduledIds = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const daysPregnant = Math.floor((today - lmp) / (1000 * 60 * 60 * 24));
    const currentWeek = Math.max(1, Math.floor(daysPregnant / 7) + 1);

    // Weekly milestone notifications (current week+1 → 40)
    for (let week = currentWeek + 1; week <= 40; week++) {
      const weekStartDate = addDays(lmp, (week - 1) * 7);
      weekStartDate.setHours(DEFAULT_NOTIFICATION_HOUR, 0, 0, 0);
      if (!isFutureTrigger(weekStartDate)) continue;

      const sizeEmoji = PREGNANCY_WEEK_EMOJI[week];

      let body;
      if (PREGNANCY_MILESTONE_WEEKS.includes(week)) {
        body = t(`notifications.milestones.w${week}`);
      } else if (sizeEmoji) {
        body = t("notifications.weekSize", { size: t(`notifications.sizes.w${week}`), emoji: sizeEmoji });
      } else {
        body = t("notifications.weekStarted", { week });
      }

      const id = await scheduleLocalNotification(
        t("notifications.weekTitle", { week }),
        body,
        weekStartDate
      );
      if (id) scheduledIds.push(id);
    }

    // Doctor visit reminders (3 days before week starts)
    for (const week of DOCTOR_VISIT_WEEKS) {
      if (week <= currentWeek) continue;
      const weekStartDate = addDays(lmp, (week - 1) * 7);
      const reminderDate = addDays(weekStartDate, -3);
      reminderDate.setHours(DEFAULT_NOTIFICATION_HOUR, 0, 0, 0);
      if (!isFutureTrigger(reminderDate)) continue;

      const id = await scheduleLocalNotification(
        t("notifications.doctorTitle"),
        t("notifications.doctorBody", { week }),
        reminderDate
      );
      if (id) scheduledIds.push(id);
    }

    // Diary reminders every 2 days
    let diaryDate = addDays(today, 1);
    diaryDate.setHours(9, 0, 0, 0);
    for (let i = 0; i < DIARY_REMINDERS_TO_SCHEDULE; i++) {
      const id = await scheduleLocalNotification(
        t("notifications.diaryTitle"),
        t("notifications.diaryBody"),
        new Date(diaryDate)
      );
      if (id) scheduledIds.push(id);
      diaryDate = addDays(diaryDate, DIARY_REMINDER_INTERVAL_DAYS);
    }

    return scheduledIds.filter(Boolean);
  } catch (error) {
    console.log("Schedule pregnancy notifications error:", error);
    return [];
  }
}

export async function syncCycleRemindersForUser() {
  try {
    const notificationsEnabled = await getNotificationsEnabled();
    if (!notificationsEnabled) {
      await Notifications.cancelAllScheduledNotificationsAsync();
      return [];
    }

    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return [];

    await registerPushTokenForCurrentUser();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const [latestCycleResponse, profileResponse] = await Promise.all([
      supabase
        .from("cycles")
        .select("start_date, cycle_length")
        .eq("user_id", user.id)
        .order("start_date", { ascending: false })
        .limit(1),
      supabase
        .from("profiles")
        .select("last_period, cycle_length, pregnancy_mode, goal, has_pregnancy_subscription, pregnancy_until")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    const latestCycle = latestCycleResponse.data?.[0];
    const profile = profileResponse.data;

    // One access rule for the shared "pregnancy" entitlement, matching
    // PregnancyContext and FertilityContext: admin/test account or a live
    // subscription. A lapsed one falls back to plain cycle reminders.
    const pregnancyAccess =
      isAdminEmail(user.email)
      || isTestAccountEmail(user.email)
      || resolvePregnancyAccessFromProfile(profile);

    // Pregnancy mode: schedule pregnancy-specific notifications
    if (profile?.pregnancy_mode && pregnancyAccess && profile?.last_period) {
      return schedulePregnancyNotifications(profile.last_period);
    }

    const lastPeriodDate = latestCycle?.start_date || profile?.last_period;
    const cycleLength = Number(
      latestCycle?.cycle_length || profile?.cycle_length || 28
    );

    if (!lastPeriodDate) {
      await Notifications.cancelAllScheduledNotificationsAsync();
      return [];
    }

    // Fertility mode swaps in conception-focused nudges.
    if (profile?.goal === "დაორსულება" && pregnancyAccess) {
      return scheduleFertilityReminders(lastPeriodDate, cycleLength);
    }

    return scheduleCycleReminders(lastPeriodDate, cycleLength);
  } catch (error) {
    console.log("Sync reminders error:", error);
    return [];
  }
}
