import { isAuthRetryableFetchError } from "@supabase/supabase-js";

import { supabase } from "./supabase";

// Telling "offline" apart from "signed out".
//
// supabase.auth.getUser() asks the server, and when the server cannot be
// reached it answers `user: null` — exactly what a sign-out looks like. The
// contexts used to take that at face value, so opening the app without
// internet switched pregnancy / fertility mode off and dropped Prime, and it
// stayed that way after the connection came back until the app was
// backgrounded. These helpers let callers keep what is on screen and reload by
// themselves once the server is reachable again.

// The signed-in user, plus whether the answer is unknown because of the network.
export async function getSignedInUser() {
  const { data, error } = await supabase.auth.getUser();
  const user = data?.user ?? null;

  return { user, offline: !user && isAuthRetryableFetchError(error) };
}

// A table query that never got an answer from the server (postgrest reports
// status 0 when the request itself failed).
export function isOfflineQueryResult(result) {
  return result?.status === 0;
}

// A stored session that could not be refreshed because of the network: the
// user is signed in, the token just expired while the device was offline.
// getSession() only refreshes when a session is stored, so this never fires
// for someone who is really signed out.
export function isOfflineSessionError(error) {
  return isAuthRetryableFetchError(error);
}

const MIN_DELAY_MS = 5000;
const MAX_DELAY_MS = 60000;

const pending = new Map();
let probeTimer = null;
let attempt = 0;

// Runs `callback` once the server is reachable again. One probe for the whole
// app with a growing delay (5s → 60s); registering the same key again only
// replaces its callback, so repeated failures never pile up.
export function retryWhenOnline(key, callback) {
  pending.set(key, callback);

  if (!probeTimer) {
    scheduleProbe();
  }
}

function scheduleProbe() {
  const delay = Math.min(MIN_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
  probeTimer = setTimeout(probe, delay);
}

async function probe() {
  attempt += 1;

  let offline = true;
  try {
    const { error } = await supabase.auth.getUser();
    offline = isAuthRetryableFetchError(error);
  } catch {
    offline = true;
  }

  probeTimer = null;

  if (offline) {
    scheduleProbe();
    return;
  }

  attempt = 0;
  const callbacks = [...pending.values()];
  pending.clear();

  callbacks.forEach((callback) => {
    Promise.resolve()
      .then(callback)
      .catch((error) => console.log("Reload after reconnect failed:", error));
  });
}
