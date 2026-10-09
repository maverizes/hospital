"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppProvider, readLS, useApp, writeLS } from "@/components/AppContext";
import Finder, { KIND_KEY, type Filters, type Loc } from "@/components/Finder";
import BookingModal, { Barcode, sendSms, smsTexts, type Booking } from "@/components/BookingModal";
import AnalysisBlock from "@/components/AnalysisBlock";
import Partners from "@/components/Partners";
import Icon from "@/components/Icon";
import { haversine, openState, specKey, TASHKENT, type LatLon, type Place, type RouteMode, type RouteResult, type Specialty } from "@/lib/geo";
import { fmtDate, fmtDist, fmtTime } from "@/lib/format";
import { LANGS } from "@/lib/i18n";

export default function Page() {
  return (
    <AppProvider>
      <Home />
    </AppProvider>
  );
}

function useReveal(deps: unknown[]) {
  useEffect(() => {
    const els = document.querySelectorAll(".reveal:not(.in)");
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.08 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

function Home() {
  const { t, lang, setLang, theme, toggleTheme } = useApp();

  const [loc, setLoc] = useState<Loc | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState(false);
  const [radius, setRadius] = useState(3000);
  const [filters, setFilters] = useState<Filters>({ kind: "all", open: false, emergency: false, q: "" });
  const [raw, setRaw] = useState<Place[]>([]);
  const [source, setSource] = useState<string | null>(null);
  const [placesState, setPlacesState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [selected, setSelected] = useState<Place | null>(null);
  const [mode, setMode] = useState<RouteMode>("car");
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeState, setRouteState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [bookingFor, setBookingFor] = useState<Place | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [prefSpec, setPrefSpec] = useState<Specialty | null>(null);
  const [sos, setSos] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [reload, setReload] = useState(0);

  useReveal([]);

  const displayName = useCallback(
    (p: Place) => p.names[lang] || p.name || t("no_name"),
    [lang, t],
  );

  /* ---------- Joylashuv ---------- */
  const reverse = useCallback(
    async (pt: LatLon) => {
      try {
        const r = await fetch(`/api/geocode?lang=${lang}&lat=${pt.lat}&lon=${pt.lon}`);
        const d = (await r.json()) as { label?: string | null; area?: string | null };
        const label =
          (d.area && d.label && !d.label.includes(d.area) ? `${d.label} · ${d.area}` : d.label || d.area) || null;
        setLoc((l) => (l && l.lat === pt.lat && l.lon === pt.lon ? { ...l, label } : l));
      } catch {
        /* manzil matni ixtiyoriy */
      }
    },
    [lang],
  );

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setLocError(true);
      return;
    }
    setLocating(true);
    setLocError(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const pt = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setLoc({ ...pt, source: "gps", accuracy: pos.coords.accuracy, label: null });
        setLocating(false);
        reverse(pt);
      },
      () => {
        setLocating(false);
        setLocError(true);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }, [reverse]);

  const pick = useCallback(
    (pt: LatLon, source: Loc["source"], label?: string | null) => {
      setLoc({ ...pt, source, accuracy: null, label: label ?? null });
      setLocError(false);
      if (!label) reverse(pt);
    },
    [reverse],
  );

  // Boshlanishda: Toshkent markazi, ruxsat avvaldan berilgan bo'lsa — GPS
  useEffect(() => {
    setNow(new Date());
    setBookings(readLS<Booking[]>("nf_bookings", []));
    setLoc({ ...TASHKENT, source: "default", accuracy: null, label: null });
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((p) => p.state === "granted" && locate())
      .catch(() => {});
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [locate]);

  /* ---------- Muassasalar ---------- */
  useEffect(() => {
    if (!loc) return;
    const ctrl = new AbortController();
    setPlacesState("loading");
    fetch(`/api/places?lat=${loc.lat}&lon=${loc.lon}&r=${radius}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const d = (await r.json()) as { places: Place[]; source: string };
        setRaw(d.places);
        setSource(d.source);
        setPlacesState("ok");
      })
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setPlacesState("error");
      });
    return () => ctrl.abort();
  }, [loc?.lat, loc?.lon, radius, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  const places = useMemo(() => {
    if (!loc) return [];
    const q = filters.q.trim().toLowerCase();
    const n = new Date();
    return raw
      .filter((p) => filters.kind === "all" || p.kind === filters.kind)
      .filter((p) => !filters.emergency || p.emergency)
      .filter((p) => {
        if (!filters.open) return true;
        const s = openState(p.hours, n);
        return s === "open" || s === "always";
      })
      .filter(
        (p) =>
          !q ||
          [p.name, p.names.ru, p.names.uz, p.names.en, p.address, p.speciality]
            .filter(Boolean)
            .some((x) => x!.toLowerCase().includes(q)),
      )
      .map((p) => ({ p, d: haversine(loc, p) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 80)
      .map((x) => x.p);
    // `now` har soniyada yangilanadi — ochiq/yopiq filtri uchun daqiqa yetarli
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, filters, loc?.lat, loc?.lon]);

  const nearestHospital = useMemo(() => {
    if (!loc) return null;
    const hs = raw.filter((p) => p.kind === "hospital");
    const pool = hs.some((p) => p.emergency) ? hs.filter((p) => p.emergency) : hs;
    const all = pool.length ? pool : raw.filter((p) => p.kind === "clinic");
    return all.map((p) => ({ p, d: haversine(loc, p) })).sort((a, b) => a.d - b.d)[0] ?? null;
  }, [raw, loc]);

  const nearestAny = useMemo(() => {
    if (!loc || !places.length) return null;
    return { p: places[0], d: haversine(loc, places[0]) };
  }, [places, loc]);

  /* ---------- SOS ---------- */
  function startSos() {
    setSos(true);
    setFilters({ kind: "all", open: false, emergency: false, q: "" });
    // Yaqinda shifoxona bo'lmasa, radiusni kengaytiramiz (yangi so'rov sekinroq)
    if (!raw.some((p) => p.kind === "hospital") && radius < 5000) setRadius(5000);
    if (!loc || loc.source === "default") locate();
    document.getElementById("find")?.scrollIntoView({ behavior: "smooth" });
  }
  useEffect(() => {
    if (!sos || placesState !== "ok" || locating) return;
    if (nearestHospital) {
      setSelected(nearestHospital.p);
      setMode("car");
    }
    setSos(false);
  }, [sos, placesState, locating, nearestHospital]);

  /* ---------- Marshrut ---------- */
  useEffect(() => {
    if (!selected || !loc) {
      setRoute(null);
      setRouteState("idle");
      return;
    }
    const ctrl = new AbortController();
    setRouteState("loading");
    setRoute(null);
    const qs = `fromLat=${loc.lat}&fromLon=${loc.lon}&toLat=${selected.lat}&toLon=${selected.lon}&mode=${mode}`;
    fetch(`/api/route?${qs}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        setRoute((await r.json()) as RouteResult);
        setRouteState("ok");
      })
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setRouteState("error");
      });
    return () => ctrl.abort();
  }, [selected?.id, mode, loc?.lat, loc?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  const select = useCallback(
    (id: string | null) =>
      setSelected((cur) => (id ? (raw.find((p) => p.id === id) ?? (cur?.id === id ? cur : null)) : null)),
    [raw],
  );

  /* ---------- Yozuvlar va eslatmalar ---------- */
  const saveBookings = useCallback((fn: (b: Booking[]) => Booking[]) => {
    setBookings((prev) => {
      const next = fn(prev);
      writeLS("nf_bookings", next);
      return next;
    });
  }, []);

  // Sahifa ochiq bo'lsa: qabuldan 1 soat oldin brauzer bildirishnomasi + SMS
  useEffect(() => {
    const tick = () => {
      const n = Date.now();
      bookings.forEach((b) => {
        const at = new Date(b.at).getTime();
        if (b.status !== "active" || b.reminded || n < at - 3600_000 || n > at) return;
        const text = smsTexts(lang, t, b).remind;
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification("Navbat-free", { body: text });
        }
        sendSms(b.phone, text);
        saveBookings((all) => all.map((x) => (x.id === b.id ? { ...x, reminded: true } : x)));
      });
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [bookings, lang, t, saveBookings]);

  function routeToBooking(b: Booking) {
    const existing = raw.find((p) => p.id === b.placeId);
    setSelected(
      existing ?? {
        id: b.placeId,
        kind: "clinic",
        lat: b.lat,
        lon: b.lon,
        name: b.placeName,
        names: {},
        address: b.address,
        phone: null,
        website: null,
        hours: null,
        emergency: false,
        speciality: null,
      },
    );
    document.getElementById("find")?.scrollIntoView({ behavior: "smooth" });
  }

  function findDoctor(s: Specialty) {
    setPrefSpec(s);
    setFilters({ kind: s === "dentist" ? "dentist" : "clinic", open: false, emergency: false, q: "" });
    document.getElementById("find")?.scrollIntoView({ behavior: "smooth" });
  }

  const active = bookings.filter((b) => b.status === "active" && new Date(b.at).getTime() > Date.now()).length;

  const locLabel =
    !loc
      ? t("loc_idle")
      : locating
        ? t("loc_locating")
        : loc.source === "default"
          ? t("loc_default")
          : loc.label || `${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}`;
  const locSrc =
    loc?.source === "gps"
      ? `${t("loc_gps")}${loc.accuracy ? ` · ${t("loc_accuracy")} ±${Math.round(loc.accuracy)} ${t("m")}` : ""}`
      : loc?.source === "search"
        ? t("loc_search")
        : loc?.source === "map"
          ? t("loc_map")
          : "";

  return (
    <>
      <header className="header">
        <div className="wrap header__in">
          <a href="#top" className="logo" aria-label="Navbat-free">
            <span className="logo__mark" aria-hidden="true" />
            NAVBAT—FREE
          </a>
          <nav className="nav">
            <a href="#find">{t("nav_find")}</a>
            <a href="#analysis">{t("nav_analysis")}</a>
            <a href="#bookings">
              {t("nav_bookings")}
              {active > 0 && <span className="count">{active}</span>}
            </a>
            <a href="#partners">{t("nav_partners")}</a>
          </nav>
          <div className="header__tools">
            <a className="btn btn--accent btn--sm hide-sm" href="tel:103">
              <Icon name="phone" size={14} /> 103
            </a>
            <div className="seg" role="group" aria-label="Language">
              {LANGS.map((l) => (
                <button key={l} aria-pressed={lang === l} onClick={() => setLang(l)}>
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            <button className="icon-btn" onClick={toggleTheme} aria-label={t("theme")}>
              <Icon name={theme === "dark" ? "sun" : "moon"} />
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="wrap hero__grid">
            <div className="hero__main">
              <span className="label index">
                <b>●</b> {t("hero_kicker")}
              </span>
              <h1>{t("hero_title")}</h1>
              <p className="hero__sub">{t("hero_sub")}</p>
              <div className="hero__cta">
                <button className="btn btn--primary" onClick={() => { locate(); document.getElementById("find")?.scrollIntoView({ behavior: "smooth" }); }}>
                  {locating ? <Icon name="spinner" className="spin" /> : <Icon name="locate" />} {t("btn_locate")}
                </button>
                <button className="btn btn--accent" onClick={startSos}>
                  <Icon name="sos" /> {t("btn_sos")}
                </button>
                <a className="btn" href="#analysis">
                  <Icon name="doc" /> {t("btn_analyze")}
                </a>
              </div>
            </div>
            <div className="hero__side">
              <div className="stat">
                <span className="label">{t("st_location")}</span>
                <span className="stat__v">
                  {locLabel}
                  {locSrc && <span className="muted mono" style={{ display: "block", fontSize: 12 }}>{locSrc}</span>}
                </span>
              </div>
              <div className="stat">
                <span className="label">{t("st_found")}</span>
                <span className="stat__v">
                  <strong className="num">{placesState === "ok" ? raw.length : "—"}</strong>{" "}
                  <span className="muted">{t("st_objects")} · {radius / 1000} {t("km")}</span>
                </span>
              </div>
              <div className="stat">
                <span className="label">{t("st_nearest")}</span>
                <span className="stat__v">
                  {nearestAny ? (
                    <button
                      onClick={() => {
                        setSelected(nearestAny.p);
                        document.getElementById("find")?.scrollIntoView({ behavior: "smooth" });
                      }}
                      style={{ all: "unset", cursor: "pointer" }}
                    >
                      <span style={{ fontWeight: 600 }}>{displayName(nearestAny.p)}</span>
                      <span className="muted mono" style={{ display: "block", fontSize: 12 }}>
                        {t(KIND_KEY[nearestAny.p.kind])} · {fmtDist(lang, nearestAny.d)} →
                      </span>
                    </button>
                  ) : (
                    "—"
                  )}
                </span>
              </div>
              <div className="stat">
                <span className="label">{t("st_source")}</span>
                <span className="stat__v mono" style={{ fontSize: 13 }}>
                  OpenStreetMap{source ? ` · ${source}` : ""}
                  <br />
                  OSRM · Nominatim
                </span>
              </div>
              <div className="stat__clock">
                <span className="label live">Live</span>
                <span className="mono num" style={{ fontSize: 22 }}>
                  {now ? now.toLocaleTimeString("ru-RU", { hour12: false }) : "--:--:--"}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="find">
          <div className="wrap">
            <div className="section__head reveal">
              <div>
                <span className="label index"><b>01</b> {t("nav_find")}</span>
                <h2>{t("find_title")}</h2>
              </div>
              <p>{t("find_sub")}</p>
            </div>
            <Finder
              loc={loc}
              locating={locating}
              locError={locError}
              radius={radius}
              setRadius={setRadius}
              filters={filters}
              setFilters={setFilters}
              places={places}
              placesState={placesState}
              reloadPlaces={() => setReload((x) => x + 1)}
              selected={selected}
              select={select}
              mode={mode}
              setMode={setMode}
              route={route}
              routeState={routeState}
              onLocate={locate}
              onPick={pick}
              onBook={(p) => setBookingFor(p)}
              displayName={displayName}
            />
          </div>
        </section>

        <section className="section" id="analysis">
          <div className="wrap">
            <div className="section__head reveal">
              <div>
                <span className="label index"><b>02</b> {t("nav_analysis")}</span>
                <h2>{t("an_title")}</h2>
              </div>
              <p>{t("an_sub")}</p>
            </div>
            <AnalysisBlock onFindDoctor={findDoctor} />
          </div>
        </section>

        <section className="section" id="bookings">
          <div className="wrap">
            <div className="section__head reveal">
              <div>
                <span className="label index"><b>03</b> {t("nav_bookings")}</span>
                <h2>{t("my_title")}</h2>
              </div>
              <p>{t("sms_remind")} — SMS. {t("bk_fee")}: {t("bk_free")}.</p>
            </div>
            {bookings.length === 0 ? (
              <div className="empty reveal">
                <Icon name="calendar" size={20} />
                {t("my_empty")}
              </div>
            ) : (
              <div className="bookings">
                {[...bookings]
                  .sort((a, b) => +new Date(b.at) - +new Date(a.at))
                  .map((b) => (
                    <BookingCard
                      key={b.id}
                      b={b}
                      now={now}
                      onRoute={() => routeToBooking(b)}
                      onCancel={() => saveBookings((all) => all.map((x) => (x.id === b.id ? { ...x, status: "cancelled" } : x)))}
                    />
                  ))}
              </div>
            )}
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <div className="section__head reveal">
              <div>
                <span className="label index"><b>04</b> {t("nd_title")}</span>
                <h2>{t("nd_title")}</h2>
              </div>
              <p>{t("an_disclaimer")}</p>
            </div>
            <div className="nd reveal">
              {(["nd_1", "nd_2", "nd_3", "nd_4"] as const).map((k, i) => (
                <div key={k}>
                  <span className="x">✕ 0{i + 1}</span>
                  <p>{t(k)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="partners">
          <div className="wrap">
            <div className="section__head reveal">
              <div>
                <span className="label index"><b>05</b> {t("nav_partners")}</span>
                <h2>{t("pt_title")}</h2>
              </div>
              <p>{t("pt_sub")}</p>
            </div>
            <Partners />
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap footer__in">
          <span>{t("ft_data")}</span>
          <span>{t("ft_note")}</span>
        </div>
      </footer>

      {bookingFor && (
        <BookingModal
          place={bookingFor}
          placeName={displayName(bookingFor)}
          initialSpec={prefSpec}
          onClose={() => setBookingFor(null)}
          onBooked={(b) => saveBookings((all) => [b, ...all])}
        />
      )}
    </>
  );
}

function BookingCard({
  b,
  now,
  onRoute,
  onCancel,
}: {
  b: Booking;
  now: Date | null;
  onRoute: () => void;
  onCancel: () => void;
}) {
  const { t, lang } = useApp();
  const at = new Date(b.at);
  const left = now ? at.getTime() - now.getTime() : 0;
  const past = left <= 0;
  const off = b.status === "cancelled" || past;
  const d = Math.floor(left / 86400000);
  const h = Math.floor((left % 86400000) / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  const s = Math.floor((left % 60000) / 1000);
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className={`ticket${off ? " ticket--off" : ""}`} ref={ref}>
      <div className="ticket__top">
        <div>
          <div className="label">{t("bk_ticket")}</div>
          <div className="ticket__code">{b.code}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="ticket__when">{fmtTime(lang, at)}</div>
          <div className="muted" style={{ fontSize: 13 }}>{fmtDate(lang, at, { weekday: "short", day: "numeric", month: "short" })}</div>
        </div>
      </div>
      <div>
        <div style={{ fontWeight: 600 }}>{b.placeName}</div>
        <div className="muted" style={{ fontSize: 13 }}>
          {t(specKey(b.spec))} · {b.pay === "online" ? t("paid_demo") : t("pay_at_clinic")}
        </div>
      </div>
      <div className="ticket__count num">
        {b.status === "cancelled"
          ? t("my_cancelled")
          : past
            ? t("my_past")
            : `${d > 0 ? `${d}d ` : ""}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} ${t("my_left")}`}
      </div>
      <Barcode code={b.code} />
      {!off && (
        <div className="route__actions">
          <button className="btn btn--sm" onClick={onRoute}>
            <Icon name="route" /> {t("my_route")}
          </button>
          <button className="btn btn--sm btn--ghost" onClick={onCancel}>
            {t("my_cancel")}
          </button>
        </div>
      )}
    </div>
  );
}
