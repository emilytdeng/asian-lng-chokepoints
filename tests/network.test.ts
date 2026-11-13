import { describe, expect, it } from "vitest";
import raw from "../data/network.json";
import type { Datum, Network } from "../src/model/types";
import { rationLambda, solve } from "../src/model/allocation";
import { buildGraph } from "../src/model/graph";

const net = raw as unknown as Network;

function* datums(x: unknown, path = ""): Generator<[string, Datum]> {
  if (x && typeof x === "object") {
    if ("value" in x && "source_url" in x) { yield [path, x as Datum]; return; }
    for (const [k, v] of Object.entries(x)) yield* datums(v, path ? `${path}.${k}` : k);
  }
}

describe("data/network.json", () => {
  it("every number is a complete Datum", () => {
    let n = 0;
    for (const [p, d] of datums(net)) {
      n++;
      expect(typeof d.value, p).toBe("number");
      expect(Number.isFinite(d.value), p).toBe(true);
      expect(d.value, p).toBeGreaterThanOrEqual(0);
      expect(d.unit, p).toBeTruthy();
      expect(d.source_url, p).toMatch(/^(https:\/\/|estimate$)/);
      expect(typeof d.is_estimate, p).toBe("boolean");
      expect(d.note.length, p).toBeGreaterThan(10);
      if (d.source_url === "estimate") expect(d.is_estimate, p).toBe(true);
    }
    expect(n).toBeGreaterThan(60);
  });
  it("all link, pipeline, scenario and investment ids resolve", () => {
    expect(() => buildGraph(net)).not.toThrow();
    const ids = new Set([...net.exporters, ...net.routes, ...net.pipelines, ...net.links].map((x) => x.id));
    for (const sc of Object.values(net.scenarios)) {
      for (const id of sc.close ?? []) expect(ids.has(id), id).toBe(true);
      for (const id of Object.keys(sc.cap_factor ?? {})) expect(ids.has(id), id).toBe(true);
    }
    for (const inv of net.investments) for (const ch of inv.changes) expect(ch.target).toMatch(/^(importers|exporters|pipelines|routes)\./);
  });
  it("the 2025 baseline is fully supplied (demand was met in 2025)", () => {
    expect(rationLambda(net, { scenario: net.scenarios.baseline })).toBe(1);
    const sol = solve(net, { scenario: net.scenarios.baseline });
    expect(sol.total).toBeCloseTo(sol.demand, 6);
  });
  it("Hormuz closure removes roughly the Qatar + UAE Asian volume", () => {
    const base = solve(net, { scenario: { label: "no diversion", diversion: 0 } });
    const hz = solve(net, { scenario: { label: "hz, no diversion", close: ["HORMUZ"], diversion: 0 } });
    const lost = base.total - hz.total;
    const qu = ["QAT", "UAE"].map((id) => net.exporters.find((e) => e.id === id)!.asia_deliveries.value).reduce((a, b) => a + b);
    expect(lost).toBeCloseTo(qu, 6);
  });
});
