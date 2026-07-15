import dayjs from "dayjs";

// Contextual recommendations, doctor-visit signals and partner/lifestyle
// content for fertility ("მინდა დაორსულება") mode. Pure functions.
//
// Deliberately conservative: these are informational nudges, never diagnoses,
// and nothing here promises a conception outcome.

export const MUCUS_HINTS = {
  dry: "მშრალი ლორწო ჩვეულებრივ ნაკლებად ნაყოფიერ დღეს ახასიათებს.",
  sticky: "წებოვანი ლორწო — ნაყოფიერება ჯერ დაბალია, მაგრამ იზრდება.",
  creamy: "კრემისებრი ლორწო — ნაყოფიერი ფანჯარა უახლოვდება.",
  watery: "წყლიანი ლორწო — ნაყოფიერება მაღალია, ოვულაცია ახლოსაა.",
  eggwhite: "კვერცხის ცილის მსგავსი ლორწო ყველაზე ნაყოფიერი ნიშანია — ოვულაცია სავარაუდოდ ძალიან ახლოსაა.",
};

export const PARTNER_TIPS = [
  { id: "together", icon: "🤝", title: "ერთად ხართ ამ გზაზე", text: "მცდელობა ორივესთვის ემოციურად დამღლელია. ისაუბრეთ ღიად და ნუ აქცევთ ინტიმს მხოლოდ „დავალებად“." },
  { id: "pressure", icon: "💗", title: "ნაკლები წნეხი", text: "მკაცრი გრაფიკი სტრესს მატებს. ნაყოფიერ ფანჯარაში ყოველ მეორე დღეს ურთიერთობა სავსებით საკმარისია." },
  { id: "checkup", icon: "🩺", title: "შემოწმება ორივეს ეხება", text: "შემთხვევათა დაახლოებით ნახევარში მიზეზი პარტნიორის მხარესაცაა. ერთობლივი გამოკვლევა ნორმალური ნაბიჯია." },
];

export const LIFESTYLE_TIPS = [
  { id: "smoking", icon: "🚭", title: "მოწევა და ალკოჰოლი", text: "მოწევა და ალკოჰოლი ორივე პარტნიორის ნაყოფიერებაზე უარყოფითად მოქმედებს — შემცირება ან შეწყვეტა ეხმარება." },
  { id: "sleep", icon: "😴", title: "ძილი", text: "7–9 საათი რეგულარული ძილი ჰორმონულ ბალანსს უწყობს ხელს." },
  { id: "food", icon: "🥗", title: "კვება", text: "მრავალფეროვანი კვება, საკმარისი ცილა და ფოლიუმის მჟავა — ორსულობამდე რამდენიმე თვით ადრეც მნიშვნელოვანია." },
  { id: "activity", icon: "🏃‍♀️", title: "ფიზიკური აქტივობა", text: "ზომიერი აქტივობა სასარგებლოა; გადამეტებული დატვირთვა კი ციკლს არღვევს." },
];

// Age matters for when specialists suggest seeking help.
export function getAgeFromBirthDate(birthDate) {
  if (!birthDate) return null;
  const born = dayjs(birthDate);
  if (!born.isValid()) return null;
  const age = dayjs().diff(born, "year");
  return age > 0 && age < 120 ? age : null;
}

// Standard guidance: seek help after 12 months of trying (6 if 35+).
export function getTryingThresholdMonths(age) {
  if (age == null) return 12;
  return age >= 35 ? 6 : 12;
}

// Today's contextual tips, driven by what has actually been logged.
export function buildFertilityRecommendations({ forecast, todayLogs = {}, referenceDate = dayjs() } = {}) {
  const tips = [];
  const today = dayjs(referenceDate).startOf("day");
  const ovulation = forecast?.ovulation ? forecast.ovulation.startOf("day") : null;
  const daysToOvulation = ovulation ? ovulation.diff(today, "day") : null;

  const lhResult = todayLogs.lh_test?.result || null;
  const mucus = todayLogs.cervical_mucus?.mucus || null;
  const phaseKey = forecast?.phaseKey || null;

  // 1. LH test result — the strongest same-day signal.
  if (lhResult === "positive" || lhResult === "peak") {
    tips.push({
      id: "lh_positive",
      icon: "🔥",
      title: "დადებითი ოვულაციის ტესტი",
      text: "ოვულაცია ჩვეულებრივ დადებითი ტესტიდან 24–36 საათში ხდება. ეს და მომდევნო დღე ყველაზე ნაყოფიერია.",
    });
  } else if (lhResult === "weak") {
    tips.push({
      id: "lh_weak",
      icon: "🌗",
      title: "სუსტი დადებითი",
      text: "LH იზრდება — განაგრძე ტესტირება ყოველდღე, სანამ მკაფიოდ დადებითს არ დაიჭერ.",
    });
  } else if (lhResult === "negative" && daysToOvulation != null && daysToOvulation <= 5 && daysToOvulation >= 0) {
    tips.push({
      id: "lh_negative",
      icon: "🧪",
      title: "ჯერ უარყოფითია",
      text: "ეს ნორმალურია — ტესტირების ფანჯარაში ხარ. გააგრძელე ყოველდღიური ტესტი, პიკი ჯერ არ დამდგარა.",
    });
  }

  // 2. Cervical mucus.
  if (mucus && MUCUS_HINTS[mucus]) {
    tips.push({ id: `mucus_${mucus}`, icon: "💧", title: "ლორწოს ნიშანი", text: MUCUS_HINTS[mucus] });
  }

  // 3. Cycle-phase framing when there is no stronger signal today.
  if (!lhResult && !mucus && phaseKey) {
    if (phaseKey === "period") {
      tips.push({ id: "phase_period", icon: "🫶", title: "მენსტრუაციის ფაზა", text: "დაისვენე და აღიდგინე ძალები. ახალი ციკლი — ახალი შანსი." });
    } else if (phaseKey === "follicular") {
      tips.push({ id: "phase_follicular", icon: "🌱", title: "ფოლიკულური ფაზა", text: "ენერგია იზრდება. კარგი დროა ვიტამინების რეგულარულად მიღებისა და ძილის რეჟიმის დასალაგებლად." });
    } else if (phaseKey === "fertile") {
      tips.push({ id: "phase_fertile", icon: "🌿", title: "ნაყოფიერი ფანჯარა", text: "ყოველ მეორე დღეს ურთიერთობა ამ ფანჯარაში ოპტიმალურად ზრდის შანსს." });
    } else if (phaseKey === "luteal") {
      tips.push({ id: "phase_luteal", icon: "🍵", title: "ლუტეალური ფაზა", text: "ლოდინის პერიოდია. ადრეული ტესტი ხშირად ცრუ-უარყოფითია — მოითმინე სანდო დღემდე." });
    }
  }

  // 4. Nudge toward BBT if it is not being tracked today.
  if (!todayLogs.bbt) {
    tips.push({
      id: "bbt_missing",
      icon: "🌡️",
      title: "ტემპერატურა ჯერ არ გაქვს",
      text: "ბაზალური ტემპერატურა დროთა განმავლობაში ოვულაციის დადასტურებაში გვეხმარება — დილით, ადგომამდე გაზომე.",
    });
  }

  return tips;
}

// Reasons it may be worth talking to a doctor. Each is informational — the
// copy always frames it as "worth discussing", never as a diagnosis.
export function evaluateDoctorVisitSignals({ regularity, trying, logSummary, age } = {}) {
  const signals = [];
  const threshold = getTryingThresholdMonths(age);

  if (trying?.monthsTrying != null && trying.monthsTrying >= threshold) {
    signals.push({
      id: "duration",
      icon: "⏳",
      title: `${trying.monthsTrying} თვეა ცდილობ`,
      text: age != null && age >= 35
        ? "35+ ასაკში 6 თვის შემდეგ სპეციალისტთან კონსულტაცია ჩვეულებრივი რეკომენდაციაა."
        : "12 თვის შემდეგ სპეციალისტთან კონსულტაცია ჩვეულებრივი რეკომენდაციაა — ეს არ ნიშნავს, რომ პრობლემაა.",
    });
  }

  if (regularity?.isRegular === false) {
    signals.push({
      id: "irregular",
      icon: "🔄",
      title: "ციკლი არარეგულარულია",
      text: `ციკლები ${regularity.shortest}–${regularity.longest} დღეს შორის მერყეობს. ღირს ექიმთან ახსენო — ეს ოვულაციის დაჭერასაც ართულებს.`,
    });
  }

  if (regularity?.avgCycle != null && regularity.sampleSize > 0) {
    if (regularity.avgCycle < 21 || regularity.avgCycle > 35) {
      signals.push({
        id: "cycle_length",
        icon: "📏",
        title: "ციკლის ხანგრძლივობა",
        text: `შენი საშუალო ციკლი ${regularity.avgCycle} დღეა. 21–35 დღის მიღმა ციკლი ღირს ექიმთან განიხილო.`,
      });
    }
  }

  // Testing consistently but never catching a surge is worth mentioning.
  if ((logSummary?.lhTestCount || 0) >= 8 && (logSummary?.lhPositiveCount || 0) === 0) {
    signals.push({
      id: "no_lh_surge",
      icon: "🧪",
      title: "ოვულაციის პიკი ვერ დაფიქსირდა",
      text: "მრავალი ტესტის მიუხედავად დადებითი ჯერ არ ყოფილა. შესაძლოა ტესტის დროა ასაცილებელი, ან ღირს ექიმთან შემოწმება.",
    });
  }

  return signals;
}

// Compact fertility summary injected into the AI context.
export function buildFertilityAiContext({ logSummary, regularity, trying, todayLogs = {}, forecast } = {}) {
  const ovulation = forecast?.ovulation || null;

  return {
    is_fertility_mode: true,
    today: {
      lh_test: todayLogs.lh_test?.result || null,
      bbt_celsius: todayLogs.bbt?.temp ?? null,
      cervical_mucus: todayLogs.cervical_mucus?.mucus || null,
      intercourse_logged: Boolean(todayLogs.intercourse),
      supplements_taken: todayLogs.supplement?.taken || [],
      ovulation_symptoms: todayLogs.ovulation_symptom?.symptoms || [],
    },
    estimated_ovulation_date: ovulation ? ovulation.format("YYYY-MM-DD") : null,
    days_to_ovulation: ovulation ? ovulation.startOf("day").diff(dayjs().startOf("day"), "day") : null,
    cycle_regularity: regularity
      ? {
          average_cycle_days: regularity.avgCycle,
          is_regular: regularity.isRegular,
          prediction_confidence: regularity.accuracyKey,
          cycles_analyzed: regularity.sampleSize,
        }
      : null,
    trying_history: trying
      ? { months_trying: trying.monthsTrying, cycles_tracked: trying.cyclesCount }
      : null,
    tracking_totals: logSummary
      ? {
          intercourse_in_fertile_window: logSummary.intercourseInFertile,
          positive_lh_tests: logSummary.lhPositiveCount,
          bbt_entries: logSummary.bbtCount,
          last_positive_lh: logSummary.lastLhPositive,
        }
      : null,
  };
}
