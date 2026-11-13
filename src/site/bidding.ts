/** Chapter 6: who gets the gas. A three-country worked example, then the real results under each sharing rule. */
import { NET, VIEWS, VIEW_LABEL, fmt, pct, type View } from "./compute";
import { S_HZ, ev } from "./story";

const NS = "http://www.w3.org/2000/svg";
const COUNTRIES = [
  { name: "Richland", bid: 20 },
  { name: "Midland", bid: 14 },
  { name: "Poorland", bid: 9 },
];
type Rule = "bid" | "equal";

function workedExample(host: HTMLElement) {
  host.innerHTML = `
    <div class="seg" role="group" aria-label="Sharing rule for the example">
      <button type="button" data-r="bid">Highest bidder wins</button>
      <button type="button" data-r="equal">Everyone shares equally</button>
    </div>
    <svg class="bid-svg" viewBox="0 0 480 230" role="img" aria-label="Two cargoes shared among three countries that each need one"></svg>
    <p class="bid-cap" aria-live="polite"></p>`;
  const svg = host.querySelector("svg")!;
  const el = <K extends keyof SVGElementTagNameMap>(tag: K, a: Record<string, string | number>, p: Element = svg) => {
    const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, String(a[k])); p.appendChild(e); return e;
  };
  // two cargo ships on the left, three tanks on the right
  const ships = [0, 1].map((k) => {
    const g = el("g", { class: "bid-ship" });
    el("path", { d: "M-26,4 L26,4 L19,16 L-19,16 Z" }, g);
    el("rect", { x: -16, y: -8, width: 32, height: 12, rx: 6, class: "bid-cargo" }, g);
    const t = el("text", { y: 32, "text-anchor": "middle", class: "bid-l" }, g); t.textContent = `Cargo ${k + 1}`;
    return g;
  });
  const tanks = COUNTRIES.map((c, k) => {
    const x = 220 + k * 92, g = el("g", { transform: `translate(${x},40)` });
    el("rect", { x: 0, y: 0, width: 56, height: 120, rx: 6, class: "bid-tank" }, g);
    const fill = el("rect", { x: 2, y: 118, width: 52, height: 0, rx: 4, class: "bid-fill" }, g);
    const lab = el("text", { x: 28, y: 140 + 0, "text-anchor": "middle", class: "bid-name" }, g); lab.textContent = c.name;
    const bid = el("text", { x: 28, y: 156, "text-anchor": "middle", class: "bid-l" }, g); bid.textContent = `pays up to $${c.bid}`;
    const got = el("text", { x: 28, y: -10, "text-anchor": "middle", class: "bid-got" }, g);
    return { g, fill, got, x };
  });
  const need = el("text", { x: 340, y: 222, "text-anchor": "middle", class: "bid-l" }); need.textContent = "Each country needs 1 full tank (1 cargo).";
  const cap = host.querySelector<HTMLElement>(".bid-cap")!;
  const set = (r: Rule) => {
    host.querySelectorAll<HTMLButtonElement>("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.r === r)));
    const got = r === "bid" ? [1, 1, 0] : [2 / 3, 2 / 3, 2 / 3];
    tanks.forEach((t, k) => {
      const h = 116 * got[k];
      t.fill.setAttribute("y", String(118 - h));
      t.fill.setAttribute("height", String(h));
      t.fill.classList.toggle("empty", got[k] < 0.01);
      t.got.textContent = got[k] === 1 ? "1 cargo" : got[k] === 0 ? "nothing" : "⅔ cargo";
      t.got.classList.toggle("zero", got[k] < 0.01);
    });
    // ships sail to the winners when the highest bidder wins; stay split when sharing
    ships.forEach((s, k) => s.setAttribute("transform", r === "bid" ? `translate(${tanks[k].x + 28},200)` : `translate(70,${70 + k * 80})`));
    cap.innerHTML = r === "bid"
      ? `Richland and Midland outbid Poorland, so each gets a full cargo. <b>Poorland gets nothing.</b>`
      : `The two cargoes are split three ways: every country gets ⅔ of what it needs.`;
    cap.innerHTML += ` Either way, <b>one cargo is missing</b>. The rule doesn't change the shortage; it changes who bears it.`;
  };
  host.querySelectorAll<HTMLButtonElement>("button").forEach((b) => (b.onclick = () => set(b.dataset.r as Rule)));
  set("bid");
}

export function mountBidding(host: HTMLElement) {
  const Z = ev(S_HZ);
  const gap = Z.demand - Z.supply;
  const row = (id: string) => Z.rows.find((r) => r.id === id)!;
  const southAsia = ["IND", "PAK", "BGD"].reduce((a, k) => a + row(k).demand, 0);
  const HELP: Record<View, string> = {
    priority: `Richer buyers buy first: Japan, Korea, Taiwan, China, Thailand, India, Bangladesh, Pakistan. The ${fmt(gap, 0)} mtpa gap is almost exactly South Asia's whole import demand (${fmt(southAsia, 0)} mtpa). This was our prediction before looking at 2026.`,
    market2026: `What happened in 2026: China, with pipelines, storage and coal to fall back on, stepped back and resold cargoes, while India and Thailand bought more. China keeps ${pct(row("CHN").share.market2026)}; Pakistan is priced out.`,
    rationed: `Every country gets the same share of what it needs: ${pct(Z.lambda)}. A fairness benchmark, not how markets behave.`,
    last: "What each country would get if every other buyer were served first: its worst case.",
    outbid: "What each country would get if it won every cargo it could physically reach: its best case.",
  };
  host.innerHTML = `
    <div class="wrap chap-head"><p class="chap-n">Chapter 6</p><h2 id="h-bid">Who gets the gas?</h2>
      <p class="dek">Max-flow says how much gas can arrive in total. It doesn't say who gets it.</p></div>
    <div class="wrap two-col">
      <div class="prose">
        <p>When there isn't enough, buyers compete. Most LNG that isn't locked into long contracts goes to whoever pays the most, so richer buyers usually win.</p>
        <p>Take a simpler puzzle first. Three countries each need one cargo of LNG, but only two cargoes are for sale. Switch the rule and watch who goes without.</p>
      </div>
      <div class="bid-ex" id="bid-ex"></div>
    </div>
    <div class="wrap real-rules">
      <h3>Now the real thing: Hormuz closed</h3>
      <div class="seg" id="rules" role="group" aria-label="How the shortage is shared"></div>
      <p class="rule-help" id="rule-help"></p>
      <div class="missing-line"><span>Missing under every rule</span><b>${fmt(gap, 0)} mtpa</b></div>
      <div class="bars" id="rule-bars"></div>
      <p class="note">Bars show the share of each country's import needs that is met. Below 50% is highlighted.</p>
      <p class="keypoint">The total shortage is the same under every rule. The rule only decides who goes without, and in a market the poorest buyers lose first. Pakistan, which got ${pct(row("PAK").exposure)} of its LNG through Hormuz in 2025, is shut out in both market cases.</p>
    </div>
    <div class="wrap takeaway" id="takeaway"></div>`;
  workedExample(host.querySelector("#bid-ex")!);
  let view: View = "priority";
  const rules = host.querySelector("#rules")!;
  for (const v of VIEWS) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = VIEW_LABEL[v]; b.dataset.v = v;
    b.onclick = () => { view = v; draw(); };
    rules.appendChild(b);
  }
  const draw = () => {
    rules.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String((b as HTMLElement).dataset.v === view)));
    host.querySelector("#rule-help")!.textContent = HELP[view];
    const rows = [...Z.rows].sort((a, b) => a.share[view] - b.share[view] || a.name.localeCompare(b.name));
    host.querySelector("#rule-bars")!.innerHTML = rows.map((r) => {
      const sh = r.share[view];
      return `<div class="bar-row${sh < 0.5 ? " low" : ""}"><span class="bar-name">${r.name}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${(100 * sh).toFixed(1)}%"></span></span><span class="bar-val">${pct(sh)}</span></div>`;
    }).join("");
  };
  draw();
  host.querySelector("#takeaway")!.innerHTML = `
    <h3>So what would help most?</h3>
    <div class="cards">
      <div class="card"><p class="big">Any new gas<br />outside the Gulf</p><p>Only new supply that doesn't pass Hormuz helps everyone, because the cut runs through the exporters. Since gas can go to any buyer, each extra tonne counts the same wherever it's produced: a bigger Power of Siberia pipeline and new US LNG each raise the equal share by the same 0.3 percentage points per extra mtpa.</p></div>
      <div class="card"><p class="big">Not more terminals<br />in South Asia</p><p>A new import terminal for Pakistan or Bangladesh changes nothing in a Hormuz closure. Their problem is getting cargoes, not unloading them.</p></div>
      <div class="card"><p class="big">Storage buys time,<br />for its owner only</p><p>Doubling Taiwan's LNG storage adds about 150 days before its tanks run dry if everyone shares equally, but only 11 if Taiwan is outbid. Storage is insurance for the country that builds it, not for the region.</p></div>
    </div>`;
}

export { NET };
