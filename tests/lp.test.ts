import { describe, expect, it } from "vitest";
import raw from "../data/network.json";
import { lastInLine, outbid, priorityAllocation, rationLambda, solve } from "../src/model/allocation";
import { fleetCapacity, lpLambda, lpLastInLine, lpOutbid, lpPriority, lpSolve } from "../src/model/lp";
import type { Network } from "../src/model/types";
import { toy } from "./fixtures";

const net = raw as unknown as Network;
const ORDER = ["JPN", "KOR", "TWN", "CHN", "THA", "IND", "BGD", "PAK"];

describe("LP agrees with max-flow when the extra constraints are off", () => {
  it("toy: total, λ and min-cut dual", async () => {
    expect((await lpSolve(toy())).total).toBeCloseTo(solve(toy()).total, 6);
    const l = await lpLambda(toy());
    expect(l.lambda).toBeCloseTo(5 / 6, 6);
    // λ = (capR + 4) / 12, so one more mtpa on route R is worth 1/12 of λ
    expect(l.duals.find((d) => d.key === "route:R")?.dual).toBeCloseTo(1 / 12, 6);
  });
  it("real network, every scenario: max-flow total and λ", async () => {
    for (const [k, sc] of Object.entries(net.scenarios)) {
      if (sc.hormuz || sc.fleet) continue;
      expect((await lpSolve(net, { scenario: sc })).total, k).toBeCloseTo(solve(net, { scenario: sc }).total, 4);
      expect((await lpLambda(net, { scenario: sc })).lambda!, k).toBeCloseTo(rationLambda(net, { scenario: sc }), 5);
    }
  });
  it("real network, Hormuz closed: outbid, last in line and market order per importer", async () => {
    const sc = net.scenarios.hormuz;
    const prio = priorityAllocation(net, ORDER, { scenario: sc });
    const lp = await lpPriority(net, ORDER, { scenario: sc });
    for (const im of net.importers) {
      expect(await lpOutbid(net, im.id, { scenario: sc }), im.id).toBeCloseTo(outbid(net, im.id, { scenario: sc }), 4);
      expect(await lpLastInLine(net, im.id, { scenario: sc }), im.id).toBeCloseTo(Math.max(0, lastInLine(net, im.id, { scenario: sc })), 4);
      expect(lp[im.id], im.id).toBeCloseTo(prio[im.id], 4);
    }
  });
  it("Hormuz at 100% share with no selection equals Hormuz open", async () => {
    const a = await lpSolve(net, { scenario: { label: "s", hormuz: { share: 1 } } });
    expect(a.total).toBeCloseTo(solve(net).total, 4);
  });
});

describe("selective and partial Hormuz", () => {
  it("Pakistan-only passage: Gulf gas reaches Pakistan and nobody else", async () => {
    const r = await lpSolve(net, { scenario: net.scenarios.hormuz_pakistan });
    for (const [d, v] of Object.entries(r.gulfByDest!)) if (d !== "PAK") expect(v, d).toBeCloseTo(0, 6);
    expect(r.gulfByDest!.PAK).toBeGreaterThan(0);
    const closed = solve(net, { scenario: net.scenarios.hormuz }).total;
    expect(r.total).toBeGreaterThan(closed);
    expect(r.total).toBeLessThanOrEqual(closed + 6.7 + 1e-6); // at most Pakistan's demand added
  });
  it("partial share lies between closed and open, and is monotone", async () => {
    const closed = solve(net, { scenario: net.scenarios.hormuz }).total, open = solve(net).total;
    let prev = closed;
    for (const share of [0.2, 0.5, 0.8]) {
      const t = (await lpSolve(net, { scenario: { label: "p", hormuz: { share } } })).total;
      expect(t).toBeGreaterThanOrEqual(prev - 1e-6);
      expect(t).toBeLessThanOrEqual(open + 1e-6);
      prev = t;
    }
  });
});

describe("fleet constraint", () => {
  it("baseline still fully supplied, and fleet use never exceeds capacity", async () => {
    const cap = await fleetCapacity(net);
    expect(cap).toBeGreaterThan(0);
    const b = await lpSolve(net, { scenario: { label: "b", fleet: true } });
    expect(b.total).toBeCloseTo(solve(net).total, 4);
    for (const k of ["hormuz", "redsea", "malacca", "panama", "hormuz_redsea"]) {
      const r = await lpSolve(net, { scenario: { ...net.scenarios[k], fleet: true } });
      expect(r.fleet!.used, k).toBeLessThanOrEqual(r.fleet!.capacity * (1 + 1e-9));
      expect(r.total, k).toBeLessThanOrEqual(solve(net, { scenario: net.scenarios[k] }).total + 1e-6);
    }
  });
  it("adding the fleet constraint never raises λ", async () => {
    for (const k of ["hormuz", "redsea", "malacca"]) {
      const a = (await lpLambda(net, { scenario: net.scenarios[k] })).lambda!;
      const b = (await lpLambda(net, { scenario: { ...net.scenarios[k], fleet: true } })).lambda!;
      expect(b, k).toBeLessThanOrEqual(a + 1e-9);
    }
  });
});
