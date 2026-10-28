import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ADMIN_EMAIL = "mishvelidze.u@gmail.com";
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const PAGE_SIZE = 1000;
// Long `in(...)` filters go into the URL, so user ids are queried in batches.
const USER_ID_BATCH_SIZE = 150;
const EXPO_BATCH_SIZE = 100;
const EXPO_PARALLEL_REQUESTS = 4;

type PushTarget = "all" | "me" | "paid_prime" | "pregnancy_paid" | "today_users";

type PushRequest = {
  title?: string;
  body?: string;
  target?: PushTarget;
  email?: string;
};

type TokenRow = {
  expo_push_token: string | null;
  user_id: string | null;
};

type ExpoTicket = {
  status?: string;
  details?: { error?: string };
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

// PostgREST returns at most `max_rows` (1000 by default) per request, so keep
// reading pages until one comes back empty. `buildQuery` must return a fresh,
// ordered query each time.
// deno-lint-ignore no-explicit-any
async function fetchAllRows<T>(buildQuery: () => any): Promise<{ rows: T[]; error: unknown }> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    // PGRST103 = offset past the last row, i.e. nothing left to read.
    if (error && from > 0 && error.code === "PGRST103") {
      return { rows, error: null };
    }
    if (error) {
      return { rows, error };
    }
    if (!data || data.length === 0) {
      return { rows, error: null };
    }
    rows.push(...data);
    from += data.length;
  }
}

// deno-lint-ignore no-explicit-any
async function fetchPushTokens(adminClient: any, targetUserIds: string[] | null) {
  const buildTokenQuery = (userIds?: string[]) => {
    let query = adminClient.from("push_tokens").select("expo_push_token, user_id");
    if (userIds) {
      query = query.in("user_id", userIds);
    }
    return query.order("expo_push_token");
  };

  if (!targetUserIds) {
    return fetchAllRows<TokenRow>(() => buildTokenQuery());
  }

  const rows: TokenRow[] = [];
  for (const userIdBatch of chunk(targetUserIds, USER_ID_BATCH_SIZE)) {
    const result = await fetchAllRows<TokenRow>(() => buildTokenQuery(userIdBatch));
    if (result.error) {
      return { rows, error: result.error };
    }
    rows.push(...result.rows);
  }
  return { rows, error: null };
}

// Sends every message and counts what Expo accepted. A failed batch no longer
// stops the rest of the send.
async function sendToExpo(messages: unknown[]) {
  let acceptedCount = 0;
  const errorCounts: Record<string, number> = {};
  const addErrors = (reason: string, count: number) => {
    errorCounts[reason] = (errorCounts[reason] || 0) + count;
  };

  const sendBatch = async (batch: unknown[]) => {
    try {
      const expoResponse = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(batch),
      });
      const responseBody = await expoResponse.json().catch(() => null);
      const tickets: ExpoTicket[] = Array.isArray(responseBody?.data) ? responseBody.data : [];

      if (!expoResponse.ok || tickets.length === 0) {
        addErrors(responseBody?.errors?.[0]?.code || `http-${expoResponse.status}`, batch.length);
        return;
      }

      for (const ticket of tickets) {
        if (ticket?.status === "ok") {
          acceptedCount += 1;
        } else {
          addErrors(ticket?.details?.error || "unknown-error", 1);
        }
      }
      if (tickets.length < batch.length) {
        addErrors("missing-ticket", batch.length - tickets.length);
      }
    } catch (error) {
      console.error("send-push-notification expo batch error:", error);
      addErrors("network-error", batch.length);
    }
  };

  const batches = chunk(messages, EXPO_BATCH_SIZE);
  for (const parallelGroup of chunk(batches, EXPO_PARALLEL_REQUESTS)) {
    await Promise.all(parallelGroup.map(sendBatch));
  }

  return { acceptedCount, errorCounts, batchCount: batches.length };
}

function getTodayIsoStart() {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

function isPaidPrimeProfile(profile: { is_premium?: boolean | null; premium_until?: string | null }) {
  if (!profile?.is_premium) {
    return false;
  }

  if (!profile?.premium_until) {
    return true;
  }

  const timestamp = Date.parse(profile.premium_until);
  return Number.isNaN(timestamp) ? false : timestamp > Date.now();
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "method-not-allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return jsonResponse({ error: "missing-supabase-env" }, 500);
    }

    const authHeader = request.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }

    if ((user.email || "").toLowerCase() !== ADMIN_EMAIL) {
      return jsonResponse({ error: "admin-only" }, 403);
    }

    const payload = (await request.json()) as PushRequest;
    const title = (payload.title || "").trim();
    const body = (payload.body || "").trim();
    const target = payload.target || "me";
    const email = (payload.email || "").trim().toLowerCase();

    if (!title || !body) {
      return jsonResponse({ error: "title-and-body-required" }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    let targetUserIds: string[] | null = null;

    if (email) {
      const { rows: profileRows, error: profileError } = await fetchAllRows<{ id: string }>(() =>
        adminClient.from("profiles").select("id").ilike("email", email).order("id")
      );

      if (profileError) {
        return jsonResponse({ error: "profile-query-failed", details: profileError }, 500);
      }

      targetUserIds = profileRows.map((profile) => profile.id);
    } else if (target === "me") {
      targetUserIds = [user.id];
    } else if (target === "paid_prime") {
      const { rows: profileRows, error: profileError } = await fetchAllRows<{
        id: string;
        is_premium: boolean | null;
        premium_until: string | null;
      }>(() =>
        adminClient
          .from("profiles")
          .select("id, is_premium, premium_until")
          .eq("is_premium", true)
          .order("id")
      );

      if (profileError) {
        return jsonResponse({ error: "profile-query-failed", details: profileError }, 500);
      }

      targetUserIds = profileRows
        .filter(isPaidPrimeProfile)
        .map((profile) => profile.id);
    } else if (target === "pregnancy_paid") {
      const { rows: profileRows, error: profileError } = await fetchAllRows<{ id: string }>(() =>
        adminClient.from("profiles").select("id").eq("has_pregnancy_subscription", true).order("id")
      );

      if (profileError) {
        return jsonResponse({ error: "profile-query-failed", details: profileError }, 500);
      }

      targetUserIds = profileRows.map((profile) => profile.id);
    } else if (target === "today_users") {
      const { rows: profileRows, error: profileError } = await fetchAllRows<{ id: string }>(() =>
        adminClient.from("profiles").select("id").gte("created_at", getTodayIsoStart()).order("id")
      );

      if (profileError) {
        return jsonResponse({ error: "profile-query-failed", details: profileError }, 500);
      }

      targetUserIds = profileRows.map((profile) => profile.id);
    } else if (target !== "all") {
      return jsonResponse({ error: "invalid-target", target }, 400);
    }

    if (targetUserIds && targetUserIds.length === 0) {
      return jsonResponse({
        ok: false,
        error: "no-target-users-found",
        target,
        email: email || null,
      }, 404);
    }

    const { rows: tokenRows, error: tokenError } = await fetchPushTokens(adminClient, targetUserIds);
    if (tokenError) {
      return jsonResponse({ error: "token-query-failed", details: tokenError }, 500);
    }

    const tokens = [...new Set(tokenRows.map((row) => row.expo_push_token).filter(Boolean))];

    if (tokens.length === 0) {
      return jsonResponse({
        ok: false,
        error: "no-push-tokens-found",
        target,
        email: email || null,
      }, 404);
    }

    const messages = tokens.map((to) => ({
      to,
      sound: "default",
      title,
      body,
      data: {
        target,
        sentBy: user.id,
      },
    }));

    const { acceptedCount, errorCounts, batchCount } = await sendToExpo(messages);
    const summary = {
      target,
      tokenCount: tokens.length,
      sentCount: acceptedCount,
      failedCount: tokens.length - acceptedCount,
      errors: errorCounts,
      chunkCount: batchCount,
    };

    if (acceptedCount === 0) {
      return jsonResponse({ ok: false, error: "expo-push-failed", ...summary }, 502);
    }

    return jsonResponse({ ok: true, ...summary });
  } catch (error) {
    console.error("send-push-notification error:", error);
    return jsonResponse(
      {
        error: "internal-error",
        message: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});
