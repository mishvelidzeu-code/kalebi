import dayjs from "dayjs";

// Builds a plain-text fertility report the user can hand to a doctor.
// Pure string building — the screen handles writing/sharing the file.

const LH_LABELS = {
  negative: "უარყოფითი",
  weak: "სუსტი დადებითი",
  positive: "დადებითი",
  peak: "პიკი",
};

const MUCUS_LABELS = {
  dry: "მშრალი",
  sticky: "წებოვანი",
  creamy: "კრემისებრი",
  watery: "წყლიანი",
  eggwhite: "კვერცხის ცილა",
};

const SYMPTOM_LABELS = {
  cramps: "მუცლის ტკივილი",
  breast: "მკერდის მგრძნობელობა",
  libido: "ლიბიდოს ცვლილება",
  fatigue: "დაღლილობა",
  nausea: "გულისრევა",
  energy: "ენერგიის მომატება",
};

const SUPPLEMENT_LABELS = {
  folic: "ფოლიუმის მჟავა",
  vitamin_d: "ვიტამინი D",
  omega3: "ომეგა 3",
  iron: "რკინა",
  iodine: "იოდი",
  other: "სხვა",
};

const METHOD_LABELS = { bbt: "ტემპერატურა", lh: "ოვულაციის ტესტი", mucus: "ლორწო" };
const CONFIDENCE_LABELS = { high: "მაღალი", medium: "საშუალო", low: "დაბალი" };

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

  out.push("ნაყოფიერების ანგარიში / FERTILITY REPORT");
  out.push("=".repeat(42));
  out.push(line("მომხმარებელი", userName || "—"));
  if (age != null) out.push(line("ასაკი", `${age}`));
  out.push(line("ანგარიშის თარიღი", fmt(dayjs())));

  // -- Summary ------------------------------------------------------
  out.push(section("შეჯამება"));
  if (trying) {
    out.push(line("მცდელობის ხანგრძლივობა", `${trying.monthsTrying} თვე`));
    out.push(line("აღრიცხული ციკლები", `${trying.cyclesCount}`));
  }
  if (regularity?.sampleSize > 0) {
    out.push(line("საშუალო ციკლი", `${regularity.avgCycle} დღე`));
    out.push(line("ციკლების დიაპაზონი", `${regularity.shortest}–${regularity.longest} დღე (სხვაობა ${regularity.spread})`));
    out.push(line("რეგულარულობა", regularity.isRegular ? "რეგულარული" : "არარეგულარული"));
  } else {
    out.push("ციკლის რეგულარულობის შესაფასებლად საკმარისი მონაცემი არ არის.");
  }
  if (lutealLength) {
    out.push(line("ლუტეალური ფაზა (გაზომილი)", `${lutealLength.days} დღე, ${lutealLength.sampleSize} ციკლის მიხედვით`));
  }
  if (logSummary) {
    out.push(line("ურთიერთობა ნაყოფიერ ფანჯარაში", `${logSummary.intercourseInFertile} / ${logSummary.intercourseCount}`));
    out.push(line("დადებითი ოვულაციის ტესტები", `${logSummary.lhPositiveCount} / ${logSummary.lhTestCount}`));
    out.push(line("ტემპერატურის ჩანაწერები", `${logSummary.bbtCount}`));
  }

  // -- Confirmed ovulations ----------------------------------------
  out.push(section("დადასტურებული ოვულაციები (ნიშნების მიხედვით)"));
  if (confirmations.length === 0) {
    out.push("ოვულაცია ჩანაწერებით ჯერ არ დადასტურებულა.");
  } else {
    confirmations.forEach((c, i) => {
      const methods = c.methods.map((m) => METHOD_LABELS[m] || m).join(" + ");
      const luteal = c.lutealLength != null ? `, ლუტეალური ფაზა ${c.lutealLength} დღე` : "";
      out.push(
        `${i + 1}. ${fmt(c.ovulationDate)} — ციკლის ${c.cycleDay}-ე დღე (${methods}; სანდოობა: ${CONFIDENCE_LABELS[c.confidence] || c.confidence}${luteal})`
      );
    });
  }

  // -- Cycle history -----------------------------------------------
  out.push(section("ციკლების ისტორია"));
  const sortedCycles = [...cycles]
    .filter((c) => c?.start_date)
    .sort((a, b) => dayjs(b.start_date).diff(dayjs(a.start_date)));
  if (sortedCycles.length === 0) {
    out.push("ჩანაწერი არ არის.");
  } else {
    sortedCycles.forEach((c, i) => {
      out.push(`${i + 1}. დაწყება: ${fmt(c.start_date)} | ხანგრძლივობა: ${c.cycle_length || "—"} დღე | მენსტრუაცია: ${c.period_length || "—"} დღე`);
    });
  }

  // -- LH tests ------------------------------------------------------
  const lhLogs = sortedByDate(logs, "lh_test");
  out.push(section("ოვულაციის ტესტები"));
  if (lhLogs.length === 0) out.push("ჩანაწერი არ არის.");
  else lhLogs.forEach((l) => out.push(`${fmt(l.date)}: ${LH_LABELS[l.value?.result] || l.value?.result || "—"}`));

  // -- BBT -----------------------------------------------------------
  const bbtLogs = sortedByDate(logs, "bbt");
  out.push(section("ბაზალური ტემპერატურა (°C)"));
  if (bbtLogs.length === 0) out.push("ჩანაწერი არ არის.");
  else bbtLogs.forEach((l) => out.push(`${fmt(l.date)}: ${l.value?.temp ?? "—"}`));

  // -- Mucus ---------------------------------------------------------
  const mucusLogs = sortedByDate(logs, "cervical_mucus");
  out.push(section("საშვილოსნოს ყელის ლორწო"));
  if (mucusLogs.length === 0) out.push("ჩანაწერი არ არის.");
  else mucusLogs.forEach((l) => out.push(`${fmt(l.date)}: ${MUCUS_LABELS[l.value?.mucus] || l.value?.mucus || "—"}`));

  // -- Symptoms ------------------------------------------------------
  const symptomLogs = sortedByDate(logs, "ovulation_symptom");
  out.push(section("ოვულაციის ნიშნები"));
  if (symptomLogs.length === 0) out.push("ჩანაწერი არ არის.");
  else {
    symptomLogs.forEach((l) => {
      const labels = (l.value?.symptoms || []).map((s) => SYMPTOM_LABELS[s] || s).join(", ");
      out.push(`${fmt(l.date)}: ${labels || "—"}`);
    });
  }

  // -- Supplements ---------------------------------------------------
  const supplementLogs = sortedByDate(logs, "supplement");
  out.push(section("ვიტამინები და დამატებები"));
  if (supplementLogs.length === 0) out.push("ჩანაწერი არ არის.");
  else {
    supplementLogs.forEach((l) => {
      const labels = (l.value?.taken || []).map((s) => SUPPLEMENT_LABELS[s] || s).join(", ");
      out.push(`${fmt(l.date)}: ${labels || "—"}`);
    });
  }

  out.push(section("შენიშვნა"));
  out.push("ეს ანგარიში მომხმარებლის მიერ აპში შეყვანილ ჩანაწერებს ეფუძნება.");
  out.push("ოვულაციის შეფასება რეტროსპექტულია და არ წარმოადგენს სამედიცინო დასკვნას.");
  out.push("გენერირებულია: Cycle Care");

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
