import raw from "../../data/network.json";
import { lastInLine, outbid, priorityAllocation, rationLambda, solve, type Solution } from "../model/allocation";
import { coverFor, type Cover } from "../model/cover";
import { exporterSupply } from "../model/graph";
import { lpFleetNeeded, lpLambda, lpLastInLine, lpOutbid, lpPriority, lpSolve, type LPSolution } from "../model/lp";
import { labelFor, type CutEdge } from "../model/mincut";
import type { Network, Scenario } from "../model/types";

export const NET = raw as unknown as Network;

/** Market order 1 (decided before the 2026 evidence): by ability to pay, high-income buyers first. */
export const PRIORITY = ["JPN", "KOR", "TWN", "CHN", "THA", "IND", "BGD", "PAK"];
/** Market order 2 (calibrated to 2026): China, which has pipelines, storage and coal, steps back; Pakistan is priced out last. */
export const PRIORITY_2026 = ["JPN", "KOR", "TWN", "THA", "IND", "BGD", "CHN", "PAK"];

export type View = "priority" | "market2026" | "rationed" | "last" | "outbid";
export const VIEWS: View[] = ["priority", "market2026", "rationed", "last", "outbid"];
export const VIEW_LABEL: Record<View, string> = {
  priority: "Highest bidder first",
  market2026: "As in 2026",
  rationed: "Everyone shares equally",
  last: "Worst case (loses every bid)",
  outbid: "Best case (wins every bid)",
};

export type HormuzMode = "open" | "closed" | "pakistan" | "share37";
export interface State {
  closed: Set<string>; // route, exporter or pipeline ids
  diversion: number; // 0..1
  focus: string | null; // importer id for the map, or null = all
  capFactor?: Record<string, number>; // e.g. { PANAMA: 0.13 } for a restricted canal
  fleet?: boolean; // LP: enforce the LNG-carrier fleet constraint
  hormuz?: HormuzMode; // LP modes "pakistan" and "share37"; "closed" is the same as closing the HORMUZ node
  simple?: boolean; // the Simple tab's model: no buffers, unlimited import terminals, diversion fixed at 20%
}

export interface ImporterRow {
  id: string;
  name: string;
  demand: number;
  exposure: number; // share of 2025 supply via Hormuz
  alloc: Record<View, number>; // mtpa
  share: Record<View, number>;
  cover: Record<View, Cover>;
}

export interface Evaluation {
  engine: "max-flow" | "LP";
  scenario: Scenario;
  map: Pick<Solution, "arcFlow" | "cut" | "total"> & { reach?: Set<string> }; // what the map draws: system or focus importer alone
  // reach: display ids (exporters, routes, importers, "__S", "__T") on the source side of the min cut (max-flow only)
  supply: number;
  demand: number;
  lambda: number;
  hormuzLost: number;
  rows: ImporterRow[];
  /** LP only: shadow prices from the equal-rationing LP, λ per mtpa. */
  duals?: LPSolution["duals"];
  fleet?: { needed: number; available: number; binds: boolean };
  /** Set while stepping through the algorithm: the arcs on the current augmenting path ("type:id"), and the
   * demand met so far. Views then show partial flows and no cut. */
  progress?: { path: Set<string>; delivered: Record<string, number> };
}

export const name = (id: string) =>
  NET.importers.find((i) => i.id === id)?.name ?? NET.exporters.find((e) => e.id === id)?.name ?? NET.routes.find((r) => r.id === id)?.name ?? NET.pipelines.find((p) => p.id === id)?.name ?? id;

export const exposure = Object.fromEntries(NET.importers.map((im) => [im.id,
  NET.exporters.filter((e) => e.id === "QAT" || e.id === "UAE").reduce((a, e) => a + (e.deliveries_2025?.[im.id] ?? 0), 0) / im.import_demand.value]));

export function scenarioOf(s: State): Scenario {
  const close = new Set(s.closed);
  if (s.hormuz === "closed") close.add("HORMUZ");
  const sc: Scenario = { label: "custom", close: [...close], diversion: s.diversion, cap_factor: s.capFactor, fleet: s.fleet };
  if (s.hormuz === "pakistan") { close.delete("HORMUZ"); sc.close = [...close]; sc.hormuz = { destinations: ["PAK"] }; }
  if (s.hormuz === "share37") { close.delete("HORMUZ"); sc.close = [...close]; sc.hormuz = { share: 0.37 }; }
  return sc;
}
/** Whether this state needs the LP (fleet limit or selective/partial Hormuz). */
export const needsLP = (s: State) => !!s.fleet || s.hormuz === "pakistan" || s.hormuz === "share37";

function rowsFrom(alloc: Record<View, Record<string, number>>): ImporterRow[] {
  return NET.importers.map((im) => {
    const d = im.import_demand.value;
    const a = Object.fromEntries(VIEWS.map((v) => [v, alloc[v][im.id]])) as Record<View, number>;
    const share = Object.fromEntries(VIEWS.map((v) => [v, d > 0 ? Math.min(1, Math.max(0, a[v]) / d) : 1])) as Record<View, number>;
    const cover = Object.fromEntries(VIEWS.map((v) => [v, coverFor(im, Math.max(0, a[v]))])) as Record<View, Cover>;
    return { id: im.id, name: im.name, demand: d, exposure: exposure[im.id], alloc: a, share, cover };
  });
}
function lostBehindHormuz(s: State) {
  if (!(s.hormuz === "closed" || s.closed.has("HORMUZ"))) return 0;
  return NET.exporters.filter((e) => e.id === "QAT" || e.id === "UAE").reduce((a, e) => a + (s.closed.has(e.id) ? 0 : exporterSupply(e, s.diversion)), 0);
}

/** Display ids on the source side of the cut. A split node (route or importer) counts by its "out" half. */
export function reachIds(sol: Solution): Set<string> {
  const out = new Set<string>();
  sol.graph.nodeName.forEach((k, i) => {
    if (!sol.result.reach[i] || k.endsWith(":in")) return;
    out.add(k.replace(/:out$/, ""));
  });
  return out;
}

/** Instant evaluation with max-flow (no fleet limit, Hormuz fully open or shut). */
export function evaluate(s: State): Evaluation {
  const scenario = scenarioOf(s);
  const o = { scenario, simple: s.simple };
  const system = solve(NET, o);
  const lambda = rationLambda(NET, o);
  const d = (id: string) => NET.importers.find((i) => i.id === id)!.import_demand.value;
  const alloc: Record<View, Record<string, number>> = {
    priority: priorityAllocation(NET, PRIORITY, o),
    market2026: priorityAllocation(NET, PRIORITY_2026, o),
    rationed: Object.fromEntries(NET.importers.map((i) => [i.id, lambda * i.import_demand.value])),
    last: Object.fromEntries(NET.importers.map((i) => [i.id, Math.max(0, lastInLine(NET, i.id, o))])),
    outbid: Object.fromEntries(NET.importers.map((i) => [i.id, outbid(NET, i.id, o)])),
  };
  const sol = s.focus ? solve(NET, { scenario, simple: s.simple, demands: { [s.focus]: d(s.focus) } }) : system;
  const map = { arcFlow: sol.arcFlow, cut: sol.cut, total: sol.total, reach: reachIds(sol) };
  return { engine: "max-flow", scenario, map, supply: system.total, demand: system.demand, lambda, hormuzLost: lostBehindHormuz(s), rows: rowsFrom(alloc) };
}

/** Full LP evaluation: fleet limit, selective/partial Hormuz, and shadow prices. */
export async function evaluateLP(s: State): Promise<Evaluation> {
  const scenario = scenarioOf(s);
  const o = { scenario };
  const d = (id: string) => NET.importers.find((i) => i.id === id)!.import_demand.value;
  const system = await lpSolve(NET, o);
  const lam = await lpLambda(NET, o);
  const alloc: Record<View, Record<string, number>> = {
    priority: await lpPriority(NET, PRIORITY, o),
    market2026: await lpPriority(NET, PRIORITY_2026, o),
    rationed: Object.fromEntries(NET.importers.map((i) => [i.id, lam.lambda! * i.import_demand.value])),
    last: {}, outbid: {},
  };
  for (const im of NET.importers) {
    alloc.last[im.id] = await lpLastInLine(NET, im.id, o);
    alloc.outbid[im.id] = await lpOutbid(NET, im.id, o);
  }
  const mapSol = s.focus ? await lpSolve(NET, { scenario, demands: { [s.focus]: d(s.focus) } }) : system;
  // binding constraints of the map's problem stand in for the min cut
  const mapLam = s.focus ? mapSol : lam;
  const closed = new Set(scenario.close ?? []);
  const cut: CutEdge[] = (s.focus ? mapSol.duals : mapLam.duals).map((x, i) => ({
    index: i, meta: x.meta, capacity: x.capacity, closed: "id" in x.meta && closed.has(x.meta.id), label: labelFor(x.meta),
  }));
  let fleet: Evaluation["fleet"];
  if (s.fleet) {
    const need = await lpFleetNeeded(NET, { scenario: { ...scenario, fleet: false } });
    fleet = { needed: need.needed, available: need.capacity, binds: lam.lambda! < need.lambda - 1e-6 };
  }
  return {
    engine: "LP", scenario, map: { arcFlow: mapSol.arcFlow, cut, total: mapSol.total }, supply: system.total,
    demand: NET.importers.reduce((a, i) => a + i.import_demand.value, 0), lambda: lam.lambda!, hormuzLost: lostBehindHormuz(s),
    rows: rowsFrom(alloc), duals: lam.duals, fleet,
  };
}

export const fmt = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : "∞");
export const pct = (x: number) => `${Math.round(Math.max(0, Math.min(1, x)) * 100)}%`;
export const days = (c: Cover) => (!Number.isFinite(c.days) ? (c.shortfall < 1e-6 ? "no gap" : "fuel switching covers it") : `${Math.round(c.days)} days`);

/** "mtpa" explained against a familiar scale; Japan's figure comes from the data. */
export const MTPA_NOTE = `mtpa = million tonnes of LNG a year (Japan uses about ${Math.round(NET.importers.find((i) => i.id === "JPN")!.import_demand.value)})`;
