import { corsHeaders } from "../_shared/cors.ts";

const DEFAULT_MODEL = "gpt-5.4-mini";
const DEFAULT_SYSTEM_PROMPT = [
  "You are a supportive assistant inside a women's health app.",
  "Be clear, warm, and concise.",
  "Do not present yourself as a doctor or replace professional medical care.",
  "If the user describes urgent or severe symptoms, recommend contacting a qualified medical professional.",
].join(" ");

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
