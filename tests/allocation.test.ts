import { describe, expect, it } from "vitest";
import { outbid, rationLambda, solve } from "../src/model/allocation";
import { coverFor } from "../src/model/cover";
import { applyChanges } from "../src/model/graph";
import { nMinus1, rankInvestments, runScenario } from "../src/model/analysis";
import { D, toy } from "./fixtures";

describe("allocation views on the hand-computed toy network", () => {
  it("equal rationing λ = 5/6", () => {
    expect(rationLambda(toy())).toBeCloseTo(5 / 6, 8);
  });
  it("outbid: each importer alone can be fully supplied", () => {
    expect(outbid(toy(), "I1")).toBeCloseTo(6);
    expect(outbid(toy(), "I2")).toBeCloseTo(6);
  });
  it("route R closed: I1 gets nothing alone, λ = 0", () => {
    const n = toy(), sc = n.scenarios.closeR;
    expect(outbid(n, "I1", { scenario: sc })).toBeCloseTo(0);
    expect(outbid(n, "I2", { scenario: sc })).toBeCloseTo(4);
    expect(rationLambda(n, { scenario: sc })).toBeCloseTo(0, 8);
  });
  it("buffers: I1 fuel switch of 1 lets λ rise. 12λ − 4 − 1 = 6 → λ = 11/12", () => {
    expect(rationLambda(toy(), { buffers: true })).toBeCloseTo(11 / 12, 8);
  });
  it("cap_factor halves a route", () => {
    expect(solve(toy(), { scenario: { label: "half", cap_factor: { R: 0.5 } } }).total).toBeCloseTo(7);
  });
});

describe("days of cover", () => {
  const imp = {
    id: "X", name: "X", regas: D(100), import_demand: D(10), fuel_switch: D(2),
    storage: { inventory: D(1.5, "Mt"), max_withdrawal: D(3) },
  };
  it("fuel switch first, then storage, then unmet", () => {
    const c = coverFor(imp, 4);
    expect(c.shortfall).toBe(6);
    expect(c.fuelSwitch).toBe(2);
    expect(c.storageDraw).toBe(3);
    expect(c.unmetNow).toBe(1);
    expect(c.days).toBeCloseTo(182.5);
    expect(c.unmetAfterDry).toBe(4);
  });
  it("no storage needed → infinite cover", () => {
    expect(coverFor(imp, 9).days).toBe(Infinity);
  });
  it("storage-first order draws storage before switching", () => {
    const c = coverFor(imp, 8, "storage-first");
    expect(c.storageDraw).toBe(2);
    expect(c.fuelSwitch).toBe(0);
    expect(c.days).toBeCloseTo(273.75);
  });
});

describe("scenario, N−1 and investment drivers", () => {
  it("applyChanges does not mutate the input", () => {
    const n = toy();
    const n2 = applyChanges(n, [{ target: "routes.R.capacity", delta: 2 }]);
    expect(n.routes[0].capacity!.value).toBe(6);
    expect(n2.routes[0].capacity!.value).toBe(8);
    expect(() => applyChanges(n, [{ target: "routes.NOPE.capacity", delta: 1 }])).toThrow();
  });
  it("runScenario reports system totals and per-importer views", () => {
    const r = runScenario(toy(), "base", { label: "Baseline" });
    expect(r.total).toBeCloseTo(10);
    expect(r.shortfall).toBeCloseTo(2);
    expect(r.importers.map((i) => i.rationed)).toEqual([expect.closeTo(5, 6), expect.closeTo(5, 6)]);
  });
  it("N−1 ranks route R and flags I1 as worst hit", () => {
    const rows = nMinus1(toy());
    expect(rows[0]).toMatchObject({ closed: "R", worstImporter: "I1" });
    expect(rows[0].shortfall).toBeCloseTo(8);
  });
  it("investments: +2 on route R beats +1 fuel switch beats +1 on B", () => {
    // R+2: route 8 → 12λ−4 ≤ 8 → λ = 1 (buffered also 1).
    // I1fs: buffered λ: 12λ − 4 − 2 = 6 → λ = 1; physical λ unchanged at 5/6.
    // B+1: 12λ − 5 = 6 → λ = 11/12 physical; buffered 12λ − 6 = 6 → 1.
    const rows = rankInvestments(toy(), { label: "Baseline" });
    expect(rows[0].id).toBe("R+2");
    expect(rows[0].dLambda).toBeCloseTo(1 / 6, 6);
    expect(rows.map((r) => r.id)).toEqual(["R+2", "B+1", "I1fs"]);
  });
});

describe("diversion of non-Asian cargoes", () => {
  it("B exports 6 but sends 4 to Asia; diversion 0.5 adds 1, diversion 1 adds 2", () => {
    const n = toy();
    expect(solve(n, { scenario: { label: "d", diversion: 0.5 } }).total).toBeCloseTo(11);
    expect(solve(n, { scenario: { label: "d", diversion: 1 } }).total).toBeCloseTo(12);
    expect(solve(n, { scenario: { label: "d", diversion: 5 } }).total).toBeCloseTo(12); // clamped
  });
});

describe("storage in buffered λ", () => {
  it("tank storage enters before regas, so regas caps LNG + tank draw", () => {
    const n = toy();
    n.importers[0].regas = D(6); // I1 regas exactly its demand
    n.importers[0].fuel_switch = D(0);
    n.importers[0].storage = { inventory: D(10, "Mt"), max_withdrawal: D(5) };
    // No horizon: I1 can draw 5 from tanks, but regas 6 still caps I1 at 6 → λ = 1 is feasible (route gives the rest to I2)
    expect(rationLambda(n, { buffers: true })).toBeCloseTo(1, 8);
    const sol = solve(n, { buffers: true });
    const regasIdx = sol.graph.meta.findIndex((m) => m.type === "regas" && m.id === "I1");
    expect(sol.result.flows[regasIdx]).toBeLessThanOrEqual(6 + 1e-9);
  });
  it("horizon caps storage at inventory × 365 / days", () => {
    const n = toy();
    n.importers[0].fuel_switch = D(0);
    n.importers[0].storage = { inventory: D(0.25, "Mt"), max_withdrawal: D(5) };
    // 0.25 Mt over 91.25 days → 1 mtpa → same as the 1 mtpa fuel switch case: λ = 11/12
    expect(rationLambda(n, { buffers: true, scenario: { label: "h", horizon_days: 91.25 } })).toBeCloseTo(11 / 12, 8);
  });
});

describe("last in line", () => {
  it("toy: each importer gets 4 when served after the other (10 − 6)", async () => {
    const { lastInLine } = await import("../src/model/allocation");
    expect(lastInLine(toy(), "I1")).toBeCloseTo(4);
    expect(lastInLine(toy(), "I2")).toBeCloseTo(4);
  });
  it("last ≤ rationed ≤ outbid for every importer", async () => {
    const { lastInLine } = await import("../src/model/allocation");
    const n = toy(), lam = rationLambda(n);
    for (const im of n.importers) {
      const l = lastInLine(n, im.id), o = outbid(n, im.id), r = lam * im.import_demand.value;
      expect(l).toBeLessThanOrEqual(r + 1e-9);
      expect(r).toBeLessThanOrEqual(o + 1e-9);
    }
  });
});

describe("priority allocation", () => {
  it("toy: serving I1 first gives I1 6 and I2 4; reversed gives I2 6 and I1 4", async () => {
    const { priorityAllocation } = await import("../src/model/allocation");
    expect(priorityAllocation(toy(), ["I1", "I2"])).toEqual({ I1: expect.closeTo(6, 9), I2: expect.closeTo(4, 9) });
    expect(priorityAllocation(toy(), ["I2", "I1"])).toEqual({ I2: expect.closeTo(6, 9), I1: expect.closeTo(4, 9) });
  });
});
