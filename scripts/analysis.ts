/**
 * npm run analysis
 *
 * Runs every scenario, the N−1 chokepoint table, the best-single-investment ranking and the robustness checks
 * on data/network.json, and writes results/findings.md plus results/*.csv. Numbers only: the narrative is
 * written by hand from these results.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import raw from "../data/network.json";
import { lastInLine, priorityAllocation, rationLambda, solve } from "../src/model/allocation";
import { nMinus1, rankInvestments, runScenario, type ScenarioResult } from "../src/model/analysis";
import { coverFor } from "../src/model/cover";
import type { Datum, Network, Scenario } from "../src/model/types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "results");
mkdirSync(OUT, { recursive: true });
const NET = raw as unknown as Network;
const HZ = NET.scenarios.hormuz;

// ------------------------------------------------------------------ helpers
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : "∞");
const f0 = (x: number) => (Number.isFinite(x) ? x.toFixed(0) : "∞");
const pct = (x: number) => `${Math.max(0, 100 * x).toFixed(0)}%`;
const name = (id: string) => NET.importers.find((i) => i.id === id)?.name ?? id;
function csv(file: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => (typeof v === "number" ? (Number.isFinite(v) ? +v.toFixed(4) : "inf") : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  writeFileSync(join(OUT, file), [header.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n") + "\n");
}
function md(header: string[], rows: (string | number)[][]) {
  return [`| ${header.join(" | ")} |`, `|${header.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
}
/** All Datum objects in the network with a path label, optionally only estimates. */
function datums(net: Network, onlyEstimates: boolean): [string, Datum][] {
  const out: [string, Datum][] = [];
  const walk = (x: any, path: string) => {
    if (x && typeof x === "object") {
      if ("value" in x && "is_estimate" in x) { if (!onlyEstimates || x.is_estimate) out.push([path, x]); return; }
      if (Array.isArray(x)) x.forEach((it) => walk(it, `${path}[${it?.id ?? "?"}]`));
      else for (const [k, v] of Object.entries(x)) walk(v, path ? `${path}.${k}` : k);
    }
  };
  walk(net, "");
  return out;
}
function withScaled(path: string, factor: number): Network {
  const copy: Network = structuredClone(NET);
  const d = datums(copy, false).find(([p]) => p === path)![1];
  const v = d.value * factor;
  d.value = d.range ? Math.min(d.range[1], Math.max(d.range[0], v)) : v;
  return copy;
}

// ------------------------------------------------------------------ 1. scenarios
// Scenarios with selective or partial passage, or a fleet limit, need the LP (analysis_lp.ts); max-flow can't represent them.
const lpOnly = (k: string) => !!(NET.scenarios[k].hormuz || NET.scenarios[k].fleet);
const scenarioKeys = Object.keys(NET.scenarios).filter((k) => !lpOnly(k));
const results: ScenarioResult[] = scenarioKeys.map((k) => runScenario(NET, k, NET.scenarios[k]));
csv("scenarios_system.csv",
  ["scenario", "label", "supply_mtpa", "demand_mtpa", "shortfall_mtpa", "lambda", "lambda_buffered", "min_cut"],
  results.map((r) => {
    const cut = solve(NET, { scenario: NET.scenarios[r.key] }).cut
      .filter((c) => c.meta.type !== "demand").map((c) => `${c.meta.id}${c.closed ? " (closed)" : ""}: ${c.label}`).join("; ");
    return [r.key, r.label, r.total, r.demand, r.shortfall, r.lambda, r.lambdaBuffered, cut];
  }));
csv("scenarios_importers.csv",
  ["scenario", "importer", "demand", "outbid", "outbid_share", "rationed", "rationed_share", "last_in_line", "last_share",
    "days_rationed", "days_last", "unmet_now_rationed", "unmet_now_last", "fuel_switch_used_last", "storage_draw_last"],
  results.flatMap((r) => r.importers.map((i) => [r.key, i.id, i.demand, i.outbid, i.outbidShare, i.rationed, r.lambda, i.last, i.lastShare,
    i.coverRationed.days, i.coverLast.days, i.coverRationed.unmetNow, i.coverLast.unmetNow, i.coverLast.fuelSwitch, i.coverLast.storageDraw])));

// ------------------------------------------------------------------ 2. N−1 and investments
const n1 = nMinus1(NET);
csv("n_minus_1.csv", ["closed", "name", "shortfall_mtpa", "lambda", "worst_outbid_importer", "worst_outbid_share", "worst_last_importer", "worst_last_share"],
  n1.map((r) => [r.closed, r.name, r.shortfall, r.lambda, r.worstImporter, r.worstShare, r.worstLastImporter, r.worstLastShare]));
const inv = rankInvestments(NET, HZ);
const targetOf = (id: string) => NET.investments.find((x) => x.id === id)!.changes[0].target.match(/^importers\.(\w+)\./)?.[1];
function targetDays(id: string) {
  const t = targetOf(id); if (!t) return { t: "", rat: NaN, last: NaN };
  const iv = NET.investments.find((x) => x.id === id)!;
  const n2: Network = structuredClone(NET);
  for (const ch of iv.changes) { const [coll, cid, ...rest] = ch.target.split("."); let o: any = (n2 as any)[coll].find((x: any) => x.id === cid); for (const k of rest) o = o[k]; o.value += ch.delta; }
  const im0 = NET.importers.find((i) => i.id === t)!, im1 = n2.importers.find((i) => i.id === t)!;
  const l0 = rationLambda(NET, { scenario: HZ }), l1 = rationLambda(n2, { scenario: HZ });
  const last0 = lastInLine(NET, t, { scenario: HZ }), last1 = lastInLine(n2, t, { scenario: HZ });
  return { t, rat: coverFor(im1, l1 * im1.import_demand.value).days - coverFor(im0, l0 * im0.import_demand.value).days,
    last: coverFor(im1, last1).days - coverFor(im0, last0).days };
}
const invSize = Object.fromEntries(NET.investments.map((iv) => [iv.id, iv.changes.reduce((a, c) => a + (/inventory|total_exports/.test(c.target) ? 0 : c.delta), 0)]));
csv("investments_hormuz.csv", ["rank", "id", "label", "lambda", "d_lambda", "lambda_buffered", "d_lambda_buffered", "min_days", "d_min_days"],
  inv.map((r, i) => [i + 1, r.id, r.label, r.lambda, r.dLambda, r.lambdaBuffered, r.dLambdaBuffered, r.minDays, r.dMinDays]));

// Investment effect on each importer's last-in-line position (who the investment actually helps).
const invLast = NET.investments.map((iv) => {
  const n2 = structuredClone(NET);
  for (const ch of iv.changes) {
    const [coll, id, ...rest] = ch.target.split(".");
    let o: any = (n2 as any)[coll].find((x: any) => x.id === id);
    for (const k of rest) o = o[k];
    o.value += ch.delta;
  }
  return { id: iv.id, label: iv.label, rows: n2.importers.map((im) => {
    const l = lastInLine(n2, im.id, { scenario: HZ });
    return { id: im.id, lastShare: l / im.import_demand.value, days: coverFor(im, l).days };
  }) };
});

// ------------------------------------------------------------------ 3. hypotheses (Hormuz closed)
const hz = results.find((r) => r.key === "hormuz")!;
const base = results.find((r) => r.key === "baseline")!;
const exposure = Object.fromEntries(NET.importers.map((im) => {
  const viaHz = NET.exporters.filter((e) => e.id === "QAT" || e.id === "UAE").reduce((a, e) => a + (e.deliveries_2025?.[im.id] ?? 0), 0);
  return [im.id, viaHz / im.import_demand.value];
}));
const pipeShare = Object.fromEntries(NET.importers.map((im) => [im.id, NET.pipelines.filter((p) => p.to === im.id).reduce((a, p) => a + p.capacity.value, 0) / im.import_demand.value]));
const sortedLast = [...hz.importers].sort((a, b) => a.lastShare - b.lastShare);

// Illustrative market allocation: high-income buyers first, then middle-, then low-income (as in 2022, when
// Pakistan and Bangladesh were priced out of spot LNG). An assumption, not a result; shown alongside the bounds.
const PRIORITY = ["JPN", "KOR", "TWN", "CHN", "THA", "IND", "BGD", "PAK"];
const prio = priorityAllocation(NET, PRIORITY, { scenario: HZ });
const prioRows = NET.importers.map((im) => ({ id: im.id, share: prio[im.id] / im.import_demand.value, cover: coverFor(im, prio[im.id]) }));

// How much of the buffered result rests on China's fuel switching and storage (an estimate-heavy input)?
const noCN: Network = structuredClone(NET);
{ const c = noCN.importers.find((i) => i.id === "CHN")!; c.fuel_switch.value = 0; c.storage.inventory.value = 0; c.storage.max_withdrawal.value = 0; }
const lamBnoCN = rationLambda(noCN, { scenario: HZ, buffers: true });
// λ with buffers depends on how long the closure lasts (storage spread over the horizon).
const horizons = [30, 90, 180, 365, 1e9].map((h) => ({ h, lamB: rationLambda(NET, { scenario: { ...HZ, horizon_days: h }, buffers: true }) }));

// ------------------------------------------------------------------ 4. robustness
interface Metrics { lambda: number; lambdaBuf: number; lambdaFS: number; shutOut: string[]; last: Record<string, number>; daysLast: Record<string, number>; daysRat: Record<string, number>; worstLast: string; shortestRat: string; topInv: string }
function metrics(net: Network, withInvest = true): Metrics {
  const lam = rationLambda(net, { scenario: HZ });
  const lamB = rationLambda(net, { scenario: HZ, buffers: true });
  const lamFS = rationLambda(net, { scenario: { ...HZ, horizon_days: 1e9 }, buffers: true });
  const last: Record<string, number> = {}, daysLast: Record<string, number> = {}, daysRat: Record<string, number> = {};
  for (const im of net.importers) {
    const l = lastInLine(net, im.id, { scenario: HZ });
    last[im.id] = l / im.import_demand.value;
    daysLast[im.id] = coverFor(im, l).days;
    daysRat[im.id] = coverFor(im, lam * im.import_demand.value).days;
  }
  // ties (several importers at 0%) resolve in data order, not by float noise
  const r9 = (x: number) => (Number.isFinite(x) ? Math.round(x * 1e9) : Infinity);
  const worstLast = Object.entries(last).sort((a, b) => r9(a[1]) - r9(b[1]))[0][0];
  const shortestRat = Object.entries(daysRat).sort((a, b) => r9(a[1]) - r9(b[1]))[0][0];
  const topInv = withInvest ? rankInvestments(net, HZ)[0].id : "";
  const shutOut = Object.entries(last).filter(([, v]) => v < 0.01).map(([k]) => k);
  return { lambda: lam, lambdaBuf: lamB, lambdaFS: lamFS, shutOut, last, daysLast, daysRat, worstLast, shortestRat, topInv };
}
const m0 = metrics(NET);
// Voyage times and fleet slack only enter the LP fleet constraint (see analysis_lp.ts), so they are left out here.
const ests = datums(NET, true).map(([p]) => p).filter((p) => !/voyage_days|fleet_slack/.test(p));
const rob: { path: string; factor: number; m: Metrics }[] = [];
for (const p of ests) for (const f of [0.75, 1.25]) rob.push({ path: p, factor: f, m: metrics(withScaled(p, f)) });
const divSweep = [0, 0.1, 0.2, 0.3, 0.5].map((d) => {
  const n = structuredClone(NET); n.meta.diversion.value = d;
  return { d, m: metrics(n) };
});
// Joint stress: every estimate moved 25% in the direction that hurts importers (less supply/buffers), and the reverse.
const harmful = (p: string) => /fuel_switch|storage|diversion|asia_deliveries|total_exports|capacity|regas|horizon_days/.test(p) && !/horizon_days/.test(p);
function joint(sign: 1 | -1): Network {
  const n: Network = structuredClone(NET);
  for (const [p, d] of datums(n, true)) {
    if (/import_demand/.test(p)) d.value *= 1 + 0.25 * sign;          // more demand hurts
    else if (/horizon_days/.test(p)) d.value *= 1 + 0.25 * sign;      // longer crisis hurts
    else if (harmful(p)) d.value *= 1 - 0.25 * sign;                   // less supply/buffer hurts
  }
  for (const [, d] of datums(n, true)) if (d.range) d.value = Math.min(d.range[1], Math.max(d.range[0], d.value));
  return n;
}
const jointWorse = metrics(joint(1)), jointBetter = metrics(joint(-1));
csv("robustness.csv",
  ["perturbed", "factor", "lambda", "lambda_buffered", "worst_last_in_line", "shortest_cover_rationed", "top_investment", ...NET.importers.map((i) => `last_${i.id}`), ...NET.importers.map((i) => `days_rationed_${i.id}`)],
  [["(none)", 1, m0], ...rob.map((r) => [r.path, r.factor, r.m] as const), ...divSweep.map((s) => [`meta.diversion=${s.d}`, 1, s.m] as const),
    ["ALL estimates −25% (harmful direction)", 1, jointWorse], ["ALL estimates +25% (helpful direction)", 1, jointBetter]]
    .map(([p, f, m]: any) => [p, f, m.lambda, m.lambdaBuf, m.worstLast, m.shortestRat, m.topInv, ...NET.importers.map((i) => m.last[i.id]), ...NET.importers.map((i) => m.daysRat[i.id])]));

// Range of each key metric across one-at-a-time perturbations, with the single most influential estimate.
function range(get: (m: Metrics) => number) {
  let lo = { v: Infinity, p: "" }, hi = { v: -Infinity, p: "" };
  const q = (x: number) => (Number.isFinite(x) ? Math.round(x * 1e9) / 1e9 : x); // ignore float noise when naming drivers
  for (const r of rob) { const v = q(get(r.m)); if (v < lo.v) lo = { v, p: `${r.path} ×${r.factor}` }; if (v > hi.v) hi = { v, p: `${r.path} ×${r.factor}` }; }
  return { lo, hi };
}
const flips = (get: (m: Metrics) => string) => {
  const c: Record<string, number> = {};
  for (const r of [...rob, ...divSweep.map((s) => ({ path: `diversion=${s.d}`, factor: 1, m: s.m }))]) c[get(r.m)] = (c[get(r.m)] ?? 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} (${n})`).join(", ");
};

// ------------------------------------------------------------------ 5. findings.md
const L: string[] = [];
L.push("# Findings: Asian LNG chokepoint analysis", "",
  `Generated by \`npm run analysis\` from data/network.json. Units: mtpa LNG-equivalent (1 Mt = ${NET.meta.bcm_per_mtpa} bcm). Diversion = ${pct(NET.meta.diversion.value)} of non-Asian cargoes; crisis horizon ${NET.meta.horizon_days.value} days; buffers used fuel-switch first, then storage.`, "",
  "Allocation views: **outbid** = the importer wins every cargo it can physically reach; **rationed** = every importer gets the same share λ of demand; **last in line** = the importer is served only after every other importer has taken all it can (loses every bidding war).", "");

L.push("## 1. Scenarios (system level)", "", md(["Scenario", "Supply / demand (mtpa)", "Shortfall", "λ (physical)", "λ (with buffers)"],
  [...results.map((r) => [r.label, `${f1(r.total)} / ${f1(r.demand)}`, f1(r.shortfall), pct(r.lambda), pct(r.lambdaBuffered)]),
   ...Object.keys(NET.scenarios).filter(lpOnly).map((k) => [NET.scenarios[k].label, "LP only — see findings_lp.md", "–", "–", "–"])]), "");

L.push("## 2. Hormuz closed, by importer", "", md(
  ["Importer", "Demand", "Hormuz share of 2025 supply", "Outbid", "Rationed", "Last in line", "Days of cover (rationed)", "Days of cover (last in line)", "Unmet now if last (mtpa)"],
  hz.importers.map((i) => [i.name, f1(i.demand), pct(exposure[i.id]), pct(i.outbidShare), pct(hz.lambda), pct(i.lastShare), f0(i.coverRationed.days), f0(i.coverLast.days), f1(i.coverLast.unmetNow)])), "",
  "Days of cover = storage inventory ÷ storage draw needed after fuel switching. ∞ = fuel switching alone covers the gap. 'Unmet now' = gap left even with fuel switching and storage at full rate.", "");
const hzCut = solve(NET, { scenario: HZ }).cut.filter((c) => c.meta.type !== "demand");
L.push(`Min cut (Hormuz closed, all importers): ${hzCut.map((c) => `${c.meta.id}${c.closed ? " (closed)" : ""} — ${c.label}, ${f1(c.capacity)}`).join("; ")}.`, "");

L.push("### Market allocation (illustrative priority order)", "",
  `Order served: ${PRIORITY.map(name).join(" → ")}. Assumption based on ability to pay; not a model result.`, "",
  md(["Importer", "Share of demand", "Days of cover", "Unmet now (mtpa)"], prioRows.map((r) => [name(r.id), pct(r.share), f0(r.cover.days), f1(r.cover.unmetNow)])), "");
L.push("### λ with buffers by closure length", "", md(["Closure length (days)", "λ with fuel switching + storage"], horizons.map((x) => [x.h > 1e6 ? "indefinite (fuel switching only)" : x.h, pct(x.lamB)])), "",
  "Storage counts at inventory ÷ closure length, so longer closures leave fuel switching as the only lasting buffer.",
  `Without China's fuel switching and storage, λ with buffers (90 days) is ${pct(lamBnoCN)}: China's buffers free LNG cargoes for everyone else in the pooled model.`, "");

L.push("## 3. N−1: close each chokepoint alone", "", md(["Closed", "Shortfall (mtpa)", "λ", "Worst hit if last in line"],
  n1.map((r) => [r.name, f1(r.shortfall), pct(r.lambda), `${name(r.worstLastImporter)} (${pct(r.worstLastShare)})`])), "");

L.push("## 4. Best single investment (Hormuz closed)", "", "Ranked by gain in physical λ (equal-rationing share without buffers), then buffered λ, then shortest days of cover under rationing.", "",
  md(["Rank", "Investment", "Δλ physical", "Δλ per mtpa added", "Δλ buffered (90 d)", "Δ shortest days (rationed)", "Δ days for the investing country (rationed / last in line)"],
    inv.map((r, i) => { const td = targetDays(r.id); const fd = (x: number) => Number.isNaN(x) ? "–" : Number.isFinite(x) ? `+${x.toFixed(0)}` : "∞";
      return [i + 1, r.label, `${(100 * r.dLambda).toFixed(1)} pts`, invSize[r.id] > 0 ? `${(100 * r.dLambda / invSize[r.id]).toFixed(2)} pts` : "–", `${(100 * r.dLambdaBuffered).toFixed(1)} pts`, Number.isFinite(r.dMinDays) ? r.dMinDays.toFixed(0) : "∞", td.t ? `${td.t}: ${fd(td.rat)} / ${fd(td.last)}` : "–"]; })), "",
  "Effect on each importer's last-in-line share (who an investment protects):", "",
  md(["Investment", ...NET.importers.map((i) => i.id)], invLast.map((r) => [r.label, ...r.rows.map((x) => pct(x.lastShare))])), "",
  "Investments differ in size and cost; this ranks physical effect per project as specified, not per dollar.", "");

L.push("## 5. Hypotheses (Hormuz closed)", "");
L.push(`**H1. South Asian importers are hit hardest and lose a bidding war.** Hormuz share of 2025 supply: ${["PAK", "BGD", "IND"].map((k) => `${name(k)} ${pct(exposure[k])}`).join(", ")}; vs ${["JPN", "KOR", "TWN", "CHN", "THA"].map((k) => `${name(k)} ${pct(exposure[k])}`).join(", ")}. Last-in-line shares, worst first: ${sortedLast.map((i) => `${i.name} ${pct(i.lastShare)}`).join(", ")}. Outbid shares: ${hz.importers.map((i) => `${i.id} ${pct(i.outbidShare)}`).join(", ")}.`, "");
L.push(`**H2. China's pipelines buffer it.** Pipelines cover ${pct(pipeShare.CHN)} of China's import demand. China last in line: ${pct(hz.importers.find((i) => i.id === "CHN")!.lastShare)}; Japan ${pct(hz.importers.find((i) => i.id === "JPN")!.lastShare)}, Korea ${pct(hz.importers.find((i) => i.id === "KOR")!.lastShare)}, Taiwan ${pct(hz.importers.find((i) => i.id === "TWN")!.lastShare)}.`, "");
L.push(`**H3. Taiwan's storage makes it the most fragile.** Days of cover under rationing: ${[...hz.importers].sort((a, b) => a.coverRationed.days - b.coverRationed.days).map((i) => `${i.name} ${f0(i.coverRationed.days)}`).join(", ")}. If last in line: ${[...hz.importers].sort((a, b) => a.coverLast.days - b.coverLast.days).map((i) => `${i.name} ${f0(i.coverLast.days)}`).join(", ")}.`, "");

L.push("## 6. Robustness", "",
  `One-at-a-time: each of the ${ests.length} estimated values that affect max-flow scaled ×0.75 and ×1.25 (${rob.length} runs), plus a diversion sweep (0-50%) and two joint stress cases. Hormuz closed throughout.`, "");
const r1 = range((m) => m.lambda), r2 = range((m) => m.lambdaBuf);
L.push(md(["Metric", "Central", "Low (driver)", "High (driver)"], [
  ["λ physical", pct(m0.lambda), `${pct(r1.lo.v)} (${r1.lo.p})`, `${pct(r1.hi.v)} (${r1.hi.p})`],
  ["λ buffered (90-day closure)", pct(m0.lambdaBuf), `${pct(r2.lo.v)} (${r2.lo.p})`, `${pct(r2.hi.v)} (${r2.hi.p})`],
  (() => { const r = range((m) => m.lambdaFS); return ["λ with fuel switching only (indefinite closure)", pct(m0.lambdaFS), `${pct(r.lo.v)} (${r.lo.p})`, `${pct(r.hi.v)} (${r.hi.p})`]; })(),
  ...NET.importers.map((im) => { const r = range((m) => m.last[im.id]); return [`${im.id} last-in-line share`, pct(m0.last[im.id]), `${pct(r.lo.v)} (${r.lo.p})`, `${pct(r.hi.v)} (${r.hi.p})`]; }),
  ...NET.importers.map((im) => { const r = range((m) => m.daysRat[im.id]); return [`${im.id} days (rationed)`, f0(m0.daysRat[im.id]), `${f0(r.lo.v)} (${r.lo.p})`, `${f0(r.hi.v)} (${r.hi.p})`]; }),
]), "");
const allRuns = [...rob.map((r) => r.m), ...divSweep.map((s) => s.m)];
const shutCount = Object.fromEntries(NET.importers.map((im) => [im.id, allRuns.filter((m) => m.shutOut.includes(im.id)).length]));
L.push(`Fully shut out if last in line (<1% of demand), number of runs out of ${allRuns.length}: ${NET.importers.map((im) => `${im.id} ${shutCount[im.id]}`).join(", ")}.`, `Shortest cover (rationed) across runs: ${flips((m) => m.shortestRat)}.`, `Top investment across runs: ${flips((m) => m.topInv)}.`, "");
L.push("Diversion sweep:", "", md(["Diversion", "λ", "λ fuel-switch only", "Shut out if last in line", "Shortest cover (rationed)", "Top investment"],
  divSweep.map((s) => [pct(s.d), pct(s.m.lambda), pct(s.m.lambdaFS), s.m.shutOut.join(", ") || "none", `${name(s.m.shortestRat)} ${f0(s.m.daysRat[s.m.shortestRat])}`, s.m.topInv])), "");
L.push("Joint stress:", "", md(["Case", "λ", "λ fuel-switch only", "Shut out if last in line", "Shortest cover (rationed)", "Top investment"],
  [["All estimates 25% worse", jointWorse], ["Central", m0], ["All estimates 25% better", jointBetter]].map(([l, m]: any) =>
    [l, pct(m.lambda), pct(m.lambdaFS), m.shutOut.join(", ") || "none", `${name(m.shortestRat)} ${f0(m.daysRat[m.shortestRat])}`, m.topInv])), "");

L.push("## Files", "", "- `scenarios_system.csv`, `scenarios_importers.csv`: every scenario, every importer, all three allocation views",
  "- `n_minus_1.csv`: chokepoint closures one at a time", "- `investments_hormuz.csv`: investment ranking", "- `robustness.csv`: every perturbation run", "");
writeFileSync(join(OUT, "findings.md"), L.join("\n"));
console.log(`wrote results/findings.md and 5 CSVs (${rob.length + divSweep.length + 2} robustness runs)`);
