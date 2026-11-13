import type { Evaluation, ImporterRow } from "./compute";
import { days, fmt, pct } from "./compute";

const NS = "http://www.w3.org/2000/svg";
function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  parent.appendChild(e);
  return e;
}

interface Spec {
  title: string;
  ticks: { v: number; label: string }[];
  x: (v: number) => number; // value → 0..1
  row: (r: ImporterRow) => { lo: number; hi: number; main: number; alt: number; tip: string };
  order: (a: ImporterRow, b: ImporterRow) => number;
  legend: [string, string, string]; // band, main dot, alt ring
}

/** Range-and-dot chart: one row per importer, band = best/worst case, filled dot = main case, ring = alternative. */
function rangeDots(host: HTMLElement, ev: Evaluation, spec: Spec, highlight: string[] = []) {
  host.innerHTML = "";
  const fig = document.createElement("figure");
  fig.className = "rd";
  const cap = document.createElement("figcaption");
  cap.innerHTML = `<span class="rd-title">${spec.title}</span><span class="rd-legend"><span><i class="lg band"></i>${spec.legend[0]}</span><span><i class="lg dot"></i>${spec.legend[1]}</span><span><i class="lg ring"></i>${spec.legend[2]}</span></span>`;
  fig.appendChild(cap);
  const rows = [...ev.rows].sort(spec.order);
  const L = 104, R = 16, rowH = 30, top = 8, Wd = 560, Hd = top + rows.length * rowH + 26;
  const svg = el("svg", { viewBox: `0 0 ${Wd} ${Hd}`, role: "img", "aria-label": spec.title }, fig);
  const X = (v: number) => L + spec.x(v) * (Wd - L - R);
  for (const t of spec.ticks) {
    el("line", { x1: X(t.v), x2: X(t.v), y1: top - 2, y2: Hd - 22, class: "rd-grid" }, svg);
    const last = t === spec.ticks[spec.ticks.length - 1];
    const tx = el("text", { x: last ? X(t.v) + 4 : X(t.v), y: Hd - 8, "text-anchor": last && spec.x(t.v) > 0.99 ? "end" : "middle", class: "rd-tick" }, svg); tx.textContent = t.label;
  }
  rows.forEach((r, i) => {
    const y = top + i * rowH + rowH / 2;
    const v = spec.row(r);
    const g = el("g", { class: `rd-row${highlight.includes(r.id) ? " hl" : ""}`, tabindex: 0 }, svg);
    const t = el("title", {}, g); t.textContent = v.tip;
    el("rect", { x: 0, y: y - rowH / 2, width: Wd, height: rowH, class: "rd-hit" }, g);
    const lab = el("text", { x: L - 10, y: y + 4, "text-anchor": "end", class: "rd-label" }, g); lab.textContent = r.name;
    const x0 = X(v.lo), x1 = X(v.hi);
    el("rect", { x: Math.min(x0, x1) - 4, y: y - 4, width: Math.abs(x1 - x0) + 8, height: 8, rx: 4, class: "rd-band" }, g);
    el("circle", { cx: X(v.alt), cy: y, r: 5, class: "rd-ring" }, g);
    el("circle", { cx: X(v.main), cy: y, r: 5.5, class: "rd-dot" }, g);
  });
  host.appendChild(fig);
}

export function shareChart(host: HTMLElement, ev: Evaluation, highlight: string[] = []) {
  rangeDots(host, ev, {
    title: "Share of import demand each importer receives, Hormuz closed",
    ticks: [0, 0.25, 0.5, 0.75, 1].map((v) => ({ v, label: pct(v) })),
    x: (v) => v,
    order: (a, b) => a.share.priority - b.share.priority || a.share.last - b.share.last,
    row: (r) => ({ lo: r.share.last, hi: r.share.outbid, main: r.share.priority, alt: r.share.rationed,
      tip: `${r.name}: market order ${pct(r.share.priority)}, equal rationing ${pct(r.share.rationed)}, range ${pct(r.share.last)} (last in line) to ${pct(r.share.outbid)} (outbids everyone)` }),
    legend: ["Last in line → outbids everyone", "Market: rich buyers first", "Equal rationing"],
  }, highlight);
}

const CAP = 1000;
const logx = (d: number) => Math.log10(Math.min(CAP, Math.max(1, d))) / Math.log10(CAP) * 0.9 + (d > CAP ? 0.1 : 0);
export function coverChart(host: HTMLElement, ev: Evaluation, highlight: string[] = []) {
  const d = (c: { days: number; shortfall: number }) => (Number.isFinite(c.days) ? c.days : CAP * 2);
  rangeDots(host, ev, {
    title: "Days until storage runs dry, Hormuz closed (after fuel switching)",
    ticks: [{ v: 1, label: "1 day" }, { v: 10, label: "10" }, { v: 100, label: "100" }, { v: 1000, label: "1,000" }, { v: CAP * 2, label: "no gap" }],
    x: logx,
    order: (a, b) => d(a.cover.priority) - d(b.cover.priority) || d(a.cover.rationed) - d(b.cover.rationed),
    row: (r) => ({ lo: d(r.cover.last), hi: d(r.cover.rationed), main: d(r.cover.priority), alt: d(r.cover.rationed),
      tip: `${r.name}: market order ${days(r.cover.priority)}, equal rationing ${days(r.cover.rationed)}, last in line ${days(r.cover.last)}. Storage ${fmt(r.cover.priority.storageDraw)} mtpa draw.` }),
    legend: ["Last in line → equal rationing", "Market: rich buyers first", "Equal rationing"],
  }, highlight);
}
