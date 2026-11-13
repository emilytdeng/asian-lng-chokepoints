/**
 * Linear-programming version of the flow model, solved with HiGHS (WebAssembly).
 *
 * With no extras switched on it is exactly the max-flow problem (tests check they agree). It adds:
 *  - a fleet constraint: Σ link flow × round-trip days ≤ ship-time available to the Asian trade, where the ships that
 *    carried the cargoes Asia can bid away from other buyers come with those cargoes
 *  - selective passage through Hormuz: Gulf gas tagged by origin and destination (multi-commodity), so a scenario can
 *    let some exporters' cargoes, or cargoes for some buyers, through while blocking the rest
 *  - shadow prices (duals) on every capacity row: the value of one more mtpa of capacity there.
 */
import { BIG, buildGraph, type ArcMeta, type FlowGraph } from "./graph";
import type { Network, Scenario } from "./types";

// ---------------------------------------------------------------- HiGHS loader
type Highs = { solve: (lp: string, opts?: Record<string, unknown>) => any };
let settings: Record<string, unknown> = {};
let loader: Promise<Highs> | null = null;
let solves = 0;
/** Browser: pass { locateFile: () => wasmUrl }. Node needs nothing. */
export function configureHighs(s: Record<string, unknown>) { settings = s; loader = null; }
async function highs(): Promise<Highs> {
  // highs-js leaks a little wasm memory per solve; start a fresh instance every few thousand solves.
  if (!loader || solves > 3000) {
    solves = 0;
    loader = import("highs").then((m: any) => (m.default ?? m)(settings));
  }
  solves++;
  return loader;
}

// ---------------------------------------------------------------- problem
export interface LPOptions {
  scenario?: Scenario;
  buffers?: boolean;
  demands?: Record<string, number>; // default: full import demand
  /** Lock in earlier results: Σ delivered to `ids` ≥ `total` (used by priority and last-in-line). */
  floors?: { ids: string[]; total: number }[];
  /** Internal: relative slack on floors (raised automatically if HiGHS reports a tolerance-level infeasibility). */
  floorSlack?: number;
}
export interface LPSolution {
  status: string;
  objective: number;
  total: number; // delivered to all sinks
  lambda?: number;
  delivered: Record<string, number>;
  arcFlow: Record<string, number>; // keyed like Solution.arcFlow: "link:QAT-HORMUZ"
  graph: FlowGraph;
  /** Shadow price on each binding capacity row, keyed "type:id". Units: objective per mtpa. */
  duals: { key: string; meta: ArcMeta; capacity: number; dual: number }[];
  fleet?: { used: number; capacity: number; dual: number };
  hormuzDual?: number;
  /** Gulf gas delivered by destination when Hormuz flows are tagged. */
  gulfByDest?: Record<string, number>;
}

const GULF = (net: Network) => net.exporters.filter((e) => net.links.some((l) => l.from === e.id && l.to === "HORMUZ")).map((e) => e.id);
const num = (x: number) => (Math.abs(x) < 1e-12 ? "0" : Number(x.toPrecision(12)).toString());

interface Built {
  text: string;
  vars: { arc: number; k: number; name: string }[];
  capRows: { row: number; arc: number }[];
  fleetRow?: number;
  fleetCap?: number;
  hzRow?: number;
  commodities: { origin: string | null; dest: string | null }[];
  g: FlowGraph;
}

type Objective = "maxflow" | "lambda" | "minship";

function build(net: Network, o: LPOptions, objective: Objective, fleetCap?: number): Built {
  const sc = o.scenario ?? { label: "" };
  const g = buildGraph(net, { scenario: sc, buffers: o.buffers, demands: o.demands });
  const gulf = GULF(net);
  const hz = sc.hormuz;
  const selective = !!(hz && (hz.origins || hz.destinations));
  const dests = net.importers.map((i) => i.id);
  const commodities: Built["commodities"] = [{ origin: null, dest: null }];
  if (selective) for (const og of gulf) for (const d of dests) commodities.push({ origin: og, dest: d });

  const hzArc = g.meta.findIndex((m) => m.type === "route" && m.id === "HORMUZ");
  const allowed = (a: number, k: number) => {
    const m = g.meta[a], c = commodities[k];
    if (k === 0) return !(selective && (m.type === "supply" || m.type === "divert") && gulf.includes(m.id));
    if (m.type === "supply" || m.type === "divert") return m.id === c.origin;
    if (m.type === "pipeline" || m.type === "fuelswitch" || m.type === "storage") return false;
    if (m.type === "demand") return m.id === c.dest;
    if (a === hzArc) return (!hz?.origins || hz.origins.includes(c.origin!)) && (!hz?.destinations || hz.destinations.includes(c.dest!));
    return true;
  };

  const vars: Built["vars"] = [];
  const byArc: number[][] = g.arcs.map(() => []);
  g.arcs.forEach((_, a) => commodities.forEach((__, k) => {
    if (!allowed(a, k)) return;
    const v = vars.length;
    vars.push({ arc: a, k, name: `x${v}` });
    byArc[a].push(v);
  }));

  const rows: string[] = [];
  const capRows: Built["capRows"] = [];
  const term = (coef: number, name: string) => `${coef >= 0 ? "+" : "-"} ${num(Math.abs(coef))} ${name}`;
  // conservation, per node and commodity
  for (let n = 0; n < g.n; n++) {
    if (n === g.s || n === g.t) continue;
    for (let k = 0; k < commodities.length; k++) {
      const t: string[] = [];
      g.arcs.forEach(([u, w], a) => {
        for (const v of byArc[a]) if (vars[v].k === k) { if (w === n) t.push(term(1, vars[v].name)); if (u === n) t.push(term(-1, vars[v].name)); }
      });
      if (t.length) rows.push(`${t.join(" ")} = 0`);
    }
  }
  // capacities (skip unbounded arcs)
  g.arcs.forEach(([, , cap], a) => {
    if (cap >= BIG * 0.999 || !byArc[a].length) return;
    capRows.push({ row: rows.length, arc: a });
    rows.push(`${byArc[a].map((v) => term(1, vars[v].name)).join(" ")} <= ${num(cap)}`);
  });
  // partial / selective Hormuz: total throughput ≤ share × Gulf supply
  let hzRow: number | undefined;
  if (hz && hzArc >= 0 && byArc[hzArc].length) {
    const gulfSupply = g.meta.reduce((s, m, a) => s + ((m.type === "supply" || m.type === "divert") && gulf.includes(m.id) ? g.arcs[a][2] : 0), 0);
    hzRow = rows.length;
    rows.push(`${byArc[hzArc].map((v) => term(1, vars[v].name)).join(" ")} <= ${num((hz.share ?? 1) * gulfSupply)}`);
  }
  // fleet
  let fleetRow: number | undefined;
  if (fleetCap !== undefined) {
    const t: string[] = [];
    g.meta.forEach((m, a) => {
      if (m.type === "link") {
        const d = net.links.find((l) => l.id === m.id)?.voyage_days?.value ?? 0;
        if (d) for (const v of byArc[a]) t.push(term(2 * d, vars[v].name));
      }
    });
    fleetRow = rows.length;
    rows.push(`${t.join(" ")} <= ${num(fleetCap)}`);
  }
  // demand coupling for λ / min-ship objectives
  const demandArcs = g.meta.map((m, a) => (m.type === "demand" ? a : -1)).filter((a) => a >= 0);
  for (const f of o.floors ?? []) {
    const t = demandArcs.filter((a) => f.ids.includes((g.meta[a] as { id: string }).id)).flatMap((a) => byArc[a].map((v) => term(1, vars[v].name)));
    if (t.length && f.total > 0) rows.push(`${t.join(" ")} >= ${num(f.total - 1e-6 - (o.floorSlack ?? 1e-7) * f.total)}`);
  }
  if (objective === "lambda") {
    for (const a of demandArcs) {
      const d = g.arcs[a][2];
      if (d > 0) rows.push(`${byArc[a].map((v) => term(1, vars[v].name)).join(" ")} ${term(-d, "L")} >= 0`);
    }
  }
  if (objective === "minship") {
    for (const a of demandArcs) {
      const d = g.arcs[a][2];
      if (d > 0) rows.push(`${byArc[a].map((v) => term(1, vars[v].name)).join(" ")} >= ${num(d)}`);
    }
  }
  // A tiny penalty on diverted cargoes: use contracted Asian supply first, and divert from other buyers only when needed.
  const EPS_DIV = 1e-6;
  const divTerms = g.meta.flatMap((m, a) => (m.type === "divert" ? byArc[a].map((v) => term(-EPS_DIV, vars[v].name)) : []));
  let obj: string;
  if (objective === "lambda") obj = `Maximize\n obj: L ${divTerms.join(" ")}`;
  else if (objective === "maxflow") obj = `Maximize\n obj: ${[...demandArcs.flatMap((a) => byArc[a].map((v) => term(1, vars[v].name))), ...divTerms].join(" ")}`;
  else {
    const t: string[] = [];
    g.meta.forEach((m, a) => {
      const d = m.type === "link" ? net.links.find((l) => l.id === m.id)?.voyage_days?.value ?? 0 : 0;
      if (d) for (const v of byArc[a]) t.push(term(2 * d, vars[v].name));
    });
    obj = `Minimize\n obj: ${t.join(" ") || "0 x0"}`;
  }
  const bounds = objective === "lambda" ? "Bounds\n 0 <= L <= 1\n" : "";
  const text = `${obj}\nSubject To\n${rows.map((r, i) => ` c${i}: ${r}`).join("\n")}\n${bounds}End\n`;
  return { text, vars, capRows, fleetRow, fleetCap, hzRow, commodities, g };
}

/**
 * Ship-time available in a scenario: the 2025 Asian requirement plus spare, plus the ships that carried the cargoes
 * Asia can bid away from other buyers (diverted mtpa × round trip to those buyers).
 */
export async function scenarioFleet(net: Network, sc: Scenario): Promise<number> {
  const g = buildGraph(net, { scenario: sc });
  const extra = g.meta.reduce((s, m, a) => s + (m.type === "divert" ? g.arcs[a][2] * 2 * (net.exporters.find((e) => e.id === m.id)?.other_voyage_days?.value ?? 0) : 0), 0);
  return (await fleetCapacity(net)) + extra;
}

async function run(net: Network, o: LPOptions, objective: Objective): Promise<LPSolution> {
  const sc = o.scenario ?? { label: "" };
  const fleetCap = sc.fleet ? await scenarioFleet(net, sc) : undefined;
  const b = build(net, o, objective, fleetCap);
  const h = await highs();
  const r = h.solve(b.text);
  if (r.Status === "Infeasible" && o.floors?.length && (o.floorSlack ?? 1e-7) < 1e-4) {
    // floors come from earlier solves; a floor a hair above the true optimum is a tolerance artefact, not a real conflict
    return run(net, { ...o, floorSlack: (o.floorSlack ?? 1e-7) * 30 }, objective);
  }
  if (r.Status !== "Optimal") throw new Error(`LP status ${r.Status}`);
  const col = (name: string) => r.Columns[name]?.Primal ?? 0;
  const arcTot = b.g.arcs.map(() => 0);
  for (const v of b.vars) arcTot[v.arc] += col(v.name);
  const delivered: Record<string, number> = {};
  const arcFlow: Record<string, number> = {};
  let total = 0;
  b.g.meta.forEach((m, a) => {
    arcFlow[`${m.type}:${m.id}`] = (arcFlow[`${m.type}:${m.id}`] ?? 0) + arcTot[a];
    if (m.type === "demand") { delivered[m.id] = arcTot[a]; total += arcTot[a]; }
  });
  const rowDual = (i: number) => Math.abs(r.Rows[i]?.Dual ?? 0);
  const duals = b.capRows.map(({ row, arc }) => {
    const m = b.g.meta[arc];
    return { key: `${m.type}:${m.id}`, meta: m, capacity: b.g.arcs[arc][2], dual: rowDual(row) };
  }).filter((d) => d.dual > 1e-9);
  let fleet: LPSolution["fleet"];
  if (b.fleetRow !== undefined) fleet = { used: r.Rows[b.fleetRow].Primal, capacity: b.fleetCap!, dual: rowDual(b.fleetRow) };
  let gulfByDest: Record<string, number> | undefined;
  if (b.commodities.length > 1) {
    gulfByDest = {};
    for (const v of b.vars) {
      const c = b.commodities[v.k];
      if (v.k > 0 && b.g.meta[v.arc].type === "demand") gulfByDest[c.dest!] = (gulfByDest[c.dest!] ?? 0) + col(v.name);
    }
  }
  return {
    status: r.Status, objective: r.ObjectiveValue, total, delivered, arcFlow, graph: b.g, duals, fleet,
    hormuzDual: b.hzRow !== undefined ? rowDual(b.hzRow) : undefined, gulfByDest,
    lambda: objective === "lambda" ? col("L") : undefined,
  };
}

// ---------------------------------------------------------------- fleet capacity
const fleetCache = new WeakMap<Network, number>();
/**
 * Ship-time (mtpa × round-trip days) available to the Asian trade: the least ship-time that could have delivered the
 * 2025 baseline (no closures, no diversion), plus meta.fleet_slack spare capacity.
 */
export async function fleetCapacity(net: Network): Promise<number> {
  const c = fleetCache.get(net);
  if (c !== undefined) return c;
  const b = build(net, { scenario: { label: "fleet baseline", diversion: 0 } }, "minship");
  const r = (await highs()).solve(b.text);
  if (r.Status !== "Optimal") throw new Error(`fleet baseline LP status ${r.Status}`);
  const cap = r.ObjectiveValue * (1 + (net.meta.fleet_slack?.value ?? 0));
  fleetCache.set(net, cap);
  return cap;
}

/**
 * Least ship-time (mtpa·days) needed to deliver the equal-rationing outcome of a scenario: every importer gets λ × demand.
 * Compared with the 2025 minimum this shows how much extra ship-time a closure really demands.
 */
export async function lpFleetNeeded(net: Network, o: LPOptions = {}): Promise<{ lambda: number; needed: number; baseline: number; capacity: number }> {
  const sc = { ...(o.scenario ?? { label: "" }), fleet: false };
  const lambda = (await lpLambda(net, { ...o, scenario: sc })).lambda!;
  const dem = Object.fromEntries(net.importers.map((i) => [i.id, lambda * i.import_demand.value * (1 - 1e-6)]));
  const b = build(net, { ...o, scenario: sc, demands: dem }, "minship");
  const r = (await highs()).solve(b.text);
  if (r.Status !== "Optimal") throw new Error(`fleet-needed LP status ${r.Status}`);
  const base = (await fleetCapacity(net)) / (1 + (net.meta.fleet_slack?.value ?? 0));
  return { lambda, needed: r.ObjectiveValue, baseline: base, capacity: await scenarioFleet(net, sc) };
}

// ---------------------------------------------------------------- allocation views (async mirrors of allocation.ts)
export const lpSolve = (net: Network, o: LPOptions = {}) => run(net, o, "maxflow");
export const lpLambda = (net: Network, o: LPOptions = {}) => run(net, o, "lambda");

export async function lpOutbid(net: Network, id: string, o: LPOptions = {}) {
  const d = net.importers.find((i) => i.id === id)!.import_demand.value;
  return (await lpSolve(net, { ...o, demands: { [id]: d } })).total;
}
/** Everyone else is served as fully as possible first; then this importer takes what is left. */
export async function lpLastInLine(net: Network, id: string, o: LPOptions = {}) {
  const all = Object.fromEntries(net.importers.map((i) => [i.id, i.import_demand.value]));
  const others = net.importers.map((i) => i.id).filter((x) => x !== id);
  const b = await lpSolve(net, { ...o, demands: { ...all, [id]: 0 } });
  const a = await lpSolve(net, { ...o, demands: all, floors: [{ ids: others, total: b.total }] });
  return Math.max(0, a.total - b.total);
}
/** Lexicographic: each importer in turn takes all it can without reducing what those ahead of it already get. */
export async function lpPriority(net: Network, order: string[], o: LPOptions = {}) {
  const d = Object.fromEntries(net.importers.map((i) => [i.id, i.import_demand.value]));
  const out: Record<string, number> = {}, dem: Record<string, number> = {};
  const floors: { ids: string[]; total: number }[] = [];
  for (const id of order) {
    dem[id] = d[id];
    const r = await lpSolve(net, { ...o, demands: dem, floors: [...floors] });
    out[id] = Math.max(0, r.delivered[id] ?? 0);
    floors.push({ ids: [id], total: out[id] });
  }
  return out;
}
