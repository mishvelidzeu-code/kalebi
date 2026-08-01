import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { supabase } from "../services/supabase";
import { isAdminEmail, isTestAccountEmail } from "../services/adminAccess";
import { resolvePregnancyAccessFromProfile } from "../services/purchases";

const FertilityContext = createContext(null);

const FERTILITY_GOAL = "დაორსულება";

// "მინდა დაორსულება" mode. Shares the pregnancy entitlement (one subscription
// unlocks both). Fertility mode is active when the user picked the fertility
// goal AND has access, but NOT while pregnancy mode is on (she's already
// pregnant — pregnancy mode wins).
export function FertilityProvider({ children }) {
  const [fertilityMode, setFertilityMode] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [loading, setLoading] = useState(true);
  // Whose data is currently in state — see PregnancyContext for why this is
  // compared instead of clearing on every auth event.
  const loadedUserIdRef = useRef(null);

  const loadFertilityData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        loadedUserIdRef.current = null;
        setFertilityMode(false);
        setHasAccess(false);
        return;
      }

      loadedUserIdRef.current = user.id;

      const { data } = await supabase
        .from("profiles")
        .select("goal, pregnancy_mode, has_pregnancy_subscription, pregnancy_until")
        .eq("id", user.id)
        .single();

      if (data) {
        const paidAccess = resolvePregnancyAccessFromProfile(data);
        const access = isAdminEmail(user.email) || isTestAccountEmail(user.email) || paidAccess;
        const isPregnant = Boolean(data.pregnancy_mode);
        const wantsFertility = data.goal === FERTILITY_GOAL;

        setHasAccess(access);
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

      if (nextUserId) {
        loadFertilityData();
      }
    });

    return () => subscription?.unsubscribe?.();
  }, [loadFertilityData]);

  return (
    <FertilityContext.Provider value={{
      fertilityMode,
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
