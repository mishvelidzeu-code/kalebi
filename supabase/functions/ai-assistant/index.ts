import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

import { corsHeaders } from "../_shared/cors.ts";

const DEFAULT_MODEL = "gpt-5.4-mini";
const DEFAULT_SYSTEM_PROMPT = [
  "You are a supportive assistant inside a women's health app.",
  "Be clear, warm, and concise.",
  "Do not present yourself as a doctor or replace professional medical care.",
  "If the user describes urgent or severe symptoms, recommend contacting a qualified medical professional.",
].join(" ");

const ADMIN_EMAILS = ["mishvelidze.u@gmail.com"];

// Chat limits mirror the client UI in app/(tabs)/symptoms.js.
const CHAT_FREE_DAILY_LIMIT = 1;
const CHAT_PREGNANCY_DAILY_LIMIT = 10;
const CHAT_PRIME_DAILY_LIMIT = 20;

// Non-chat features are cached client-side and called a few times per day at most;
// these caps exist only to bound abuse, real users never reach them.
const FEATURE_DAILY_LIMITS: Record<string, number> = {
  "home-daily-advice": 30,
  "home-daily-advice-pregnancy": 30,
  "calendar-diary-support": 30,
  "calendar-diary-support-pregnancy": 30,
  "pregnancy-weekly-advice": 30,
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function clampMaxTokens(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 400;
  }

  return Math.min(Math.max(Math.round(parsed), 64), 1200);
}

// Mirrors resolvePremiumAccessFromProfile in services/purchases.js.
function isPremiumProfile(
  profile: {
    is_premium?: boolean | null;
    premium_override?: boolean | null;
    premium_until?: string | null;
  } | null
) {
  if (profile?.premium_override) {
    return true;
  }

  if (!profile?.is_premium) {
    return false;
  }

  if (!profile?.premium_until) {
    return true;
  }

  const timestamp = Date.parse(profile.premium_until);
  return Number.isNaN(timestamp) ? false : timestamp > Date.now();
}

function buildInput(prompt: string, context: unknown) {
  if (context == null || context === "") {
    return prompt;
  }

  const serializedContext =
    typeof context === "string"
      ? context.trim()
      : JSON.stringify(context, null, 2);

  if (!serializedContext) {
    return prompt;
  }

  return [
    "App context:",
    serializedContext,
    "",
    "User request:",
    prompt,
  ].join("\n");
}

function extractOutputText(output: unknown) {
  if (!Array.isArray(output)) {
    return "";
  }

  const parts: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const contentItem of content) {
      if (
        contentItem &&
        typeof contentItem === "object" &&
        (contentItem as { type?: string }).type === "output_text"
      ) {
        const text = (contentItem as { text?: string }).text;
        if (text) {
          parts.push(text);
        }
      }
    }
  }

  return parts.join("\n").trim();
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const openAiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openAiKey) {
      return jsonResponse(
        {
          error: "Missing OPENAI_API_KEY secret.",
        },
        500
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        {
          error: "Missing Supabase service configuration.",
        },
        500
      );
    }

    const authHeader = request.headers.get("Authorization") || "";
    const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!accessToken) {
      return jsonResponse({ error: "authentication-required" }, 401);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } =
      await supabaseAdmin.auth.getUser(accessToken);
    const user = userData?.user || null;

    // The anon key alone is not a user session, so this also rejects
    // direct calls made with only the public key.
    if (userError || !user) {
      return jsonResponse({ error: "authentication-required" }, 401);
    }

    const payload = await request.json();
    const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";

    if (!prompt) {
      return jsonResponse(
        {
          error: "Prompt is required.",
        },
        400
      );
    }

    const isAdmin = ADMIN_EMAILS.includes((user.email || "").trim().toLowerCase());
    const rawFeature =
      typeof payload?.metadata?.feature === "string" ? payload.metadata.feature : "";
    // Unknown or missing features fall back to the strictest (chat) limits, so a
    // forged feature name cannot unlock a bigger budget. Both chat variants share
    // one counter, matching the single daily counter in the app.
    const isChatFeature = !(rawFeature in FEATURE_DAILY_LIMITS);
    const usageFeature = isChatFeature ? "assistant-chat" : rawFeature;

    let consumedUsage = false;

    if (!isAdmin) {
      let dailyLimit = FEATURE_DAILY_LIMITS[usageFeature];
      let limitResolved = !isChatFeature;

      if (isChatFeature) {
        const { data: profile, error: profileError } = await supabaseAdmin
          .from("profiles")
          .select("is_premium, premium_override, premium_until, pregnancy_mode")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) {
          // Fail open: never block a real user because of a transient profile read error.
          console.log("Assistant profile read error:", profileError.message);
        } else {
          dailyLimit = isPremiumProfile(profile)
            ? CHAT_PRIME_DAILY_LIMIT
            : profile?.pregnancy_mode
            ? CHAT_PREGNANCY_DAILY_LIMIT
            : CHAT_FREE_DAILY_LIMIT;
          limitResolved = true;
        }
      }

      if (limitResolved) {
        const { data: usageCount, error: usageError } = await supabaseAdmin.rpc(
          "consume_assistant_ai_usage",
          {
            p_user_id: user.id,
            p_feature: usageFeature,
            p_limit: dailyLimit,
          }
        );

        if (usageError) {
          // Fail open so a missing migration never takes the assistant down;
          // authentication above still protects the endpoint.
          console.log("Assistant usage check error:", usageError.message);
        } else if (typeof usageCount === "number" && usageCount < 0) {
          return jsonResponse({ error: "assistant-daily-limit" }, 429);
        } else {
          consumedUsage = true;
        }
      }
    }

    const model =
      typeof payload?.model === "string" && payload.model.trim()
        ? payload.model.trim()
        : Deno.env.get("OPENAI_MODEL") || DEFAULT_MODEL;

    const instructions =
      typeof payload?.systemPrompt === "string" && payload.systemPrompt.trim()
        ? payload.systemPrompt.trim()
        : DEFAULT_SYSTEM_PROMPT;

    const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions,
        input: buildInput(prompt, payload?.context),
        max_output_tokens: clampMaxTokens(payload?.maxOutputTokens),
        metadata:
          payload?.metadata && typeof payload.metadata === "object"
            ? payload.metadata
            : undefined,
        store: false,
        text: {
          format: {
            type: "text",
          },
        },
      }),
    });

    const responseJson = await openAiResponse.json();

    if (!openAiResponse.ok) {
      if (consumedUsage) {
        try {
          await supabaseAdmin.rpc("refund_assistant_ai_usage", {
            p_user_id: user.id,
            p_feature: usageFeature,
          });
        } catch (refundError) {
          console.log("Assistant usage refund error:", refundError);
        }
      }

      const message =
        responseJson?.error?.message || "OpenAI request failed.";

      return jsonResponse(
        {
          error: message,
        },
        openAiResponse.status
      );
    }

    const text = extractOutputText(responseJson?.output);

    return jsonResponse({
      id: responseJson?.id || null,
      model: responseJson?.model || model,
      text,
      usage: responseJson?.usage || null,
    });
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Unexpected AI error.",
      },
      500
    );
  }
});
