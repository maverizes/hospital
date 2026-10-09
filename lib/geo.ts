import type { TKey } from "./i18n";

export type LatLon = { lat: number; lon: number };

export type PlaceKind = "hospital" | "clinic" | "doctors" | "dentist" | "pharmacy";

export type Place = {
  id: string;
  kind: PlaceKind;
  lat: number;
  lon: number;
  name: string | null;
  names: { uz?: string; ru?: string; en?: string };
  address: string | null;
  phone: string | null;
  website: string | null;
  hours: string | null;
  emergency: boolean;
  speciality: string | null;
};

export type RouteMode = "car" | "foot" | "bike";

export type RouteStep = {
  type: string;
  modifier: string | null;
  exit: number | null;
  street: string;
  distance: number;
  duration: number;
};

export type RouteResult = {
  distance: number;
  duration: number;
  coords: [number, number][];
  steps: RouteStep[];
};

export const TASHKENT: LatLon = { lat: 41.3111, lon: 69.2797 };

export const SPECIALTIES = [
  "therapist",
  "pediatrician",
  "cardiologist",
  "endocrinologist",
  "gynecologist",
  "neurologist",
  "ent",
  "dentist",
  "lab",
] as const;
export type Specialty = (typeof SPECIALTIES)[number];

// Taxminiy narxlar, so'm. Haqiqiy narxni klinika tasdiqlaydi.
export const SPEC_PRICE: Record<Specialty, number> = {
  therapist: 150_000,
  pediatrician: 150_000,
  cardiologist: 250_000,
  endocrinologist: 250_000,
  gynecologist: 220_000,
  neurologist: 230_000,
  ent: 180_000,
  dentist: 200_000,
  lab: 90_000,
};

export function specKey(s: Specialty): TKey {
  return `spec_${s}` as TKey;
}

export function haversine(a: LatLon, b: LatLon): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bearing(a: LatLon, b: LatLon): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/* ---------- opening_hours: keng tarqalgan shakllar uchun soddalashtirilgan tahlil ---------- */

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function parseDays(spec: string): Set<number> | null {
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    const p = part.trim();
    if (p === "PH") continue;
    const m = p.match(/^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/);
    if (!m) return null;
    const a = DAYS.indexOf(m[1]);
    const b = m[2] ? DAYS.indexOf(m[2]) : a;
    for (let i = a; ; i = (i + 1) % 7) {
      out.add(i);
      if (i === b) break;
    }
  }
  return out;
}

export type OpenState = "open" | "closed" | "always" | "unknown";

/** Returns whether the place is open at `now`, or "unknown" when the tag can't be read. */
export function openState(hours: string | null, now = new Date()): OpenState {
  if (!hours) return "unknown";
  const h = hours.trim();
  if (h === "24/7" || h === "Mo-Su 00:00-24:00") return "always";
  const today = (now.getDay() + 6) % 7; // Mo=0
  const minutes = now.getHours() * 60 + now.getMinutes();
  let matchedDay = false;
  let open = false;
  for (const rawRule of h.split(";")) {
    const rule = rawRule.trim();
    if (!rule) continue;
    const m = rule.match(/^(?:([A-Za-z,\- ]+?)\s+)?((?:\d{1,2}:\d{2}-\d{1,2}:\d{2}(?:,\s*)?)+|off|closed)$/);
    if (!m) return "unknown";
    const days = m[1] ? parseDays(m[1].replace(/\s/g, "")) : new Set([0, 1, 2, 3, 4, 5, 6]);
    if (!days) return "unknown";
    if (!days.has(today)) continue;
    // Keyingi qoida oldingisini shu kun uchun almashtiradi (OSM semantikasi)
    matchedDay = true;
    open = false;
    if (m[2] === "off" || m[2] === "closed") continue;
    for (const range of m[2].split(",")) {
      const [from, to] = range.trim().split("-");
      const [fh, fm] = from.split(":").map(Number);
      const [th, tm] = to.split(":").map(Number);
      const a = fh * 60 + fm;
      const b = th * 60 + tm;
      if (b > a ? minutes >= a && minutes < b : minutes >= a || minutes < b) open = true;
    }
  }
  if (!matchedDay) return "closed";
  return open ? "open" : "closed";
}
