import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// Android notification channel
export async function setupNotificationChannel() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
    });
  }
}

// პერიოდის დაწყებამდე 2 დღით ადრე
export async function schedulePeriodNotification(date) {
  try {
    const triggerDate = new Date(date);
    triggerDate.setDate(triggerDate.getDate() - 2);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "მენსტრუაცია 🌸",
        body: "მენსტრუაცია სავარაუდოდ 2 დღეში დაიწყება",
      },
      trigger: triggerDate,
    });
  } catch (error) {
    console.log("Period notification error:", error);
  }
}

// ოვულაციის შეხსენება
export async function scheduleOvulationNotification(date) {
  try {
    const triggerDate = new Date(date);
    triggerDate.setDate(triggerDate.getDate() - 1);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "ოვულაცია 💕",
        body: "ხვალ ოვულაციის სავარაუდო დღეა",
      },
      trigger: triggerDate,
    });
  } catch (error) {
    console.log("Ovulation notification error:", error);
  }
}

// ნაყოფიერი დღეების შეტყობინება
export async function scheduleFertileNotification(date) {
  try {
    const triggerDate = new Date(date);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "ნაყოფიერი დღეები 🌱",
        body: "დღეს იწყება ნაყოფიერი პერიოდი",
      },
      trigger: triggerDate,
    });
  } catch (error) {
    console.log("Fertile notification error:", error);
  }
}

// ციკლის თარიღების გამოთვლა
export function calculateCycleDates(lastPeriodDate, cycleLength) {

  const startDate = new Date(lastPeriodDate);

  const nextPeriod = new Date(startDate);
  nextPeriod.setDate(startDate.getDate() + cycleLength);

  const ovulation = new Date(startDate);
  ovulation.setDate(startDate.getDate() + Math.floor(cycleLength / 2));

  const fertileStart = new Date(ovulation);
  fertileStart.setDate(ovulation.getDate() - 2);

  const fertileEnd = new Date(ovulation);
  fertileEnd.setDate(ovulation.getDate() + 2);

  return {
    nextPeriod,
    ovulation,
    fertileStart,
    fertileEnd
  };
}

// ყველა reminder-ის დაგეგმვა
export async function scheduleCycleReminders(lastPeriodDate, cycleLength) {
  try {

    // ძველი reminder-ების წაშლა
    await Notifications.cancelAllScheduledNotificationsAsync();

    // Android channel
    await setupNotificationChannel();

    const {
      nextPeriod,
      ovulation,
      fertileStart
    } = calculateCycleDates(lastPeriodDate, cycleLength);

    await schedulePeriodNotification(nextPeriod);
    await scheduleOvulationNotification(ovulation);
    await scheduleFertileNotification(fertileStart);

  } catch (error) {
    console.log("Schedule reminders error:", error);
  }
}