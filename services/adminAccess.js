// App-side admin list. This is what unlocks paid modes for testing
// (fertilityUnlocked / isPremium), because it cannot be overwritten by the
// RevenueCat sync the way a database flag can.
//
// Note: the DB's admin RLS policies and the ai-assistant edge function keep
// their own separate lists, deliberately not widened here — a test account has
// no business reading every user's data.
export const ADMIN_EMAILS = [
  "mishvelidze.u@gmail.com",
  "u@gmail.com", // test account
];

export function isAdminEmail(email = "") {
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
