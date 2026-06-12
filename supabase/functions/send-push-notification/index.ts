import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ADMIN_EMAIL = "mishvelidze.u@gmail.com";
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

type PushTarget = "all" | "me" | "paid_prime" | "pregnancy_paid" | "today_users";

type PushRequest = {
  title?: string;
  body?: string;
  target?: PushTarget;
  email?: string;
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
      const { data: profileRows, error: profileError } = await adminClient
        .from("profiles")
        .select("id")
        .ilike("email", email);

      if (profileError) {
        return jsonResponse({ error: "profile-query-failed", details: profileError }, 500);
      }

      targetUserIds = (profileRows || []).map((profile) => profile.id);
    } else if (target === "me") {
      targetUserIds = [user.id];
    } else if (target === "paid_prime") {
      const { data: profileRows, error: profileError } = await adminClient
        .from("profiles")
        .select("id, is_premium, premium_until")
        .eq("is_premium", true);

      if (profileError) {
        return jsonResponse({ error: "profile-query-failed", details: profileError }, 500);
      }

      targetUserIds = (profileRows || [])
        .filter(isPaidPrimeProfile)
        .map((profile) => profile.id);
    } else if (target === "pregnancy_paid") {
      const { data: profileRows, error: profileError } = await adminClient
        .from("profiles")
        .select("id")
        .eq("has_pregnancy_subscription", true);

      if (profileError) {
        return jsonResponse({ error: "profile-query-failed", details: profileError }, 500);
      }

      targetUserIds = (profileRows || []).map((profile) => profile.id);
    } else if (target === "today_users") {
      const { data: profileRows, error: profileError } = await adminClient
        .from("profiles")
        .select("id")
        .gte("created_at", getTodayIsoStart());

      if (profileError) {
        return jsonResponse({ error: "profile-query-failed", details: profileError }, 500);
      }

      targetUserIds = (profileRows || []).map((profile) => profile.id);
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

    let tokenQuery = adminClient
      .from("push_tokens")
      .select("expo_push_token, user_id");

    if (targetUserIds) {
      tokenQuery = tokenQuery.in("user_id", targetUserIds);
    }

    const { data: tokenRows, error: tokenError } = await tokenQuery;
    if (tokenError) {
      return jsonResponse({ error: "token-query-failed", details: tokenError }, 500);
    }

    const tokens = [...new Set((tokenRows || []).map((row) => row.expo_push_token).filter(Boolean))];

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

    const expoResponses = [];
    for (const messageChunk of chunk(messages, 100)) {
      const expoResponse = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(messageChunk),
      });

      const responseBody = await expoResponse.json();
      expoResponses.push(responseBody);

      if (!expoResponse.ok) {
        return jsonResponse(
          {
            error: "expo-push-failed",
            status: expoResponse.status,
            details: responseBody,
          },
          502
        );
      }
    }

    return jsonResponse({
      ok: true,
      target,
      tokenCount: tokens.length,
      chunkCount: expoResponses.length,
      expoResponses,
    });
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
