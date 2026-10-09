import { NextResponse } from "next/server";
import type { Place, PlaceKind } from "@/lib/geo";
import { OSM_UA, num } from "@/lib/osm";

// Overpass — asosiy manba (ish vaqti, telefon, bo'limlar). Band bo'lsa — Nominatim zaxirasi.
const ENDPOINTS: [string, number][] = [
  ["https://overpass-api.de/api/interpreter", 6000],
  ["https://overpass.private.coffee/api/interpreter", 3000],
];
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const KINDS: PlaceKind[] = ["hospital", "clinic", "doctors", "dentist", "pharmacy"];

type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function kindOf(tags: Record<string, string>): PlaceKind | null {
  const a = tags.amenity;
  if (a === "hospital" || a === "clinic" || a === "doctors" || a === "dentist" || a === "pharmacy") return a;
  if (tags.healthcare === "hospital") return "hospital";
  if (tags.healthcare === "clinic" || tags.healthcare === "centre") return "clinic";
  if (tags.healthcare === "dentist") return "dentist";
  return null;
}

function addressOf(t: Record<string, string>): string | null {
  if (t["addr:full"]) return t["addr:full"];
  const street = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(", ");
  const parts = [street, t["addr:district"] || t["addr:suburb"]].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

function normalize(el: OsmElement): Place | null {
  const t = el.tags || {};
  const kind = kindOf(t);
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (!kind || lat === undefined || lon === undefined) return null;
  return {
    id: `${el.type[0]}${el.id}`,
    kind,
    lat,
    lon,
    name: t.name || t["name:ru"] || t["name:uz"] || t["name:en"] || null,
    names: { uz: t["name:uz"], ru: t["name:ru"], en: t["name:en"] },
    address: addressOf(t),
    phone: t.phone || t["contact:phone"] || null,
    website: t.website || t["contact:website"] || null,
    hours: t.opening_hours || null,
    emergency: t.emergency === "yes",
    speciality: t["healthcare:speciality"] || null,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = num(searchParams.get("lat"), -90, 90);
  const lon = num(searchParams.get("lon"), -180, 180);
  const r = num(searchParams.get("r"), 200, 15000) ?? 3000;
  if (lat === null || lon === null) {
    return NextResponse.json({ error: "lat/lon required" }, { status: 400 });
  }
  // 4 xonagacha yaxlitlash (~10 m) — kesh samaraliroq ishlaydi
  const la = lat.toFixed(4);
  const lo = lon.toFixed(4);
  const around = `(around:${Math.round(r)},${la},${lo})`;
  const query = `[out:json][timeout:20];
(
  nwr["amenity"~"^(hospital|clinic|doctors|dentist|pharmacy)$"]${around};
  nwr["healthcare"~"^(hospital|clinic|centre|dentist)$"]${around};
);
out center tags 400;`;

  let lastError = "";
  for (const [url, timeout] of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": OSM_UA },
        body: "data=" + encodeURIComponent(query),
        signal: AbortSignal.timeout(timeout),
        next: { revalidate: 3600 },
      });
      if (!res.ok) {
        lastError = `${url} → ${res.status}`;
        continue;
      }
      const data = (await res.json()) as { elements?: OsmElement[] };
      return ok(dedupe((data.elements || []).map(normalize)), new URL(url).host);
    } catch (e) {
      lastError = `${url} → ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  try {
    const places = await fromNominatim(lat, lon, r, req.headers.get("accept-language"));
    if (places.length) return ok(places, "nominatim.openstreetmap.org");
  } catch (e) {
    lastError += ` · nominatim → ${e instanceof Error ? e.message : String(e)}`;
  }
  return NextResponse.json({ error: "osm unavailable", detail: lastError }, { status: 502 });
}

function ok(places: Place[], source: string) {
  return NextResponse.json(
    { places, source },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}

function dedupe(list: (Place | null)[]): Place[] {
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const p of list) {
    if (!p) continue;
    // Bir bino ham node, ham way bo'lib kelishi mumkin — nom+koordinata bo'yicha takrorni olib tashlaymiz
    const key = `${p.name ?? ""}|${p.lat.toFixed(3)}|${p.lon.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

type NomItem = {
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  name: string;
  address?: Record<string, string>;
  extratags?: Record<string, string> | null;
  namedetails?: Record<string, string> | null;
};

// Nominatim qoidasi: soniyasiga 1 so'rov — turlarni ketma-ket, oraliq bilan so'raymiz
async function fromNominatim(lat: number, lon: number, r: number, lang: string | null): Promise<Place[]> {
  const dLat = r / 111320;
  const dLon = r / (111320 * Math.cos((lat * Math.PI) / 180));
  const viewbox = [lon - dLon, lat + dLat, lon + dLon, lat - dLat].map((x) => x.toFixed(5)).join(",");
  const out: (Place | null)[] = [];
  for (let i = 0; i < KINDS.length; i++) {
    if (i) await new Promise((res) => setTimeout(res, 1100));
    const kind = KINDS[i];
    const url = `${NOMINATIM}?format=jsonv2&amenity=${kind}&viewbox=${viewbox}&bounded=1&limit=40&extratags=1&namedetails=1&addressdetails=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": OSM_UA, "Accept-Language": lang || "ru,uz;q=0.8,en;q=0.5" },
      signal: AbortSignal.timeout(10000),
      next: { revalidate: 3600 },
    });
    if (!res.ok) continue;
    for (const x of (await res.json()) as NomItem[]) {
      const ex = x.extratags || {};
      const nd = x.namedetails || {};
      const a = x.address || {};
      const p: Place = {
        id: `${x.osm_type[0]}${x.osm_id}`,
        kind,
        lat: Number(x.lat),
        lon: Number(x.lon),
        name: nd.name || x.name || null,
        names: { uz: nd["name:uz"], ru: nd["name:ru"], en: nd["name:en"] },
        address:
          [[a.road, a.house_number].filter(Boolean).join(", "), a.suburb || a.city_district]
            .filter(Boolean)
            .join(" · ") || null,
        phone: ex.phone || ex["contact:phone"] || null,
        website: ex.website || ex["contact:website"] || null,
        hours: ex.opening_hours || null,
        emergency: ex.emergency === "yes",
        speciality: ex["healthcare:speciality"] || null,
      };
      // viewbox kvadrat — radius tashqarisidagilarni olib tashlaymiz
      const dy = (p.lat - lat) * 111320;
      const dx = (p.lon - lon) * 111320 * Math.cos((lat * Math.PI) / 180);
      out.push(Math.hypot(dx, dy) <= r ? p : null);
    }
  }
  return dedupe(out);
}
