import { edmondsKarp, type FlowResult } from "./maxflow";
import { buildGraph, type BuildOptions, type FlowGraph } from "./graph";
import { minCut, type CutEdge } from "./mincut";
import type { Network, Scenario } from "./types";

export interface Solution {
  graph: FlowGraph;
  result: FlowResult;
  total: number;
  demand: number;
  cut: CutEdge[];
  /** Flow on each importer's demand arc (delivered from all included sources). */
  delivered: Record<string, number>;
  /** Flow by arc id+type, e.g. "route:HORMUZ", "link:QAT-HORMUZ", "supply:QAT". */
  arcFlow: Record<string, number>;
}

export function solve(net: Network, opts: BuildOptions = {}): Solution {
  const graph = buildGraph(net, opts);
  const result = edmondsKarp(graph.n, graph.arcs, graph.s, graph.t);
  const delivered: Record<string, number> = {};
  const arcFlow: Record<string, number> = {};
  let demand = 0;
  graph.meta.forEach((m, i) => {
    arcFlow[`${m.type}:${m.id}`] = result.flows[i];
    if (m.type === "demand") { delivered[m.id] = result.flows[i]; demand += graph.arcs[i][2]; }
  });
  return { graph, result, total: result.total, demand, cut: minCut(graph, result), delivered, arcFlow };
}

export interface AllocOptions { scenario?: Scenario; buffers?: boolean }

/** "If it outbids everyone": max deliverable to one importer when it alone is a sink. Returns mtpa. */
export function outbid(net: Network, importerId: string, o: AllocOptions = {}): number {
  const imp = net.importers.find((i) => i.id === importerId);
  if (!imp) throw new Error(`unknown importer ${importerId}`);
  return solve(net, { ...o, demands: { [importerId]: imp.import_demand.value } }).total;
}

/**
 * "Last in line": what one importer can still get after every other importer has been served as fully as the
 * network allows. Equals maxflow(all importers) − maxflow(all importers except this one). This is the outcome
 * for a buyer that loses every bidding war, and the counterpart to `outbid`.
 */
export function lastInLine(net: Network, importerId: string, o: AllocOptions = {}): number {
  const all = Object.fromEntries(net.importers.map((i) => [i.id, i.import_demand.value]));
  const others = { ...all, [importerId]: 0 };
  return solve(net, { ...o, demands: all }).total - solve(net, { ...o, demands: others }).total;
}

/**
 * "Priority": importers are served in the given order, each taking all it can after those ahead of it
 * (lexicographic max-flow). Allocation of the k-th importer = maxflow(first k) − maxflow(first k−1).
 * Models a market where buyers further down the list are outbid by those above them.
 */
export function priorityAllocation(net: Network, order: string[], o: AllocOptions = {}): Record<string, number> {
  const d = Object.fromEntries(net.importers.map((i) => [i.id, i.import_demand.value]));
  const out: Record<string, number> = {};
  const dem: Record<string, number> = {};
  let prev = 0;
  for (const id of order) {
    if (!(id in d)) throw new Error(`unknown importer ${id}`);
    dem[id] = d[id];
    const t = solve(net, { ...o, demands: dem }).total;
    out[id] = t - prev;
    prev = t;
  }
  return out;
}

/**
 * "Equal rationing": largest λ in [0,1] such that every importer can simultaneously receive λ × its demand.
 * Binary search; feasibility of λ is monotone because shrinking every demand keeps any flow feasible.
 */
export function rationLambda(net: Network, o: AllocOptions = {}, iters = 40): number {
  const d = Object.fromEntries(net.importers.map((i) => [i.id, i.import_demand.value]));
  const tot = Object.values(d).reduce((a, b) => a + b, 0);
  if (tot <= 0) return 1;
  const feasible = (lam: number) => {
    const dem = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v * lam]));
    return solve(net, { ...o, demands: dem }).total >= tot * lam - 1e-11 * Math.max(1, tot);
  };
  if (feasible(1)) return 1;
  let lo = 0, hi = 1;
  for (let k = 0; k < iters; k++) { const m = (lo + hi) / 2; if (feasible(m)) lo = m; else hi = m; }
  return lo;
}
