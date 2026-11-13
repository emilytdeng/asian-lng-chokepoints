import { describe, expect, it } from "vitest";
import raw from "../data/network.json";
import { priorityAllocation, rationLambda, solve } from "../src/model/allocation";
import { BIG, buildGraph } from "../src/model/graph";
import { edmondsKarp } from "../src/model/maxflow";
import type { Network } from "../src/model/types";
import { CLRS, randomGraph } from "./fixtures";

const net = raw as unknown as Network;
/** The full network with no buffers and every import terminal unlimited. */
const unlimited = (): Network => { const n: Network = structuredClone(net); for (const im of n.importers) im.regas.value = BIG; return n; };

describe("simple model", () => {
  it("simple graph equals the full graph with buffers off and unlimited import terminals", () => {
    for (const [k, sc] of Object.entries(net.scenarios)) {
      const s = { ...sc, diversion: undefined };
      const a = buildGraph(net, { scenario: s, simple: true, buffers: true });
      const b = buildGraph(unlimited(), { scenario: s, buffers: false });
      expect(a.arcs, k).toEqual(b.arcs);
      expect(a.meta, k).toEqual(b.meta);
      const fa = solve(net, { scenario: s, simple: true }), fb = solve(unlimited(), { scenario: s });
      expect(fa.total, k).toBeCloseTo(fb.total, 9);
      expect(fa.cut.map((c) => `${c.meta.type}:${c.meta.id}`).sort(), k).toEqual(fb.cut.map((c) => `${c.meta.type}:${c.meta.id}`).sort());
    }
  });
  it("simple model ignores a scenario's diversion and keeps the central 20%", () => {
    const a = solve(net, { scenario: { label: "d", close: ["HORMUZ"], diversion: 0.5 }, simple: true });
    const b = solve(net, { scenario: { label: "d", close: ["HORMUZ"] }, simple: true });
    expect(a.total).toBeCloseTo(b.total, 9);
  });
  it("allocations run on the simple graph", () => {
    const sc = net.scenarios.hormuz;
    expect(rationLambda(net, { scenario: sc, simple: true })).toBeCloseTo(rationLambda(unlimited(), { scenario: sc }), 8);
    const p = priorityAllocation(net, ["JPN", "KOR", "TWN", "CHN", "THA", "IND", "BGD", "PAK"], { scenario: sc, simple: true });
    expect(Object.values(p).reduce((a, b) => a + b, 0)).toBeCloseTo(solve(net, { scenario: sc, simple: true }).total, 6);
  });
});

describe("deferred arcs change the flow, not its value or cut", () => {
  it("same total and residual cut with and without deferral", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const n = 5 + (seed % 8), arcs = randomGraph(seed * 3, n, 0.35);
      const d = new Set(arcs.map((_, i) => i).filter((i) => i % 3 === 0));
      const a = edmondsKarp(n, arcs, 0, n - 1), b = edmondsKarp(n, arcs, 0, n - 1, d);
      expect(b.total).toBeCloseTo(a.total, 9);
      expect(b.reach).toEqual(a.reach);
    }
    expect(edmondsKarp(6, CLRS, 0, 5, new Set([0, 3])).total).toBeCloseTo(23);
  });
  it("2025 baseline: every exporter ships its 2025 Asian deliveries before any diverted cargo", () => {
    const sol = solve(net);
    for (const e of net.exporters) expect(sol.arcFlow[`divert:${e.id}`], e.id).toBeCloseTo(0, 9);
  });
});
