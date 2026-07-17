export const ADMIN_EMAILS = ["mishvelidze.u@gmail.com"];

// Test accounts: the paid modes (fertility / pregnancy) are free for them, and
// nothing else changes — the app looks and behaves exactly as it does for a
// normal user. Deliberately NOT admins: isAdmin hides the home, calendar,
// assistant and statistics tabs and boots into the dashboard, which would make
// testing those very modes impossible.
//
// This lives in code rather than in the database because on iOS RevenueCat is
// the source of truth and its sync overwrites profile subscription flags.
export const TEST_ACCOUNT_EMAILS = ["u@gmail.com"];

export function isAdminEmail(email = "") {
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

export function isTestAccountEmail(email = "") {
  return TEST_ACCOUNT_EMAILS.includes(email.trim().toLowerCase());
}
