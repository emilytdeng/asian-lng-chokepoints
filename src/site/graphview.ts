/** The same flow network drawn as a textbook graph: source → exporters → straits and seas → importers → sink. */
import type { Evaluation, State } from "./compute";
import { NET, fmt, name, pct } from "./compute";
import { hoverTips } from "./tips";
import { exporterSupply } from "../model/graph";
import type { MapOptions } from "./map";
import { cutPath } from "./cutline";

const NS = "http://www.w3.org/2000/svg";
const W = 1000, H = 720;
const BUS = 700; // y of the line that carries source → pipelines along the bottom

/** Hand-placed layered layout, columns left to right. */
const POS: Record<string, [number, number]> = {
  __S: [34, 330], __T: [972, 330],
  QAT: [200, 40], UAE: [200, 80], OMN: [200, 120],
  OTH_ATL: [200, 190], USA: [200, 230], RUS_ARC: [200, 270],
  AUS: [200, 340], PNG: [200, 380], IDN: [200, 420], MYS: [200, 460], BRN: [200, 500], RUS_SAK: [200, 540], OTH_PAC: [200, 580],
  HORMUZ: [370, 80], BAB_SUEZ: [370, 185], CAPE: [370, 255], PANAMA: [370, 330],
  IO: [530, 175], MALACCA: [650, 265], LOMBOK: [650, 370], PACIFIC: [765, 440],
  PAK: [880, 60], IND: [880, 125], BGD: [880, 190], JPN: [880, 270], KOR: [880, 340], TWN: [880, 410], CHN: [880, 500], THA: [880, 585],
  POS: [560, 650], CAC: [660, 650], MYC: [760, 650], MYT: [860, 650],
};
const SHORT: Record<string, string> = {
  BAB_SUEZ: "Red Sea", CAPE: "Cape", PANAMA: "Panama", HORMUZ: "Hormuz", MALACCA: "Malacca", LOMBOK: "Lombok",
  IO: "Indian Ocean", PACIFIC: "Pacific", OTH_ATL: "Other Atlantic", OTH_PAC: "Other Pacific", RUS_ARC: "Russia (Arctic)",
  RUS_SAK: "Russia (Sakhalin)", PNG: "Papua N. Guinea", POS: "Power of Siberia", CAC: "Central Asia", MYC: "Myanmar→China", MYT: "Myanmar→Thai",
};
const R: Record<string, number> = { src: 7, imp: 9, choke: 9, lane: 8, pipe: 6, st: 15 };

type Pt = [number, number];
type Edge = { g: SVGGElement; track: SVGPathElement; flow: SVGPathElement; cut: SVGPathElement; path: SVGPathElement; title: SVGTitleElement; keys: string[]; label: string; from: string; to: string; pts: Pt[] };
type Node = { g: SVGGElement; v: SVGTextElement; kind: string };

export class ChartGraph {
  svg: SVGSVGElement;
  private edges = new Map<string, Edge>();
  private nodes = new Map<string, Node>();

  constructor(host: HTMLElement, private opts: MapOptions) {
    this.svg = document.createElementNS(NS, "svg");
    this.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    this.svg.setAttribute("role", "img");
    this.svg.setAttribute("aria-label", "Network graph: a source feeds every exporter and pipeline, gas runs through straits and seas to eight importers, and each importer drains to a sink");
    this.svg.classList.add("chart-map", "chart-graph");
    host.appendChild(this.svg);
    hoverTips(this.svg);
    const defs = this.el("defs", {});
    const m = this.el("marker", { id: `arrow-${Math.random().toString(36).slice(2, 8)}`, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse", markerUnits: "userSpaceOnUse" }, defs);
    this.el("path", { d: "M0,1 L10,5 L0,9 Z", class: "g-arrow" }, m);
    this.marker = `url(#${m.id})`;
    this.draw();
  }
  private marker: string;
  private cutLine!: SVGPathElement;
  private cutHalo!: SVGPathElement;

  private el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element = this.svg) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, String(attrs[k]));
    parent.appendChild(e);
    return e;
  }

  private kindOf(id: string) {
    if (id === "__S" || id === "__T") return "st";
    if (NET.exporters.some((e) => e.id === id)) return "src";
    if (NET.importers.some((i) => i.id === id)) return "imp";
    if (NET.pipelines.some((p) => p.id === id)) return "pipe";
    return NET.routes.find((r) => r.id === id)?.kind === "lane" ? "lane" : "choke";
  }

  /** Straight (or slightly bowed, for two-way pairs) path from node edge to node edge. */
  private line(a: string, b: string, bow = 0) {
    const [x1, y1] = POS[a], [x2, y2] = POS[b];
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
    const ra = R[this.kindOf(a)] + 2, rb = R[this.kindOf(b)] + 3;
    const p1 = [x1 + ux * ra, y1 + uy * ra], p2 = [x2 - ux * rb, y2 - uy * rb];
    if (!bow) return `M${p1[0]},${p1[1]} L${p2[0]},${p2[1]}`;
    const cx = (x1 + x2) / 2 - uy * bow, cy = (y1 + y2) / 2 + ux * bow;
    return `M${p1[0]},${p1[1]} Q${cx},${cy} ${p2[0]},${p2[1]}`;
  }

  private edge(id: string, d: string, keys: string[], label: string, parent: Element, from: string, to: string, pts: Pt[] = [POS[from], POS[to]]) {
    const g = this.el("g", { class: "edge gedge" }, parent);
    const track = this.el("path", { d, class: "edge-track", "marker-end": this.marker }, g);
    const flow = this.el("path", { d, class: "edge-flow" }, g);
    const path = this.el("path", { d, class: "edge-path" }, g);
    const cut = this.el("path", { d, class: "edge-cut" }, g);
    this.el("path", { d, class: "hit" }, g);
    const title = this.el("title", {}, g);
    this.edges.set(id, { g, track, flow, cut, path, title, keys, label, from, to, pts });
  }

  private draw() {
    const layer = this.el("g", { class: "edges" });
    const nm = (id: string) => id === "__S" ? "Source" : id === "__T" ? "Sink" : SHORT[id] ?? NET.exporters.find((e) => e.id === id)?.name ?? NET.importers.find((i) => i.id === id)?.name ?? id;
    for (const e of NET.exporters) this.edge(`S-${e.id}`, this.line("__S", e.id), [`supply:${e.id}`, `divert:${e.id}`], `Source → ${nm(e.id)}`, layer, "__S", e.id);
    const ids = new Set(NET.links.map((l) => l.id));
    for (const l of NET.links) {
      const two = ids.has(`${l.to}-${l.from}`);
      this.edge(l.id, this.line(l.from, l.to, two ? 14 : 0), [`link:${l.id}`], `${nm(l.from)} → ${nm(l.to)}`, layer, l.from, l.to);
    }
    for (const p of NET.pipelines) {
      if (!POS[p.id]) continue;
      const [x, y] = POS[p.id], [sx, sy] = POS.__S;
      // source → pipeline runs down the left edge and along the bottom
      const d = `M${sx},${sy + R.st + 2} L${sx},${BUS - 12} Q${sx},${BUS} ${sx + 12},${BUS} L${x - 12},${BUS} Q${x},${BUS} ${x},${BUS - 12} L${x},${y + R.pipe + 3}`;
      this.edge(`S-${p.id}`, d, [`pipeline:${p.id}`], `Source → ${p.name}`, layer, "__S", p.id, [[sx, sy], [sx, BUS], [x, BUS], [x, y]]);
      this.edge(`${p.id}-${p.to}`, this.line(p.id, p.to), [`pipeline:${p.id}`], `${p.name} → ${nm(p.to)}`, layer, p.id, p.to);
    }
    for (const i of NET.importers) this.edge(`${i.id}-T`, this.line(i.id, "__T"), [`demand:${i.id}`], `${i.name} → Sink (its import needs)`, layer, i.id, "__T");

    this.cutHalo = this.el("path", { class: "g-cuthalo", d: "" });
    this.cutLine = this.el("path", { class: "g-cutline", d: "" });
    const nl = this.el("g", { class: "nodes" });
    const add = (id: string) => {
      const kind = this.kindOf(id);
      const [x, y] = POS[id];
      const g = this.el("g", { class: `node g-${kind} ${kind === "choke" ? "choke" : kind === "imp" ? "imp" : kind === "lane" ? "lane" : kind === "src" ? "src" : ""}`, transform: `translate(${x},${y})` }, nl);
      if (kind === "choke") this.el("path", { d: "M0,-9 L9,0 L0,9 L-9,0 Z" }, g);
      else if (kind === "pipe") this.el("rect", { x: -6, y: -6, width: 12, height: 12, rx: 2 }, g);
      else this.el("circle", { r: R[kind] }, g);
      let t: SVGTextElement, v: SVGTextElement;
      if (kind === "st") {
        const c = this.el("text", { y: 4.5, "text-anchor": "middle", class: "g-st" }, g); c.textContent = id === "__S" ? "S" : "T";
        t = this.el("text", { y: -24, "text-anchor": "middle", class: "nlabel" }, g);
        v = this.el("text", { y: 34, "text-anchor": "middle", class: "nvalue" }, g);
      } else if (kind === "src") {
        t = this.el("text", { x: -12, y: 0, "text-anchor": "end", class: "nlabel" }, g);
        v = this.el("text", { x: -12, y: 12, "text-anchor": "end", class: "nvalue" }, g);
      } else if (kind === "pipe") {
        t = this.el("text", { y: 22, "text-anchor": "middle", class: "nlabel" }, g);
        v = this.el("text", { y: 35, "text-anchor": "middle", class: "nvalue" }, g);
      } else if (kind === "imp") {
        t = this.el("text", { y: -15, "text-anchor": "middle", class: "nlabel" }, g);
        v = this.el("text", { y: 23, "text-anchor": "middle", class: "nvalue" }, g);
      } else {
        t = this.el("text", { y: -15, "text-anchor": "middle", class: "nlabel" }, g);
        v = this.el("text", { y: 24, "text-anchor": "middle", class: "nvalue" }, g);
      }
      t.textContent = id === "__S" ? "Source" : id === "__T" ? "Sink" : nm(id);
      this.nodes.set(id, { g, v, kind });
      const full = NET.routes.find((r) => r.id === id)?.name ?? NET.pipelines.find((p) => p.id === id)?.name ?? NET.exporters.find((e) => e.id === id)?.name;
      if (this.opts.interactive && (kind === "choke" || kind === "src" || kind === "pipe")) this.clickable(g, id, `${full}: click to ${kind === "choke" ? "close or reopen" : "shut or reopen"}`);
      else if (full) { const tt = this.el("title", {}, g); tt.textContent = full; }
    };
    for (const id of Object.keys(POS)) if (id !== "POS2") add(id);
    const bt = this.el("text", { x: 300, y: BUS - 6, class: "g-bus" }); bt.textContent = "Pipelines (overland, no strait)";
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

  /** Which drawn nodes are on the source side: exact from max-flow, else rebuilt by walking edges that aren't cut. */
  private sides(ev: Evaluation): Set<string> {
    const cut = new Set(ev.map.cut.map((c) => `${c.meta.type}:${c.meta.id}`));
    const closed = new Set(ev.scenario.close ?? []);
    if (ev.map.reach) {
      const r = new Set(ev.map.reach);
      for (const p of NET.pipelines) if (r.has(p.to) && !cut.has(`pipeline:${p.id}`) && !closed.has(p.id)) r.add(p.id);
      return r;
    }
    const r = new Set<string>(["__S"]);
    const q = ["__S"];
    while (q.length) {
      const u = q.shift()!;
      for (const e of this.edges.values()) {
        if (e.from !== u || r.has(e.to) || e.keys.some((k) => cut.has(k)) || closed.has(e.to)) continue;
        if (cut.has(`route:${e.to}`) || cut.has(`regas:${e.to}`)) continue;
        r.add(e.to); q.push(e.to);
      }
    }
    return r;
  }

  private drawCut(ev: Evaluation, s: State) {
    if (this.opts.cut === false || ev.progress || !ev.map.cut.length) { this.cutLine.setAttribute("d", ""); this.cutHalo.setAttribute("d", ""); return; }
    const r = this.sides(ev);
    const shown = (id: string) => this.nodes.has(id);
    const d = cutPath({
      w: W, h: H,
      nodes: [...this.nodes.keys()].filter(shown).map((id) => ({ p: POS[id], source: r.has(id) })),
      edges: [...this.edges.values()].filter((e) => shown(e.from) && shown(e.to) && r.has(e.from) === r.has(e.to) && !(s.focus && e.to === "__T" && e.from !== s.focus))
        .map((e) => ({ pts: e.pts, source: r.has(e.from) })),
    });
    this.cutLine.setAttribute("d", d);
    this.cutHalo.setAttribute("d", d);
  }

  update(ev: Evaluation, s: State, highlight: string[] = []) {
    const f = ev.map.arcFlow;
    const cutKeys = new Set(ev.map.cut.map((c) => `${c.meta.type}:${c.meta.id}`));
    const path = ev.progress?.path ?? new Set<string>();
    const closed = new Set(ev.scenario.close ?? []);
    const w = (x: number) => (x > 1e-6 ? 1.2 + Math.sqrt(x) * 1.15 : 0);
    const div = s.simple ? NET.meta.diversion.value : s.diversion;
    const cap: Record<string, number> = {};
    for (const e of NET.exporters) cap[e.id] = closed.has(e.id) ? 0 : exporterSupply(e, div);
    for (const p of NET.pipelines) cap[p.id] = closed.has(p.id) ? 0 : p.capacity.value;

    for (const [id, e] of this.edges) {
      const flow = e.keys.reduce((a, k) => a + (f[k] ?? 0), 0);
      e.flow.setAttribute("stroke-width", String(w(flow)));
      const capOf = id.startsWith("S-") ? cap[id.slice(2)] : id.endsWith("-T") ? NET.importers.find((i) => `${i.id}-T` === id)!.import_demand.value
        : NET.pipelines.some((p) => p.id === e.from) ? cap[e.from] : undefined; // sea lanes have no limit
      e.flow.classList.toggle("full", capOf !== undefined && capOf > 1e-6 && flow >= capOf - 1e-6);
      e.path.style.display = e.keys.some((k) => path.has(k)) ? "" : "none";
      // the cut sits on the S→exporter, pipeline and importer→T arcs (links and lanes are unlimited unless closed)
      e.cut.style.display = "none";
      const [a, b] = id.includes("-") ? [id.split("-")[0], id.split("-").slice(1).join("-")] : [id, ""];
      const shut = closed.has(a) || closed.has(b) || (a === "S" && closed.has(b));
      e.g.classList.toggle("closed", shut);
      const c = id.startsWith("S-") ? cap[b] : id.endsWith("-T") ? NET.importers.find((i) => i.id === a)!.import_demand.value : NET.pipelines.some((p) => p.id === a) ? cap[a] : shut ? 0 : Infinity;
      e.title.textContent = `${e.label}: ${fmt(flow)} mtpa${Number.isFinite(c) ? ` of ${fmt(c)} possible` : " (no limit)"}`;
      e.g.dataset.tip = shut ? `${e.label}: closed` : `${e.label}\n${fmt(flow)} mtpa${Number.isFinite(c) ? ` of ${fmt(c)} possible` : " (no limit)"}`;
      e.g.classList.toggle("dim", !!s.focus && (id.endsWith("-T") ? !id.startsWith(s.focus + "-") : false));
    }

    const view = this.opts.view?.() ?? "priority";
    let total = 0;
    for (const [id, n] of this.nodes) {
      n.g.classList.toggle("closed", closed.has(id) || (id === "HORMUZ" && s.hormuz === "closed"));
      n.g.classList.toggle("hl", highlight.includes(id));
      n.g.classList.toggle("onpath", [...path].some((k) => k.endsWith(`:${id}`)) || (id === "__S" && path.size > 0) || (id === "__T" && path.size > 0));
      n.g.classList.toggle("dim", !!s.focus && n.kind === "imp" && id !== s.focus);
      n.g.classList.toggle("oncut", cutKeys.has(`route:${id}`));
      if (n.kind === "src") {
        const fl = (f[`supply:${id}`] ?? 0) + (f[`divert:${id}`] ?? 0);
        n.v.textContent = closed.has(id) ? "embargoed" : `${fmt(fl, 0)} / ${fmt(cap[id], 0)}`;
        n.g.dataset.tip = `${name(id)}\n${closed.has(id) ? "Embargoed" : `Sells ${fmt(fl)} of the ${fmt(cap[id])} mtpa it can send to these buyers`}${this.opts.interactive ? "\nClick to embargo or restore" : ""}`;
      } else if (n.kind === "pipe") {
        n.v.textContent = closed.has(id) ? "shut" : `${fmt(f[`pipeline:${id}`] ?? 0, 0)} / ${fmt(cap[id], 0)}`;
        n.g.dataset.tip = `${name(id)} pipeline\n${closed.has(id) ? "Shut" : `${fmt(f[`pipeline:${id}`] ?? 0)} of ${fmt(cap[id])} mtpa`}${this.opts.interactive ? "\nClick to shut or reopen" : ""}`;
      } else if (n.kind === "imp") {
        const im = NET.importers.find((i) => i.id === id)!;
        const got = f[`demand:${id}`] ?? 0;
        total += got;
        if (ev.progress) { n.v.textContent = `${fmt(got, 0)} / ${fmt(im.import_demand.value, 0)}`; n.g.classList.remove("short"); n.g.dataset.tip = `${im.name}\nSo far ${fmt(got)} of ${fmt(im.import_demand.value)} mtpa`; }
        else {
          const sh = ev.rows.find((r) => r.id === id)!.share[view];
          const need = im.import_demand.value;
          n.v.textContent = `${fmt(sh * need, 0)} / ${fmt(need, 0)}${sh < 0.995 ? ` (${pct(sh)})` : ""}`;
          n.g.dataset.tip = `${im.name}\nGets ${fmt(sh * need)} of the ${fmt(need)} mtpa it needs (${pct(sh)})`;
          n.g.classList.toggle("short", sh < 0.995);
        }
      } else if (n.kind === "choke") {
        n.v.textContent = closed.has(id) || (id === "HORMUZ" && s.hormuz === "closed") ? "closed" : "";
        n.g.dataset.tip = `${name(id)}\n${n.v.textContent ? "Closed" : `${fmt(f[`route:${id}`] ?? 0)} mtpa passing through`}${this.opts.interactive ? "\nClick to close or reopen" : ""}`;
      }
    }
    this.drawCut(ev, s);
    this.nodes.get("__S")!.v.textContent = this.nodes.get("__T")!.v.textContent = `${fmt(ev.progress ? total : ev.map.total, 0)} mtpa`;
    const tot = fmt(ev.progress ? total : ev.map.total);
    this.nodes.get("__S")!.g.dataset.tip = `S, the made-up start\nFeeds every exporter and pipeline: ${tot} mtpa in all`;
    this.nodes.get("__T")!.g.dataset.tip = `T, the made-up finish\nCollects what every importer receives: ${tot} mtpa in all`;
    for (const [id, n] of this.nodes) if (n.kind === "lane") n.g.dataset.tip = `${name(id)} (open sea)\n${fmt(f[`route:${id}`] ?? 0)} mtpa passing through`;
  }
}
