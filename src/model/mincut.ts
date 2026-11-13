import { cutArcs, EPS, type FlowResult } from "./maxflow";
import type { ArcMeta, FlowGraph } from "./graph";

export type CutLabel =
  | "route bottleneck"
  | "exporter at capacity"
  | "importer fully supplied"
  | "regas bottleneck"
  | "pipeline at capacity"
  | "buffer at max rate";

export interface CutEdge {
  index: number;
  meta: ArcMeta;
  capacity: number;
  closed: boolean;
  label: CutLabel;
}

export function labelFor(m: ArcMeta): CutLabel {
  switch (m.type) {
    case "supply": return "exporter at capacity";
    case "route": case "link": return "route bottleneck";
    case "demand": return "importer fully supplied";
    case "regas": return "regas bottleneck";
    case "pipeline": return "pipeline at capacity";
    case "fuelswitch": case "storage": return "buffer at max rate";
  }
}

/** Min cut read off the residual graph. Zero-capacity arcs are kept only if they were closed by the scenario. */
export function minCut(g: FlowGraph, r: FlowResult): CutEdge[] {
  return cutArcs(g.arcs, r.reach)
    .map((i) => {
      const m = g.meta[i];
      const closed = "id" in m && (g.closed.has(m.id) || (m.type === "regas" && g.closed.has(m.id + ":regas")));
      return { index: i, meta: m, capacity: g.arcs[i][2], closed, label: labelFor(m) };
    })
    .filter((c) => c.capacity > EPS || c.closed);
}

export function cutCapacity(cut: CutEdge[]): number {
  return cut.reduce((a, c) => a + c.capacity, 0);
}
