/** SVG of the toy network: pipes drawn as wide grey tracks (width ∝ capacity) with blue flow inside (width ∝ flow). */
import type { AugmentStep } from "../model/maxflow";
import { cutPath } from "./cutline";
import { TOY_ARCS, TOY_NODES } from "./toydata";

const NS = "http://www.w3.org/2000/svg";
const W = 540, H = 300, R = 19, K = 2.6; // px of width per unit
const POS: Record<string, [number, number]> = { S: [34, 150], A: [140, 62], C: [290, 62], E: [420, 62], B: [140, 238], D: [290, 238], F: [420, 238], T: [506, 150] };

export interface ToyFrame {
  flows: number[];
  labels: "cap" | "flow";
  path?: AugmentStep;
  pulse?: string;
  reach?: boolean[];
  cut?: boolean;
  total?: number;
  note?: string;
}

export class ToyGraph {
  svg: SVGSVGElement;
  private arcs: { flow: SVGLineElement; track: SVGLineElement; label: SVGTextElement; a: [number, number]; b: [number, number] }[] = [];
  private nodes = new Map<string, SVGGElement>();
  private pathLayer: SVGGElement;
  private cutLine: SVGPathElement;
  private total: SVGTextElement;
  private cutText: SVGTextElement;

  constructor(host: HTMLElement, label = "A small made-up network: source S, sink T and six junctions A to F, joined by pipes of different sizes") {
    this.svg = document.createElementNS(NS, "svg");
    this.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    this.svg.setAttribute("role", "img");
    this.svg.setAttribute("aria-label", label);
    this.svg.classList.add("toy");
    host.appendChild(this.svg);
    const defs = this.el("defs", {});
    const m = this.el("marker", { id: `ta-${Math.random().toString(36).slice(2, 7)}`, viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 9, markerHeight: 9, orient: "auto", markerUnits: "userSpaceOnUse" }, defs);
    this.el("path", { d: "M0,0 L10,5 L0,10 Z", class: "toy-arrowhead" }, m);
    const shade = this.el("g", { class: "toy-shade" });
    const arcsG = this.el("g", {});
    this.pathLayer = this.el("g", { class: "toy-path" });
    this.cutLine = this.el("path", { class: "toy-cut", d: "" });
    const labelsG = this.el("g", {});
    TOY_ARCS.forEach(([u, v, c]) => {
      const [x1, y1] = POS[TOY_NODES[u]], [x2, y2] = POS[TOY_NODES[v]];
      const L = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / L, uy = (y2 - y1) / L;
      const a: [number, number] = [x1 + ux * R, y1 + uy * R], b: [number, number] = [x2 - ux * (R + 4), y2 - uy * (R + 4)];
      const g = this.el("g", { class: "toy-arc" }, arcsG);
      const track = this.el("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: "toy-track", "stroke-width": K * c }, g);
      const flow = this.el("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: "toy-flow", "stroke-width": 0 }, g);
      this.el("line", { x1: b[0] - ux * 2, y1: b[1] - uy * 2, x2: b[0] + ux * 3, y2: b[1] + uy * 3, class: "toy-tip", "marker-end": `url(#${m.id})` }, g);
      // label sits beside the pipe, on the outside of the figure
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      let nx = -uy, ny = ux;
      if (ny > 0 && my < H / 2) { nx = -nx; ny = -ny; }
      if (ny < 0 && my > H / 2) { nx = -nx; ny = -ny; }
      const off = (K * c) / 2 + 12;
      const label = this.el("text", { x: mx + nx * off, y: my + ny * off + 4, class: "toy-label", "text-anchor": "middle" }, labelsG);
      this.arcs.push({ flow, track, label, a, b });
    });
    for (const id of TOY_NODES) {
      const [x, y] = POS[id];
      const g = this.el("g", { class: `toy-node${id === "S" || id === "T" ? " st" : ""}`, transform: `translate(${x},${y})` });
      this.el("circle", { r: R }, g);
      const t = this.el("text", { y: 5.5, "text-anchor": "middle" }, g); t.textContent = id;
      this.nodes.set(id, g);
      this.el("circle", { r: R + 16, class: "toy-halo", cx: x, cy: y }, shade);
    }
    const s = this.el("text", { x: POS.S[0], y: POS.S[1] + R + 18, class: "toy-cap", "text-anchor": "middle" }); s.textContent = "start";
    const t = this.el("text", { x: POS.T[0], y: POS.T[1] + R + 18, class: "toy-cap", "text-anchor": "middle" }); t.textContent = "finish";
    this.total = this.el("text", { x: 8, y: 22, class: "toy-total" });
    this.cutText = this.el("text", { x: W - 8, y: 22, class: "toy-cuttext", "text-anchor": "end" });
  }

  private el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element = this.svg) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, String(attrs[k]));
    parent.appendChild(e);
    return e;
  }

  show(fr: ToyFrame) {
    TOY_ARCS.forEach(([, , c], i) => {
      const f = fr.flows[i], a = this.arcs[i];
      a.flow.setAttribute("stroke-width", String(K * f));
      a.flow.classList.toggle("full", f >= c - 1e-9 && c > 0);
      a.label.textContent = fr.labels === "cap" ? String(c) : `${f} / ${c}`;
      a.label.classList.toggle("full", fr.labels === "flow" && f >= c - 1e-9);
      a.label.classList.toggle("oncut", !!fr.cut && !!fr.reach && fr.reach[TOY_ARCS[i][0]] && !fr.reach[TOY_ARCS[i][1]]);
    });
    // current augmenting path: marching dashes along each hop, in the direction gas moves (backward on an undone pipe)
    this.pathLayer.innerHTML = "";
    if (fr.path) {
      for (const { i, fwd } of fr.path.arcs) {
        const { a, b } = this.arcs[i];
        const [p, q] = fwd ? [a, b] : [b, a];
        this.el("line", { x1: p[0], y1: p[1], x2: q[0], y2: q[1], class: `toy-hop${fwd ? "" : " back"}` }, this.pathLayer);
        if (!fwd) {
          const t = this.el("text", { x: (a[0] + b[0]) / 2 + 30, y: (a[1] + b[1]) / 2 + 2, class: "toy-undo" }, this.pathLayer);
          t.textContent = `undo ${fr.path.amount}`;
        }
      }
    }
    TOY_NODES.forEach((id, k) => {
      const g = this.nodes.get(id)!;
      g.classList.toggle("pulse", fr.pulse === id);
      g.classList.toggle("reach", !!fr.reach?.[k]);
      g.classList.toggle("onpath", !!fr.path && (id === "S" || id === "T" || fr.path.arcs.some(({ i }) => TOY_NODES[TOY_ARCS[i][0]] === id || TOY_NODES[TOY_ARCS[i][1]] === id)));
    });
    this.svg.querySelectorAll<SVGCircleElement>(".toy-halo").forEach((h, k) => h.classList.toggle("on", !!fr.reach?.[k]));
    if (fr.cut && fr.reach) {
      const reach = fr.reach;
      this.cutLine.setAttribute("d", cutPath({
        w: W, h: H,
        nodes: TOY_NODES.map((id, k) => ({ p: POS[id], source: reach[k] })),
        edges: TOY_ARCS.filter(([u, v]) => reach[u] === reach[v]).map(([u, v]) => ({ pts: [POS[TOY_NODES[u]], POS[TOY_NODES[v]]], source: reach[u] })),
      }, 6));
    }
    this.cutLine.classList.toggle("on", !!fr.cut);
    this.total.textContent = fr.total === undefined ? "" : `Flow from S to T: ${fr.total}`;
    this.cutText.textContent = fr.note ?? "";
  }
}

export { POS as TOY_POS };
