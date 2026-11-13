import { describe, expect, it } from "vitest";
import { dinic, edmondsKarp, type Arc } from "../src/model/maxflow";
import { CLRS, bruteMinCut, randomGraph } from "./fixtures";

describe("max-flow on textbook graphs", () => {
  it("CLRS Fig 26.1 = 23", () => {
    expect(edmondsKarp(6, CLRS, 0, 5).total).toBeCloseTo(23);
    expect(dinic(6, CLRS, 0, 5).total).toBeCloseTo(23);
  });
  it("Ford–Fulkerson worst case (diamond with cross arc) = 2000", () => {
    const g: Arc[] = [[0, 1, 1000], [0, 2, 1000], [1, 2, 1], [1, 3, 1000], [2, 3, 1000]];
    expect(edmondsKarp(4, g, 0, 3).total).toBe(2000);
  });
  it("series bottleneck and parallel sum", () => {
    expect(edmondsKarp(3, [[0, 1, 5], [1, 2, 3]], 0, 2).total).toBe(3);
    expect(edmondsKarp(2, [[0, 1, 2], [0, 1, 4.5]], 0, 1).total).toBe(6.5);
  });
  it("disconnected sink = 0", () => {
    expect(edmondsKarp(3, [[0, 1, 5]], 0, 2).total).toBe(0);
  });
  it("handles Infinity capacities when a finite arc bounds every path", () => {
    expect(edmondsKarp(3, [[0, 1, Infinity], [1, 2, 7]], 0, 2).total).toBe(7);
  });
  it("Edmonds–Karp, Dinic and brute-force min cut agree on 200 random graphs", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const n = 4 + (seed % 6); // 4..9 nodes
      const arcs = randomGraph(seed, n, 0.4);
      const ek = edmondsKarp(n, arcs, 0, n - 1).total;
      expect(dinic(n, arcs, 0, n - 1).total).toBeCloseTo(ek, 9);
      expect(bruteMinCut(n, arcs)).toBeCloseTo(ek, 9);
    }
  });
});
