#!/usr/bin/env node
/* eslint-env node */
// Localisation guard. Run with `node scripts/i18n-check.js`. Checks three things:
//
//  1. Key parity — every key in locales/ka.js exists in en.js and ru.js, and the
//     other two have no keys Georgian lacks.
//  2. No Georgian left in code — for every file listed in MIGRATED_FILES, no
//     Georgian letters remain outside comments.
//  3. Nothing lost — every Georgian string literal that the file had on `main`
//     still exists as a value in locales/ka.js, so the Georgian UI is unchanged.
//
// Exit code 1 on any failure so it can gate a commit or an OTA.

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const BASE_REF = process.env.I18N_BASE_REF || "main";

// Files whose user-facing strings have been moved into the dictionaries.
// Add a file here when its extraction is done; the guard then keeps it clean.
const MIGRATED_FILES = [
  "app/splash.jsx",
  "app/auth/login.jsx",
  "app/auth/register.jsx",
  "app/onboarding/name.jsx",
  "app/onboarding/birth.jsx",
  "app/onboarding/protection.jsx",
  "app/onboarding/health.jsx",
  "app/onboarding/cycle-length.jsx",
  "app/onboarding/last-period.jsx",
  "app/onboarding/notifications.jsx",
];

// Georgian literals that are allowed to stay in code because they are stored
// values (profiles.goal / protection / health / symptoms.mood …), not UI text.
// Changing them would break matching against rows already in the database.
const DB_VALUE_LITERALS = new Set([
  // profiles.protection
  "კონდომი", "ჰორმონალური კონტრაცეფცია", "სპირალი", "ქალწული", "არ ვიყენებ",
  // profiles.health
  "არა", "ჰორმონალური პრობლემა", "ინფექციური პრობლემა", "არ ვიცი",
]);

// Georgian strings that were in code on main but are now produced by a
// library (dayjs "ka" locale) instead of the dictionary.
const MOVED_TO_LIBRARY = new Set([
  "იანვარი", "თებერვალი", "მარტი", "აპრილი", "მაისი", "ივნისი",
  "ივლისი", "აგვისტო", "სექტემბერი", "ოქტომბერი", "ნოემბერი", "დეკემბერი",
]);

const GEORGIAN = /[Ⴀ-ჿ]/;

function loadDictionary(code) {
  const source = fs.readFileSync(path.join(ROOT, "locales", `${code}.js`), "utf8");
  const sandbox = { module: { exports: {} } };
  vm.runInNewContext(source.replace(/export default/, "module.exports ="), sandbox);
  return sandbox.module.exports;
}

function flatten(node, prefix = "", out = {}) {
  if (node && typeof node === "object") {
    const keys = Object.keys(node);
    const isPluralLeaf = keys.length > 0 && keys.every((k) => ["zero", "one", "two", "few", "many", "other"].includes(k));
    if (isPluralLeaf) {
      out[prefix] = node;
      return out;
    }
    for (const key of keys) flatten(node[key], prefix ? `${prefix}.${key}` : key, out);
    return out;
  }
  out[prefix] = node;
  return out;
}

// Comments and console.* calls are developer-facing, not UI — ignored.
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
    .replace(/console\.(log|warn|error|info|debug)\([^;]*\);?/g, "");
}

// Georgian text as it appears in source: quoted literals plus JSX text nodes.
function georgianLiterals(source) {
  const clean = stripComments(source);
  const found = new Set();
  const literal = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
  for (const match of clean.matchAll(literal)) {
    const text = match[1] ?? match[2] ?? match[3];
    if (GEORGIAN.test(text)) found.add(text);
  }
  for (const match of clean.matchAll(/>([^<>{}]*[Ⴀ-ჿ][^<>{}]*)</g)) {
    const text = match[1].replace(/\s+/g, " ").trim();
    if (text) found.add(text);
  }
  return found;
}

function collectValues(dictionary) {
  const values = new Set();
  for (const value of Object.values(flatten(dictionary))) {
    if (typeof value === "string") values.add(value);
    else if (value && typeof value === "object") Object.values(value).forEach((v) => typeof v === "string" && values.add(v));
  }
  return values;
}

const failures = [];
const warnings = [];

// 1. key parity
const dictionaries = { ka: loadDictionary("ka"), en: loadDictionary("en"), ru: loadDictionary("ru") };
const flat = Object.fromEntries(Object.entries(dictionaries).map(([code, dict]) => [code, flatten(dict)]));
for (const code of ["en", "ru"]) {
  for (const key of Object.keys(flat.ka)) if (!(key in flat[code])) failures.push(`[${code}] missing key: ${key}`);
  for (const key of Object.keys(flat[code])) if (!(key in flat.ka)) failures.push(`[${code}] extra key not in ka: ${key}`);
  for (const key of Object.keys(flat[code])) {
    if (typeof flat[code][key] === "string" && GEORGIAN.test(flat[code][key])) failures.push(`[${code}] Georgian text in value: ${key}`);
  }
}
for (const key of Object.keys(flat.ka)) {
  const value = flat.ka[key];
  if (value === "" || value === undefined) failures.push(`[ka] empty value: ${key}`);
}

// 2 + 3. per migrated file
const kaValues = collectValues(dictionaries.ka);
const kaJoined = [...kaValues].join("\n");
for (const file of MIGRATED_FILES) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) {
    failures.push(`[${file}] listed as migrated but does not exist`);
    continue;
  }
  const current = fs.readFileSync(full, "utf8");
  const leftover = georgianLiterals(current);
  for (const text of leftover) {
    if (DB_VALUE_LITERALS.has(text)) continue;
    failures.push(`[${file}] Georgian still in code: "${text}"`);
  }

  let base;
  try {
    base = execSync(`git show ${BASE_REF}:${file}`, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    warnings.push(`[${file}] not on ${BASE_REF} — skipped the "nothing lost" check`);
    continue;
  }
  for (const text of georgianLiterals(base)) {
    const normalised = text.trim();
    if (DB_VALUE_LITERALS.has(text) || MOVED_TO_LIBRARY.has(text)) continue;
    if (kaValues.has(text) || kaValues.has(normalised) || kaJoined.includes(normalised)) continue;
    failures.push(`[${file}] Georgian text from ${BASE_REF} is not in locales/ka.js: "${text}"`);
  }
}

const kaCount = Object.keys(flat.ka).length;
console.log(`i18n-check: ${kaCount} keys, ${MIGRATED_FILES.length} migrated files checked against ${BASE_REF}`);
for (const line of warnings) console.log("  warn  " + line);
for (const line of failures) console.log("  FAIL  " + line);
if (failures.length) {
  console.log(`\n${failures.length} problem(s).`);
  process.exit(1);
}
console.log("OK — dictionaries in sync, no Georgian left in migrated files, nothing lost.");
