export const ADMIN_EMAILS = ["mishvelidze.u@gmail.com"];

export function isAdminEmail(email = "") {
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
