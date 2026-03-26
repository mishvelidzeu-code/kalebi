import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { supabase } from "./supabase";

const NOTIFICATIONS_ENABLED_KEY = "@cycle-care/notifications-enabled";
const DEFAULT_NOTIFICATION_HOUR = 10;
const CYCLES_TO_SCHEDULE = 6;

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
  await AsyncStorage.setItem(NOTIFICATIONS_ENABLED_KEY, enabled ? "true" : "false");
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
  return scheduleLocalNotification("მენსტრუაცია 🌸", "მენსტრუაცია სავარაუდოდ 2 დღეში დაიწყება", triggerDate);
}

export async function scheduleOvulationNotification(ovulationDate) {
  const triggerDate = addDays(parseCycleDate(ovulationDate), -1);
  return scheduleLocalNotification("ოვულაცია 💕", "ხვალ ოვულაციის სავარაუდო დღეა", triggerDate);
}

export async function scheduleFertileNotification(fertileStartDate) {
  const triggerDate = parseCycleDate(fertileStartDate);
  return scheduleLocalNotification("ნაყოფიერი დღეები 🌱", "დღეს იწყება ნაყოფიერი პერიოდი", triggerDate);
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

    return scheduledIds.filter(Boolean);
  } catch (error) {
    console.log("Schedule reminders error:", error);
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

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const [latestCycleResponse, profileResponse] = await Promise.all([
      supabase.from("cycles").select("start_date, cycle_length").eq("user_id", user.id).order("start_date", { ascending: false }).limit(1),
      supabase.from("profiles").select("last_period, cycle_length").eq("id", user.id).maybeSingle(),
    ]);

    const latestCycle = latestCycleResponse.data?.[0];
    const profile = profileResponse.data;

    const lastPeriodDate = latestCycle?.start_date || profile?.last_period;
    const cycleLength = Number(latestCycle?.cycle_length || profile?.cycle_length || 28);

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
