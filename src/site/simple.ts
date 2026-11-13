/** The "Simple version" tab: exporters → sea lanes → importers (plus pipelines), solved by max-flow. */
import { MTPA_NOTE, NET, evaluate, fmt, pct, type State, type View } from "./compute";
import { holdingBack, maxflowCard, sharingCard } from "./explain";
import { ChartMap } from "./map";

const PRESETS: { label: string; close: string[] }[] = [
  { label: "Normal year (2025)", close: [] },
  { label: "Close Hormuz", close: ["HORMUZ"] },
  { label: "Close the Red Sea", close: ["BAB_SUEZ"] },
  { label: "Close Malacca", close: ["MALACCA"] },
  { label: "Close Panama", close: ["PANAMA"] },
];
const RULES: { view: View; label: string }[] = [
  { view: "priority", label: "Highest bidder first" },
  { view: "rationed", label: "Everyone shares equally" },
];

export function mountSimple(host: HTMLElement) {
  const state: State = { closed: new Set(["HORMUZ"]), diversion: NET.meta.diversion.value, focus: null, simple: true };
  let view: View = "priority";

  host.innerHTML = `
    <section class="wrap simple-intro">
      <h1 class="simple-h">The simple version: Asia's gas as plumbing</h1>
      <p class="lede">This tab strips the model down to its core: countries that sell gas, the sea lanes it travels through, and the countries that buy it. Click a strait to close it and see what happens. The Full model tab adds storage, backup fuels, ships and more.</p>
    </section>
    <section class="wrap simple-body">
      <div class="seg simple-presets" id="s-presets" role="group" aria-label="Scenarios"></div>
      <div class="simple-map" id="s-map"></div>
      <p class="note">Click a diamond (a strait), a dot (an exporter) or a dotted line (a pipeline) to close or reopen it. Line width shows how much gas flows.</p>
      <div class="bignums" id="s-nums"></div>
      <div class="holding" id="s-holding" aria-live="polite"></div>
      <div class="who">
        <h2>Who goes without</h2>
        <div class="seg" id="s-rules" role="group" aria-label="How the shortage is shared"></div>
        <p class="note">The amount of missing gas is the same either way. The sharing rule only decides who goes without.</p>
        <div class="bars" id="s-bars"></div>
      </div>
      <div class="explainers" id="s-explain"></div>
    </section>`;

  const presetBox = host.querySelector("#s-presets")!;
  const ruleBox = host.querySelector("#s-rules")!;
  const map = new ChartMap(host.querySelector<HTMLElement>("#s-map")!, {
    interactive: true,
    view: () => view,
    onToggle: (id) => { state.closed.has(id) ? state.closed.delete(id) : state.closed.add(id); render(); },
  });
  for (const p of PRESETS) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = p.label;
    b.onclick = () => { state.closed = new Set(p.close); render(); };
    presetBox.appendChild(b);
  }
  for (const r of RULES) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = r.label; b.dataset.v = r.view;
    b.onclick = () => { view = r.view; render(); };
    ruleBox.appendChild(b);
  }
  const ex = host.querySelector("#s-explain")!;
  ex.append(maxflowCard(true), sharingCard(true, true));

  function render() {
    const ev = evaluate(state);
    map.update(ev, state);
    const key = [...state.closed].sort().join(",");
    presetBox.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-pressed", String(PRESETS[i].close.slice().sort().join(",") === key)));
    ruleBox.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String((b as HTMLElement).dataset.v === view)));

    const gap = Math.max(0, ev.demand - ev.supply);
    host.querySelector("#s-nums")!.innerHTML = `
      <div><p class="bn-l">Gas Asia needs</p><p class="bn">${fmt(ev.demand, 0)}<small> mtpa</small></p></div>
      <div><p class="bn-l">Gas that can get through</p><p class="bn">${fmt(ev.supply, 0)}<small> mtpa</small></p></div>
      <div class="${gap > 0.05 ? "miss" : ""}"><p class="bn-l">Missing</p><p class="bn">${fmt(gap, 0)}<small> mtpa</small></p></div>
      <p class="note bn-note">${MTPA_NOTE}. Pipelines into China and Thailand count too.</p>`;

    const hb = holdingBack(ev);
    host.querySelector("#s-holding")!.innerHTML = `
      <p class="lbl">What's holding supply back</p>
      <p class="hb-s">${hb.sentence}</p>
      ${hb.items.length && gap > 0.05 ? `<ul class="hb-list">${hb.items.map((t) => `<li>${t}</li>`).join("")}</ul>` : ""}`;

    const rows = [...ev.rows].sort((a, b) => a.share[view] - b.share[view] || a.name.localeCompare(b.name));
    host.querySelector("#s-bars")!.innerHTML = rows.map((r) => {
      const sh = r.share[view];
      return `<div class="bar-row${sh < 0.5 ? " low" : ""}">
        <span class="bar-name">${r.name}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${(100 * sh).toFixed(1)}%"></span></span>
        <span class="bar-val">${pct(sh)}</span></div>`;
    }).join("") + `<p class="note">Bars show the share of each country's import needs that is met. Countries below 50% are highlighted.</p>`;
  }
  render();
}
