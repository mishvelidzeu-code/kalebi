import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

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

const PREGNANCY_WEEK_SIZES = {
  5: ["სეზამის მარცვლის", "🌱"],
  6: ["ოსპის", "🫘"],
  7: ["მოცვის", "🫐"],
  8: ["ჟოლოს", "🍓"],
  9: ["ყურძნის მარცვლის", "🍇"],
  10: ["ქლიავის", "🍑"],
  11: ["ლეღვის", "🍋"],
  12: ["ლიმონის", "🍋"],
  13: ["ატმის", "🍑"],
  14: ["ვაშლის", "🍎"],
  15: ["ფორთოხლის", "🍊"],
  16: ["ავოკადოს", "🥑"],
  17: ["მსხლის", "🍐"],
  18: ["ბოლოკის", "🥕"],
  19: ["მანგოს", "🥭"],
  20: ["ბანანის", "🍌"],
  21: ["სტაფილოს", "🥕"],
  22: ["ქოქოსის", "🥥"],
  23: ["გრეიფრუტის", "🍈"],
  24: ["სიმინდის ტაროს", "🌽"],
  25: ["ყვავილოვანი კომბოსტოს", "🥦"],
  26: ["სალათის კოჭის", "🥬"],
  27: ["კომბოსტოს", "🥬"],
  28: ["ბადრიჯნის", "🍆"],
  29: ["კიტრის", "🥒"],
  30: ["გოგრის ნაჭრის", "🎃"],
  31: ["ქოქოსის", "🥥"],
  32: ["ანანასის", "🍍"],
  33: ["ნესვის", "🍈"],
  34: ["პაპაიას", "🍈"],
  35: ["ბოსტნეულის", "🥦"],
  36: ["სალათის", "🥬"],
  37: ["ნესვის", "🍈"],
  38: ["ნერგის", "🌿"],
  39: ["გოგრის", "🎃"],
  40: ["სასიხარულო", "👶"],
};

const PREGNANCY_MILESTONE_MESSAGES = {
  12: "I ტრიმესტრი დასრულდა! 🎉 ყველაზე კრიტიკული ეტაპი წარმატებით გადალახე!",
  20: "ნახევარი გზა გავლილია! 🌟 ბავშვი ახლა სრულად ჩამოყალიბებულია",
  28: "III ტრიმესტრი დაიწყო! 💪 ფინიშამდე ცოტა დარჩა!",
  36: "ბავშვი სრულად მზადაა დასაბადებლად! ✨ მომზადება დაიწყე",
  40: "სავარაუდო მშობიარობის კვირა! 👶 მალე გნახავ, ჩვილო!",
};

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
    "მენსტრუაცია 🌸",
    "მენსტრუაცია სავარაუდოდ 2 დღეში დაიწყება",
    triggerDate
  );
}

export async function scheduleOvulationNotification(ovulationDate) {
  const triggerDate = addDays(parseCycleDate(ovulationDate), -1);
  return scheduleLocalNotification(
    "ოვულაცია 💕",
    "ხვალ ოვულაციის სავარაუდო დღეა",
    triggerDate
  );
}

export async function scheduleFertileNotification(fertileStartDate) {
  const triggerDate = parseCycleDate(fertileStartDate);
  return scheduleLocalNotification(
    "ნაყოფიერი დღეები 🌱",
    "დღეს იწყება ნაყოფიერი პერიოდი",
    triggerDate
  );
}

export async function scheduleWellnessCheckinNotification(checkinDate) {
  const triggerDate = parseCycleDate(checkinDate);
  return scheduleLocalNotification(
    "როგორ გრძნობ თავს დღეს? 💗",
    "შეავსე დღიური და ჩაინიშნე შენი განწყობა და სიმპტომები.",
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

      const milestoneMsg = PREGNANCY_MILESTONE_MESSAGES[week];
      const sizeData = PREGNANCY_WEEK_SIZES[week];

      let body;
      if (milestoneMsg) {
        body = milestoneMsg;
      } else if (sizeData) {
        body = `ნაყოფი ახლა ${sizeData[0]} ზომისაა ${sizeData[1]}`;
      } else {
        body = `${week}-ე კვირა დაიწყო! 🤰`;
      }

      const id = await scheduleLocalNotification(
        `კვირა ${week} 🤰`,
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
        "ექიმის ვიზიტი 🏥",
        `კვირა ${week} ახლოვდება — ექიმის ვიზიტი დაჯავშნე`,
        reminderDate
      );
      if (id) scheduledIds.push(id);
    }

    // Diary reminders every 2 days
    let diaryDate = addDays(today, 1);
    diaryDate.setHours(9, 0, 0, 0);
    for (let i = 0; i < DIARY_REMINDERS_TO_SCHEDULE; i++) {
      const id = await scheduleLocalNotification(
        "ორსულობის დღიური 📔",
        "დაფიქსირე დღევანდელი სიმპტომები და განწყობა",
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
        .select("last_period, cycle_length, pregnancy_mode")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    const latestCycle = latestCycleResponse.data?.[0];
    const profile = profileResponse.data;

    // Pregnancy mode: schedule pregnancy-specific notifications
    if (profile?.pregnancy_mode && profile?.last_period) {
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

    return scheduleCycleReminders(lastPeriodDate, cycleLength);
  } catch (error) {
    console.log("Sync reminders error:", error);
    return [];
  }
}
