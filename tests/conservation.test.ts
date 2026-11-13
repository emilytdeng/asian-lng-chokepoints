import { describe, expect, it } from "vitest";
import { edmondsKarp, type Arc, type FlowResult } from "../src/model/maxflow";
import { solve } from "../src/model/allocation";
import { CLRS, randomGraph, toy } from "./fixtures";

function checkFlow(n: number, arcs: Arc[], s: number, t: number, r: FlowResult) {
  const bal = new Array(n).fill(0);
  arcs.forEach(([u, v, c], i) => {
    const f = r.flows[i];
    expect(f).toBeGreaterThanOrEqual(-1e-9);
    expect(f).toBeLessThanOrEqual(c + 1e-9);
    bal[u] -= f; bal[v] += f;
  });
  for (let x = 0; x < n; x++) if (x !== s && x !== t) expect(Math.abs(bal[x])).toBeLessThan(1e-9);
  expect(bal[t]).toBeCloseTo(r.total, 9);
  expect(-bal[s]).toBeCloseTo(r.total, 9);
}

describe("flow conservation and capacity bounds", () => {
  it("CLRS", () => checkFlow(6, CLRS, 0, 5, edmondsKarp(6, CLRS, 0, 5)));
  it("random graphs", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const n = 5 + (seed % 12), arcs = randomGraph(seed * 13, n, 0.3);
      checkFlow(n, arcs, 0, n - 1, edmondsKarp(n, arcs, 0, n - 1));
    }
  });
  it("toy LNG network, with and without buffers", () => {
    for (const buffers of [false, true]) {
      const sol = solve(toy(), { buffers });
      checkFlow(sol.graph.n, sol.graph.arcs, sol.graph.s, sol.graph.t, sol.result);
    }
  });
});
