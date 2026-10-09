// OpenStreetMap xizmatlari qoidasi: User-Agent ilovani aniq ko'rsatishi kerak.
// Nominatim example.com kabi soxta manzillarni bloklaydi — haqiqiy kontaktni OSM_CONTACT ga yozing.
export const OSM_UA = `NavbatFree/0.1 (${process.env.OSM_CONTACT || "+https://github.com/navbat-free"})`;

export function num(v: string | null, min: number, max: number): number | null {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}
