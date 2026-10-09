"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "./AppContext";
import Icon from "./Icon";
import { SAMPLE_CBC, SAMPLE_THYROID, type AnItem, type Analysis } from "@/lib/samples";
import { specKey, type Specialty } from "@/lib/geo";
import type { TKey } from "@/lib/i18n";

type Img = { media_type: "image/jpeg"; data: string; preview: string };

// Rasmni 1600 px gacha kichraytirib JPEG ga o'tkazamiz — so'rov yengil bo'lsin
async function prepare(file: File): Promise<Img> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/jpeg", 0.86);
  return { media_type: "image/jpeg", data: url.split(",")[1], preview: url };
}

const STATUS_KEY: Record<AnItem["status"], TKey> = {
  normal: "s_normal",
  low: "s_low",
  high: "s_high",
  critical: "s_critical",
  unknown: "s_unknown",
};

export default function AnalysisBlock({ onFindDoctor }: { onFindDoctor: (s: Specialty) => void }) {
  const { t, lang } = useApp();
  const [imgs, setImgs] = useState<Img[]>([]);
  const [over, setOver] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ a: Analysis; sample: null | "cbc" | "thyroid" } | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [shown, setShown] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Namuna tanlanganda til almashsa, matn ham almashadi
  useEffect(() => {
    if (result?.sample) setResult({ a: (result.sample === "cbc" ? SAMPLE_CBC : SAMPLE_THYROID)(lang), sample: result.sample });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // Shkala belgilari joyiga «suzib» kelishi uchun
  useEffect(() => {
    setShown(false);
    const id = setTimeout(() => setShown(true), 60);
    return () => clearTimeout(id);
  }, [result]);

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files)
      .filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type))
      .slice(0, 4);
    if (!list.length) return;
    const prepared = await Promise.all(list.map(prepare));
    setImgs(prepared);
    run(prepared);
  }

  async function run(images: Img[]) {
    setState("loading");
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang, images: images.map(({ media_type, data }) => ({ media_type, data })) }),
      });
      const data = await res.json();
      if (res.status === 501) {
        setError(t("an_no_key"));
        setState("error");
        return;
      }
      if (!res.ok) throw new Error(data.error || res.status);
      setResult({ a: data as Analysis, sample: null });
      setState("ok");
    } catch (e) {
      setError(t("an_error") + (e instanceof Error ? e.message : String(e)));
      setState("error");
    }
  }

  function sample(k: "cbc" | "thyroid") {
    setImgs([]);
    setError(null);
    setResult({ a: (k === "cbc" ? SAMPLE_CBC : SAMPLE_THYROID)(lang), sample: k });
    setState("ok");
    setOpen(null);
  }

  const a = result?.a;

  return (
    <div className="an reveal">
      <div className="an__in">
        <div
          className={`drop${over ? " drop--over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            addFiles(e.dataTransfer.files);
          }}
        >
          <Icon name="upload" size={22} />
          <div style={{ fontWeight: 500 }}>{t("an_drop")}</div>
          <button className="btn btn--primary btn--sm" onClick={() => fileRef.current?.click()}>
            {t("an_choose")}
          </button>
          <div className="label">{t("an_formats")}</div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
        </div>
        {imgs.length > 0 && (
          <div className="thumbs">
            {imgs.map((im, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={im.preview} alt="" />
            ))}
          </div>
        )}
        <div className="field">
          <span className="label">{t("an_samples")}</span>
          <div className="chips">
            <button className="chip" aria-pressed={result?.sample === "cbc"} onClick={() => sample("cbc")}>
              {t("an_sample_cbc")}
            </button>
            <button className="chip" aria-pressed={result?.sample === "thyroid"} onClick={() => sample("thyroid")}>
              {t("an_sample_thyroid")}
            </button>
          </div>
        </div>
        <div className="note" style={{ padding: 0, border: 0 }}>
          <Icon name="alert" size={15} />
          <span>{t("an_disclaimer")}</span>
        </div>
      </div>

      <div className="an__out" aria-live="polite">
        {state === "idle" && (
          <div className="an__empty">
            <Icon name="doc" size={28} />
            <span>{t("an_sub")}</span>
          </div>
        )}
        {state === "loading" && (
          <div>
            <div className="an__bar">
              <span className="label" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                <Icon name="spinner" className="spin" /> {t("an_running")}
              </span>
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div className="skel" key={i}>
                <i style={{ width: `${50 + ((i * 17) % 40)}%` }} />
              </div>
            ))}
          </div>
        )}
        {state === "error" && (
          <div className="an__empty">
            <Icon name="alert" size={24} />
            <span>{error}</span>
            <div className="chips">
              <button className="btn btn--sm" onClick={() => sample("cbc")}>
                {t("an_sample_cbc")}
              </button>
            </div>
          </div>
        )}
        {state === "ok" && a && (
          <div>
            <div className="an__bar">
              <div>
                <span className="label">{t("an_result")}</span>
                {result?.sample && <span className="tag" style={{ marginLeft: 8 }}>{t("an_sample_badge")}</span>}
                {a.lab && !result?.sample && <span className="muted" style={{ marginLeft: 8, fontSize: 13 }}>{a.lab}</span>}
              </div>
              <span className="label num">
                {a.items.filter((i) => i.status === "normal").length}/{a.items.length} {t("s_normal").toLowerCase()}
              </span>
            </div>
            {a.urgent && (
              <div className="alert" role="alert">
                <Icon name="alert" /> {t("an_urgent")}
              </div>
            )}
            {!a.readable && <div className="alert">{t("an_unreadable")}</div>}
            <div className="an__row label" style={{ cursor: "default", background: "transparent" }} aria-hidden="true">
              <span>{t("an_indicator")}</span>
              <span>{t("an_value")}</span>
              <span className="scale-cell">{t("an_ref")}</span>
              <span />
            </div>
            <div className="stagger" key={`${result?.sample}-${a.items.length}`}>
              {a.items.map((it, i) => (
                <div key={i}>
                  <button className="an__row" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                    <b>{it.name}</b>
                    <span className="mono num">
                      {it.value ?? it.value_text} <span className="muted" style={{ fontSize: 12 }}>{it.unit}</span>
                    </span>
                    <span className="scale-cell">
                      <Scale item={it} shown={shown} />
                    </span>
                    <span>
                      <span className={`status status--${it.status}`}>{t(STATUS_KEY[it.status])}</span>
                    </span>
                    {open === i && <span className="an__exp">{it.explanation}</span>}
                  </button>
                </div>
              ))}
            </div>
            <div className="an__foot">
              <div>
                <div className="label">{t("an_doctor")}</div>
                <div style={{ fontSize: 22, fontWeight: 600, margin: "6px 0 4px" }}>{t(specKey(a.doctor))}</div>
                <p className="muted" style={{ fontSize: 14 }}>{a.doctor_reason}</p>
                <p style={{ fontSize: 14, marginTop: 10 }}>{a.summary}</p>
                <button className="btn btn--accent btn--sm" style={{ marginTop: 14 }} onClick={() => onFindDoctor(a.doctor)}>
                  <Icon name="locate" /> {t("an_find")}
                </button>
              </div>
              <div>
                <div className="label">{t("an_questions")}</div>
                <ol>
                  {a.questions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Scale({ item, shown }: { item: AnItem; shown: boolean }) {
  const { ref_low: lo, ref_high: hi, value: v } = item;
  if (lo === null || hi === null || v === null || hi <= lo) {
    return <span className="muted mono" style={{ fontSize: 12 }}>{item.ref_text || "—"}</span>;
  }
  // Me'yor zonasi o'rtada — ikki tomonda chetga chiqish uchun joy qoldiramiz
  const span = hi - lo;
  const min = Math.max(0, lo - span * 0.6);
  const max = hi + span * 0.6;
  const pos = (x: number) => Math.min(100, Math.max(0, ((x - min) / (max - min)) * 100));
  return (
    <span style={{ display: "block" }}>
      <span className="scale" style={{ display: "block" }}>
        <span className="scale__track" />
        <span className="scale__ok" style={{ left: `${pos(lo)}%`, width: `${pos(hi) - pos(lo)}%` }} />
        <span className="scale__mark" style={{ left: shown ? `${pos(v)}%` : "50%" }} />
      </span>
      <span className="scale__ends">
        <span style={{ left: `${pos(lo)}%` }}>{lo}</span>
        <span style={{ left: `${pos(hi)}%` }}>{hi}</span>
      </span>
    </span>
  );
}
