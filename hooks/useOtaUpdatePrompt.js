import * as Updates from "expo-updates";
import { useEffect, useRef } from "react";
import { Alert, AppState } from "react-native";

import { useLanguage } from "../context/LanguageContext";

// Offers a one-tap restart as soon as an OTA update has been downloaded,
// instead of waiting for the user to close and reopen the app twice.
//
// expo-updates already downloads new updates in the background on launch
// (checkAutomatically defaults to ON_LOAD); this hook additionally checks when
// the app returns to the foreground, and watches `isUpdatePending` so the
// prompt also appears for the automatic download. Each downloaded update is
// offered once per session; "later" simply leaves it to apply on the next
// cold start, as before.
export function useOtaUpdatePrompt() {
  const { t } = useLanguage();
  const { isUpdatePending, downloadedUpdate } = Updates.useUpdates();
  const promptedRef = useRef(null);

  useEffect(() => {
    // Dev client / Expo Go have no OTA channel — nothing to check.
    if (__DEV__ || !Updates.isEnabled) return undefined;

    const check = async () => {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) await Updates.fetchUpdateAsync();
      } catch (error) {
        // Offline or a transient server error — try again on the next foreground.
        console.log("OTA check skipped:", error?.message || error);
      }
    };

    check();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!isUpdatePending) return;
    const id = downloadedUpdate?.updateId || "pending";
    if (promptedRef.current === id) return;
    promptedRef.current = id;

    Alert.alert(t("update.title"), t("update.body"), [
      { text: t("update.later"), style: "cancel" },
      {
        text: t("update.now"),
        onPress: () => {
          Updates.reloadAsync().catch((error) => console.log("OTA reload failed:", error));
        },
      },
    ]);
  }, [isUpdatePending, downloadedUpdate, t]);
}
