import { LOCALE, translate, type Lang } from "./i18n";
import type { RouteStep } from "./geo";

export function fmtDist(lang: Lang, m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} ${translate(lang, "m")}`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} ${translate(lang, "km")}`;
}

export function fmtDur(lang: Lang, s: number): string {
  const mins = Math.max(1, Math.round(s / 60));
  if (mins < 60) return `${mins} ${translate(lang, "min")}`;
  return `${Math.floor(mins / 60)} ${translate(lang, "h")} ${mins % 60} ${translate(lang, "min")}`;
}

export function fmtTime(lang: Lang, d: Date): string {
  return d.toLocaleTimeString(LOCALE[lang], { hour: "2-digit", minute: "2-digit", hour12: false });
}

const UZ_MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const UZ_MONTHS_SHORT = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];
const UZ_DAYS = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];
const UZ_DAYS_SHORT = ["Ya", "Du", "Se", "Ch", "Pa", "Ju", "Sh"];

export function fmtDate(lang: Lang, d: Date, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" }) {
  if (lang !== "uz") return d.toLocaleDateString(LOCALE[lang], opts);
  // Ko'p brauzerlarda uz-UZ uchun ICU ma'lumoti yo'q va inglizcha chiqadi — o'zimiz formatlaymiz
  const parts: string[] = [];
  if (opts.weekday) parts.push(opts.weekday === "long" ? UZ_DAYS[d.getDay()] : UZ_DAYS_SHORT[d.getDay()]);
  const m = opts.month === "short" ? UZ_MONTHS_SHORT[d.getMonth()] : UZ_MONTHS[d.getMonth()];
  if (opts.day && opts.month) parts.push(`${d.getDate()}-${m}`);
  else if (opts.month) parts.push(m);
  if (opts.year) parts.push(String(d.getFullYear()));
  return parts.join(", ");
}

export function fmtSum(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** OSRM manevrini tanlangan tilda o'qiladigan matnga aylantiradi. */
export function stepText(lang: Lang, s: RouteStep): string {
  const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate(lang, k, v);
  let head: string;
  switch (s.type) {
    case "depart":
      head = t("st_depart");
      break;
    case "arrive":
      return t("st_arrive");
    case "roundabout":
    case "rotary":
    case "exit roundabout":
    case "exit rotary":
      head = t("st_roundabout", { n: s.exit ?? 1 });
      break;
    case "merge":
      head = t("st_merge");
      break;
    case "fork":
      head = s.modifier?.includes("left") ? t("st_fork_left") : t("st_fork_right");
      break;
    default: {
      const m = s.modifier;
      if (s.type === "continue" || s.type === "new name" || m === "straight" || !m) head = t("st_continue");
      else if (m === "uturn") head = t("st_uturn");
      else if (m === "left") head = t("st_left");
      else if (m === "right") head = t("st_right");
      else if (m === "slight left") head = t("st_slight_left");
      else if (m === "slight right") head = t("st_slight_right");
      else if (m === "sharp left") head = t("st_sharp_left");
      else if (m === "sharp right") head = t("st_sharp_right");
      else head = t("st_continue");
    }
  }
  if (!s.street) return head;
  const isStraight = head === t("st_continue") || s.type === "depart";
  return `${head} ${t(isStraight ? "st_along" : "st_onto", { street: s.street })}`;
}

export function stepIcon(s: RouteStep): number {
  // Strelka burchagi, gradus (0 = yuqoriga)
  if (s.type === "arrive") return -1;
  switch (s.modifier) {
    case "left":
      return -90;
    case "right":
      return 90;
    case "slight left":
      return -45;
    case "slight right":
      return 45;
    case "sharp left":
      return -135;
    case "sharp right":
      return 135;
    case "uturn":
      return 180;
    default:
      return 0;
  }
}
