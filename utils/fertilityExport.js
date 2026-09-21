import dayjs from "dayjs";

import { t } from "../services/i18n";

// Builds a plain-text fertility report the user can hand to a doctor.
// Pure string building — the screen handles writing/sharing the file.
// All copy comes from locales/*.report (and the shared calendar/stats keys
// for option labels), so the report is written in the app's language.

const known = (set, id) => set.includes(id);
const LH_IDS = ["negative", "weak", "positive", "peak"];
const MUCUS_IDS = ["dry", "sticky", "creamy", "watery", "eggwhite"];
const SYMPTOM_IDS = ["cramps", "breast", "libido", "fatigue", "nausea", "energy"];
const SUPPLEMENT_IDS = ["folic", "vitamin_d", "omega3", "iron", "iodine"];
const METHOD_IDS = ["bbt", "lh", "mucus"];
const CONFIDENCE_IDS = ["high", "medium", "low"];

const lhLabel = (id) => (known(LH_IDS, id) ? t(`calendar.lh.${id}`) : id);
const mucusLabel = (id) => (known(MUCUS_IDS, id) ? t(`calendar.mucus.${id}`) : id);
const symptomLabel = (id) => (known(SYMPTOM_IDS, id) ? t(`calendar.ovulationSigns.${id}`) : id);
const supplementLabel = (id) => (known(SUPPLEMENT_IDS, id) ? t(`fertility.supplements.${id}`) : id === "other" ? t("report.otherSupplement") : id);
const methodLabel = (id) => (known(METHOD_IDS, id) ? t(`stats.methods.${id}`) : id);
const confidenceLabel = (id) => (known(CONFIDENCE_IDS, id) ? t(`stats.confidence.${id}`) : id);

const line = (label, value) => `${label}: ${value}`;
const section = (title) => `\n${title}\n${"-".repeat(title.length)}`;
const fmt = (date) => dayjs(date).format("YYYY-MM-DD");

function sortedByDate(logs, type) {
  return (logs || [])
    .filter((l) => l.type === type)
    .sort((a, b) => dayjs(a.date).diff(dayjs(b.date)));
}

export function buildFertilityReport({
  userName = "",
  age = null,
  cycles = [],
  logs = [],
  regularity = null,
  confirmations = [],
  lutealLength = null,
  trying = null,
  logSummary = null,
} = {}) {
  const out = [];

  out.push(t("report.title"));
  out.push("=".repeat(42));
  out.push(line(t("report.user"), userName || "—"));
  if (age != null) out.push(line(t("report.age"), `${age}`));
  out.push(line(t("report.reportDate"), fmt(dayjs())));

  // -- Summary ------------------------------------------------------
  out.push(section(t("report.summary")));
  if (trying) {
    out.push(line(t("report.tryingDuration"), t("report.months", { count: trying.monthsTrying })));
    out.push(line(t("report.loggedCycles"), `${trying.cyclesCount}`));
  }
  if (regularity?.sampleSize > 0) {
    out.push(line(t("report.avgCycle"), t("report.days", { count: regularity.avgCycle })));
    out.push(line(t("report.cycleRange"), t("report.cycleRangeValue", { shortest: regularity.shortest, longest: regularity.longest, spread: regularity.spread })));
    out.push(line(t("report.regularity"), regularity.isRegular ? t("report.regular") : t("report.irregular")));
  } else {
    out.push(t("report.notEnoughData"));
  }
  if (lutealLength) {
    out.push(line(t("report.lutealMeasured"), t("report.lutealValue", { days: lutealLength.days, cycles: lutealLength.sampleSize })));
  }
  if (logSummary) {
    out.push(line(t("report.intercourseInWindow"), `${logSummary.intercourseInFertile} / ${logSummary.intercourseCount}`));
    out.push(line(t("report.positiveLhTests"), `${logSummary.lhPositiveCount} / ${logSummary.lhTestCount}`));
    out.push(line(t("report.bbtEntries"), `${logSummary.bbtCount}`));
  }

  // -- Confirmed ovulations ----------------------------------------
  out.push(section(t("report.confirmedOvulations")));
  if (confirmations.length === 0) {
    out.push(t("report.noneConfirmed"));
  } else {
    confirmations.forEach((c, i) => {
      const methods = c.methods.map(methodLabel).join(" + ");
      const luteal = c.lutealLength != null ? t("report.lutealSuffix", { days: c.lutealLength }) : "";
      out.push(
        t("report.confirmationLine", {
          index: i + 1,
          date: fmt(c.ovulationDate),
          day: c.cycleDay,
          methods,
          confidence: confidenceLabel(c.confidence),
          luteal,
        })
      );
    });
  }

  // -- Cycle history -----------------------------------------------
  out.push(section(t("report.cycleHistory")));
  const sortedCycles = [...cycles]
    .filter((c) => c?.start_date)
    .sort((a, b) => dayjs(b.start_date).diff(dayjs(a.start_date)));
  if (sortedCycles.length === 0) {
    out.push(t("report.noEntries"));
  } else {
    sortedCycles.forEach((c, i) => {
      out.push(t("report.cycleLine", { index: i + 1, start: fmt(c.start_date), cycle: c.cycle_length || "—", period: c.period_length || "—" }));
    });
  }

  // -- LH tests ------------------------------------------------------
  const lhLogs = sortedByDate(logs, "lh_test");
  out.push(section(t("report.lhTests")));
  if (lhLogs.length === 0) out.push(t("report.noEntries"));
  else lhLogs.forEach((l) => out.push(`${fmt(l.date)}: ${l.value?.result ? lhLabel(l.value.result) : "—"}`));

  // -- BBT -----------------------------------------------------------
  const bbtLogs = sortedByDate(logs, "bbt");
  out.push(section(t("report.bbt")));
  if (bbtLogs.length === 0) out.push(t("report.noEntries"));
  else bbtLogs.forEach((l) => out.push(`${fmt(l.date)}: ${l.value?.temp ?? "—"}`));

  // -- Mucus ---------------------------------------------------------
  const mucusLogs = sortedByDate(logs, "cervical_mucus");
  out.push(section(t("report.mucus")));
  if (mucusLogs.length === 0) out.push(t("report.noEntries"));
  else mucusLogs.forEach((l) => out.push(`${fmt(l.date)}: ${l.value?.mucus ? mucusLabel(l.value.mucus) : "—"}`));

  // -- Symptoms ------------------------------------------------------
  const symptomLogs = sortedByDate(logs, "ovulation_symptom");
  out.push(section(t("report.ovulationSigns")));
  if (symptomLogs.length === 0) out.push(t("report.noEntries"));
  else {
    symptomLogs.forEach((l) => {
      const labels = (l.value?.symptoms || []).map(symptomLabel).join(", ");
      out.push(`${fmt(l.date)}: ${labels || "—"}`);
    });
  }

  // -- Supplements ---------------------------------------------------
  const supplementLogs = sortedByDate(logs, "supplement");
  out.push(section(t("report.supplements")));
  if (supplementLogs.length === 0) out.push(t("report.noEntries"));
  else {
    supplementLogs.forEach((l) => {
      const labels = (l.value?.taken || []).map(supplementLabel).join(", ");
      out.push(`${fmt(l.date)}: ${labels || "—"}`);
    });
  }

  out.push(section(t("report.note")));
  out.push(t("report.noteLine1"));
  out.push(t("report.noteLine2"));
  out.push(t("report.generatedBy"));

  return out.join("\n");
}

// Estimated due date from the last menstrual period (Naegele: LMP + 280 days).
export function calculateDueDate(lastPeriodDate) {
  if (!lastPeriodDate) return null;
  const lmp = dayjs(lastPeriodDate).startOf("day");
  if (!lmp.isValid()) return null;
  return lmp.add(280, "day");
}

// What the "ორსულად ვარ" confirmation should tell the user before switching.
export function buildPregnancyTransition(lastPeriodDate, referenceDate = dayjs()) {
  const lmp = lastPeriodDate ? dayjs(lastPeriodDate).startOf("day") : null;
  if (!lmp || !lmp.isValid()) return null;

  const today = dayjs(referenceDate).startOf("day");
  const dueDate = calculateDueDate(lastPeriodDate);
  const daysPregnant = today.diff(lmp, "day");
  const currentWeek = Math.max(1, Math.min(Math.floor(daysPregnant / 7) + 1, 40));

  return {
    lmp,
    dueDate,
    currentWeek,
    daysRemaining: Math.max(0, 280 - daysPregnant),
    // A "pregnancy" starting from an LMP that is too recent or absurdly old is
    // almost certainly the wrong date — let the UI ask before committing.
    isPlausible: daysPregnant >= 14 && daysPregnant <= 280,
  };
}
