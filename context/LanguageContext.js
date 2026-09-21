import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  applyLanguage,
  isSupportedLanguage,
  translate,
} from "../services/i18n";
import { supabase } from "../services/supabase";

// Persisted locally so the app can render in the right language before any
// network call. Mirrored to profiles.language (best effort) so the server side
// — reminders, AI — can follow it later.
const LANGUAGE_STORAGE_KEY = "cycle_app_language";

const LanguageContext = createContext({
  language: DEFAULT_LANGUAGE,
  hasChosenLanguage: false,
  isLanguageLoaded: false,
  setLanguage: async () => {},
  t: (key) => key,
  languages: SUPPORTED_LANGUAGES,
});

async function writeLanguageToProfile(language) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ language }).eq("id", user.id);
    // The column ships in a separate migration; until it exists the update
    // fails harmlessly and the local value still wins.
    if (error) console.log("Language profile sync skipped:", error.message);
  } catch (error) {
    console.log("Language profile sync failed:", error);
  }
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(DEFAULT_LANGUAGE);
  // false until the user (or a previous session) explicitly picked a language —
  // the splash screen uses it to decide whether to show the picker.
  const [hasChosenLanguage, setHasChosenLanguage] = useState(false);
  // true once AsyncStorage has been read — the splash waits for it before
  // deciding whether to show the picker.
  const [isLanguageLoaded, setIsLanguageLoaded] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const load = async () => {
      try {
        const saved = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (isSupportedLanguage(saved)) {
          applyLanguage(saved);
          if (mountedRef.current) {
            setLanguageState(saved);
            setHasChosenLanguage(true);
          }
        } else {
          applyLanguage(DEFAULT_LANGUAGE);
        }
      } catch (error) {
        console.log("Language load failed:", error);
        applyLanguage(DEFAULT_LANGUAGE);
      } finally {
        if (mountedRef.current) setIsLanguageLoaded(true);
      }
    };
    load();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const setLanguage = useCallback(async (code) => {
    const next = applyLanguage(code);
    setLanguageState(next);
    setHasChosenLanguage(true);
    try {
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch (error) {
      console.log("Language save failed:", error);
    }
    writeLanguageToProfile(next);
  }, []);

  const t = useCallback((key, params) => translate(language, key, params), [language]);

  const value = useMemo(
    () => ({ language, hasChosenLanguage, isLanguageLoaded, setLanguage, t, languages: SUPPORTED_LANGUAGES }),
    [language, hasChosenLanguage, isLanguageLoaded, setLanguage, t]
  );

  // Children render immediately with the Georgian default; the stored language
  // arrives a few milliseconds later, long before the splash reveals any text.
  // (Not holding the tree keeps the mount sequence identical to before.)
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
