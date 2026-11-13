import type { Datum } from "../model/types";
import { NET, fmt, pct, type Evaluation } from "./compute";

const IEA_GMR = "https://iea.blob.core.windows.net/assets/8a1b93f9-d096-4dcd-b29a-77613f201ecc/GasMarketReport%2CQ2-2026.pdf";
const CGEP = "https://www.energypolicy.columbia.edu/asias-gas-shock-playbook-coal-curtailment-and-competing-for-lng/";

const TITLES: Record<string, string> = {
  "https://www.giignl.org/annual-report/2026": "GIIGNL, Annual Report 2026 (2025 trade matrix, regas and liquefaction capacity)",
  "https://iea.blob.core.windows.net/assets/c8248eba-8689-46d9-ae4b-b858b59c0f1c/StraitofHormuz2026-Factsheet.pdf": "IEA, Strait of Hormuz Factsheet, February 2026",
  [IEA_GMR]: "IEA, Gas Market Report Q2-2026",
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
};

function* datums(x: unknown, path = ""): Generator<[string, Datum]> {
  if (x && typeof x === "object") {
    if ("value" in x && "source_url" in x) { yield [path, x as Datum]; return; }
    if (Array.isArray(x)) for (const it of x) yield* datums(it, `${path}[${(it as any)?.id ?? ""}]`);
    else for (const [k, v] of Object.entries(x)) yield* datums(v, path ? `${path}.${k}` : k);
  }
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export function renderReality(host: HTMLElement, z: Evaluation) {
  const r = (id: string) => z.rows.find((x) => x.id === id)!;
  const rows: [string, string, string, string][] = [
    ["Pakistan", `${pct(r("PAK").share.priority)} of demand (range ${pct(r("PAK").share.last)}–${pct(r("PAK").share.outbid)})`, "LNG imports fell 67% year on year in March; four-day working week, fertiliser cuts.", "Direction right; the model is harsher (0% vs about a third of normal imports in March)."],
    ["Bangladesh", `${pct(r("BGD").share.priority)} (range ${pct(r("BGD").share.last)}–${pct(r("BGD").share.outbid)})`, "LNG imports fell only 10% in March; a $370m subsidy request; five of six fertiliser plants shut.", "Model too harsh: subsidised spot buying kept cargoes coming."],
    ["India", `${pct(r("IND").share.priority)} (range ${pct(r("IND").share.last)}–${pct(r("IND").share.outbid)})`, "Emergency gas order: households in full, fertiliser ~95%, other industry ~80%; deliveries to some sectors cut 10–30%.", "Model too harsh: India bid for spot cargoes and rationed at home."],
    ["China", `${pct(r("CHN").share.priority)} (last in line ${pct(r("CHN").share.last)})`, "LNG imports fell 30% in March, to a multi-year low; 8–10 cargoes resold to other buyers.", "Consistent: China leaned on pipelines, storage and coal and released LNG."],
    ["Japan, Korea", `${pct(r("JPN").share.priority)}, ${pct(r("KOR").share.priority)}`, "Coal-plant limits lifted; Korean nuclear restarts. Only 6% of Japan's LNG came via Hormuz.", "Consistent."],
    ["Asia overall", `gap ${pct((z.demand - z.supply) / z.demand)} of import demand`, "LNG imports down 6% year on year in March, the first month of closure.", "Smaller than modeled so far: cargoes already at sea, and demand fell."],
  ];
  host.innerHTML = `
    <h2>What actually happened in 2026 <span class="tag">Preliminary</span></h2>
    <p class="sub">The Strait of Hormuz was effectively closed from 28 February 2026. Below, the model's Hormuz-closed scenario sits beside the first month of evidence. A full validation using Lloyd's List, S&amp;P Global and Kpler reporting is in progress.</p>
    <div class="tablewrap"><table class="reality-t">
      <thead><tr><th scope="col">Importer</th><th scope="col">Model: market order</th><th scope="col">March 2026</th><th scope="col">Verdict</th></tr></thead>
      <tbody>${rows.map((x) => `<tr><th scope="row">${x[0]}</th><td>${x[1]}</td><td>${x[2]}</td><td>${x[3]}</td></tr>`).join("")}</tbody>
    </table></div>
    <h3>What the model misses</h3>
    <ul class="misses">
      <li><b>Demand destruction.</b> The model treats 2025 imports as fixed needs. In practice India, Pakistan and Bangladesh cut fertiliser and industrial gas use, and high prices cut demand across Asia.</li>
      <li><b>Contracts and subsidies.</b> Gas is pooled and goes to the highest bidder in the market view. Real cargoes follow long-term contracts, and governments subsidised purchases (Bangladesh).</li>
      <li><b>Selective passage.</b> The model treats Hormuz as fully open or fully shut. It cannot yet represent a blockade that lets some exporters' cargoes through; the next version adds origin-tagged flows.</li>
      <li><b>Time.</b> Rates are annual. Cargoes already at sea cushioned the first weeks.</li>
    </ul>
    <p class="note">Sources: <a href="${IEA_GMR}">IEA Gas Market Report Q2-2026</a>; <a href="${CGEP}">Columbia CGEP, April 2026</a>.</p>`;
}

export function renderMethod(host: HTMLElement) {
  const all = [...datums(NET)];
  const bySource = new Map<string, string[]>();
  for (const [p, d] of all) if (d.source_url !== "estimate") bySource.set(d.source_url, [...(bySource.get(d.source_url) ?? []), p]);
  const ests = all.filter(([, d]) => d.is_estimate);
  host.innerHTML = `
    <h2>Method and sources</h2>
    <div class="cols">
      <div>
        <h3>How the model works</h3>
        <p>Asian LNG supply is a flow network. A super-source feeds ${NET.exporters.length} exporter nodes. Each can supply its 2025 deliveries to these importers plus ${pct(NET.meta.diversion.value)} of the cargoes it sent elsewhere, mainly to Europe, which Asian buyers could bid away. Cargoes travel through ${NET.routes.filter((r) => r.kind === "chokepoint").length} chokepoint nodes (Hormuz, Suez/Bab el-Mandeb, the Cape, Panama, Malacca, Lombok) to ${NET.importers.length} importers. Each importer is split into an arrival node and a delivery node joined by its regasification capacity. China's and Thailand's pipelines feed delivery nodes directly. Each importer's 2025 import demand flows to a super-sink.</p>
        <p><b>Max-flow</b> (Edmonds–Karp) gives the most gas the network can deliver. The <b>min cut</b>, read from the residual graph, names the binding constraints. Four allocation views split that gas: equal rationing (binary search for the largest common share λ), served in market order, last in line, and outbids everyone. <b>Days of cover</b> = storage inventory ÷ the withdrawal still needed after fuel switching. Units are million tonnes per annum of LNG (1 Mt = ${NET.meta.bcm_per_mtpa} bcm).</p>
      </div>
      <div>
        <h3>Key assumptions and limits</h3>
        <ul>
          <li><b>Pooled, fungible gas.</b> Any cargo can serve any importer it can physically reach. No prices, contracts or destination clauses.</li>
          <li><b>Static annual rates</b> from the 2025 baseline; no seasonality or ships already at sea.</li>
          <li><b>Diversion of ${pct(NET.meta.diversion.value)}</b> of non-Asian cargoes is an assumption, varied 0–50% in the robustness checks. It is the most influential input.</li>
          <li><b>Market order</b> (Japan, Korea, Taiwan, China, Thailand, India, Bangladesh, Pakistan) is an assumed ranking by ability to pay. It is shown beside its best and worst cases.</li>
          <li><b>Fuel switching</b> capacities are estimates built from announced 2026 measures. Fuel switching is used before storage.</li>
          <li><b>Voyage time is ignored</b>, so rerouting around a closed strait is free. Fleet limits come in the next version.</li>
        </ul>
      </div>
    </div>
    <h3>Sources</h3>
    <ol class="sources">${[...bySource.entries()].sort((a, b) => b[1].length - a[1].length).map(([u, ps]) =>
      `<li><a href="${esc(u)}">${esc(TITLES[u] ?? u)}</a> <span class="muted">· ${ps.length} value${ps.length > 1 ? "s" : ""}</span></li>`).join("")}</ol>
    <details><summary>${ests.length} of ${all.length} values are estimates. Show each with its basis.</summary>
      <div class="tablewrap"><table class="est"><thead><tr><th scope="col">Value</th><th scope="col">Field</th><th scope="col">Basis</th></tr></thead><tbody>
      ${ests.map(([p, d]) => `<tr><td>${fmt(d.value, d.value < 10 ? 2 : 1)} ${esc(d.unit)}</td><td><code>${esc(p)}</code></td><td>${esc(d.note)}</td></tr>`).join("")}
      </tbody></table></div></details>`;
}
