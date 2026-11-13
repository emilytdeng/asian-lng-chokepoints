import { describe, expect, it } from "vitest";
import raw from "../data/network.json";
import { traceSolve } from "../src/model/allocation";
import { edmondsKarp, EPS, type AugmentStep } from "../src/model/maxflow";
import type { Network } from "../src/model/types";
import { CLRS, randomGraph } from "./fixtures";

const net = raw as unknown as Network;

/** Replay steps arc by arc, checking each path is a real s→t path that respects capacity. */
function replay(n: number, arcs: [number, number, number][], s: number, t: number, steps: AugmentStep[]) {
  const f = new Array(arcs.length).fill(0);
  for (const st of steps) {
    let at = s;
    for (const { i, fwd } of st.arcs) {
      const [u, v, c] = arcs[i];
      expect(fwd ? u : v).toBe(at);
      at = fwd ? v : u;
      f[i] += fwd ? st.amount : -st.amount;
      expect(f[i]).toBeGreaterThanOrEqual(-EPS);
      expect(f[i]).toBeLessThanOrEqual(c + EPS);
    }
    expect(at).toBe(t);
    expect(st.amount).toBeGreaterThan(0);
  }
  return f;
}

describe("augmenting-path trace", () => {
  it("replays to the same flow and total (CLRS and random graphs)", () => {
    const cases = [{ n: 6, arcs: CLRS }, ...Array.from({ length: 30 }, (_, k) => ({ n: 8, arcs: randomGraph(k + 1, 8, 0.4) }))]
      .map((g) => ({ ...g, s: 0, t: g.n - 1 }));
    for (const g of cases) {
      const steps: AugmentStep[] = [];
      const r = edmondsKarp(g.n, g.arcs, g.s, g.t, undefined, (x) => steps.push(x));
      const f = replay(g.n, g.arcs, g.s, g.t, steps);
      f.forEach((x, i) => expect(x).toBeCloseTo(r.flows[i], 9));
      expect(steps.reduce((a, x) => a + x.amount, 0)).toBeCloseTo(r.total, 9);
    }
  });
  it("on the simple network, phase 1 uses no diverted cargoes and the steps sum to the max flow", () => {
    for (const close of [[], ["HORMUZ"], ["MALACCA"]]) {
      const { sol, steps } = traceSolve(net, { scenario: { label: "t", close }, simple: true });
      const f = replay(sol.graph.n, sol.graph.arcs, sol.graph.s, sol.graph.t, steps);
      f.forEach((x, i) => expect(x).toBeCloseTo(sol.result.flows[i], 9));
      for (const st of steps.filter((x) => x.phase === 1)) expect(st.arcs.some((a) => sol.graph.meta[a.i].type === "divert")).toBe(false);
      expect(steps.length).toBeGreaterThan(5);
    }
  });
});
