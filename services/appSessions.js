import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { AppState, Platform } from "react-native";

import { isAdminEmail, isTestAccountEmail } from "./adminAccess";
import { supabase } from "./supabase";

// One app_sessions row per foreground visit, so the admin panel can show how
// often and how long the app is used. The row is upserted when the visit starts
// (it counts even if the app is killed) and again when the app goes to the
// background. The open visit is mirrored in AsyncStorage with a heartbeat: if
// the app is killed in the foreground, the next launch closes it at its last
// heartbeat instead of losing it. Visits that could not be uploaded (offline)
// wait in a small pending list and go up on a later visit.

const CURRENT_KEY = "cycle_app_session_current";
const PENDING_KEY = "cycle_app_session_pending";
const HEARTBEAT_MS = 30 * 1000;
// Back in the app this soon (notification shade, a quick reply elsewhere,
// the photo picker) = still the same visit.
const RESUME_WINDOW_MS = 30 * 1000;
const MAX_DURATION_SECONDS = 24 * 60 * 60;
const MAX_PENDING = 30;
const PENDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

let current = null; // { id, userId, startedAt, lastActiveAt, endedAt?, uploaded? }
let heartbeatTimer = null;
let queue = Promise.resolve();
let isTracking = false;

// AppState and auth events can arrive back to back; every step runs in order.
function runQueued(task) {
  queue = queue.then(task).catch((error) => {
    console.log("App session tracking error:", error);
  });
  return queue;
}

function createSessionId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    return (char === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

async function readJson(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

async function writeCurrent() {
  try {
    if (current) {
      await AsyncStorage.setItem(CURRENT_KEY, JSON.stringify(current));
    } else {
      await AsyncStorage.removeItem(CURRENT_KEY);
    }
  } catch (error) {
    console.log("App session save error:", error);
  }
}

function toRow(session) {
  const endedAt = session.endedAt ?? null;
  const durationSeconds =
    endedAt == null
      ? null
      : Math.min(Math.max(Math.round((endedAt - session.startedAt) / 1000), 0), MAX_DURATION_SECONDS);

  return {
    id: session.id,
    user_id: session.userId,
    started_at: new Date(session.startedAt).toISOString(),
    ended_at: endedAt == null ? null : new Date(endedAt).toISOString(),
    duration_seconds: durationSeconds,
    platform: Platform.OS,
    app_version: Constants.expoConfig?.version ?? null,
  };
}

// The admin and the test account would only skew the numbers.
async function getTrackableUserId() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) {
    return null;
  }

  const email = user.email || "";
  if (isAdminEmail(email) || isTestAccountEmail(email)) {
    return null;
  }

  return user.id;
}

async function uploadSession(session) {
  const {
    data: { session: authSession },
  } = await supabase.auth.getSession();

  // RLS only accepts the signed-in user's own rows.
  if (!authSession?.user?.id || authSession.user.id !== session.userId) {
    return false;
  }

  const { error } = await supabase.from("app_sessions").upsert(toRow(session));
  if (error) {
    console.log("App session upload error:", error.message || error);
    return false;
  }

  return true;
}

async function addPending(session) {
  const pending = await readJson(PENDING_KEY, []);
  const next = [...pending.filter((item) => item.id !== session.id), session].slice(-MAX_PENDING);
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(next));
}

async function removePending(sessionId) {
  const pending = await readJson(PENDING_KEY, []);
  if (pending.some((item) => item.id === sessionId)) {
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(pending.filter((item) => item.id !== sessionId)));
  }
}

async function flushPending() {
  const pending = await readJson(PENDING_KEY, []);
  if (!pending.length) {
    return;
  }

  const cutoff = Date.now() - PENDING_MAX_AGE_MS;
  const fresh = pending.filter((item) => (item.endedAt ?? item.startedAt) >= cutoff);
  const remaining = [];

  for (let index = 0; index < fresh.length; index += 1) {
    if (await uploadSession(fresh[index])) {
      continue;
    }

    // Another user's visit waits for that user; anything else failing (offline)
    // will fail for the rest too, so stop here.
    remaining.push(fresh[index]);
    if (fresh[index].userId === current?.userId) {
      remaining.push(...fresh.slice(index + 1));
      break;
    }
  }

  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(remaining));
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    runQueued(async () => {
      if (!current || current.endedAt) {
        return;
      }

      current = { ...current, lastActiveAt: Date.now() };
      await writeCurrent();
    });
  }, HEARTBEAT_MS);
}

// A visit left over from the previous launch: either ended in the background
// (upload may not have finished) or killed in the foreground.
async function closeStoredSession() {
  const stored = await readJson(CURRENT_KEY, null);
  if (!stored?.id) {
    return;
  }

  await AsyncStorage.removeItem(CURRENT_KEY);
  if (stored.endedAt && stored.uploaded) {
    return;
  }

  const closed = {
    id: stored.id,
    userId: stored.userId,
    startedAt: stored.startedAt,
    endedAt: stored.endedAt ?? stored.lastActiveAt ?? stored.startedAt,
  };

  if (!(await uploadSession(closed))) {
    await addPending(closed);
  }
}

async function beginSession() {
  const userId = await getTrackableUserId();
  if (!userId) {
    current = null;
    await writeCurrent();
    return;
  }

  const now = Date.now();
  current = { id: createSessionId(), userId, startedAt: now, lastActiveAt: now };
  await writeCurrent();
  startHeartbeat();

  await uploadSession(current);
  await flushPending();
}

async function endSession() {
  stopHeartbeat();
  if (!current || current.endedAt) {
    return;
  }

  const now = Date.now();
  current = { ...current, lastActiveAt: now, endedAt: now };
  await writeCurrent();

  const ended = current;
  if (await uploadSession(ended)) {
    if (current?.id === ended.id) {
      current = { ...current, uploaded: true };
      await writeCurrent();
    }
  } else {
    await addPending(ended);
  }
}

async function handleForeground() {
  if (current && !current.endedAt) {
    return;
  }

  const now = Date.now();
  if (current?.endedAt && now - current.endedAt <= RESUME_WINDOW_MS) {
    const userId = await getTrackableUserId();
    if (userId && userId === current.userId) {
      // The longer version of this visit is uploaded when it ends again.
      await removePending(current.id);
      current = { id: current.id, userId, startedAt: current.startedAt, lastActiveAt: now };
      await writeCurrent();
      startHeartbeat();
      return;
    }
  }

  await beginSession();
}

async function handleSignedIn() {
  const userId = await getTrackableUserId();
  if (current && !current.endedAt && current.userId === userId) {
    return;
  }

  await endSession();
  if (AppState.currentState !== "background") {
    await beginSession();
  }
}

// The login is already gone, so the visit can only be closed locally; it goes up
// if the same user signs back in within a week.
async function handleSignedOut() {
  stopHeartbeat();
  if (current && !current.endedAt) {
    await addPending({ id: current.id, userId: current.userId, startedAt: current.startedAt, endedAt: Date.now() });
  }

  current = null;
  await writeCurrent();
}

export function startAppSessionTracking() {
  if (isTracking) {
    return () => {};
  }
  isTracking = true;

  runQueued(async () => {
    await closeStoredSession();
    if (AppState.currentState !== "background") {
      await beginSession();
    }
  });

  const appStateSubscription = AppState.addEventListener("change", (state) => {
    if (state === "active") {
      runQueued(handleForeground);
    } else if (state === "background") {
      runQueued(endSession);
    }
  });

  const {
    data: { subscription: authSubscription },
  } = supabase.auth.onAuthStateChange((event) => {
    // Deferred: supabase-js holds its auth lock while this callback runs.
    if (event === "SIGNED_IN") {
      setTimeout(() => runQueued(handleSignedIn), 0);
    } else if (event === "SIGNED_OUT") {
      setTimeout(() => runQueued(handleSignedOut), 0);
    }
  });

  return () => {
    appStateSubscription.remove();
    authSubscription.unsubscribe();
    stopHeartbeat();
    isTracking = false;
  };
}
