import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { supabase } from "../services/supabase";
import { isAdminEmail, isTestAccountEmail } from "../services/adminAccess";
import { getSignedInUser, isOfflineQueryResult, retryWhenOnline } from "../services/networkRecovery";
import { resolvePregnancyAccessFromProfile } from "../services/purchases";
import { usePregnancy } from "./PregnancyContext";

const FertilityContext = createContext(null);

const FERTILITY_GOAL = "დაორსულება";

// "მინდა დაორსულება" mode. Shares the pregnancy entitlement (one subscription
// unlocks both). Fertility mode is active when the user picked the fertility
// goal AND has access, but NOT while pregnancy mode is on (she's already
// pregnant — pregnancy mode wins).
export function FertilityProvider({ children }) {
  const [fertilityMode, setFertilityMode] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  // The goal alone, paid or not — weight-loss mode stays off for anyone
  // trying to conceive.
  const [fertilityGoal, setFertilityGoal] = useState(false);
  const [loading, setLoading] = useState(true);
  // Whose data is currently in state — see PregnancyContext for why this is
  // compared instead of clearing on every auth event.
  const loadedUserIdRef = useRef(null);
  const { pregnancyMode, syncVersion } = usePregnancy();

  const loadFertilityData = useCallback(async () => {
    try {
      const { user, offline } = await getSignedInUser();
      if (offline) {
        // No internet is not a sign-out: keep what is on screen and load again
        // once the server is reachable.
        retryWhenOnline("fertility", loadFertilityData);
        return;
      }

      if (!user) {
        loadedUserIdRef.current = null;
        setFertilityMode(false);
        setHasAccess(false);
        setFertilityGoal(false);
        return;
      }

      loadedUserIdRef.current = user.id;

      const profileResult = await supabase
        .from("profiles")
        .select("goal, pregnancy_mode, has_pregnancy_subscription, pregnancy_until")
        .eq("id", user.id)
        .single();
      const { data } = profileResult;

      if (!data && isOfflineQueryResult(profileResult)) {
        retryWhenOnline("fertility", loadFertilityData);
        return;
      }

      if (data) {
        const paidAccess = resolvePregnancyAccessFromProfile(data);
        const access = isAdminEmail(user.email) || isTestAccountEmail(user.email) || paidAccess;
        const isPregnant = Boolean(data.pregnancy_mode);
        const wantsFertility = data.goal === FERTILITY_GOAL;

        setHasAccess(access);
        setFertilityGoal(wantsFertility);
        setFertilityMode(wantsFertility && access && !isPregnant);
      }
    } catch (error) {
      console.log("FertilityContext load error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFertilityData();
  }, [loadFertilityData]);

  // PregnancyContext asks the store (iOS) before it reads the profile, so its
  // load finishes after the latest expiry has been written. Reading again at
  // that point keeps a renewing subscriber in fertility mode — the first read
  // above can still see the previous period's expiry on renewal day.
  useEffect(() => {
    if (syncVersion > 0) {
      loadFertilityData();
    }
  }, [syncVersion, loadFertilityData]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        loadFertilityData();
      }
    });
    return () => subscription.remove();
  }, [loadFertilityData]);

  // Sign-out and account switches must not leave the previous user's fertility
  // state on screen; token refreshes are ignored by comparing the user id.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id ?? null;
      if (nextUserId === loadedUserIdRef.current) {
        return;
      }

      loadedUserIdRef.current = nextUserId;
      setFertilityMode(false);
      setHasAccess(false);
      setFertilityGoal(false);

      if (nextUserId) {
        loadFertilityData();
      }
    });

    return () => subscription?.unsubscribe?.();
  }, [loadFertilityData]);

  // Pregnancy wins the moment it is switched on (pregnancyMode is read at the
  // top). The flag above is only recomputed on load, and several screens turn
  // pregnancy on without reloading this context (profile, the pregnancy
  // paywall), which used to leave fertility styling on screen until the app
  // went to the background.
  return (
    <FertilityContext.Provider value={{
      fertilityMode: fertilityMode && !pregnancyMode,
      fertilityGoal,
      hasAccess,
      loading,
      reload: loadFertilityData,
    }}>
      {children}
    </FertilityContext.Provider>
  );
}

export function useFertility() {
  const ctx = useContext(FertilityContext);
  if (!ctx) throw new Error("useFertility must be used inside FertilityProvider");
  return ctx;
}
