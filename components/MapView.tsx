"use client";

import { useEffect, useRef, useState } from "react";
import type * as L from "leaflet";
import type { LatLon, Place } from "@/lib/geo";

type Props = {
  center: LatLon | null;
  accuracy: number | null;
  radius: number;
  places: Place[];
  selectedId: string | null;
  route: [number, number][] | null;
  dark: boolean;
  youLabel: string;
  onSelect: (id: string) => void;
  onPick: (p: LatLon) => void;
};

// OSM standart plitalari; qat'iy monoxrom ko'rinish CSS filtri bilan beriladi (globals.css)
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export default function MapView(props: Props) {
  const el = useRef<HTMLDivElement>(null);
  const lib = useRef<typeof L | null>(null);
  const map = useRef<L.Map | null>(null);
  const me = useRef<L.LayerGroup | null>(null);
  const pins = useRef<L.LayerGroup | null>(null);
  const line = useRef<L.LayerGroup | null>(null);
  const markerById = useRef(new Map<string, L.Marker>());
  const cb = useRef(props);
  cb.current = props;
  const [ready, setReady] = useState(false);

  // Xaritani bir marta yaratamiz; Leaflet faqat brauzerda yuklanadi
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const Lmod = (await import("leaflet")).default;
      if (cancelled || !el.current || map.current) return;
      lib.current = Lmod;
      const start = cb.current.center ?? { lat: 41.3111, lon: 69.2797 };
      const m = Lmod.map(el.current, { zoomControl: false, attributionControl: true }).setView(
        [start.lat, start.lon],
        14,
      );
      Lmod.control.zoom({ position: "bottomright" }).addTo(m);
      Lmod.tileLayer(TILE_URL, { attribution: ATTR, maxZoom: 19 }).addTo(m);
      line.current = Lmod.layerGroup().addTo(m);
      me.current = Lmod.layerGroup().addTo(m);
      pins.current = Lmod.layerGroup().addTo(m);
      m.on("click", (e: L.LeafletMouseEvent) => cb.current.onPick({ lat: e.latlng.lat, lon: e.latlng.lng }));
      map.current = m;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      setReady(false);
    };
  }, []);

  // Foydalanuvchi nuqtasi + radius
  useEffect(() => {
    const Lm = lib.current;
    if (!Lm || !map.current || !me.current || !props.center) return;
    me.current.clearLayers();
    const c: L.LatLngExpression = [props.center.lat, props.center.lon];
    const ring = Lm.circle(c, {
      radius: props.radius,
      color: "#0d0e0e",
      className: "radius-ring",
      weight: 1,
      dashArray: "4 6",
      fill: false,
      interactive: false,
    }).addTo(me.current);
    if (props.accuracy && props.accuracy < 2000) {
      Lm.circle(c, {
        radius: props.accuracy,
        stroke: false,
        fillColor: "#2a78d6",
        className: "acc-ring",
        fillOpacity: 0.1,
        interactive: false,
      }).addTo(me.current);
    }
    Lm.marker(c, {
      icon: Lm.divIcon({ className: "", html: '<div class="me"><i></i></div>', iconSize: [22, 22] }),
      zIndexOffset: 2000,
      keyboard: false,
    })
      .bindTooltip(esc(props.youLabel), { className: "tip", direction: "top", offset: [0, -10] })
      .addTo(me.current);
    // flyTo fondagi vkladkada rAF to'xtaganda yarim yo'lda qotib qoladi — fitBounds ishonchliroq
    map.current.fitBounds(ring.getBounds(), { padding: [16, 16], animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.center?.lat, props.center?.lon, props.radius, props.accuracy, props.youLabel, ready]);

  // Muassasa pinlari
  useEffect(() => {
    const Lm = lib.current;
    if (!Lm || !pins.current) return;
    pins.current.clearLayers();
    markerById.current.clear();
    props.places.forEach((p, i) => {
      const sel = p.id === props.selectedId;
      const html = `<div class="pin pin--${p.kind}${sel ? " pin--sel" : ""}">${i + 1}</div>`;
      const mk = Lm.marker([p.lat, p.lon], {
        icon: Lm.divIcon({ className: "pin-wrap", html, iconSize: [26, 26], iconAnchor: [13, 13] }),
        zIndexOffset: sel ? 1000 : 0,
        title: p.name ?? "",
      })
        .bindTooltip(esc(p.name ?? "—"), { className: "tip", direction: "top", offset: [0, -14] })
        .on("click", () => cb.current.onSelect(p.id));
      mk.addTo(pins.current!);
      markerById.current.set(p.id, mk);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.places, props.selectedId, ready]);

  // Marshrut chizig'i: chizilish animatsiyasi bilan
  useEffect(() => {
    const Lm = lib.current;
    const m = map.current;
    if (!Lm || !m || !line.current) return;
    line.current.clearLayers();
    if (!props.route || props.route.length < 2) {
      const sel = props.places.find((p) => p.id === props.selectedId);
      if (sel && props.center) {
        m.fitBounds(
          Lm.latLngBounds([
            [props.center.lat, props.center.lon],
            [sel.lat, sel.lon],
          ]),
          { padding: [60, 60], maxZoom: 16, animate: true },
        );
      }
      return;
    }
    Lm.polyline(props.route, {
      color: "#ffffff",
      className: "route-casing",
      weight: 9,
      opacity: 0.9,
      interactive: false,
    }).addTo(
      line.current,
    );
    const pl = Lm.polyline(props.route, {
      color: "#c8102e",
      weight: 4.5,
      opacity: 1,
      lineCap: "square",
      className: "route-line",
      interactive: false,
    }).addTo(line.current);
    m.fitBounds(pl.getBounds(), { padding: [50, 50], maxZoom: 17, animate: true });
    const path = pl.getElement() as SVGPathElement | undefined;
    if (path && typeof path.getTotalLength === "function") {
      const len = path.getTotalLength();
      path.style.transition = "none";
      path.style.strokeDasharray = `${len}`;
      path.style.strokeDashoffset = `${len}`;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          path.style.transition = "";
          path.style.strokeDashoffset = "0";
        }),
      );
      // Zoom paytida uzunlik o'zgaradi — animatsiyadan keyin chiziqni qattiq qilamiz
      const done = () => {
        path.style.strokeDasharray = "";
        path.style.strokeDashoffset = "";
      };
      path.addEventListener("transitionend", done, { once: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.route, props.selectedId, ready]);

  return <div ref={el} className={`map__el${props.dark ? " is-dark" : ""}`} role="application" aria-label="Map" />;
}
