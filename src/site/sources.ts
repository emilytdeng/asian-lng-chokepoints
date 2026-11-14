import type { Datum } from "../model/types";
import { NET, evaluate, fmt, pct } from "./compute";

const IEA_GMR_Q2 = "https://iea.blob.core.windows.net/assets/8a1b93f9-d096-4dcd-b29a-77613f201ecc/GasMarketReport%2CQ2-2026.pdf";
const CGEP = "https://www.energypolicy.columbia.edu/asias-gas-shock-playbook-coal-curtailment-and-competing-for-lng/";

const TITLES: Record<string, string> = {
  "https://www.giignl.org/annual-report/2026": "GIIGNL, Annual Report 2026 (2025 trade matrix, regas and liquefaction capacity)",
  "https://iea.blob.core.windows.net/assets/c8248eba-8689-46d9-ae4b-b858b59c0f1c/StraitofHormuz2026-Factsheet.pdf": "IEA, Strait of Hormuz Factsheet, February 2026",
  [IEA_GMR_Q2]: "IEA, Gas Market Report Q2-2026",
  "https://www.energyinst.org/statistical-review/resources-and-data-downloads": "Energy Institute, Statistical Review of World Energy 2026 (data workbook)",
  "https://www.kpler.com/blog/china-gas-supply-strength-caps-lng-demand-growth": "Kpler, China gas supply strength caps LNG demand growth (Jan 2026)",
  [CGEP]: "Columbia CGEP, Asia's Gas Shock Playbook (Corbeau, Apr 2026)",
  "https://www.bairdmaritime.com/shipping/tankers/gas/japans-lng-inventories-grow-no-emergency-supply-requests-reported": "Reuters via Baird Maritime, Japan's LNG inventories (METI, Mar 2026)",
  "https://www.eppo.go.th/wp-content/uploads/2026/04/T03_01_01.xls": "Thailand EPPO, Table 3.1-1 Production and Import of Natural Gas",
  "https://datamarnews.com/noticias/panama-canal-at-top-capacity-as-iran-war-triggers-more-lng-vessel-traffic-chief-says/": "DataMar News, Panama Canal at top capacity (Mar 2026)",
  "https://www.gem.wiki/Central_Asia%E2%80%93China_Gas_Pipeline": "Global Energy Monitor, Central Asia–China Gas Pipeline",
  "https://www.gem.wiki/Power_of_Siberia_Gas_Pipeline": "Global Energy Monitor, Power of Siberia Gas Pipeline",
  "https://www.gem.wiki/Power_of_Siberia_2_Gas_Pipeline": "Global Energy Monitor, Power of Siberia 2 Gas Pipeline",
  "https://www.gem.wiki/Sino-Myanmar_Gas_Pipeline": "Global Energy Monitor, Sino-Myanmar Gas Pipeline",
  "https://www.iea.org/files/42bb838f-d20d-4815-8554-32146033967d/GlobalGasSecurityReview2026.pdf": "IEA, Global Gas Security Review 2026 (incl. Gas Market Report Q4-2026)",
  "https://www.spglobal.com/energy/en/news-research/latest-news/lng/052926-taiwans-cpc-turns-to-spot-market-diversifies-lng-supply-amid-middle-east-conflict": "S&P Global, Taiwan's CPC turns to spot market (May 2026)",
  "https://www.globalsecurity.org/wmd/library/news/iran/2026/05/iran-260512-rferl05.htm": "RFE/RL (Reuters), Second Qatari LNG tanker crosses Hormuz (May 2026)",
  "https://www.gisreportsonline.com/r/gas-markets-hormuz-shock/": "GIS Reports, Global gas markets after the Hormuz shock (Nakhle, Jul 2026)",
  "https://sea-distances.org/": "Sea-distances.org, port-to-port distances (voyage-time basis)",
};

function* datums(x: unknown, path = ""): Generator<[string, Datum]> {
  if (x && typeof x === "object") {
    if ("value" in x && "source_url" in x) { yield [path, x as Datum]; return; }
    if (Array.isArray(x)) for (const it of x) yield* datums(it, `${path}[${(it as any)?.id ?? ""}]`);
    else for (const [k, v] of Object.entries(x)) yield* datums(v, path ? `${path}.${k}` : k);
  }
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const sgn = (x: number) => `${x > 0.5 ? "+" : x < -0.5 ? "−" : "±"}${Math.abs(Math.round(x))}%`;

export async function renderReality(host: HTMLElement) {
  const V = (NET as any).validation_2026 as { id: string; importer: string | null; metric: string; period: string; value: Datum }[];
  const v = (id: string) => V.find((x) => x.id === id)!;
  const link = (d: Datum, t: string) => `<a href="${esc(d.source_url)}">${t}</a>`;
  host.innerHTML = `
    <h3 class="reality-h">Reality check: what actually happened in 2026</h3>
    <p class="sub">The Strait of Hormuz was effectively closed from 28 February 2026. LNG traffic stopped in March and recovered only partly. By September, 27 laden LNG carriers left the Gulf, against about 95 a month in 2025. Iranian strikes also knocked out about ${v("QAT_damage").value.value}% of Qatar's export capacity, possibly for years.</p>
    <div class="cards facts">
      <div class="card"><p class="big">${v("asia").value.value}%</p><p>Asia's LNG imports. Europe's fell 6%. ${link(v("asia").value, "IEA")}</p></div>
    </div>
    <div id="val-table"><p class="note">Solving the 2026 scenario…</p></div>
    <h3>What the model got right</h3>
    <ul class="misses">
      <li><b>The size of Asia's loss, once Hormuz is partly open.</b> At the 37% of normal Gulf supply that got through, if everyone shared equally, every country would get <span id="lam26">…</span> of what it needs. Asia's LNG imports actually fell ${Math.abs(v("asia").value.value)}%.</li>
      <li><b>Pakistan is the most exposed buyer.</b> Its LNG imports fell ${Math.abs(v("PAK").value.value)}% (more than 70% in March–September). Pakistan is shut out whenever richer buyers take the cargoes first, and in its worst case it gets nothing in 62 of 63 runs with different input assumptions.</li>
      <li><b>Selective passage.</b> In May Iran approved ${v("PAK_pass").value.value} Qatari cargoes bound for Pakistan (${link(v("PAK_pass").value, "Reuters via RFE/RL")}). The model's Pakistan-only passage scenario lets Pakistan be fully supplied from Qatar while nobody else gets Gulf gas.</li>
      <li><b>Ships were not the constraint.</b> The model finds closures change the ship-time needed by −5% to +11%, within spare fleet capacity, even with no spare ships assumed and every voyage 25% longer. Supply, not shipping, limited Asia.</li>
    </ul>
    <h3>What the model missed</h3>
    <ul class="misses">
      <li><b>Who stepped back.</b> The richest-buyers-first order put India at 7%. India's imports actually rose ${v("IND").value.value}%, with US, African and Omani cargoes replacing Qatar. China, with pipelines, storage and coal, absorbed the largest cut (${v("CHN").value.value}%) and resold cargoes. Willingness to pay depends on alternatives as much as on income. Re-running the model with a queue reordered to match 2026 (China steps back, Pakistan priced out last) fixes these sign errors; that variant lives in the analysis, not on this page.</li>
      <li><b>New supply.</b> The model is fixed at 2025 capacity. In March–June 2026 new US and other non-Gulf liquefaction lifted non-Gulf output by about 18%.</li>
      <li><b>Demand destruction.</b> The model treats 2025 import needs as fixed. The IEA expects Asian gas demand to fall about 1.5% in 2026; Pakistan's gas-fired power fell more than 25% (March–September) and Bangladesh's 12% (March–August), replaced largely by coal.</li>
      <li><b>Contracts and subsidies.</b> Bangladesh kept buying spot cargoes with government support; its imports fell only ${Math.abs(v("BGD").value.value)}%.</li>
    </ul>
    <p class="note">Sources: ${link(v("asia").value, "IEA Global Gas Security Review 2026 (incl. Gas Market Report Q4-2026)")}; ${link(v("TWN").value, "S&amp;P Global on Taiwan's CPC")}; ${link(v("QAT_damage").value, "GIS Reports on Ras Laffan")}; ${link(v("PAK_pass").value, "RFE/RL (Reuters)")}.</p>`;

  // model side: the "2026 as it happened" scenario, solved with the LP
  try {
    const { evaluateLP, VIEW_LABEL } = await import("./compute");
    const ev = await evaluateLP({ closed: new Set(), diversion: NET.meta.diversion.value, focus: null, hormuz: "share37", fleet: true });
    host.querySelector("#lam26")!.textContent = pct(ev.lambda);
    const ids = ["CHN", "IND", "THA", "BGD", "PAK", "TWN"];
    const rows = ids.map((id) => {
      const r = ev.rows.find((x) => x.id === id)!;
      const o = V.find((x) => x.importer === id)!;
      const obs = o.value.unit === "%" ? `${sgn(o.value.value)} <span class="muted">(${o.period})</span>` : `${o.value.value} ${o.value.unit} <span class="muted">(${o.period})</span>`;
      return `<tr><th scope="row">${r.name}</th><td>${obs}</td><td>${sgn(100 * (r.share.priority - 1))}</td><td>${sgn(100 * (r.share.rationed - 1))}</td></tr>`;
    });
    const notes = ids.map((id) => { const o = V.find((x) => x.importer === id)!; return `<li><b>${NET.importers.find((i) => i.id === id)!.name}.</b> ${esc(o.value.note)}</li>`; }).join("");
    host.querySelector("#val-table")!.innerHTML = `
      <h3>Model vs what happened, by importer</h3>
      <p class="note">All figures are changes from 2025 LNG imports. The model lets 37% of normal Gulf LNG through Hormuz (the 2026 average), with the tanker limit on. (Tanker limit is the model's name for the fleet constraint, since there are only so many LNG tankers in the world.) Observed figures compare the same months of 2025 and 2026 (IEA; Taiwan from S&amp;P Global).</p>
      <div class="tablewrap"><table class="reality-t">
        <thead><tr><th scope="col">Importer</th><th scope="col">Observed</th><th scope="col">${VIEW_LABEL.priority}</th><th scope="col">${VIEW_LABEL.rationed}</th></tr></thead>
        <tbody>${rows.join("")}</tbody></table></div>
      <details><summary>What happened in each country</summary><ul class="misses">${notes}</ul></details>`;
  } catch (e) {
    host.querySelector("#val-table")!.innerHTML = `<p class="note">The LP solver could not run in this browser (${esc(String(e)).slice(0, 80)}).</p>`;
  }
}

export function renderMethod(host: HTMLElement) {
  const lamAt = (diversion: number) => evaluate({ closed: new Set(["HORMUZ"]), diversion, focus: null }).lambda;
  const all = [...datums(NET)];
  const bySource = new Map<string, string[]>();
  for (const [p, d] of all) if (d.source_url !== "estimate") bySource.set(d.source_url, [...(bySource.get(d.source_url) ?? []), p]);
  const ests = all.filter(([, d]) => d.is_estimate);
  host.innerHTML = `
    <h2>Method and sources</h2>
    <div class="cols">
      <div>
        <h3>How the model works</h3>
        <p>Asian LNG supply is modelled as a flow network: pipes and junctions, as in chapter 2. A single start node (the “super-source”) feeds ${NET.exporters.length} exporter nodes. Each can supply its 2025 deliveries to these importers plus ${pct(NET.meta.diversion.value)} of the cargoes it sent elsewhere, mainly to Europe, which Asian buyers could bid away. Cargoes travel through ${NET.routes.filter((r) => r.kind === "chokepoint").length} chokepoint nodes (Hormuz, Suez/Bab el-Mandeb, the Cape, Panama, Malacca, Lombok) to ${NET.importers.length} importers. Each importer is split into an arrival node and a delivery node, joined by a pipe the size of its import terminals (where LNG is turned back into gas). China's and Thailand's pipelines feed delivery nodes directly. Each importer's 2025 import demand flows to a single finish node (the “super-sink”).</p>
        <p><b>Max-flow</b> (Edmonds–Karp) gives the most gas the network can deliver. The <b>min cut</b> (found from what the start can still reach when the algorithm stops, as in chapter 3) names the limits that bind. The site splits that gas two ways: <b>share equally</b> (the computer searches for the largest share every country can get at once) and <b>richest buyers first</b> (max-flow re-run adding one country at a time in order of wealth, each taking whatever extra gas can still reach it). The analysis behind the write-up also computes each country's best case, its worst case, and a queue recalibrated to 2026. <b>Days until storage runs out</b> = storage inventory ÷ the withdrawal still needed after fuel switching. Units are million tonnes per annum of LNG (1 Mt = ${NET.meta.bcm_per_mtpa} bcm).</p>
        <p><b>Optimization solver.</b> The same network is also solved as a linear program (an optimization problem with a goal and limits) using <b>HiGHS</b>, an open-source linear-programming solver, running in your browser via WebAssembly. With no extras it reproduces max-flow exactly; the tests check this. It is used where plain max-flow isn't enough, and adds three things. A <b>fleet constraint</b> ("the tanker limit") caps Σ flow × round-trip voyage days at the ship-time the 2025 trade needed plus ${pct(NET.meta.fleet_slack?.value ?? 0)} spare. <b>Gulf cargoes tagged by origin and destination</b> let a scenario pass only part of the normal flow through Hormuz, as in the 2026 scenario (37%). <b>Shadow prices</b> say how much one more mtpa of capacity anywhere would be worth; they extend the min cut and rank investments.</p>
      </div>
      <div>
        <h3>Key assumptions and limits</h3>
        <ul>
          <li><b>Pooled, fungible gas.</b> Any cargo can serve any importer it can physically reach. No prices, contracts or destination clauses.</li>
          <li><b>Static annual rates</b> from the 2025 baseline; no seasonality or ships already at sea.</li>
          <li><b>Diversion of ${pct(NET.meta.diversion.value)}</b> of non-Asian cargoes is an assumption, varied 0–50% in the robustness checks. It is the most influential input: moving it from none to half moves the equal share in a Hormuz closure from ${pct(lamAt(0))} to ${pct(lamAt(0.5))}. The headline findings hold across that whole range.</li>
          <li><b>Fuel switching</b> capacities are estimates built from announced 2026 measures. Fuel switching is used before storage.</li>
          <li><b>Voyage times</b> are estimated from port-to-port sea distances at about 18 knots. They matter only for the fleet constraint, which never binds in the tested cases.</li>
          <li><b>Two market orders</b> are assumptions: ability to pay (set before the 2026 evidence) and the order seen in 2026 (China steps back, Pakistan last). The second is fitted to the outcome it is compared with.</li>
        </ul>
        <h3>Why a flow network at all?</h3>
        <p>Most chokepoint analysis ranks straits by the volume passing through them; by that measure Malacca looks vital. A flow network asks a different question: which limit still binds once everything else adjusts? By that test, Asia's LNG vulnerability sits in one strait, can be relieved only by more supply, and falls hardest on the buyers least able to pay — things a map of shipping volumes can't show. The price of the approach: max-flow measures what is <i>physically possible</i>, not what will happen.</p>
      </div>
    </div>
    <h3>Where this could go next</h3>
    <ul class="misses">
      <li><b>Prices and shipping costs.</b> Max-flow only asks whether gas can arrive, not what it costs. A minimum-cost flow would pick the cheapest routes (today, when two sea lanes are open, the split between them is arbitrary) and let willingness to pay, not a fixed queue, decide who wins cargoes.</li>
      <li><b>Contracts and destination clauses.</b> Most LNG moves under long-term contracts that name the buyer. Tagging cargoes with contracts would shrink the pool that can actually be bid away.</li>
      <li><b>Port and loading time.</b> The tanker limit counts only sailing days. Adding berth time and canal queues would tighten it, and droughts or congestion could then be modelled directly.</li>
      <li><b>Beyond the 2025 snapshot.</b> New liquefaction arriving in 2026–27, seasonal demand swings and storage refill would turn the one-year picture into a timeline.</li>
    </ul>
    <h3>Sources</h3>
    <ol class="sources">${[...bySource.entries()].sort((a, b) => b[1].length - a[1].length).map(([u, ps]) =>
      `<li><a href="${esc(u)}">${esc(TITLES[u] ?? u)}</a> <span class="muted">· ${ps.length} value${ps.length > 1 ? "s" : ""}</span></li>`).join("")}</ol>
    <details><summary>${ests.length} of ${all.length} values are estimates; the 29 that affect the flow results are each stress-tested at ±25%. Show each with its basis.</summary>
      <div class="tablewrap"><table class="est"><thead><tr><th scope="col">Value</th><th scope="col">Field</th><th scope="col">Basis</th></tr></thead><tbody>
      ${ests.map(([p, d]) => `<tr><td>${fmt(d.value, d.value < 10 ? 2 : 1)} ${esc(d.unit)}</td><td><code>${esc(p)}</code></td><td>${esc(d.note)}</td></tr>`).join("")}
      </tbody></table></div></details>`;
}
