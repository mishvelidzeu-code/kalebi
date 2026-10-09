import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { TEMP_WEIGHT_MODE_ENABLED } from "../constants/tempFlags";
import { getSignedInUser, isOfflineQueryResult, retryWhenOnline } from "../services/networkRecovery";
import { supabase } from "../services/supabase";
import { setWeightModeFlag } from "../services/weightLogs";
import { useFertility } from "./FertilityContext";
import { usePregnancy } from "./PregnancyContext";
import { useTheme } from "./ThemeContext";

const WeightContext = createContext(null);

// Weight-loss mode, a Prime feature on top of cycle tracking. The profile only
// stores the user's choice (weight_mode); whether the mode is actually on is
// decided live here:
//   - Prime is required (a lapsed Prime pauses it, data stays),
//   - never while trying to conceive (the goal, paid or not) or pregnant,
//   - hidden for everyone but test accounts until TEMP_WEIGHT_MODE_ENABLED.
// Because the flag stays in the profile, the mode comes back by itself when
// the blocking mode is switched off or Prime is renewed.
export function WeightProvider({ children }) {
  const { isPremium, isTestAccount } = useTheme();
  const { pregnancyMode } = usePregnancy();
  const { fertilityGoal } = useFertility();

  const [weightModeChosen, setWeightModeChosen] = useState(false);
  const [loading, setLoading] = useState(true);
  // Whose data is in state — token refreshes must not clear it (see PregnancyContext).
  const loadedUserIdRef = useRef(null);

  const loadWeightData = useCallback(async () => {
    try {
      const { user, offline } = await getSignedInUser();
      if (offline) {
        retryWhenOnline("weight", loadWeightData);
        return;
      }

      if (!user) {
        loadedUserIdRef.current = null;
        setWeightModeChosen(false);
        return;
      }

      loadedUserIdRef.current = user.id;

      const result = await supabase.from("profiles").select("weight_mode").eq("id", user.id).maybeSingle();
      if (result.error && isOfflineQueryResult(result)) {
        retryWhenOnline("weight", loadWeightData);
        return;
      }
      // Any other error (e.g. the column is not there yet) fails closed: the
      // regular app keeps working exactly as before.
      setWeightModeChosen(Boolean(result.data?.weight_mode));
    } catch (error) {
      console.log("WeightContext load error:", error);
      setWeightModeChosen(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWeightData();
  }, [loadWeightData]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        loadWeightData();
      }
    });
    return () => subscription.remove();
  }, [loadWeightData]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id ?? null;
      if (nextUserId === loadedUserIdRef.current) {
        return;
      }

      loadedUserIdRef.current = nextUserId;
      setWeightModeChosen(false);

      if (nextUserId) {
        loadWeightData();
      }
    });

    return () => subscription?.unsubscribe?.();
  }, [loadWeightData]);

  const disableWeightMode = useCallback(async () => {
    const result = await setWeightModeFlag(false);
    if (result.ok) {
      setWeightModeChosen(false);
    }
    return result;
  }, []);

  const featureVisible = TEMP_WEIGHT_MODE_ENABLED || Boolean(isTestAccount);
  const blockedBy = pregnancyMode ? "pregnancy" : fertilityGoal ? "fertility" : null;
  const weightMode = featureVisible && weightModeChosen && Boolean(isPremium) && !blockedBy;

  return (
    <WeightContext.Provider value={{
      weightMode,
      weightModeChosen,
      featureVisible,
      blockedBy,
      loading,
      reload: loadWeightData,
      disableWeightMode,
    }}>
      {children}
    </WeightContext.Provider>
  );
}

export function useWeight() {
  const ctx = useContext(WeightContext);
  if (!ctx) throw new Error("useWeight must be used inside WeightProvider");
  return ctx;
}
