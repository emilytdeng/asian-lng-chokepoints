import type { Network, Scenario, Change, Exporter, Importer } from "./types";
import { type Arc } from "./maxflow";

/** What each arc in the flow graph represents. Drives min-cut labelling and the UI. */
export type ArcMeta =
  | { type: "supply"; id: string } // S → exporter (liquefaction)
  | { type: "route"; id: string } // route_in → route_out (chokepoint throughput)
  | { type: "link"; id: string; from: string; to: string } // exporter/route → route/importer_in
  | { type: "pipeline"; id: string; to: string } // S → importer_out
  | { type: "regas"; id: string } // importer_in → importer_out
  | { type: "fuelswitch"; id: string } // S → importer_out
  | { type: "storage"; id: string } // S → importer_out (max withdrawal rate)
  | { type: "demand"; id: string }; // importer_out → T

export interface BuildOptions {
  scenario?: Scenario;
  /** Per-importer demand override (mtpa). Missing importers get 0. Default: full import_demand. */
  demands?: Record<string, number>;
  /** Include storage and fuel-switch source arcs. Default false (physical LNG + pipeline only). */
  buffers?: boolean;
}

export interface FlowGraph {
  n: number;
  s: number;
  t: number;
  arcs: Arc[];
  meta: ArcMeta[];
  node: Record<string, number>;
  nodeName: string[];
  closed: Set<string>;
}

/** Large finite stand-in for "unbounded" so the solver never meets an all-infinite path. */
export const BIG = 1e6;

export function capFor(id: string, base: number | null | undefined, sc?: Scenario): number {
  if (sc?.close?.includes(id)) return 0;
  const v = base == null ? BIG : base;
  const f = sc?.cap_factor?.[id];
  return f == null ? v : v * f;
}

export function buildGraph(net: Network, opts: BuildOptions = {}): FlowGraph {
  const sc = opts.scenario;
  const node: Record<string, number> = {};
  const nodeName: string[] = [];
  const add = (k: string) => { if (!(k in node)) { node[k] = nodeName.length; nodeName.push(k); } return node[k]; };
  const s = add("__S"), t = add("__T");
  const arcs: Arc[] = [];
  const meta: ArcMeta[] = [];
  const push = (u: number, v: number, c: number, m: ArcMeta) => { arcs.push([u, v, Math.max(0, c)]); meta.push(m); };

  const routeIds = new Set(net.routes.map((r) => r.id));
  const expIds = new Set(net.exporters.map((e) => e.id));
  const impIds = new Set(net.importers.map((i) => i.id));
  const tail = (id: string) => expIds.has(id) ? add(id) : routeIds.has(id) ? add(id + ":out") : bad(id);
  const head = (id: string) => routeIds.has(id) ? add(id + ":in") : impIds.has(id) ? add(id + ":in") : bad(id);
  function bad(id: string): never { throw new Error(`unknown node id in link: ${id}`); }

  const div = sc?.diversion ?? net.meta.diversion.value;
  for (const e of net.exporters) push(s, add(e.id), capFor(e.id, exporterSupply(e, div), sc), { type: "supply", id: e.id });
  for (const r of net.routes) push(add(r.id + ":in"), add(r.id + ":out"), capFor(r.id, r.capacity?.value, sc), { type: "route", id: r.id });
  for (const l of net.links) push(tail(l.from), head(l.to), capFor(l.id, l.capacity?.value, sc), { type: "link", id: l.id, from: l.from, to: l.to });
  for (const p of net.pipelines) {
    if (!impIds.has(p.to)) bad(p.to);
    push(s, add(p.to + ":out"), capFor(p.id, p.capacity.value, sc), { type: "pipeline", id: p.id, to: p.to });
  }
  for (const im of net.importers) {
    const i = add(im.id + ":in"), o = add(im.id + ":out");
    push(i, o, capFor(im.id + ":regas", im.regas.value, sc), { type: "regas", id: im.id });
    if (opts.buffers) {
      push(s, o, im.fuel_switch.value, { type: "fuelswitch", id: im.id });
      push(s, im.storage.enters === "out" ? o : i, storageRate(im, sc?.horizon_days ?? net.meta.horizon_days?.value), { type: "storage", id: im.id });
    }
    const d = opts.demands ? opts.demands[im.id] ?? 0 : im.import_demand.value;
    push(o, t, d, { type: "demand", id: im.id });
  }
  return { n: nodeName.length, s, t, arcs, meta, node, nodeName, closed: new Set(sc?.close ?? []) };
}

/**
 * Gas an exporter can send to the modeled Asian importers: its 2025 Asian deliveries plus a `diversion`
 * share of the cargoes it sent elsewhere (mainly Europe), which Asian buyers could bid away in a crisis.
 */
export function exporterSupply(e: Exporter, diversion: number): number {
  const other = Math.max(0, e.total_exports.value - e.asia_deliveries.value);
  return e.asia_deliveries.value + Math.min(1, Math.max(0, diversion)) * other;
}

/**
 * Storage rate used in buffered λ: the max withdrawal rate, capped by what the inventory can sustain
 * for `horizonDays` (inventory Mt × 365 / days → mtpa). With no horizon, the max withdrawal rate.
 */
export function storageRate(im: Importer, horizonDays?: number): number {
  const w = im.storage.max_withdrawal.value;
  if (!horizonDays || horizonDays <= 0) return w;
  return Math.min(w, (im.storage.inventory.value * 365) / horizonDays);
}

/** Return a deep copy of the network with each change's delta added to its target Datum. */
export function applyChanges(net: Network, changes: Change[]): Network {
  const copy: Network = structuredClone(net);
  for (const ch of changes) {
    const [coll, id, ...rest] = ch.target.split(".");
    const arr = (copy as any)[coll];
    if (!Array.isArray(arr)) throw new Error(`bad target collection: ${ch.target}`);
    let obj = arr.find((x: any) => x.id === id);
    if (!obj) throw new Error(`no ${coll} with id ${id}`);
    for (const k of rest) { if (obj[k] == null) throw new Error(`bad target path: ${ch.target}`); obj = obj[k]; }
    if (typeof obj.value !== "number") throw new Error(`target is not a Datum: ${ch.target}`);
    obj.value += ch.delta;
  }
  return copy;
}
