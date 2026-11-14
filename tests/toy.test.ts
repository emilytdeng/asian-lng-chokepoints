import { describe, expect, it } from "vitest";
import { TOY_ARCS, TOY_NODES, arcName, flowsAfter, pathNodes, toyTrace } from "../src/site/toydata";

describe("toy network used in the story", () => {
  const t = toyTrace();
  it("Edmonds–Karp takes S→A→F→T (3 pipes), then S→A→C→E→T (4), then undoes A→F via S→B→D→F→A→C→E→T (7)", () => {
    expect(t.steps.map(pathNodes)).toEqual([
      ["S", "A", "F", "T"],
      ["S", "A", "C", "E", "T"],
      ["S", "B", "D", "F", "A", "C", "E", "T"],
    ]);
    expect(t.steps.map((s) => s.amount)).toEqual([5, 3, 3]);
    const back = t.steps[2].arcs.filter((a) => !a.fwd).map((a) => arcName(a.i));
    expect(back).toEqual(["A→F"]);
    expect(t.result.total).toBe(11);
  });
  it("each chosen route is the unique shortest one with capacity left (no ties to explain)", () => {
    const N = TOY_NODES.length, S = 0, T = N - 1;
    const res = Array.from({ length: N }, () => new Array<number>(N).fill(0));
    for (const [u, v, c] of TOY_ARCS) res[u][v] += c;
    for (const st of t.steps) {
      // count shortest residual S→T paths by BFS layers
      const dist = new Array<number>(N).fill(-1), cnt = new Array<number>(N).fill(0);
      dist[S] = 0; cnt[S] = 1;
      const q = [S];
      while (q.length) {
        const u = q.shift()!;
        for (let v = 0; v < N; v++) if (res[u][v] > 0) {
          if (dist[v] < 0) { dist[v] = dist[u] + 1; q.push(v); }
          if (dist[v] === dist[u] + 1) cnt[v] += cnt[u];
        }
      }
      expect(cnt[T]).toBe(1);
      expect(dist[T]).toBe(st.arcs.length);
      const p = pathNodes(st).map((x) => TOY_NODES.indexOf(x as (typeof TOY_NODES)[number]));
      for (let k = 0; k + 1 < p.length; k++) { res[p[k]][p[k + 1]] -= st.amount; res[p[k + 1]][p[k]] += st.amount; }
    }
  });
  it("ends with A→F at 2 and the unique min cut {A→C, F→T} = 11", () => {
    const f = flowsAfter(t.steps, 3);
    expect(f).toEqual(t.result.flows);
    expect(f[TOY_ARCS.findIndex((_, i) => arcName(i) === "A→F")]).toBe(2);
    expect(t.cut.map(arcName).sort()).toEqual(["A→C", "F→T"]);
    expect(t.result.reach).toEqual([true, true, true, false, true, false, true, false]); // S, A, B, D, F
    // every other S–T cut is larger
    const mid = TOY_NODES.length - 2;
    const vals: number[] = [];
    for (let m = 0; m < 1 << mid; m++) {
      const side = [true, ...Array.from({ length: mid }, (_, b) => !!(m & (1 << b))), false];
      vals.push(TOY_ARCS.reduce((a, [u, v, c]) => a + (side[u] && !side[v] ? c : 0), 0));
    }
    expect(Math.min(...vals)).toBe(11);
    expect(vals.filter((v) => v === 11)).toHaveLength(1);
  });
});
