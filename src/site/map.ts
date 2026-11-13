import { geoGraticule10, geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import land110 from "world-atlas/land-110m.json";
import type { Evaluation, State, View } from "./compute";
import { NET, fmt, name, pct } from "./compute";

const NS = "http://www.w3.org/2000/svg";
const W = 1000, H = 640;

/** Display positions [lon, lat]. Distant exporters sit at the chart margin with a note on where they really are. */
const DISPLAY: Record<string, [number, number]> = {
  USA: [11, -24], OTH_ATL: [10, 4], OTH_PAC: [175, 38], PANAMA: [175, 10], RUS_ARC: [66, 47.5],
  IO: [70, 6], PACIFIC: [138, 20], MALACCA: [99.5, 3.6], LOMBOK: [115.8, -8.8], HORMUZ: [56.4, 26.4],
  BAB_SUEZ: [43.4, 12.6], OMN: [59.6, 20.2], CAPE: [19, -35.5], BRN: [114.6, 5.4], MYS: [111.5, 2.6], IDN: [117.8, -0.6],
};
const MARGIN_NOTE: Record<string, string> = { USA: "from the US Gulf Coast", OTH_PAC: "LNG Canada, Peru", PANAMA: "for US cargoes", OTH_ATL: "Africa, Atlantic", RUS_ARC: "Yamal, Arctic LNG 2" };
/** Label side per node: r(ight), l(eft), t(op), b(ottom). */
const SIDE: Record<string, "r" | "l" | "t" | "b"> = {
  QAT: "l", UAE: "b", OMN: "r", HORMUZ: "t", PAK: "l", IND: "b", BGD: "r", BAB_SUEZ: "l", CAPE: "r", USA: "r", OTH_ATL: "r", RUS_ARC: "r",
  MALACCA: "l", LOMBOK: "b", THA: "l", MYS: "l", BRN: "t", IDN: "r", PNG: "r", AUS: "b", TWN: "r", CHN: "l", KOR: "l", JPN: "r",
  RUS_SAK: "r", OTH_PAC: "l", PANAMA: "l",
};
/** Pipeline origins drawn on the map. */
const PIPE_FROM: Record<string, [number, number]> = { POS: [124, 47.5], CAC: [84, 42], MYC: [96, 24.5], MYT: [96.5, 16.5], POS2: [108, 46] };
/** Control points [lon, lat] for links that would otherwise cut across land. */
const BEND: Record<string, [number, number]> = {
  "USA-BAB_SUEZ": [24, 34], "OTH_ATL-BAB_SUEZ": [24, 32], "RUS_ARC-BAB_SUEZ": [40, 38], "RUS_ARC-CAPE": [14, 28],
  "RUS_ARC-PACIFIC": [118, 54], "OTH_ATL-IO": [46, -18], "USA-CAPE": [5, -38], "OTH_ATL-CAPE": [4, -20],
  "CAPE-IO": [52, -32], "AUS-IO": [92, -18], "AUS-PACIFIC": [132, -14], "IO-BGD": [86, 10], "IO-PAK": [63, 18],
  "IO-IND": [68, 16], "MALACCA-IO": [90, 0], "IO-MALACCA": [88, 7], "LOMBOK-IO": [100, -14], "IO-LOMBOK": [96, -10],
  "PACIFIC-THA": [112, 12], "PACIFIC-CHN": [128, 26], "PACIFIC-JPN": [142, 28], "PACIFIC-KOR": [130, 30],
  "MALACCA-PACIFIC": [112, 10], "PACIFIC-MALACCA": [115, 8], "LOMBOK-PACIFIC": [126, 2], "PACIFIC-LOMBOK": [124, -4],
  "PANAMA-PACIFIC": [160, 16], "OTH_PAC-PACIFIC": [160, 30],
  "CAPE-MALACCA": [70, -30], "MALACCA-THA": [100, 8],
};
// Links drawn once per pair (the reverse direction shares the curve).
const SKIP = new Set(["MALACCA-IO", "PACIFIC-MALACCA", "LOMBOK-IO", "PACIFIC-LOMBOK", "USA-PANAMA"]);

export interface MapOptions {
  interactive: boolean;
  onToggle?: (id: string) => void;
  view?: () => View;
}

export class ChartMap {
  svg: SVGSVGElement;
  private proj = geoMercator();
  private edges = new Map<string, { g: SVGGElement; track: SVGPathElement; flow: SVGPathElement; cut: SVGPathElement; path: SVGPathElement; id: string; reverse?: string }>();
  private nodes = new Map<string, { g: SVGGElement; v: SVGTextElement }>();
  private pipes = new Map<string, { g: SVGGElement; flow: SVGPathElement; track: SVGPathElement; path: SVGPathElement }>();

  constructor(host: HTMLElement, private opts: MapOptions) {
    this.svg = document.createElementNS(NS, "svg");
    this.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    this.svg.setAttribute("role", "img");
    this.svg.setAttribute("aria-label", "Nautical-chart schematic of LNG routes from exporters to eight Asian importers");
    this.svg.classList.add("chart-map");
    host.appendChild(this.svg);
    this.proj.fitExtent([[0, 0], [W, H]], { type: "MultiPoint", coordinates: [[6, -42], [180, 50]] } as any);
    this.drawBase();
    this.drawNetwork();
  }

  private el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element = this.svg) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, String(attrs[k]));
    parent.appendChild(e);
    return e;
  }
  private p(id: string): [number, number] {
    const ll = DISPLAY[id] ?? (NET.exporters.find((e) => e.id === id)?.lonlat ?? NET.importers.find((i) => i.id === id)?.lonlat ?? NET.routes.find((r) => r.id === id)?.lonlat) as [number, number];
    return this.proj(ll)!;
  }

  private drawBase() {
    const path = geoPath(this.proj);
    const land = feature(land110 as any, (land110 as any).objects.land);
    this.el("path", { d: path(geoGraticule10())!, class: "graticule" });
    this.el("path", { d: path(land as any)!, class: "land" });
    // compass rose, bottom right
    const g = this.el("g", { class: "rose", transform: `translate(${W - 70},${H - 70})` });
    this.el("circle", { r: 34, class: "rose-ring" }, g);
    this.el("path", { d: "M0,-30 L5,0 L0,30 L-5,0 Z", class: "rose-needle" }, g);
    this.el("path", { d: "M-30,0 L0,4 L30,0 L0,-4 Z", class: "rose-needle faint" }, g);
    const n = this.el("text", { y: -38, "text-anchor": "middle", class: "rose-n" }, g); n.textContent = "N";
    for (const [t, ll] of [["Arabian Sea", [63, 15]], ["Bay of Bengal", [88, 15]], ["South China Sea", [113, 14]], ["Indian Ocean", [80, -22]], ["Pacific Ocean", [158, 2]]] as const) {
      const [x, y] = this.proj(ll as [number, number])!;
      const tx = this.el("text", { x, y, class: "sea-label", "text-anchor": "middle" }); tx.textContent = t;
    }
  }

  private curve(a: [number, number], b: [number, number], bend?: [number, number]) {
    const c = bend ? this.proj(bend)! : [(a[0] + b[0]) / 2 + (b[1] - a[1]) * 0.12, (a[1] + b[1]) / 2 - (b[0] - a[0]) * 0.12];
    return `M${a[0]},${a[1]} Q${c[0]},${c[1]} ${b[0]},${b[1]}`;
  }

  private drawNetwork() {
    const layer = this.el("g", { class: "edges" });
    for (const l of NET.links) {
      if (SKIP.has(l.id)) continue;
      const d = this.curve(this.p(l.from), this.p(l.to), BEND[l.id]);
      const g = this.el("g", { class: "edge" }, layer);
      const track = this.el("path", { d, class: "edge-track" }, g);
      const flow = this.el("path", { d, class: "edge-flow" }, g);
      const path = this.el("path", { d, class: "edge-path" }, g);
      const cut = this.el("path", { d, class: "edge-cut" }, g);
      const rev = `${l.to}-${l.from}`;
      this.edges.set(l.id, { g, track, flow, cut, path, id: l.id, reverse: NET.links.some((x) => x.id === rev) ? rev : undefined });
    }
    for (const pl of NET.pipelines) {
      const a = this.proj(PIPE_FROM[pl.id])!, b = this.p(pl.to);
      const g = this.el("g", { class: "pipe" }, layer);
      const track = this.el("path", { d: this.curve(a, b), class: "pipe-track" }, g);
      const flow = this.el("path", { d: this.curve(a, b), class: "pipe-flow" }, g);
      const path = this.el("path", { d: this.curve(a, b), class: "edge-path" }, g);
      const t = this.el("text", { x: a[0], y: a[1] - 7, class: "pipe-label", "text-anchor": "middle" }, g);
      t.textContent = pl.name.replace(" (not built)", "");
      this.pipes.set(pl.id, { g, track, flow, path });
      if (this.opts.interactive) this.clickable(g, pl.id, `${pl.name}: click to shut or reopen`);
    }
    const nl = this.el("g", { class: "nodes" });
    const add = (id: string, kind: string, label: string) => {
      const [x, y] = this.p(id);
      const g = this.el("g", { class: `node ${kind}`, transform: `translate(${x},${y})` }, nl);
      if (kind === "choke") this.el("path", { d: "M0,-8 L7,0 L0,8 L-7,0 Z" }, g);
      else if (kind === "lane") this.el("circle", { r: 3.5 }, g);
      else this.el("circle", { r: kind === "imp" ? 7.5 : 5.5 }, g);
      const side = SIDE[id] ?? (x > W * 0.6 ? "l" : "r");
      const [dx, dy, anchor] = { r: [11, 4, "start"], l: [-11, 4, "end"], t: [0, -14, "middle"], b: [0, 20, "middle"] }[side] as [number, number, string];
      const t = this.el("text", { x: dx, y: side === "t" ? dy - 12 : dy, "text-anchor": anchor, class: "nlabel" }, g); t.textContent = label;
      const v = this.el("text", { x: dx, y: side === "t" ? dy : dy + 13, "text-anchor": anchor, class: "nvalue" }, g);
      if (MARGIN_NOTE[id]) v.textContent = MARGIN_NOTE[id];
      this.nodes.set(id, { g, v });
      if (this.opts.interactive && (kind === "choke" || kind === "src")) this.clickable(g, id, `${label}: click to ${kind === "src" ? "embargo or restore" : "close or reopen"}`);
    };
    for (const r of NET.routes) add(r.id, r.kind === "lane" ? "lane" : "choke", r.kind === "lane" ? "" : r.name);
    for (const e of NET.exporters) add(e.id, "src", e.name);
    for (const i of NET.importers) add(i.id, "imp", i.name);
  }

  private clickable(g: SVGGElement, id: string, title: string) {
    g.setAttribute("tabindex", "0");
    g.setAttribute("role", "button");
    g.classList.add("clickable");
    const t = this.el("title", {}, g); t.textContent = title;
    const go = () => this.opts.onToggle?.(id);
    g.addEventListener("click", go);
    g.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); go(); } });
  }

  update(ev: Evaluation, s: State, highlight: string[] = []) {
    const f = ev.map.arcFlow;
    const cutIds = new Set(ev.map.cut.map((c) => `${c.meta.type}:${c.meta.id}`));
    const path = ev.progress?.path ?? new Set<string>();
    const w = (x: number) => (x > 1e-6 ? 1.2 + Math.sqrt(x) * 1.15 : 0);
    for (const [id, e] of this.edges) {
      const flow = (f[`link:${id}`] ?? 0) + (e.reverse ? f[`link:${e.reverse}`] ?? 0 : 0);
      e.flow.setAttribute("stroke-width", String(w(flow)));
      const l = NET.links.find((x) => x.id === id)!;
      const closed = s.closed.has(l.from) || s.closed.has(l.to);
      e.g.classList.toggle("closed", closed);
      const onCut = cutIds.has(`link:${id}`);
      e.cut.style.display = onCut ? "" : "none";
      e.path.style.display = path.has(`link:${id}`) || (e.reverse && path.has(`link:${e.reverse}`)) ? "" : "none";
    }
    for (const [id, p] of this.pipes) {
      const cap = NET.pipelines.find((x) => x.id === id)!.capacity.value;
      p.g.style.display = cap > 0 || s.closed.has(id) ? "" : "none";
      p.flow.setAttribute("stroke-width", String(w(f[`pipeline:${id}`] ?? 0)));
      p.g.classList.toggle("closed", s.closed.has(id));
      p.path.style.display = path.has(`pipeline:${id}`) ? "" : "none";
    }
    const view: View = this.opts.view?.() ?? "priority";
    for (const [id, n] of this.nodes) {
      const isImp = NET.importers.some((i) => i.id === id);
      n.g.classList.toggle("closed", s.closed.has(id));
      n.g.classList.toggle("oncut", cutIds.has(`route:${id}`) || cutIds.has(`supply:${id}`) || cutIds.has(`divert:${id}`));
      n.g.classList.toggle("hl", highlight.includes(id));
      n.g.classList.toggle("onpath", [...path].some((k) => k.endsWith(`:${id}`)));
      n.g.classList.toggle("dim", !!s.focus && isImp && id !== s.focus);
      if (isImp) {
        const r = ev.rows.find((x) => x.id === id)!;
        const sh = r.share[view];
        if (ev.progress) { n.v.textContent = `${fmt(f[`demand:${id}`] ?? 0, 0)} of ${fmt(r.demand, 0)} mtpa`; n.g.classList.remove("short"); continue; }
        n.v.textContent = sh < 0.995 || this.opts.interactive ? `${pct(sh)} of demand` : "";
        n.g.classList.toggle("short", sh < 0.995);
      } else if (NET.exporters.some((e) => e.id === id) && !MARGIN_NOTE[id]) {
        n.v.textContent = s.closed.has(id) ? "embargoed" : `${fmt((f[`supply:${id}`] ?? 0) + (f[`divert:${id}`] ?? 0))} mtpa`;
      } else if (NET.routes.some((r) => r.id === id && r.kind === "chokepoint") && !MARGIN_NOTE[id]) {
        n.v.textContent = s.closed.has(id) ? "closed" : "";
      }
    }
  }
}

export { name };
