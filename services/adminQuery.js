import dayjs from "dayjs";
import { supabase } from "./supabase";

export async function runAdminQuery(text, stats) {
  const q = text.toLowerCase().trim();

  if (q.includes("დღეს") && (q.includes("დამ") || q.includes("რამდენ") || q.includes("ახალ"))) {
    const todayStart = dayjs().startOf("day").toISOString();
    const { data } = await supabase
      .from("profiles")
      .select("name, email, phone_number, created_at")
      .gte("created_at", todayStart)
      .order("created_at", { ascending: false });
    const count = data?.length || 0;
    if (count === 0) return "დღეს ჯერ არც ერთი მომხმარებელი არ დამატებულა.";
    const lines = (data || []).map(
      (p) => `- ${p.name || "უსახელო"} | ${p.phone_number || "N/A"} | ${p.email || ""}`
    );
    return `დღეს ${count} მომხმარებელი დაემატა:\n${lines.join("\n")}`;
  }

  if (q.includes("ნომ") || q.includes("ტელ") || q.includes("phone") || q.includes("კონტაქ")) {
    const cleaned = text
      .replace(/მომეცი|ნომერი|ტელეფონი|ნომ\.?|ტელ\.?|phone|კონტაქტი|სახელი|გვარი|ვისაც|ჰქვია|ამ/gi, "")
      .replace(/[?!.,]/g, "")
      .trim();
    if (cleaned.length >= 2) {
      const pattern = `%${cleaned}%`;
      const { data } = await supabase
        .from("profiles")
        .select("name, phone_number, email")
        .or(`name.ilike.${pattern},email.ilike.${pattern}`)
        .limit(5);
      if (!data?.length) return `"${cleaned}" სახელის მომხმარებელი ვერ მოიძებნა.`;
      return data
        .map((p) => `${p.name || "N/A"}: ${p.phone_number || "N/A"} | ${p.email || ""}`)
        .join("\n");
    }
    return "ჩაწერე სახელი: მაგ. \"მომეცი მარიამის ნომერი\"";
  }

  if (q.includes("ბოლო") || q.includes("უახლეს") || q.includes("last")) {
    const { data } = await supabase
      .from("profiles")
      .select("name, email, phone_number, created_at, is_premium")
      .order("created_at", { ascending: false })
      .limit(3);
    if (!data?.length) return "მომხმარებლები ვერ მოიძებნა.";
    return data
      .map((p) => `${p.name || "უსახელო"} | ${p.phone_number || "N/A"} | ${dayjs(p.created_at).format("DD.MM HH:mm")} | ${p.is_premium ? "Prime" : "Free"}`)
      .join("\n");
  }

  if (q.includes("სულ") || (q.includes("რამდენ") && !q.includes("დღეს"))) {
    return `სულ: ${stats.users}\nPaid Prime: ${stats.paidPremium}\nAdmin Prime: ${stats.adminPremium}\nPregnancy: ${stats.pregnancyPaid}\nდღეს: ${stats.todayUsers}`;
  }

  if (q.includes("prime") || q.includes("premium") || q.includes("paid")) {
    return `Paid Prime: ${stats.paidPremium}\nAdmin Prime: ${stats.adminPremium}\nPregnancy Paid: ${stats.pregnancyPaid}`;
  }

  const safeQ = text.replace(/[(),]/g, " ").trim();
  if (safeQ.length >= 2) {
    const pattern = `%${safeQ}%`;
    const { data } = await supabase
      .from("profiles")
      .select("name, email, phone_number, is_premium, premium_override")
      .or(`email.ilike.${pattern},name.ilike.${pattern},phone_number.ilike.${pattern}`)
      .limit(5);
    if (data?.length) {
      return data
        .map((p) => `${p.name || "N/A"} | ${p.phone_number || "N/A"} | ${p.email || ""} | ${p.is_premium || p.premium_override ? "Prime" : "Free"}`)
        .join("\n");
    }
  }

  return [
    "ვერ ვიპოვე. სცადე:",
    "- დღეს რამდენი დაემატა",
    "- მომეცი მარიამის ნომერი",
    "- სულ რამდენი მომხმარებელია",
    "- ბოლო დამატებული",
  ].join("\n");
}
