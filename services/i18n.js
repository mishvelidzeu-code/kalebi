// Tiny translation layer — no external dependency on purpose. Dictionaries live
// in locales/{ka,en,ru}.js as nested objects; `t("auth.login.title")` walks the
// path. Georgian is the source of truth: every key must exist there, and the
// other languages fall back to it when a key is missing (so a half-translated
// screen shows Georgian rather than a raw key).
//
// The current language is kept in module state so that plain services
// (notifications, exports) can call `t()` without a React hook. React screens
// go through context/LanguageContext.js, which also re-renders on change.

import dayjs from "../utils/dayjs";
import en from "../locales/en";
import ka from "../locales/ka";
import ru from "../locales/ru";

export const DEFAULT_LANGUAGE = "ka";

export const SUPPORTED_LANGUAGES = [
  { code: "ka", label: "ქართული", flag: "🇬🇪" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "ru", label: "Русский", flag: "🇷🇺" },
];

const DICTIONARIES = { ka, en, ru };

let currentLanguage = DEFAULT_LANGUAGE;
const listeners = new Set();

export function isSupportedLanguage(code) {
  return Boolean(code) && Object.prototype.hasOwnProperty.call(DICTIONARIES, code);
}

export function getLanguage() {
  return currentLanguage;
}

// Called by LanguageContext only. Keeps dayjs in step so every formatted date
// in the app follows the chosen language.
export function applyLanguage(code) {
  const next = isSupportedLanguage(code) ? code : DEFAULT_LANGUAGE;
  currentLanguage = next;
  dayjs.locale(next);
  listeners.forEach((listener) => listener(next));
  return next;
}

export function subscribeToLanguage(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function lookup(dictionary, path) {
  let node = dictionary;
  for (const part of path) {
    if (node == null || typeof node !== "object") return undefined;
    node = node[part];
  }
  return node;
}

// CLDR plural categories for the three languages we ship. Georgian has no
// plural forms; English has one/other; Russian has one/few/many.
function pluralCategory(language, count) {
  const n = Math.abs(Number(count));
  if (!Number.isFinite(n)) return "other";
  if (language === "ru") {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (Number.isInteger(n) && mod10 === 1 && mod100 !== 11) return "one";
    if (Number.isInteger(n) && mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "few";
    return "many";
  }
  if (language === "en") {
    return n === 1 ? "one" : "other";
  }
  return "other";
}

function resolvePlural(language, node, params) {
  if (node == null || typeof node !== "object") return node;
  const count = params?.count;
  if (count == null) return node.other ?? node.one ?? undefined;
  const category = pluralCategory(language, count);
  return node[category] ?? node.other ?? node.many ?? node.one;
}

function interpolate(template, params) {
  if (typeof template !== "string" || !params) return template;
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name) =>
    params[name] === undefined || params[name] === null ? match : String(params[name])
  );
}

// t("path.to.key", { name: "Nino", count: 3 })
// - {{name}} placeholders are replaced from params
// - if the key points at { one, few, many, other } the form is picked by count
// - missing in the current language → Georgian → the key itself
export function translate(language, key, params) {
  const path = String(key).split(".");
  let value = resolvePlural(language, lookup(DICTIONARIES[language], path), params);
  if (value === undefined && language !== DEFAULT_LANGUAGE) {
    value = resolvePlural(DEFAULT_LANGUAGE, lookup(DICTIONARIES[DEFAULT_LANGUAGE], path), params);
  }
  if (value === undefined) {
    if (__DEV__) console.warn(`[i18n] missing key "${key}" (${language})`);
    return key;
  }
  return interpolate(value, params);
}

export function t(key, params) {
  return translate(currentLanguage, key, params);
}
