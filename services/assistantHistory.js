import { supabase } from "./supabase";

export async function saveAssistantChatHistory({
  userId,
  question,
  answer,
  source = "ai",
  metadata = {},
} = {}) {
  const cleanQuestion = String(question || "").trim();
  const cleanAnswer = String(answer || "").trim();

  if (!userId || !cleanQuestion || !cleanAnswer) {
    return;
  }

  const { error } = await supabase.from("assistant_chat_history").insert({
    user_id: userId,
    question: cleanQuestion,
    answer: cleanAnswer,
    source: source || "ai",
    metadata,
  });

  if (error) {
    console.log("Assistant history save error:", error);
  }
}
