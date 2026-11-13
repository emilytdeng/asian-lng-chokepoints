import "./style.css";
import wasmUrl from "highs/runtime?url";
import { configureHighs } from "../model/lp";
import { coverChart, shareChart } from "./charts";
import { MTPA_NOTE, NET, evaluate, fmt, pct, type State } from "./compute";
import { ChartMap } from "./map";
import { renderMethod, renderReality } from "./sources";
import { mountSandbox } from "./sandbox";
import { mountSimple } from "./simple";

configureHighs({ locateFile: () => wasmUrl });

// ---------------------------------------------------------------- theme
const root = document.documentElement;
const themeBtn = document.getElementById("theme")!;
try { const t = localStorage.getItem("theme"); if (t) root.dataset.theme = t; } catch { /* storage unavailable */ }
themeBtn.addEventListener("click", () => {
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = dark ? "light" : "dark";
  try { localStorage.setItem("theme", root.dataset.theme); } catch { /* ignore */ }
});

// ---------------------------------------------------------------- tabs (#simple, #full; Simple when no hash)
const TABS = ["simple", "full"] as const;
type Tab = (typeof TABS)[number];
const mounted = new Set<Tab>();
const tabBtn = (t: Tab) => document.getElementById(`tab-${t}`) as HTMLButtonElement;
function activate(t: Tab, focus = false) {
  for (const x of TABS) {
    const on = x === t;
    tabBtn(x).setAttribute("aria-selected", String(on));
    tabBtn(x).tabIndex = on ? 0 : -1;
    document.getElementById(`panel-${x}`)!.hidden = !on;
  }
  if (!mounted.has(t)) {
    mounted.add(t);
    if (t === "simple") mountSimple(document.getElementById("panel-simple")!);
    else mountFull();
  }
  if (focus) tabBtn(t).focus();
}
const fromHash = (): Tab => (location.hash === "#full" ? "full" : "simple");
for (const t of TABS) tabBtn(t).addEventListener("click", () => { if (location.hash !== `#${t}`) location.hash = t; else activate(t); });
document.getElementById("tablist")!.addEventListener("keydown", (e) => {
  const i = TABS.indexOf(fromHash());
  let j = -1;
  if (e.key === "ArrowRight") j = (i + 1) % TABS.length;
  else if (e.key === "ArrowLeft") j = (i + TABS.length - 1) % TABS.length;
  else if (e.key === "Home") j = 0;
  else if (e.key === "End") j = TABS.length - 1;
  if (j < 0) return;
  e.preventDefault();
  location.hash = TABS[j];
  tabBtn(TABS[j]).focus();
});
addEventListener("hashchange", () => { activate(fromHash()); scrollTo(0, 0); });

function mountFull() {
// ---------------------------------------------------------------- central results
const D = NET.meta.diversion.value;
const base: State = { closed: new Set(), diversion: D, focus: null };
const hz: State = { closed: new Set(["HORMUZ"]), diversion: D, focus: null };
const B = evaluate(base), Z = evaluate(hz);
const row = (id: string) => Z.rows.find((r) => r.id === id)!;
const gap = Z.demand - Z.supply;
const southAsia = ["IND", "PAK", "BGD"].reduce((a, k) => a + row(k).demand, 0);
const cnPipe = NET.pipelines.filter((p) => p.to === "CHN").reduce((a, p) => a + p.capacity.value, 0) / row("CHN").demand;
const hzShare = (B.rows.reduce((a, r) => a + r.exposure * r.demand, 0)) / B.demand;

// ---------------------------------------------------------------- hook
document.getElementById("lede")!.innerHTML =
  `In 2025 about <b>${pct(hzShare)}</b> of the gas these eight Asian economies imported came through one strait. ` +
  `Shut it, and roughly <b>${fmt(Z.hormuzLost, 0)} million tonnes a year</b> of LNG is stranded in the Gulf. ` +
  `This briefing models Asia's LNG supply as a network of pipes and sea lanes to ask three questions: how much gas can each importer still physically get, how long can it hold out, and what single investment would help most?`;
const hookMap = new ChartMap(document.getElementById("hook-map")!, { interactive: false });
// Draw 2025 as it was: with no diversion, every exporter ships exactly its 2025 Asian deliveries.
const as2025: State = { ...base, diversion: 0 };
hookMap.update(evaluate(as2025), as2025);

// ---------------------------------------------------------------- story
const steps: { title: string; html: string; state: State; chart?: "share" | "cover"; hl?: string[] }[] = [
  {
    title: "Only one chokepoint really matters",
    state: hz,
    html: `<p>Closing the Strait of Hormuz cuts Asia off from <b>${fmt(Z.hormuzLost, 0)} mtpa</b> of Qatari and Emirati LNG. Other exporters can make up about half by bidding cargoes away from Europe. That leaves a gap of <b>${fmt(gap, 0)} mtpa</b>, or <b>${pct(gap / Z.demand)}</b> of what these economies import.</p>
      <p class="robust">${MTPA_NOTE}.</p>
      <p>Close any <em>other</em> single strait (Malacca, the Red Sea, Panama, Lombok or the Cape) and no gas is physically lost. Each has a way around, so the cost is longer voyages and higher prices, not missing gas.</p>
      <p class="robust">How sure is this? The gap stays between 9% and 14% of demand when any estimated input is moved up or down by a quarter. The input that matters most is how many of Europe's cargoes Asia can outbid it for.</p>`,
  },
  {
    title: "Who goes without depends on who pays, and who doesn't have to",
    state: hz, chart: "share", hl: ["PAK", "CHN"],
    html: `<p>If every importer took an equal cut, each would still get <b>${pct(Z.lambda)}</b> of its demand. Markets don't ration equally. Two market cases bracket what happens.</p>
      <p><b>Highest bidder first</b>, the prediction made before the 2026 evidence: the ${fmt(gap, 0)} mtpa gap is almost exactly South Asia's whole import demand (${fmt(southAsia, 0)} mtpa). Pakistan gets ${pct(row("PAK").share.priority)}, Bangladesh ${pct(row("BGD").share.priority)}, India ${pct(row("IND").share.priority)}.</p>
      <p><b>As in 2026</b>: China, with pipelines, storage and coal to fall back on, stepped back and resold cargoes, while India and Thailand bought more. Served that way, China keeps ${pct(row("CHN").share.market2026)} and everyone else is whole except Pakistan, at ${pct(row("PAK").share.market2026)}.</p>
      <p>The gap lands on buyers who can't pay and buyers who don't have to. Pakistan is shut out in both cases: Hormuz carried ${pct(row("PAK").exposure)} of its 2025 LNG, and any importer smaller than the gap can be priced out entirely.</p>`,
  },
  {
    title: "Taiwan is the fragile rich buyer; China has a cushion",
    state: hz, chart: "cover", hl: ["TWN", "CHN"],
    html: `<p>Wealthy buyers win the bidding, but they still have to hold out until cargoes arrive. If everyone shared equally, <b>Taiwan's storage would last ${Math.round(row("TWN").cover.rationed.days)} days</b>, the shortest of any importer in 62 of 63 runs with different input assumptions. If it lost the bidding war, its 0.7 Mt of tanks would last <b>${Math.round(row("TWN").cover.last.days)} days</b>, against ${Math.round(row("KOR").cover.last.days)} for Korea and ${Math.round(row("JPN").cover.last.days)} for Japan.</p>
      <p><b>China</b> is the opposite case. Pipelines from Russia, Central Asia and Myanmar cover ${pct(cnPipe)} of its import needs, a supply no LNG buyer can bid away. Even served last, China keeps <b>${pct(row("CHN").share.last)}</b> of its demand, and it is never shut out under any of the input assumptions we tested.</p>`,
  },
];
const stepsHost = document.getElementById("steps")!;
steps.forEach((s, i) => {
  const d = document.createElement("article");
  d.className = "step";
  d.dataset.i = String(i);
  d.innerHTML = `<p class="step-n">${i + 1} / ${steps.length}</p><h3>${s.title}</h3><div class="step-inline"></div>${s.html}`;
  stepsHost.appendChild(d);
  // Narrow screens: each step carries its own graphic (CSS hides the sticky one).
  const inline = d.querySelector<HTMLElement>(".step-inline")!;
  const ev = s.state === hz ? Z : evaluate(s.state);
  if (s.chart === "share") shareChart(inline, ev, s.hl);
  else if (s.chart === "cover") coverChart(inline, ev, s.hl);
  else new ChartMap(inline, { interactive: false }).update(ev, s.state, s.hl);
});
const storyMap = new ChartMap(document.getElementById("story-map")!, { interactive: false });
const storyChart = document.getElementById("story-chart")!;
let current = -1;
function show(i: number) {
  if (i === current) return;
  current = i;
  const s = steps[i];
  const ev = s.state === hz ? Z : evaluate(s.state);
  storyMap.update(ev, s.state, s.hl);
  storyChart.classList.toggle("on", !!s.chart);
  storyChart.parentElement!.classList.toggle("has-chart", !!s.chart);
  if (s.chart === "share") shareChart(storyChart, ev, s.hl);
  else if (s.chart === "cover") coverChart(storyChart, ev, s.hl);
  else storyChart.innerHTML = "";
  stepsHost.querySelectorAll(".step").forEach((el, k) => el.classList.toggle("active", k === i));
}
show(0);
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) show(Number((e.target as HTMLElement).dataset.i));
}, { rootMargin: "-45% 0px -45% 0px" });
stepsHost.querySelectorAll(".step").forEach((el) => io.observe(el));

// ---------------------------------------------------------------- takeaway (investment results)
document.getElementById("takeaway")!.innerHTML = `
  <h2>So what would help most?</h2>
  <div class="cards">
    <div class="card"><p class="big">Any new gas<br />outside the Gulf</p><p>Only new supply that doesn't pass Hormuz raises every importer's share. Because gas can go to any buyer, each extra tonne counts the same wherever it is produced. A bigger Power of Siberia pipeline and new US LNG each lift the equal share by the same 0.3 percentage points per extra million tonnes a year.</p></div>
    <div class="card"><p class="big">Not more terminals<br />in South Asia</p><p>A third floating import terminal for Pakistan or a new Bangladeshi terminal changes nothing in a Hormuz closure. Their problem is getting cargoes, not unloading them.</p></div>
    <div class="card"><p class="big">Storage buys time,<br />for its owner only</p><p>Doubling Taiwan's LNG storage adds about 150 days before its tanks run dry if everyone shares equally, but only 11 if Taiwan is outbid. Storage is insurance for the country that builds it, not for the region.</p></div>
  </div>
  <p class="note">The optimization solver confirms this with "what one more unit is worth" figures (economists call them shadow prices). With Hormuz closed, one more million tonnes a year from any non-Gulf exporter, any pipeline, or a partly reopened Hormuz raises the equal share by the same 0.32 percentage points; bigger import terminals and storage are worth nothing. So the biggest single gain comes from the biggest project (Power of Siberia 2, 50 billion cubic metres a year, +12 points). Choosing between projects is a question of cost and build time, not of geography.</p>`;

// ---------------------------------------------------------------- sandbox, reality, method
mountSandbox();
renderReality(document.getElementById("reality")!);
renderMethod(document.getElementById("method")!);
}

activate(fromHash());
document.getElementById("foot")!.innerHTML = `Final project, The Geoeconomics of Asian Energy Security, Schwarzman College, Tsinghua University, 2026. Model, data and code: every number is sourced in <code>data/network.json</code>.`;
