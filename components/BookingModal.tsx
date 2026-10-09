"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "./AppContext";
import Icon from "./Icon";
import { SPECIALTIES, SPEC_PRICE, specKey, type Place, type Specialty } from "@/lib/geo";
import { fmtDate, fmtSum, fmtTime } from "@/lib/format";
import type { Lang } from "@/lib/i18n";

export type Booking = {
  id: string;
  code: string;
  placeId: string;
  placeName: string;
  address: string | null;
  lat: number;
  lon: number;
  spec: Specialty;
  at: string;
  name: string;
  phone: string;
  pay: "clinic" | "online";
  price: number;
  createdAt: string;
  status: "active" | "cancelled";
  sms: "sent" | "demo" | "failed";
  reminded: boolean;
};

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function makeCode() {
  const A = "ABCDEFGHJKLMNPRSTUVXYZ";
  const r = crypto.getRandomValues(new Uint32Array(2));
  return `${A[r[0] % A.length]}${A[(r[0] >>> 8) % A.length]}-${String(r[1] % 10000).padStart(4, "0")}`;
}

// Raqamlar kiritilgan sari bosqichma-bosqich formatlaymiz: (90) 123-45-67
function fmtPhone(d: string) {
  if (d.length <= 2) return d.length ? `(${d}` : "";
  let out = `(${d.slice(0, 2)}) ${d.slice(2, 5)}`;
  if (d.length > 5) out += `-${d.slice(5, 7)}`;
  if (d.length > 7) out += `-${d.slice(7, 9)}`;
  return out;
}

export function smsTexts(lang: Lang, t: ReturnType<typeof useApp>["t"], b: Booking) {
  const at = new Date(b.at);
  const vars = {
    name: b.name.split(" ")[0],
    clinic: b.placeName,
    date: fmtDate(lang, at),
    time: fmtTime(lang, at),
    spec: t(specKey(b.spec)).toLowerCase(),
    code: b.code,
    addr: b.address ?? `${b.lat.toFixed(5)}, ${b.lon.toFixed(5)}`,
  };
  return { confirm: t("sms_text_confirm", vars), remind: t("sms_text_remind", vars) };
}

export async function sendSms(phone: string, text: string): Promise<{ status: Booking["sms"]; error?: string }> {
  try {
    const res = await fetch("/api/sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, text }),
    });
    const data = (await res.json()) as { sent?: boolean; demo?: boolean; error?: string };
    if (data.demo) return { status: "demo" };
    if (data.sent) return { status: "sent" };
    return { status: "failed", error: data.error };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : String(e) };
  }
}

export default function BookingModal({
  place,
  placeName,
  initialSpec,
  onClose,
  onBooked,
}: {
  place: Place;
  placeName: string;
  initialSpec: Specialty | null;
  onClose: () => void;
  onBooked: (b: Booking) => void;
}) {
  const { t, lang } = useApp();
  const days = useMemo(() => {
    const out: Date[] = [];
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    for (let i = 0; i < 7; i++) out.push(new Date(d.getTime() + i * 86400000));
    return out;
  }, []);
  // Bugun bo'sh vaqt qolmagan bo'lsa (kech kirgan), ertangi kundan boshlaymiz
  const [day, setDay] = useState(() => (new Date().getHours() >= 16 ? 1 : 0));
  const [time, setTime] = useState<string | null>(null);
  const [spec, setSpec] = useState<Specialty>(
    initialSpec ?? (place.kind === "dentist" ? "dentist" : "therapist"),
  );
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pay, setPay] = useState<"clinic" | "online">("clinic");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ b: Booking; error?: string } | null>(null);
  const [notif, setNotif] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    setNotif(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  // 08:00–18:00, 30 daqiqalik slotlar; bandlik — klinika+sana+vaqt asosidagi barqaror psevdo-tasodif
  const slots = useMemo(() => {
    const d = days[day];
    const now = Date.now();
    const out: { label: string; disabled: boolean }[] = [];
    for (let m = 8 * 60; m < 18 * 60; m += 30) {
      const label = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      const at = new Date(d);
      at.setHours(Math.floor(m / 60), m % 60);
      const taken = hash(`${place.id}|${d.toDateString()}|${label}|${spec}`) % 100 < 32;
      out.push({ label, disabled: taken || at.getTime() < now + 60 * 60 * 1000 });
    }
    return out;
  }, [day, days, place.id, spec]);

  useEffect(() => {
    if (time && slots.find((s) => s.label === time)?.disabled) setTime(null);
  }, [slots, time]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2 || phone.length !== 9 || !time) {
      setErr(t("bk_invalid"));
      return;
    }
    const at = new Date(days[day]);
    const [hh, mm] = time.split(":").map(Number);
    at.setHours(hh, mm, 0, 0);
    if (at.getTime() < Date.now()) {
      setErr(t("bk_past"));
      return;
    }
    setErr(null);
    setBusy(true);
    const b: Booking = {
      id: crypto.randomUUID(),
      code: makeCode(),
      placeId: place.id,
      placeName,
      address: place.address,
      lat: place.lat,
      lon: place.lon,
      spec,
      at: at.toISOString(),
      name: name.trim(),
      phone,
      pay,
      price: SPEC_PRICE[spec],
      createdAt: new Date().toISOString(),
      status: "active",
      sms: "demo",
      reminded: false,
    };
    const res = await sendSms(phone, smsTexts(lang, t, b).confirm);
    b.sms = res.status;
    setBusy(false);
    setDone({ b, error: res.error });
    onBooked(b);
  }

  async function askNotif() {
    if (typeof Notification === "undefined") return;
    setNotif(await Notification.requestPermission());
  }

  const price = SPEC_PRICE[spec];

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="bk-title" onClick={onClose}>
      <div className="modal__box" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <div>
            <div className="label">{done ? t("bk_done") : t("bk_title")}</div>
            <h3 id="bk-title" style={{ fontSize: 22, marginTop: 6 }}>
              {placeName}
            </h3>
            {place.address && <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{place.address}</div>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label={t("close")}>
            <Icon name="close" />
          </button>
        </div>

        {done ? (
          <Done b={done.b} error={done.error} notif={notif} onNotif={askNotif} />
        ) : (
          <form className="modal__body" onSubmit={submit}>
            <div className="field">
              <span className="label">{t("bk_spec")}</span>
              <div className="chips">
                {SPECIALTIES.map((s) => (
                  <button type="button" key={s} className="chip" aria-pressed={s === spec} onClick={() => setSpec(s)}>
                    {t(specKey(s))}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <span className="label">{t("bk_date")}</span>
              <div className="days">
                {days.map((d, i) => (
                  <button
                    type="button"
                    key={i}
                    aria-pressed={i === day}
                    onClick={() => setDay(i)}
                  >
                    <span>{fmtDate(lang, d, { weekday: "short" })}</span>
                    <strong className="num">{d.getDate()}</strong>
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <span className="label">{t("bk_time")}</span>
              <div className="slots">
                {slots.map((s) => (
                  <button
                    type="button"
                    key={s.label}
                    disabled={s.disabled}
                    aria-pressed={time === s.label}
                    onClick={() => setTime(s.label)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid2">
              <label className="field">
                <span className="label">{t("bk_name")}</span>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  maxLength={60}
                />
              </label>
              <label className="field">
                <span className="label">{t("bk_phone")}</span>
                <div className="phone">
                  <span>+998</span>
                  <input
                    className="input mono"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    value={phone ? fmtPhone(phone) : ""}
                    placeholder="(90) 123-45-67"
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").replace(/^998/, "").slice(0, 9))}
                  />
                </div>
              </label>
            </div>

            <div className="field">
              <span className="label">{t("bk_pay")}</span>
              <div className="pay">
                <label>
                  <input type="radio" name="pay" checked={pay === "clinic"} onChange={() => setPay("clinic")} />
                  {t("pay_clinic")}
                </label>
                <label>
                  <input type="radio" name="pay" checked={pay === "online"} onChange={() => setPay("online")} />
                  {t("pay_online")}
                </label>
              </div>
              {pay === "online" && <div className="muted" style={{ fontSize: 12.5 }}>{t("pay_online_note")}</div>}
            </div>

            <div className="sum">
              <div>
                <span>{t("bk_price")}</span>
                <b className="num">≈ {fmtSum(price)} so'm</b>
              </div>
              <div>
                <span>{t("bk_fee")}</span>
                <b>{t("bk_free")}</b>
              </div>
              <div className="muted" style={{ fontSize: 12.5 }}>{t("bk_price_note")}</div>
            </div>

            {err && <div className="err" role="alert">{err}</div>}

            <button className="btn btn--accent" type="submit" disabled={busy} style={{ height: 48 }}>
              {busy ? (
                <>
                  <Icon name="spinner" className="spin" /> {t("bk_sending")}
                </>
              ) : (
                <>
                  <Icon name="check" /> {t("bk_submit")}
                  {time && <span className="mono" style={{ opacity: 0.8 }}>· {time}</span>}
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Done({
  b,
  error,
  notif,
  onNotif,
}: {
  b: Booking;
  error?: string;
  notif: NotificationPermission | "unsupported";
  onNotif: () => void;
}) {
  const { t, lang } = useApp();
  const at = new Date(b.at);
  const remindAt = new Date(at.getTime() - 3600_000);
  const texts = smsTexts(lang, t, b);
  return (
    <div className="modal__body">
      <div className="ticket" style={{ border: "1px solid var(--rule-strong)" }}>
        <div className="ticket__top">
          <div>
            <div className="label">{t("bk_ticket")}</div>
            <div className="ticket__code">{b.code}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="ticket__when">{fmtTime(lang, at)}</div>
            <div className="muted">{fmtDate(lang, at, { weekday: "long", day: "numeric", month: "long" })}</div>
          </div>
        </div>
        <div>
          {t(specKey(b.spec))} · <span className="muted">{b.pay === "online" ? t("paid_demo") : t("pay_at_clinic")}</span>
        </div>
        <Barcode code={b.code} />
      </div>

      <div className="sms">
        <div className="label">{t("sms_title")} · +998 {fmtPhone(b.phone)}</div>
        <div className="muted" style={{ fontSize: 13 }}>
          {b.sms === "sent" ? t("sms_real") : b.sms === "demo" ? t("sms_demo") : t("sms_fail") + (error ?? "")}
        </div>
        <div className="sms__msg stagger">
          <header>
            <span className="label">{t("sms_now")}</span>
            <span className="mono muted" style={{ fontSize: 12 }}>{fmtTime(lang, new Date(b.createdAt))}</span>
          </header>
          <p>{texts.confirm}</p>
        </div>
        <div className="sms__msg">
          <header>
            <span className="label">{t("sms_remind")}</span>
            <span className="mono muted" style={{ fontSize: 12 }}>
              {fmtDate(lang, remindAt, { day: "numeric", month: "short" })} {fmtTime(lang, remindAt)}
            </span>
          </header>
          <p>{texts.remind}</p>
        </div>
      </div>

      {notif !== "unsupported" && (
        <button className="btn btn--ghost" onClick={onNotif} disabled={notif === "granted" || notif === "denied"}>
          <Icon name="bell" /> {notif === "granted" ? t("remind_on") : t("remind_browser")}
        </button>
      )}
    </div>
  );
}

export function Barcode({ code }: { code: string }) {
  const bars = useMemo(() => {
    let h = hash(code);
    const out: number[] = [];
    for (let i = 0; i < 48; i++) {
      h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
      out.push(1 + (h % 3));
    }
    return out;
  }, [code]);
  return (
    <div className="barcode" aria-hidden="true">
      {bars.map((w, i) => (
        <i key={i} style={{ width: w, marginRight: i % 3 === 0 ? 2 : 0, opacity: i % 2 ? 1 : 0.85 }} />
      ))}
    </div>
  );
}
