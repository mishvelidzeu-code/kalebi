// Temporary feature flags — flip to false (or delete the flag and its usages)
// once the feature it guards is no longer needed.

// Kill switch for fertility ("მინდა დაორსულება") mode. Flip back to true to
// show a "მალე დაემატება" alert at every entry point, blocking both entry and
// payment — useful if something goes wrong in production.
export const TEMP_FERTILITY_COMING_SOON = false;

// Temporarily hides the assistant screen's top header (title, subtitle and the
// portrait image), leaving only the safe-area spacing. Flip to false to bring
// it back exactly as it was.
export const TEMP_HIDE_ASSISTANT_HEADER = true;

// Language picker on the splash screen (and the language row in the profile).
// While false the app behaves exactly as before: every user gets Georgian and
// never sees a language choice, even though the dictionaries are already wired
// in. Flip to true once the English and Russian dictionaries are complete.
export const TEMP_LANGUAGE_PICKER_ENABLED = false;
