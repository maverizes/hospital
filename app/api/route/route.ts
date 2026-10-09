import { NextResponse } from "next/server";
import type { RouteResult, RouteStep } from "@/lib/geo";
import { OSM_UA, num } from "@/lib/osm";

// routing.openstreetmap.de mashina, piyoda va velosiped profillarini beradi;
// mashina uchun zaxira — OSRM demo serveri.
const PROFILES: Record<string, string[]> = {
  car: [
    "https://routing.openstreetmap.de/routed-car/route/v1/driving",
    "https://router.project-osrm.org/route/v1/driving",
  ],
  foot: ["https://routing.openstreetmap.de/routed-foot/route/v1/foot"],
  bike: ["https://routing.openstreetmap.de/routed-bike/route/v1/bike"],
};

type OsrmStep = {
  distance: number;
  duration: number;
  name: string;
  ref?: string;
  maneuver: { type: string; modifier?: string; exit?: number };
};
type OsrmRoute = {
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
  legs: { steps: OsrmStep[] }[];
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const fromLat = num(searchParams.get("fromLat"), -90, 90);
  const fromLon = num(searchParams.get("fromLon"), -180, 180);
  const toLat = num(searchParams.get("toLat"), -90, 90);
  const toLon = num(searchParams.get("toLon"), -180, 180);
  const mode = searchParams.get("mode") || "car";
  const bases = PROFILES[mode];
  if (fromLat === null || fromLon === null || toLat === null || toLon === null || !bases) {
    return NextResponse.json({ error: "bad params" }, { status: 400 });
  }
  const coords = `${fromLon},${fromLat};${toLon},${toLat}`;
  let lastError = "";
  for (const base of bases) {
    try {
      const res = await fetch(`${base}/${coords}?overview=full&geometries=geojson&steps=true`, {
        headers: { "User-Agent": OSM_UA },
        signal: AbortSignal.timeout(15000),
        next: { revalidate: 600 },
      });
      if (!res.ok) {
        lastError = `${res.status}`;
        continue;
      }
      const data = (await res.json()) as { code: string; routes?: OsrmRoute[] };
      const r = data.routes?.[0];
      if (data.code !== "Ok" || !r) {
        lastError = data.code;
        continue;
      }
      const steps: RouteStep[] = r.legs.flatMap((leg) =>
        leg.steps.map((s) => ({
          type: s.maneuver.type,
          modifier: s.maneuver.modifier ?? null,
          exit: s.maneuver.exit ?? null,
          street: s.name || s.ref || "",
          distance: s.distance,
          duration: s.duration,
        })),
      );
      const out: RouteResult = {
        distance: r.distance,
        duration: r.duration,
        // GeoJSON [lon, lat] → Leaflet [lat, lon]
        coords: r.geometry.coordinates.map(([lo, la]) => [la, lo]),
        steps,
      };
      return NextResponse.json(out);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  return NextResponse.json({ error: "routing unavailable", detail: lastError }, { status: 502 });
}
