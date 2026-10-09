import type { Lang } from "./i18n";
import type { Specialty } from "./geo";

export type AnStatus = "normal" | "low" | "high" | "critical" | "unknown";

export type AnItem = {
  name: string;
  value: number | null;
  value_text: string;
  unit: string;
  ref_low: number | null;
  ref_high: number | null;
  ref_text: string;
  status: AnStatus;
  explanation: string;
};

export type Analysis = {
  readable: boolean;
  lab: string | null;
  items: AnItem[];
  summary: string;
  doctor: Specialty;
  doctor_reason: string;
  questions: string[];
  urgent: boolean;
};

type Tri = Record<Lang, string>;
type Row = [string, number, string, number, number, AnStatus, Tri];

// Namuna qiymatlari to'qib chiqarilgan; me'yorlar taxminiy, kattalar uchun.
function build(rows: Row[], rest: Record<Lang, Omit<Analysis, "items" | "readable" | "lab">>, lab: string) {
  return (lang: Lang): Analysis => ({
    readable: true,
    lab,
    items: rows.map(([name, value, unit, lo, hi, status, exp]) => ({
      name,
      value,
      value_text: String(value),
      unit,
      ref_low: lo,
      ref_high: hi,
      ref_text: `${lo}–${hi}`,
      status,
      explanation: exp[lang],
    })),
    ...rest[lang],
  });
}

export const SAMPLE_CBC = build(
  [
    ["Gemoglobin (HGB)", 108, "g/L", 120, 150, "low", {
      uz: "Qondagi kislorod tashuvchi oqsil. Biroz past — ko'pincha temir tanqisligi bilan bog'liq, shifokor sababini aniqlaydi.",
      ru: "Белок, который переносит кислород. Немного снижен — часто это связано с нехваткой железа, причину уточнит врач.",
      en: "The protein that carries oxygen. Slightly low, often linked to low iron; a doctor will check why.",
    }],
    ["Eritrotsitlar (RBC)", 4.1, "10¹²/L", 3.8, 5.1, "normal", {
      uz: "Qizil qon tanachalari soni. Me'yorda.",
      ru: "Количество красных кровяных клеток. В норме.",
      en: "Red blood cell count. Within range.",
    }],
    ["Leykotsitlar (WBC)", 6.4, "10⁹/L", 4, 9, "normal", {
      uz: "Oq qon tanachalari — immunitet hujayralari. Me'yorda, faol yallig'lanish belgisi yo'q.",
      ru: "Белые кровяные клетки, отвечают за иммунитет. В норме, признаков активного воспаления нет.",
      en: "White cells of the immune system. Normal, no sign of active inflammation.",
    }],
    ["Trombotsitlar (PLT)", 265, "10⁹/L", 180, 320, "normal", {
      uz: "Qon ivishiga javob beradigan hujayralar. Me'yorda.",
      ru: "Клетки, которые отвечают за свёртывание крови. В норме.",
      en: "Cells that help blood clot. Within range.",
    }],
    ["MCV", 76, "fL", 80, 100, "low", {
      uz: "Eritrotsitning o'rtacha hajmi. Past bo'lsa, hujayralar mayda — bu ham temir tanqisligiga ishora qilishi mumkin.",
      ru: "Средний объём эритроцита. Низкий — клетки мелкие, это тоже может указывать на нехватку железа.",
      en: "Average size of red cells. Low means small cells, which can also point to low iron.",
    }],
    ["ECHT (ESR)", 12, "mm/h", 2, 20, "normal", {
      uz: "Eritrotsitlarning cho'kish tezligi. Me'yorda.",
      ru: "Скорость оседания эритроцитов. В норме.",
      en: "Erythrocyte sedimentation rate. Within range.",
    }],
  ],
  {
    uz: {
      summary: "Gemoglobin va MCV biroz past, qolganlari me'yorda. Bu manzara ko'pincha temir tanqisligida uchraydi.",
      doctor: "therapist",
      doctor_reason: "Terapevt ferritin tahlilini buyurib, sababini aniqlaydi.",
      questions: [
        "Ferritin va temir tahlilini topshirishim kerakmi?",
        "Holsizlik shu natijalar bilan bog'liqmi?",
        "Qachon qayta tekshirish kerak?",
      ],
      urgent: false,
    },
    ru: {
      summary: "Гемоглобин и MCV немного снижены, остальное в норме. Такая картина часто бывает при нехватке железа.",
      doctor: "therapist",
      doctor_reason: "Терапевт назначит анализ на ферритин и выяснит причину.",
      questions: [
        "Нужно ли сдать ферритин и сывороточное железо?",
        "Может ли слабость быть связана с этими результатами?",
        "Когда пересдать анализ?",
      ],
      urgent: false,
    },
    en: {
      summary: "Haemoglobin and MCV are slightly low, the rest is normal. This pattern is common with low iron.",
      doctor: "therapist",
      doctor_reason: "A GP can order a ferritin test and find the cause.",
      questions: [
        "Should I test ferritin and serum iron?",
        "Could my tiredness be related to these results?",
        "When should I repeat the test?",
      ],
      urgent: false,
    },
  },
  "Namuna · Sample",
);

export const SAMPLE_THYROID = build(
  [
    ["TTG (TSH)", 6.8, "mIU/L", 0.4, 4.0, "high", {
      uz: "Gipofiz qalqonsimon bezni «undovchi» gormon. Yuqori bo'lsa, bez sustroq ishlayotgan bo'lishi mumkin.",
      ru: "Гормон гипофиза, который «подгоняет» щитовидную железу. Повышен — железа может работать слабее.",
      en: "The pituitary hormone that drives the thyroid. High can mean the thyroid is underactive.",
    }],
    ["T4 erkin (FT4)", 11.2, "pmol/L", 10, 22, "normal", {
      uz: "Qalqonsimon bezning asosiy gormoni. Me'yorning pastki chegarasida.",
      ru: "Основной гормон щитовидной железы. У нижней границы нормы.",
      en: "The main thyroid hormone. At the lower edge of the range.",
    }],
    ["AT-TPO (Anti-TPO)", 142, "IU/mL", 0, 34, "high", {
      uz: "Bezga qarshi antitelalar. Yuqori bo'lsa, autoimmun jarayon ehtimoli bor — endokrinolog baholaydi.",
      ru: "Антитела к ферменту щитовидной железы. Повышены — возможен аутоиммунный процесс, оценит эндокринолог.",
      en: "Antibodies against a thyroid enzyme. High suggests a possible autoimmune process; an endocrinologist will assess it.",
    }],
  ],
  {
    uz: {
      summary: "TTG va AT-TPO yuqori, T4 me'yorda. Bezning ishini endokrinolog ko'rib chiqishi kerak.",
      doctor: "endocrinologist",
      doctor_reason: "Qalqonsimon bez gormonlari va antitelalar endokrinolog sohasi.",
      questions: [
        "Qalqonsimon bez UZI kerakmi?",
        "Tahlillarni qachon takrorlash kerak?",
        "Bu natijalar homiladorlik rejasiga ta'sir qiladimi?",
      ],
      urgent: false,
    },
    ru: {
      summary: "ТТГ и АТ-ТПО повышены, Т4 в норме. Работу железы должен оценить эндокринолог.",
      doctor: "endocrinologist",
      doctor_reason: "Гормоны щитовидной железы и антитела — это область эндокринолога.",
      questions: [
        "Нужно ли УЗИ щитовидной железы?",
        "Когда повторить анализы?",
        "Влияют ли эти результаты на планирование беременности?",
      ],
      urgent: false,
    },
    en: {
      summary: "TSH and Anti-TPO are high, FT4 is normal. An endocrinologist should look at thyroid function.",
      doctor: "endocrinologist",
      doctor_reason: "Thyroid hormones and antibodies are an endocrinologist's field.",
      questions: [
        "Do I need a thyroid ultrasound?",
        "When should I repeat these tests?",
        "Do these results affect pregnancy planning?",
      ],
      urgent: false,
    },
  },
  "Namuna · Sample",
);
