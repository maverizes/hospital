"use client";

import { useMemo, useState } from "react";
import { useApp } from "./AppContext";
import { fmtDate, fmtSum } from "@/lib/format";

const GROWTH = 1.08;

export default function Partners() {
  const { t, lang } = useApp();
  const [visits, setVisits] = useState(400);
  const [check, setCheck] = useState(200_000);
  const [rate, setRate] = useState(7);
  const [subs, setSubs] = useState(300);
  const [subPrice, setSubPrice] = useState(29_000);
  const [hover, setHover] = useState<number | null>(null);

  const commission = (visits * check * rate) / 100;
  const subsRev = subs * subPrice;
  const month = commission + subsRev;
  const clinicGets = visits * check - commission;

  const series = useMemo(() => {
    const start = new Date();
    start.setDate(1);
    return Array.from({ length: 12 }, (_, i) => {
      const g = GROWTH ** i;
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      return { d, c: commission * g, s: subsRev * g };
    });
  }, [commission, subsRev]);
  const year = series.reduce((a, x) => a + x.c + x.s, 0);

  // Grafik geometriyasi
  const W = 640;
  const H = 240;
  const padL = 44;
  const padB = 22;
  const top = Math.max(...series.map((x) => x.c + x.s), 1);
  const step = niceStep(top / 4);
  const yMax = Math.ceil(top / step) * step;
  const bw = (W - padL) / 12;
  const barW = Math.min(30, bw * 0.56);
  const y = (v: number) => H - padB - (v / yMax) * (H - padB - 8);
  const short = (v: number) => (v === 0 ? "0" : v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${Math.round(v / 1e6)}M` : `${Math.round(v / 1e3)}k`);

  return (
    <div className="pt reveal">
      <div className="pt__in">
        <Range label={t("pt_visits")} value={visits} set={setVisits} min={20} max={3000} step={10} out={fmtSum(visits)} />
        <Range label={t("pt_check")} value={check} set={setCheck} min={50_000} max={800_000} step={10_000} out={fmtSum(check)} />
        <Range label={t("pt_rate")} value={rate} set={setRate} min={3} max={15} step={0.5} out={`${rate}%`} />
        <Range label={t("pt_family")} value={subs} set={setSubs} min={0} max={5000} step={50} out={fmtSum(subs)} />
        <Range label={t("pt_family_price")} value={subPrice} set={setSubPrice} min={9_000} max={99_000} step={1_000} out={fmtSum(subPrice)} />
      </div>
      <div className="pt__out">
        <div className="kpis">
          <div>
            <span className="label">{t("pt_month")}</span>
            <strong>{fmtSum(month)}</strong>
          </div>
          <div>
            <span className="label">{t("pt_year")}</span>
            <strong>{fmtSum(year)}</strong>
          </div>
          <div>
            <span className="label">{t("pt_clinic_gets")}</span>
            <strong>{fmtSum(clinicGets)}</strong>
          </div>
        </div>
        <div className="chart">
          <div className="label" style={{ marginBottom: 8 }}>{t("pt_chart")}, so'm</div>
          <div className="legend">
            <span><i style={{ background: "var(--series-1)" }} />{t("pt_commission")}</span>
            <span><i style={{ background: "var(--series-2)" }} />{t("pt_subs")}</span>
          </div>
          <div style={{ position: "relative" }}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("pt_chart")} onMouseLeave={() => setHover(null)}>
            <g className="grid">
              {Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => (
                <line key={i} x1={padL} x2={W} y1={y(i * step)} y2={y(i * step)} />
              ))}
            </g>
            <g className="axis">
              {Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => (
                <text key={i} x={padL - 8} y={y(i * step) + 3} textAnchor="end">{short(i * step)}</text>
              ))}
              {series.map((m, i) => (
                <text key={i} x={padL + bw * i + bw / 2} y={H - 6} textAnchor="middle">
                  {fmtDate(lang, m.d, { month: "short" }).replace(".", "")}
                </text>
              ))}
            </g>
            {series.map((m, i) => {
              const x = padL + bw * i + (bw - barW) / 2;
              const yc = y(m.c);
              const ys = y(m.c + m.s);
              const gap = m.s > 0 && m.c > 0 ? 2 : 0;
              return (
                <g key={i} className="col" onMouseEnter={() => setHover(i)}>
                  <rect className="hit" x={padL + bw * i} y={0} width={bw} height={H - padB} />
                  <path d={bar(x, yc, barW, H - padB - yc, m.s > 0 ? 0 : 4)} fill="var(--series-1)" />
                  {m.s > 0 && <path d={bar(x, ys, barW, Math.max(0, yc - ys - gap), 4)} fill="var(--series-2)" />}
                </g>
              );
            })}
          </svg>
          {hover !== null && (
            <div
              className="tooltip"
              style={{
                left: `${((padL + bw * hover + bw / 2) / W) * 100}%`,
                top: `${(y(series[hover].c + series[hover].s) / H) * 100}%`,
              }}
            >
              <b>{fmtDate(lang, series[hover].d, { month: "long", year: "numeric" })}</b>
              <span><span>{t("pt_commission")}</span><b className="num">{fmtSum(series[hover].c)}</b></span>
              <span><span>{t("pt_subs")}</span><b className="num">{fmtSum(series[hover].s)}</b></span>
            </div>
          )}
          </div>
          <table className="sr-only">
            <tbody>
              {series.map((m, i) => (
                <tr key={i}>
                  <td>{fmtDate(lang, m.d, { month: "long" })}</td>
                  <td>{Math.round(m.c)}</td>
                  <td>{Math.round(m.s)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Range(p: {
  label: string;
  value: number;
  set: (n: number) => void;
  min: number;
  max: number;
  step: number;
  out: string;
}) {
  return (
    <label className="field">
      <span className="field__row">
        <span>{p.label}</span>
        <output>{p.out}</output>
      </span>
      <input type="range" min={p.min} max={p.max} step={p.step} value={p.value} onChange={(e) => p.set(Number(e.target.value))} />
    </label>
  );
}

/** Faqat yuqori burchaklari yumaloq ustun */
function bar(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return "";
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function niceStep(raw: number) {
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
