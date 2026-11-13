import type { Arc } from "../src/model/maxflow";
import type { Datum, Network } from "../src/model/types";

export const D = (value: number, unit = "mtpa"): Datum => ({ value, unit, source_url: "test", year: 2025, is_estimate: false, note: "" });

/** CLRS 3rd ed. Figure 26.1: max flow 23. Nodes s=0, v1..v4 = 1..4, t=5. */
export const CLRS: Arc[] = [
  [0, 1, 16], [0, 2, 13], [1, 3, 12], [2, 1, 4], [2, 4, 14],
  [3, 2, 9], [3, 5, 20], [4, 3, 7], [4, 5, 4],
];

/** Deterministic pseudo-random graph generator (mulberry32). */
export function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function randomGraph(seed: number, n: number, p: number): Arc[] {
  const r = rng(seed); const arcs: Arc[] = [];
  for (let u = 0; u < n; u++) for (let v = 0; v < n; v++) if (u !== v && v !== 0 && u !== n - 1 && r() < p) arcs.push([u, v, Math.round(r() * 20)]);
  return arcs;
}
/** Brute-force min s–t cut over all 2^(n-2) partitions. s = 0, t = n-1. */
export function bruteMinCut(n: number, arcs: Arc[]): number {
  let best = Infinity;
  for (let mask = 0; mask < 1 << (n - 2); mask++) {
    const S = (x: number) => x === 0 || (x !== n - 1 && ((mask >> (x - 1)) & 1) === 1);
    let c = 0; for (const [u, v, cap] of arcs) if (S(u) && !S(v)) c += cap;
    best = Math.min(best, c);
  }
  return best;
}

/**
 * Toy LNG network with a hand-computed answer.
 *   Exporter A (10) → route R (6) → importers I1, I2
 *   Exporter B (4)  → I2 directly
 *   Demands: I1 = 6, I2 = 6. Regas non-binding.
 * Equal rationing: route R carries 6λ for I1 plus (6λ − 4) for I2, so 12λ − 4 = 6 → λ = 5/6.
 * Max flow = 6 (route) + 4 (B) = 10 of 12.
 */
export function toy(): Network {
  const imp = (id: string, d: number, fs = 0, wd = 0, inv = 0) => ({
    id, name: id, regas: D(100), import_demand: D(d),
    storage: { inventory: D(inv, "Mt"), max_withdrawal: D(wd) }, fuel_switch: D(fs),
  });
  return {
    meta: { baseline_year: 2025, unit: "mtpa", bcm_per_mtpa: 1.36, diversion: D(0, "share"), horizon_days: D(0, "days") },
    exporters: [
      { id: "A", name: "A", capacity: D(12), asia_deliveries: D(10), total_exports: D(10) },
      { id: "B", name: "B", capacity: D(6), asia_deliveries: D(4), total_exports: D(6) },
    ],
    routes: [{ id: "R", name: "Route R", kind: "chokepoint", capacity: D(6) }],
    links: [
      { id: "A-R", from: "A", to: "R", capacity: null },
      { id: "R-I1", from: "R", to: "I1", capacity: null },
      { id: "R-I2", from: "R", to: "I2", capacity: null },
      { id: "B-I2", from: "B", to: "I2", capacity: null },
    ],
    pipelines: [],
    importers: [imp("I1", 6, 1, 0, 0), imp("I2", 6, 0, 0, 0)],
    investments: [
      { id: "R+2", label: "+2 route R", changes: [{ target: "routes.R.capacity", delta: 2 }] },
      { id: "I1fs", label: "+1 fuel switch I1", changes: [{ target: "importers.I1.fuel_switch", delta: 1 }] },
      { id: "B+1", label: "+1 exporter B", changes: [{ target: "exporters.B.asia_deliveries", delta: 1 }] },
    ],
    scenarios: { closeR: { label: "R closed", close: ["R"] } },
  };
}
