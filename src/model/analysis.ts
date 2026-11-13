import { lastInLine, outbid, rationLambda, solve } from "./allocation";
import { coverFor, type BufferOrder, type Cover } from "./cover";
import { applyChanges } from "./graph";
import type { Network, Scenario } from "./types";

export interface ImporterView {
  id: string;
  name: string;
  demand: number;
  outbid: number; // mtpa if it wins every cargo
  outbidShare: number;
  rationed: number; // λ × demand
  last: number; // mtpa if it loses every bidding war (served after everyone else)
  lastShare: number;
  coverOutbid: Cover;
  coverRationed: Cover;
  coverLast: Cover;
}

export interface ScenarioResult {
  key: string;
  label: string;
  total: number; // system max-flow (LNG + pipeline), mtpa
  demand: number;
  shortfall: number;
  lambda: number; // equal-rationing share, physical supply only
  lambdaBuffered: number; // equal-rationing share including fuel switch + storage at max rate
  importers: ImporterView[];
}

export function runScenario(net: Network, key: string, scenario: Scenario, order: BufferOrder = "fuelswitch-first"): ScenarioResult {
  const sol = solve(net, { scenario });
  const lambda = rationLambda(net, { scenario });
  const lambdaBuffered = rationLambda(net, { scenario, buffers: true });
  const importers = net.importers.map((im) => {
    const d = im.import_demand.value;
    const ob = outbid(net, im.id, { scenario });
    const last = lastInLine(net, im.id, { scenario });
    return {
      id: im.id, name: im.name, demand: d, outbid: ob, outbidShare: d > 0 ? ob / d : 1,
      rationed: lambda * d,
      last, lastShare: d > 0 ? last / d : 1,
      coverOutbid: coverFor(im, ob, order),
      coverRationed: coverFor(im, lambda * d, order),
      coverLast: coverFor(im, last, order),
    };
  });
  return { key, label: scenario.label, total: sol.total, demand: sol.demand, shortfall: sol.demand - sol.total, lambda, lambdaBuffered, importers };
}

export interface N1Row {
  closed: string;
  name: string;
  shortfall: number;
  lambda: number;
  worstImporter: string; // lowest outbid share
  worstShare: number;
  worstLastImporter: string; // lowest last-in-line share
  worstLastShare: number;
}

/** Close each chokepoint (on top of an optional base scenario) one at a time; sort by total shortfall. */
export function nMinus1(net: Network, base: Scenario = { label: "Baseline" }, includeLanes = false): N1Row[] {
  const rows = net.routes.filter((r) => includeLanes || r.kind === "chokepoint").map((r) => {
    const sc: Scenario = { ...base, label: `${r.name} closed`, close: [...(base.close ?? []), r.id] };
    const sol = solve(net, { scenario: sc });
    let worstImporter = "", worstShare = Infinity, worstLastImporter = "", worstLastShare = Infinity;
    for (const im of net.importers) {
      const sh = outbid(net, im.id, { scenario: sc }) / im.import_demand.value;
      if (sh < worstShare - 1e-12) { worstShare = sh; worstImporter = im.id; }
      const ls = lastInLine(net, im.id, { scenario: sc }) / im.import_demand.value;
      if (ls < worstLastShare - 1e-12) { worstLastShare = ls; worstLastImporter = im.id; }
    }
    return { closed: r.id, name: r.name, shortfall: sol.demand - sol.total, lambda: rationLambda(net, { scenario: sc }), worstImporter, worstShare, worstLastImporter, worstLastShare };
  });
  // round before sorting so float noise (~1e-13) can't reorder ties
  const r6 = (x: number) => Math.round(x * 1e6);
  return rows.sort((a, b) => r6(b.shortfall) - r6(a.shortfall) || r6(a.lambda) - r6(b.lambda));
}

export interface InvestRow {
  id: string;
  label: string;
  lambda: number;
  dLambda: number;
  lambdaBuffered: number;
  dLambdaBuffered: number;
  minDays: number; // shortest days of cover across importers under rationing
  dMinDays: number;
}

function minDays(net: Network, scenario: Scenario, order: BufferOrder): number {
  const lam = rationLambda(net, { scenario });
  return Math.min(...net.importers.map((im) => coverFor(im, lam * im.import_demand.value, order).days));
}

/** Apply each candidate investment alone and rank by gain in physical λ, then buffered λ, then shortest days of cover. */
export function rankInvestments(net: Network, scenario: Scenario, order: BufferOrder = "fuelswitch-first"): InvestRow[] {
  const l0 = rationLambda(net, { scenario });
  const lb0 = rationLambda(net, { scenario, buffers: true });
  const md0 = minDays(net, scenario, order);
  const rows = net.investments.map((inv) => {
    const n2 = applyChanges(net, inv.changes);
    const l = rationLambda(n2, { scenario });
    const lb = rationLambda(n2, { scenario, buffers: true });
    const md = minDays(n2, scenario, order);
    return { id: inv.id, label: inv.label, lambda: l, dLambda: l - l0, lambdaBuffered: lb, dLambdaBuffered: lb - lb0, minDays: md, dMinDays: md - md0 };
  });
  const r = (x: number) => Math.round(x * 1e6);
  return rows.sort((a, b) => r(b.dLambda) - r(a.dLambda) || r(b.dLambdaBuffered) - r(a.dLambdaBuffered) || b.dMinDays - a.dMinDays);
}
