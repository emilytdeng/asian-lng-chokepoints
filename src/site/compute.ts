import raw from "../../data/network.json";
import { lastInLine, outbid, priorityAllocation, rationLambda, solve, type Solution } from "../model/allocation";
import { coverFor, type Cover } from "../model/cover";
import { exporterSupply } from "../model/graph";
import type { Network, Scenario } from "../model/types";

export const NET = raw as unknown as Network;

/** Main-case market order (user decision): high-income buyers first, low-income last. */
export const PRIORITY = ["JPN", "KOR", "TWN", "CHN", "THA", "IND", "BGD", "PAK"];

export type View = "priority" | "rationed" | "last" | "outbid";
export const VIEW_LABEL: Record<View, string> = {
  priority: "Market (rich buyers first)",
  rationed: "Equal rationing",
  last: "Last in line",
  outbid: "Outbids everyone",
};

export interface State {
  closed: Set<string>; // route, exporter or pipeline ids
  diversion: number; // 0..1
  focus: string | null; // importer id for the map, or null = all
  capFactor?: Record<string, number>; // e.g. { PANAMA: 0.13 } for a restricted canal
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
  scenario: Scenario;
  system: Solution; // all importers, LNG + pipeline
  map: Solution; // what the map draws: system or focus importer alone
  supply: number;
  demand: number;
  lambda: number;
  hormuzLost: number; // mtpa of Asian-available supply that sits behind Hormuz (0 when Hormuz is open)
  rows: ImporterRow[];
}

export const name = (id: string) =>
  NET.importers.find((i) => i.id === id)?.name ?? NET.exporters.find((e) => e.id === id)?.name ?? NET.routes.find((r) => r.id === id)?.name ?? NET.pipelines.find((p) => p.id === id)?.name ?? id;

export const exposure = Object.fromEntries(NET.importers.map((im) => [im.id,
  NET.exporters.filter((e) => e.id === "QAT" || e.id === "UAE").reduce((a, e) => a + (e.deliveries_2025?.[im.id] ?? 0), 0) / im.import_demand.value]));

export function scenarioOf(s: State): Scenario {
  return { label: "custom", close: [...s.closed], diversion: s.diversion, cap_factor: s.capFactor };
}

export function evaluate(s: State): Evaluation {
  const scenario = scenarioOf(s);
  const o = { scenario };
  const system = solve(NET, o);
  const lambda = rationLambda(NET, o);
  const prio = priorityAllocation(NET, PRIORITY, o);
  const rows: ImporterRow[] = NET.importers.map((im) => {
    const d = im.import_demand.value;
    const alloc: Record<View, number> = {
      priority: prio[im.id],
      rationed: lambda * d,
      last: Math.max(0, lastInLine(NET, im.id, o)),
      outbid: outbid(NET, im.id, o),
    };
    const share = Object.fromEntries(Object.entries(alloc).map(([k, v]) => [k, d > 0 ? Math.min(1, v / d) : 1])) as Record<View, number>;
    const cover = Object.fromEntries(Object.entries(alloc).map(([k, v]) => [k, coverFor(im, v)])) as Record<View, Cover>;
    return { id: im.id, name: im.name, demand: d, exposure: exposure[im.id], alloc, share, cover };
  });
  const map = s.focus ? solve(NET, { scenario, demands: { [s.focus]: NET.importers.find((i) => i.id === s.focus)!.import_demand.value } }) : system;
  const hormuzClosed = s.closed.has("HORMUZ");
  const hormuzLost = hormuzClosed ? NET.exporters.filter((e) => e.id === "QAT" || e.id === "UAE").reduce((a, e) => a + (s.closed.has(e.id) ? 0 : exporterSupply(e, s.diversion)), 0) : 0;
  return { scenario, system, map, supply: system.total, demand: system.demand, lambda, hormuzLost, rows };
}

export const fmt = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : "∞");
export const pct = (x: number) => `${Math.round(Math.max(0, Math.min(1, x)) * 100)}%`;
export const days = (c: Cover) => (!Number.isFinite(c.days) ? (c.shortfall < 1e-6 ? "no gap" : "fuel switching covers it") : `${Math.round(c.days)} days`);
