import { NextResponse } from "next/server";
import { OSM_UA, num } from "@/lib/osm";

const NOMINATIM = "https://nominatim.openstreetmap.org";

// ?q=manzil → koordinata (O'zbekiston bo'yicha); ?lat&lon → manzil matni
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lang = (searchParams.get("lang") || "ru").slice(0, 2);
  const q = searchParams.get("q");
  const headers = { "User-Agent": OSM_UA, "Accept-Language": `${lang},ru;q=0.8,en;q=0.5` };

  try {
    if (q) {
      const url = `${NOMINATIM}/search?format=jsonv2&limit=1&countrycodes=uz&q=${encodeURIComponent(q.slice(0, 200))}`;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000), next: { revalidate: 86400 } });
      const data = (await res.json()) as { lat: string; lon: string; display_name: string }[];
      if (!data[0]) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json({ lat: Number(data[0].lat), lon: Number(data[0].lon), label: data[0].display_name });
    }
    const lat = num(searchParams.get("lat"), -90, 90);
    const lon = num(searchParams.get("lon"), -180, 180);
    if (lat === null || lon === null) return NextResponse.json({ error: "bad params" }, { status: 400 });
    const url = `${NOMINATIM}/reverse?format=jsonv2&zoom=17&lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000), next: { revalidate: 86400 } });
    const data = (await res.json()) as {
      address?: Record<string, string>;
      display_name?: string;
    };
    const a = data.address || {};
    const label =
      [a.road, a.house_number].filter(Boolean).join(", ") ||
      a.neighbourhood ||
      a.suburb ||
      data.display_name?.split(",").slice(0, 2).join(",") ||
      null;
    const area = a.city_district || a.suburb || a.city || null;
    return NextResponse.json({ label, area });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
