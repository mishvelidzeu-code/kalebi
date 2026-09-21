import dayjs from "dayjs";

import { t } from "../services/i18n";

// Long-running memory for the pregnancy assistant. Rather than replay the whole
// 9-month chat, it summarises the FACTS the app already stores: which symptoms
// appeared in which pregnancy weeks, and what the user has been asking about.
//
// Pure functions — the orchestrator fetches the rows and passes them in.

// Labels live in locales/*.pregnancyMemory.symptoms.<id>
const SYMPTOM_IDS = new Set(["headache", "cramps", "fatigue", "bloating", "backache", "irritable", "sad", "anxious", "happy", "nausea", "heartburn", "movement", "urination"]);

const label = (id) => (SYMPTOM_IDS.has(id) ? t(`pregnancyMemory.symptoms.${id}`) : id);

// Which pregnancy week a date falls in (1-40).
function weekForDate(dateStr, lmpDate) {
  const week = Math.floor(dayjs(dateStr).diff(dayjs(lmpDate), "day") / 7) + 1;
  if (week < 1) return 1;
  if (week > 42) return 42;
  return week;
}

// Groups every logged symptom by symptom id, tracking how often it appeared and
// the pregnancy-week span it covered. Sorted by frequency so the assistant sees
// the persistent complaints first.
export function summarizePregnancySymptomHistory(symptomRows = [], lmpDate) {
  if (!lmpDate || !symptomRows.length) return [];

  const byId = {};
  symptomRows.forEach((row) => {
    const week = weekForDate(row.date, lmpDate);
    (row.symptoms || []).forEach((id) => {
      if (!byId[id]) byId[id] = { id, count: 0, firstWeek: week, lastWeek: week };
      const rec = byId[id];
      rec.count += 1;
      if (week < rec.firstWeek) rec.firstWeek = week;
      if (week > rec.lastWeek) rec.lastWeek = week;
    });
  });

  return Object.values(byId)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map((rec) => ({
      symptom: label(rec.id),
      times: rec.count,
      week_range: rec.firstWeek === rec.lastWeek
        ? t("pregnancyMemory.week", { week: rec.firstWeek })
        : t("pregnancyMemory.weekRange", { from: rec.firstWeek, to: rec.lastWeek }),
    }));
}

// Notes the user wrote across the pregnancy are the closest thing to "what was
// worrying her" in her own words. Keep the most recent handful, trimmed.
export function collectPregnancyNotes(symptomRows = [], lmpDate, limit = 5) {
  return symptomRows
    .filter((row) => row.note && row.note.trim())
    .sort((a, b) => dayjs(b.date).diff(dayjs(a.date)))
    .slice(0, limit)
    .map((row) => ({
      week: lmpDate ? weekForDate(row.date, lmpDate) : null,
      note: row.note.trim().slice(0, 160),
    }));
}

// What she has been asking the assistant lately — topics, not transcripts.
export function collectRecentQuestionTopics(historyRows = [], limit = 12) {
  return historyRows
    .map((row) => String(row.question || "").trim())
    .filter(Boolean)
    .slice(0, limit)
    .map((q) => (q.length > 90 ? `${q.slice(0, 90)}…` : q));
}

// Assembles the compact memory block injected into the pregnancy AI context.
// Returns null when there is nothing worth sending, so callers can omit it.
export function buildPregnancyMemory({ symptomRows = [], historyRows = [], lmpDate } = {}) {
  const symptomHistory = summarizePregnancySymptomHistory(symptomRows, lmpDate);
  const notes = collectPregnancyNotes(symptomRows, lmpDate);
  const recentQuestions = collectRecentQuestionTopics(historyRows);

  if (!symptomHistory.length && !notes.length && !recentQuestions.length) {
    return null;
  }

  return {
    symptom_history: symptomHistory,
    notable_notes: notes,
    recent_questions: recentQuestions,
  };
}
