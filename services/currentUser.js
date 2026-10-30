import { supabase } from "./supabase";

// The signed-in user, read from the session stored on the phone. Same shape as
// supabase.auth.getUser() ({ data: { user }, error }), so it drops in for it.
//
// getUser() asks the auth server every time, and supabase-js runs that request
// under the same lock every table query takes to read its token — so each call
// in flight made every query behind it wait one more round trip. With about
// twenty of them at launch (contexts, splash, push, home) that was seconds
// before any screen got its data, and each screen paid one more on every visit.
//
// The stored session is enough: the server checks the token on every query
// (RLS), so asking it about the user again added nothing. getSession() only
// goes to the network when the token has expired, to refresh it — once, for
// everyone waiting. Offline, that refresh fails with a retryable error and the
// stored session is kept (see networkRecovery.js).
export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getSession();
  return { data: { user: data?.session?.user ?? null }, error };
}
