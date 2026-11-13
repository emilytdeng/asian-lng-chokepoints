import "./style.css";
import { coverChart, shareChart } from "./charts";
import { NET, evaluate, fmt, pct, type State } from "./compute";
import { ChartMap } from "./map";
import { renderMethod, renderReality } from "./sources";
import { mountSandbox } from "./sandbox";

// ---------------------------------------------------------------- theme
const root = document.documentElement;
const themeBtn = document.getElementById("theme")!;
try { const t = localStorage.getItem("theme"); if (t) root.dataset.theme = t; } catch { /* storage unavailable */ }
themeBtn.addEventListener("click", () => {
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = dark ? "light" : "dark";
  try { localStorage.setItem("theme", root.dataset.theme); } catch { /* ignore */ }
});

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
hookMap.update(B, base);

// ---------------------------------------------------------------- story
const steps: { title: string; html: string; state: State; chart?: "share" | "cover"; hl?: string[] }[] = [
  {
    title: "Only one chokepoint really matters",
    state: hz,
    html: `<p>Closing the Strait of Hormuz cuts Asia off from <b>${fmt(Z.hormuzLost, 0)} mtpa</b> of Qatari and Emirati LNG. Other exporters can make up about half by bidding cargoes away from Europe. That leaves a gap of <b>${fmt(gap, 0)} mtpa</b>, or <b>${pct(gap / Z.demand)}</b> of what these economies import.</p>
      <p>Close any <em>other</em> single strait (Malacca, the Red Sea, Panama, Lombok or the Cape) and no gas is physically lost. Each has a way around, so the cost is longer voyages and higher prices, not missing gas.</p>
      <p class="robust">Robustness: the gap stays between 9% and 14% of demand when any estimated input moves ±25%. The main driver is how many European cargoes Asia can bid away.</p>`,
  },
  {
    title: "Who goes without depends on who pays",
    state: hz, chart: "share", hl: ["PAK", "BGD", "IND"],
    html: `<p>If every importer took an equal cut, each would still get <b>${pct(Z.lambda)}</b> of its demand. Markets don't ration equally. Buyers who can pay most are served first.</p>
      <p>Served in that order, the ${fmt(gap, 0)} mtpa gap is almost exactly South Asia's entire import demand (${fmt(southAsia, 0)} mtpa). <b>Pakistan gets ${pct(row("PAK").share.priority)}, Bangladesh ${pct(row("BGD").share.priority)}, India ${pct(row("IND").share.priority)}.</b> Their tanks run dry in ${Math.round(row("BGD").cover.priority.days)} to ${Math.round(row("IND").cover.priority.days)} days.</p>
      <p>The physics doesn't doom South Asia. Its position in the bidding queue does: Hormuz carried ${pct(row("PAK").exposure)} of Pakistan's and ${pct(row("IND").exposure)} of India's 2025 supply, and any importer smaller than the gap can be priced out entirely.</p>`,
  },
  {
    title: "Taiwan is the fragile rich buyer; China has a cushion",
    state: hz, chart: "cover", hl: ["TWN", "CHN"],
    html: `<p>Wealthy buyers win the bidding, but they still have to hold out until cargoes arrive. Under equal rationing <b>Taiwan's storage lasts ${Math.round(row("TWN").cover.rationed.days)} days</b>, the shortest of any importer in 62 of 63 sensitivity runs. If it lost the bidding war, its 0.7 Mt of tanks would last <b>${Math.round(row("TWN").cover.last.days)} days</b>, against ${Math.round(row("KOR").cover.last.days)} for Korea and ${Math.round(row("JPN").cover.last.days)} for Japan.</p>
      <p><b>China</b> is the opposite case. Pipelines from Russia, Central Asia and Myanmar cover ${pct(cnPipe)} of its import needs, a supply no LNG buyer can bid away. Even served last, China keeps <b>${pct(row("CHN").share.last)}</b> of its demand, and it is never shut out in any sensitivity run.</p>`,
  },
];
const stepsHost = document.getElementById("steps")!;
steps.forEach((s, i) => {
  const d = document.createElement("article");
  d.className = "step";
  d.dataset.i = String(i);
  d.innerHTML = `<p class="step-n">${i + 1} / ${steps.length}</p><h3>${s.title}</h3>${s.html}`;
  stepsHost.appendChild(d);
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
    <div class="card"><p class="big">Any new gas<br />outside the Gulf</p><p>Only new supply that doesn't pass Hormuz raises every importer's share. In a pooled market each extra tonne counts the same wherever it is produced. A Power of Siberia expansion and new US LNG lift the shared supply by the same 0.3 points per mtpa.</p></div>
    <div class="card"><p class="big">Not more terminals<br />in South Asia</p><p>A third FSRU for Pakistan or a new Bangladeshi terminal changes nothing in a Hormuz closure. Their problem is getting cargoes, not landing them.</p></div>
    <div class="card"><p class="big">Storage buys time,<br />for its owner only</p><p>Doubling Taiwan's LNG storage adds about 150 days of cover under equal rationing, but only 11 if Taiwan is outbid. Storage is insurance for the country that builds it, not for the region.</p></div>
  </div>
  <p class="note">The single largest gain comes from building Power of Siberia 2 (50 bcm), because it is the largest project. Ranking projects fairly needs costs, which the next version adds through the model's shadow prices.</p>`;

// ---------------------------------------------------------------- sandbox, reality, method
mountSandbox();
renderReality(document.getElementById("reality")!, Z);
renderMethod(document.getElementById("method")!);
document.getElementById("foot")!.innerHTML = `Final project, The Geoeconomics of Asian Energy Security, Schwarzman College, Tsinghua University, 2026. Model, data and code: every number is sourced in <code>data/network.json</code>.`;
