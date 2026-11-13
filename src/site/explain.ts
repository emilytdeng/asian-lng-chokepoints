/** Plain-language explanations shared by both tabs: the "what's holding supply back" sentence and two explainer cards. */
import type { CutEdge } from "../model/mincut";
import { NET, name, type Evaluation } from "./compute";

const isRoute = (c: CutEdge) => c.meta.type === "route" || c.meta.type === "link";
const isSupply = (c: CutEdge) => c.meta.type === "supply" || c.meta.type === "divert" || c.meta.type === "pipeline";
const routeName = (c: CutEdge) => (c.meta.type === "link" ? `the ${name(c.meta.from)}–${name(c.meta.to)} lane` : name(c.meta.id));
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** One plain sentence about what limits supply, plus the cut items in plain words. */
export function holdingBack(ev: Evaluation): { sentence: string; items: string[] } {
  const gap = ev.demand - ev.supply;
  const cut = ev.map.cut.filter((c) => c.meta.type !== "demand");
  const closedRoutes = [...new Set(cut.filter((c) => isRoute(c) && (c.closed || c.capacity < 1e-9)).map(routeName))];
  const fullRoutes = [...new Set(cut.filter((c) => isRoute(c) && !c.closed && c.capacity > 1e-9).map(routeName))];
  const supplies = cut.filter(isSupply);
  const items: string[] = [];
  const seen = new Set<string>();
  for (const c of [...cut].sort((a, b) => Number(b.closed) - Number(a.closed))) {
    const m = c.meta;
    let t: string;
    if (m.type === "supply" || m.type === "divert") t = `${name(m.id)}: selling all it can`;
    else if (m.type === "pipeline") t = `${name(m.id)}: pipeline full`;
    else if (isRoute(c)) t = `${routeName(c)}: ${c.closed || c.capacity < 1e-9 ? "closed" : "full"}`;
    else if (m.type === "regas") t = `${name(m.id)}: import terminals are full`;
    else if (m.type === "storage" || m.type === "fuelswitch") t = `${name(m.id)}: backup supplies at their limit`;
    else continue;
    if (!seen.has(t)) { seen.add(t); items.push(t.charAt(0).toUpperCase() + t.slice(1)); }
  }
  let sentence: string;
  if (gap < 0.05) sentence = "Nothing is short: ships simply take another route.";
  else if (fullRoutes.length) sentence = `The bottleneck is a sea lane: ${list(fullRoutes)} ${fullRoutes.length > 1 ? "are" : "is"} full. Gas exists, but it can't get through.`;
  else if (closedRoutes.length && !supplies.length) sentence = `Closing ${list(closedRoutes)} cuts off gas that has no other way out.`;
  else sentence = "Every exporter that can still reach Asia is already selling all it can. Reopening other sea lanes wouldn't help; only more gas would.";
  return { sentence, items };
}

/** Taps-and-tank diagram: max flow 3 + 4 = 7, min cut = Pipe A + Exporter B. Colors come from theme tokens. */
const DIAGRAM = `
<svg class="xd" viewBox="0 0 320 196" role="img" aria-labelledby="xd-t">
  <title id="xd-t">Two exporters feed one importer through two pipes. Max flow is 3 plus 4, which is 7. The min cut is Pipe A, full at 3, plus Exporter B, which sells all 4.</title>
  <g class="xd-node"><rect x="8" y="18" width="92" height="44" rx="4"/><text x="54" y="37">Exporter A</text><text x="54" y="53" class="xd-sub">can supply 5</text></g>
  <g class="xd-node xd-cut"><rect x="8" y="112" width="92" height="44" rx="4"/><text x="54" y="131">Exporter B</text><text x="54" y="147" class="xd-sub">can supply 4</text></g>
  <path class="xd-pipe xd-cutline" d="M100,40 C150,40 160,82 212,82"/>
  <text x="156" y="40" class="xd-lab xd-cuttext">Pipe A: 3 (full)</text>
  <path class="xd-pipe" d="M100,134 C150,134 160,102 212,102"/>
  <text x="156" y="150" class="xd-lab">Pipe B: 6 (carries 4)</text>
  <g class="xd-node"><rect x="212" y="62" width="100" height="60" rx="4"/><text x="262" y="84">Importer</text><text x="262" y="100" class="xd-sub">needs 10</text><text x="262" y="114" class="xd-sub">gets 7</text></g>
  <text x="160" y="186" class="xd-result">Max flow = 3 + 4 = 7</text>
</svg>
<p class="xd-caption"><b>Max flow = 3 + 4 = 7.</b> The min cut is <span class="xd-mark">Pipe A</span> (full at 3) plus <span class="xd-mark">Exporter B</span> (all 4 sold).</p>`;

export function maxflowCard(open: boolean): HTMLElement {
  const d = document.createElement("details");
  d.className = "explainer";
  d.open = open;
  d.innerHTML = `<summary><span class="xk">Explainer</span>How the math works: max-flow and min-cut</summary>
    <div class="xbody">
      <p>Think of the LNG trade as plumbing. Exporters are taps, sea lanes are pipes, and each importing country is a tank that needs filling. Every tap and every pipe has a limit on how much gas it can handle in a year.</p>
      ${DIAGRAM}
      <p><b>Max-flow.</b> The computer pushes as much gas as it can from the taps to the tanks. Whenever a pipe is full or closed, it reroutes through another one, and it keeps going until nothing more can get through. That total is the most gas Asia can physically receive.</p>
      <p><b>Min-cut.</b> When the flow stops growing, something is full. The min cut is the set of full or closed pipes and taps that blocks any more gas: the narrowest point in the system. A classic theorem guarantees that the capacity of the min cut always equals the max flow exactly. So the cut tells you precisely what is holding supply back.</p>
      <p><b>Why it matters for policy.</b> Widening anything that isn't in the cut changes nothing. In the example, a bigger Pipe B is useless; only a bigger Pipe A or more gas from Exporter B helps. On this site, when Hormuz closes, the cut isn't another strait. It's every other exporter, already selling all it can. Asia doesn't have a shipping-route problem. It has a not-enough-gas problem.</p>
    </div>`;
  return d;
}

export function sharingCard(open: boolean, simple: boolean): HTMLElement {
  const d = document.createElement("details");
  d.className = "explainer";
  d.open = open;
  const bullets = simple
    ? `<li><b>Highest bidder first:</b> Japan, Korea and Taiwan buy first; Bangladesh and Pakistan buy last. This was our prediction before looking at 2026.</li>
       <li><b>Everyone shares equally:</b> every country gets the same percentage of what it needs. This is a fairness benchmark, not how markets behave.</li>`
    : `<li><b>Highest bidder first:</b> Japan, Korea and Taiwan buy first; Bangladesh and Pakistan buy last. This was our prediction before looking at 2026.</li>
       <li><b>As in 2026:</b> what actually happened. China stepped back because it could lean on pipelines, storage and coal, and it resold cargoes to others. Pakistan was priced out.</li>
       <li><b>Everyone shares equally:</b> every country gets the same percentage of what it needs. This is a fairness benchmark, not how markets behave.</li>
       <li><b>Best case and worst case:</b> what one country gets if it wins every bidding war, or loses every one.</li>`;
  d.innerHTML = `<summary><span class="xk">Explainer</span>Who gets the gas: how bidding works</summary>
    <div class="xbody">
      <p>Max-flow tells us how much gas can arrive in total, not who gets it. When there isn't enough, countries compete for cargoes. Most LNG that isn't locked into contracts goes to whoever pays the most, so richer buyers usually win.</p>
      <p>${simple ? "This tab shows two ways the shortage could be shared:" : "The site shows several ways the shortage could be shared:"}</p>
      <ul>${bullets}</ul>
      <p>The total amount of missing gas is the same in every view. The sharing rule only changes who goes without, and in every market-based view the poorest buyers go without first.</p>
    </div>`;
  return d;
}

/** Open by default on desktop, collapsed on phones. */
export const openByDefault = () => !matchMedia("(max-width: 700px)").matches;
export { NET };
