import { describe, expect, it } from "vitest";
import { TOY_ARCS, arcName, flowsAfter, pathNodes, toyTrace } from "../src/site/toydata";

describe("toy network used in the story", () => {
  const t = toyTrace();
  it("Edmonds–Karp takes S→A→D→T, then S→A→C→T, then undoes A→D via S→B→D→A→C→T", () => {
    expect(t.steps.map(pathNodes)).toEqual([["S", "A", "D", "T"], ["S", "A", "C", "T"], ["S", "B", "D", "A", "C", "T"]]);
    expect(t.steps.map((s) => s.amount)).toEqual([5, 3, 3]);
    const back = t.steps[2].arcs.filter((a) => !a.fwd).map((a) => arcName(a.i));
    expect(back).toEqual(["A→D"]);
    expect(t.result.total).toBe(11);
  });
  it("ends with A→D at 2 and the unique min cut {A→C, D→T} = 11", () => {
    const f = flowsAfter(t.steps, 3);
    expect(f).toEqual(t.result.flows);
    expect(f[TOY_ARCS.findIndex((_, i) => arcName(i) === "A→D")]).toBe(2);
    expect(t.cut.map(arcName).sort()).toEqual(["A→C", "D→T"]);
    expect(t.result.reach).toEqual([true, true, true, false, true, false]); // S, A, B, D
    // every other S–T cut is larger
    const vals: number[] = [];
    for (let m = 0; m < 16; m++) {
      const side = [true, ...[0, 1, 2, 3].map((b) => !!(m & (1 << b))), false];
      vals.push(TOY_ARCS.reduce((a, [u, v, c]) => a + (side[u] && !side[v] ? c : 0), 0));
    }
    expect(Math.min(...vals)).toBe(11);
    expect(vals.filter((v) => v === 11)).toHaveLength(1);
  });
});
