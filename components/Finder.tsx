"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useApp } from "./AppContext";
import Icon from "./Icon";
import { bearing, haversine, openState, type LatLon, type Place, type PlaceKind, type RouteMode, type RouteResult } from "@/lib/geo";
import { fmtDist, fmtDur, fmtTime, stepIcon, stepText } from "@/lib/format";
import type { TKey } from "@/lib/i18n";

const MapView = dynamic(() => import("./MapView"), { ssr: false });

export type Loc = LatLon & {
  source: "default" | "gps" | "search" | "map";
  accuracy: number | null;
  label: string | null;
};

export type Filters = {
  kind: "all" | PlaceKind;
  open: boolean;
  emergency: boolean;
  q: string;
};

const KINDS: { k: Filters["kind"]; key: TKey }[] = [
  { k: "all", key: "f_all" },
  { k: "hospital", key: "f_hospital" },
  { k: "clinic", key: "f_clinic" },
  { k: "doctors", key: "f_doctors" },
  { k: "dentist", key: "f_dentist" },
  { k: "pharmacy", key: "f_pharmacy" },
];

export const KIND_KEY: Record<PlaceKind, TKey> = {
  hospital: "f_hospital",
  clinic: "f_clinic",
  doctors: "f_doctors",
  dentist: "f_dentist",
  pharmacy: "f_pharmacy",
};

type Props = {
  loc: Loc | null;
  locating: boolean;
  locError: boolean;
  radius: number;
  setRadius: (r: number) => void;
  filters: Filters;
  setFilters: (f: Filters) => void;
  places: Place[];
  placesState: "idle" | "loading" | "ok" | "error";
  reloadPlaces: () => void;
  selected: Place | null;
  select: (id: string | null) => void;
  mode: RouteMode;
  setMode: (m: RouteMode) => void;
  route: RouteResult | null;
  routeState: "idle" | "loading" | "ok" | "error";
  onLocate: () => void;
  onPick: (p: LatLon, source: Loc["source"], label?: string | null) => void;
  onBook: (p: Place) => void;
  displayName: (p: Place) => string;
};

export default function Finder(p: Props) {
  const { t, lang, theme } = useApp();
  const [addr, setAddr] = useState("");
  const [addrBusy, setAddrBusy] = useState(false);
  const [addrErr, setAddrErr] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const qRef = useRef<HTMLInputElement>(null);

  // «/» — ro'yxat qidiruviga fokus
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        qRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Tanlangan element ro'yxatda ko'rinsin
  useEffect(() => {
    if (!p.selected) return;
    const el = listRef.current?.querySelector(`[data-id="${p.selected.id}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [p.selected]);

  async function searchAddr(e: React.FormEvent) {
    e.preventDefault();
    const q = addr.trim();
    if (!q) return;
    setAddrBusy(true);
    setAddrErr(false);
    try {
      const hasCity = /toshkent|ташкент|tashkent/i.test(q);
      const res = await fetch(`/api/geocode?lang=${lang}&q=${encodeURIComponent(hasCity ? q : `${q}, Tashkent`)}`);
      if (!res.ok) throw new Error();
      const d = (await res.json()) as { lat: number; lon: number; label: string };
      p.onPick({ lat: d.lat, lon: d.lon }, "search", d.label.split(",").slice(0, 2).join(","));
    } catch {
      setAddrErr(true);
    } finally {
      setAddrBusy(false);
    }
  }

  const sel = p.selected;
  const now = new Date();

  return (
    <div className="finder reveal">
      <aside className="finder__side">
        <div className="finder__controls">
          <form className="addr" onSubmit={searchAddr}>
            <input
              className="input"
              value={addr}
              onChange={(e) => setAddr(e.target.value)}
              placeholder={t("search_address")}
              aria-label={t("search_address")}
              aria-invalid={addrErr}
            />
            <button className="btn btn--primary" type="submit" disabled={addrBusy} aria-label={t("search_go")}>
              {addrBusy ? <Icon name="spinner" className="spin" /> : <Icon name="search" />}
            </button>
            <button className="btn" type="button" onClick={p.onLocate} title={t("btn_locate")} aria-label={t("btn_locate")}>
              {p.locating ? <Icon name="spinner" className="spin" /> : <Icon name="locate" />}
            </button>
          </form>
          {addrErr && <div className="err">{t("list_error")}</div>}
          {p.locError && <div className="err">{t("loc_denied")}</div>}

          <div className="chips" role="group" aria-label="type">
            {KINDS.map(({ k, key }) => (
              <button
                key={k}
                className="chip"
                aria-pressed={p.filters.kind === k}
                onClick={() => p.setFilters({ ...p.filters, kind: k })}
              >
                {t(key)}
              </button>
            ))}
          </div>

          <div className="toggles">
            <label>
              <input
                type="checkbox"
                checked={p.filters.open}
                onChange={(e) => p.setFilters({ ...p.filters, open: e.target.checked })}
              />
              {t("f_open")}
            </label>
            <label>
              <input
                type="checkbox"
                checked={p.filters.emergency}
                onChange={(e) => p.setFilters({ ...p.filters, emergency: e.target.checked })}
              />
              {t("f_emergency")}
            </label>
            <label style={{ marginLeft: "auto" }}>
              {t("radius")}
              <select value={p.radius} onChange={(e) => p.setRadius(Number(e.target.value))} className="mono">
                {[1000, 2000, 3000, 5000, 8000].map((r) => (
                  <option key={r} value={r}>
                    {r / 1000} {t("km")}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <input
            ref={qRef}
            className="input"
            style={{ height: 36 }}
            value={p.filters.q}
            onChange={(e) => p.setFilters({ ...p.filters, q: e.target.value })}
            placeholder={`${t("search_name")}  ( / )`}
            aria-label={t("search_name")}
          />
        </div>

        <div className="list__meta label">
          <span>
            {p.placesState === "ok" ? `${p.places.length} ${t("st_objects")}` : p.placesState === "loading" ? t("list_loading") : ""}
          </span>
          <span>{p.loc ? `${p.loc.lat.toFixed(4)}, ${p.loc.lon.toFixed(4)}` : ""}</span>
        </div>

        <div className="list" ref={listRef}>
          {p.placesState === "loading" &&
            Array.from({ length: 6 }).map((_, i) => (
              <div className="skel" key={i}>
                <i style={{ width: "70%" }} />
                <i style={{ width: "45%" }} />
              </div>
            ))}
          {p.placesState === "error" && (
            <div className="empty" style={{ margin: 16 }}>
              <Icon name="alert" />
              <span style={{ flex: 1 }}>{t("list_error")}</span>
              <button className="btn btn--sm" onClick={p.reloadPlaces}>
                {t("retry")}
              </button>
            </div>
          )}
          {p.placesState === "ok" && p.places.length === 0 && (
            <div className="empty" style={{ margin: 16 }}>{t("list_empty")}</div>
          )}
          {p.placesState === "ok" && (
            <div className="stagger" key={`${p.loc?.lat}-${p.filters.kind}`}>
              {p.places.map((pl, i) => {
                const d = p.loc ? haversine(p.loc, pl) : 0;
                const st = openState(pl.hours, now);
                const deg = p.loc ? bearing(p.loc, pl) : 0;
                return (
                  <button
                    key={pl.id}
                    data-id={pl.id}
                    className="item"
                    aria-current={sel?.id === pl.id}
                    onClick={() => p.select(pl.id)}
                  >
                    <span className="item__n">{i + 1}</span>
                    <span style={{ minWidth: 0 }}>
                      <span className="item__name" style={{ display: "block" }}>{p.displayName(pl)}</span>
                      {pl.address && <span className="item__addr" style={{ display: "block" }}>{pl.address}</span>}
                      <span className="item__tags">
                        <span className="tag">{t(KIND_KEY[pl.kind])}</span>
                        {st === "always" && <span className="tag tag--ok">{t("open_247")}</span>}
                        {st === "open" && <span className="tag tag--ok">{t("open_now")}</span>}
                        {st === "closed" && <span className="tag tag--bad">{t("closed")}</span>}
                        {pl.emergency && <span className="tag tag--warn">{t("emergency")}</span>}
                      </span>
                    </span>
                    <span className="item__dist">
                      {fmtDist(lang, d)}
                      <small>
                        <span className="arrow" style={{ transform: `rotate(${deg}deg)` }}>↑</span>
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      <div className="finder__main">
        <div className="map">
          <MapView
            center={p.loc}
            accuracy={p.loc?.accuracy ?? null}
            radius={p.radius}
            places={sel && !p.places.some((x) => x.id === sel.id) ? [...p.places, sel] : p.places}
            selectedId={sel?.id ?? null}
            route={p.route?.coords ?? null}
            dark={theme === "dark"}
            youLabel={t("you")}
            onSelect={(id) => p.select(id)}
            onPick={(pt) => p.onPick(pt, "map")}
          />
          <div className="map__hint label">{t("map_hint")}</div>
        </div>

        {sel ? (
          <RoutePanel {...p} sel={sel} />
        ) : (
          <div className="route__empty">
            <Icon name="route" size={20} />
            <span>{t("route_hint")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function RoutePanel(p: Props & { sel: Place }) {
  const { t, lang } = useApp();
  const { sel, loc, route } = p;
  const arrive = route ? new Date(Date.now() + route.duration * 1000) : null;
  const from = loc ? `${loc.lat},${loc.lon}` : "";
  const to = `${sel.lat},${sel.lon}`;
  const ytype = p.mode === "car" ? "auto" : p.mode === "foot" ? "pd" : "bc";
  const gtype = p.mode === "car" ? "driving" : p.mode === "foot" ? "walking" : "bicycling";
  const st = openState(sel.hours);

  return (
    <div className="route" key={sel.id}>
      <div className="route__a stagger">
        <div>
          <div className="label">
            {t("route_title")} · {t(KIND_KEY[sel.kind])}
          </div>
          <div className="route__name" style={{ marginTop: 6 }}>{p.displayName(sel)}</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            {sel.address ?? `${sel.lat.toFixed(5)}, ${sel.lon.toFixed(5)}`}
            {" · "}
            {st === "always" ? t("open_247") : st === "open" ? t("open_now") : st === "closed" ? t("closed") : t("hours_unknown")}
            {sel.hours && st !== "always" ? ` (${sel.hours})` : ""}
          </div>
        </div>

        <div className="seg" role="group" aria-label={t("route_title")}>
          {(["car", "foot", "bike"] as RouteMode[]).map((m) => (
            <button key={m} aria-pressed={p.mode === m} onClick={() => p.setMode(m)}>
              {t(m === "car" ? "mode_car" : m === "foot" ? "mode_foot" : "mode_bike")}
            </button>
          ))}
        </div>

        <div className="route__kpis">
          <div>
            <span className="label">{t("route_time")}</span>
            <strong>{p.routeState === "loading" ? "…" : route ? fmtDur(lang, route.duration) : "—"}</strong>
          </div>
          <div>
            <span className="label">{t("route_dist")}</span>
            <strong>{p.routeState === "loading" ? "…" : route ? fmtDist(lang, route.distance) : "—"}</strong>
          </div>
          <div>
            <span className="label">{t("route_arrive")}</span>
            <strong>{p.routeState === "loading" ? "…" : arrive ? fmtTime(lang, arrive) : "—"}</strong>
          </div>
        </div>
        {p.routeState === "error" && <div className="err">{t("route_error")}</div>}

        <div className="route__actions">
          {sel.kind !== "pharmacy" && (
            <button className="btn btn--accent btn--sm" onClick={() => p.onBook(sel)}>
              <Icon name="calendar" /> {t("book")}
            </button>
          )}
          {sel.phone && (
            <a className="btn btn--sm" href={`tel:${sel.phone.split(/[;,]/)[0].replace(/[^\d+]/g, "")}`}>
              <Icon name="phone" /> {t("call")}
            </a>
          )}
          {sel.website && (
            <a className="btn btn--sm" href={sel.website} target="_blank" rel="noopener noreferrer">
              <Icon name="globe" /> {t("site")}
            </a>
          )}
        </div>
        {loc && (
          <div>
            <div className="label" style={{ marginBottom: 6 }}>{t("route_open")}</div>
            <div className="route__actions">
              <a className="btn btn--sm btn--ghost" target="_blank" rel="noopener noreferrer"
                href={`https://yandex.uz/maps/?rtext=${from}~${to}&rtt=${ytype}`}>
                Yandex <Icon name="ext" size={13} />
              </a>
              <a className="btn btn--sm btn--ghost" target="_blank" rel="noopener noreferrer"
                href={`https://www.google.com/maps/dir/?api=1&origin=${from}&destination=${to}&travelmode=${gtype}`}>
                Google <Icon name="ext" size={13} />
              </a>
              <a className="btn btn--sm btn--ghost" target="_blank" rel="noopener noreferrer"
                href={`https://2gis.uz/tashkent/routeSearch/rsType/${p.mode === "car" ? "car" : p.mode === "foot" ? "pedestrian" : "bicycle"}/from/${loc.lon},${loc.lat}/to/${sel.lon},${sel.lat}`}>
                2GIS <Icon name="ext" size={13} />
              </a>
            </div>
          </div>
        )}
      </div>

      <div className="route__b">
        <div className="label">{t("route_steps")}</div>
        {p.routeState === "loading" && (
          <div className="skel" style={{ padding: "12px 0", border: 0 }}>
            <i style={{ width: "80%" }} />
            <i style={{ width: "60%" }} />
            <i style={{ width: "70%" }} />
          </div>
        )}
        {route && p.routeState === "ok" && (
          <ol className="steps stagger">
            {route.steps
              .filter((s, i) => s.distance > 0 || i === 0 || s.type === "arrive")
              .map((s, i) => {
                const deg = stepIcon(s);
                return (
                  <li key={i}>
                    <span className="ico">
                      {deg === -1 ? (
                        <Icon name="flag" size={13} />
                      ) : (
                        <Icon name="arrow" size={13} style={{ transform: `rotate(${deg}deg)` }} />
                      )}
                    </span>
                    <span>{stepText(lang, s)}</span>
                    <span className="d">{s.distance > 0 ? fmtDist(lang, s.distance) : ""}</span>
                  </li>
                );
              })}
          </ol>
        )}
      </div>
    </div>
  );
}
