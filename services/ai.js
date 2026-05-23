import { supabase } from "./supabase";

const AI_FUNCTION_NAME = process.env.EXPO_PUBLIC_AI_FUNCTION_NAME || "ai-assistant";

export async function generateAiResponse({
  prompt,
  context = null,
  systemPrompt = null,
  maxOutputTokens = 400,
  model = null,
  metadata = null,
} = {}) {
  const cleanPrompt = typeof prompt === "string" ? prompt.trim() : "";

  if (!cleanPrompt) {
    throw new Error("AI prompt is required.");
  }

  const { data, error } = await supabase.functions.invoke(AI_FUNCTION_NAME, {
    body: {
      prompt: cleanPrompt,
      context,
      systemPrompt,
      maxOutputTokens,
      model,
      metadata,
    },
  });

  if (error) {
    let message = error.message || "AI request failed.";
    try {
      // error.context is the raw fetch Response — read body to get real error
      const body = await error.context?.json?.();
      if (body?.error) message = typeof body.error === "string" ? body.error : body.error?.message || message;
    } catch {}
    throw new Error(message);
  }

  if (!data?.text) {
    throw new Error("AI response was empty.");
  }

  return data;
}
