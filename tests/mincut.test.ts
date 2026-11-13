import { describe, expect, it } from "vitest";
import { cutArcs, edmondsKarp } from "../src/model/maxflow";
import { solve } from "../src/model/allocation";
import { cutCapacity } from "../src/model/mincut";
import { CLRS, randomGraph, toy } from "./fixtures";

describe("min cut capacity equals max flow", () => {
  it("CLRS: cut arcs sum to 23 and are saturated", () => {
    const r = edmondsKarp(6, CLRS, 0, 5);
    const cut = cutArcs(CLRS, r.reach);
    expect(cut.reduce((a, i) => a + CLRS[i][2], 0)).toBeCloseTo(23);
    for (const i of cut) expect(r.flows[i]).toBeCloseTo(CLRS[i][2]);
  });
  it("random graphs", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const n = 5 + (seed % 10);
      const arcs = randomGraph(seed * 7, n, 0.35);
      const r = edmondsKarp(n, arcs, 0, n - 1);
      const c = cutArcs(arcs, r.reach).reduce((a, i) => a + arcs[i][2], 0);
      expect(c).toBeCloseTo(r.total, 9);
    }
  });
  it("toy LNG network: route R is the labelled bottleneck, I1 fully supplied side", () => {
    const sol = solve(toy());
    expect(sol.total).toBeCloseTo(10);
    expect(cutCapacity(sol.cut)).toBeCloseTo(sol.total);
    const labels = sol.cut.map((c) => `${c.meta.type}:${c.meta.id}:${c.label}`).sort();
    expect(labels).toEqual(["route:R:route bottleneck", "supply:B:exporter at capacity"]);
  });
  it("closed route appears on the cut flagged as closed", () => {
    const n = toy();
    const sol = solve(n, { scenario: n.scenarios.closeR });
    expect(sol.total).toBeCloseTo(4);
    const r = sol.cut.find((c) => c.meta.type === "route");
    expect(r?.closed).toBe(true);
    expect(r?.capacity).toBe(0);
    expect(cutCapacity(sol.cut)).toBeCloseTo(sol.total);
  });
});
