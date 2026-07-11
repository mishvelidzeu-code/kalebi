// Temporary feature flags — flip to false (or delete the flag and its usages)
// once the feature it guards is no longer needed.

// Blocks fertility ("მინდა დაორსულება") mode entirely while it is being
// finished: every entry point shows a "მალე დაემატება" alert instead of the
// paywall/activation flow, so nobody can enter or pay.
export const TEMP_FERTILITY_COMING_SOON = true;
