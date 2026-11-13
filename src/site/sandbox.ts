import { NET, VIEW_LABEL, days, evaluate, fmt, name, pct, type Evaluation, type State, type View } from "./compute";
import { ChartMap } from "./map";

const PRESETS: { label: string; key: string }[] = [
  { label: "Baseline 2025", key: "baseline" },
  { label: "Hormuz closed", key: "hormuz" },
  { label: "Red Sea closed", key: "redsea" },
  { label: "Malacca closed", key: "malacca" },
  { label: "Panama restricted", key: "panama" },
  { label: "Russia sanctioned", key: "russia" },
];
const VIEWS: View[] = ["priority", "rationed", "last", "outbid"];
const VIEW_HELP: Record<View, string> = {
  priority: "Buyers are served in order of ability to pay: Japan, Korea, Taiwan, China, Thailand, India, Bangladesh, Pakistan. The main case.",
  rationed: "Every importer receives the same share of its demand at the same time.",
  last: "What an importer gets if every other buyer is served first. Its worst case.",
  outbid: "What an importer gets if it wins every cargo it can physically reach. Its best case.",
};
const CUT_HELP: Record<string, string> = {
  "route bottleneck": "a closed or full sea lane",
  "exporter at capacity": "the exporter has nothing more to sell to Asia",
  "pipeline at capacity": "the pipeline is full",
  "regas bottleneck": "the importer cannot land more LNG",
  "buffer at max rate": "storage or fuel switching at its limit",
};

export function mountSandbox() {
  const state: State = { closed: new Set(["HORMUZ"]), diversion: NET.meta.diversion.value, focus: null };
  let view: View = "priority";
  let preset = "hormuz";

  const panel = document.getElementById("panel")!;
  const table = document.getElementById("sb-table")!;
  const map = new ChartMap(document.getElementById("sb-map")!, {
    interactive: true,
    view: () => view,
    onToggle: (id) => { state.closed.has(id) ? state.closed.delete(id) : state.closed.add(id); preset = ""; render(); },
  });
  document.getElementById("sb-legend")!.innerHTML =
    `<span><i class="sw flow"></i>Gas flow (width ∝ mtpa)</span><span><i class="sw cut"></i>Min cut: the binding constraint</span><span><i class="sw closed"></i>Closed</span><span><i class="sw track"></i>Unused route</span>`;

  panel.innerHTML = `
    <div><p class="lbl">Scenario</p><div class="seg" id="presets"></div></div>
    <div><p class="lbl">How gas is shared</p><div class="seg" id="views"></div><p class="note" id="view-help"></p></div>
    <div><label class="lbl" for="div">Share of Europe-bound cargoes Asia can bid away: <span id="div-v"></span></label>
      <input type="range" id="div" min="0" max="50" step="5" /></div>
    <div><label class="lbl" for="focus">Map shows flows for</label>
      <select id="focus"><option value="">All importers</option>${NET.importers.map((i) => `<option value="${i.id}">${i.name} alone (outbids everyone)</option>`).join("")}</select></div>
    <div class="headline" id="headline"></div>
    <div><p class="lbl">Min cut: what limits supply</p><ul class="cut" id="cut"></ul></div>`;

  const presetsBox = panel.querySelector("#presets")!;
  for (const p of PRESETS) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = p.label; b.dataset.k = p.key;
    b.onclick = () => {
      preset = p.key;
      const sc = NET.scenarios[p.key];
      state.closed = new Set(sc.close ?? []);
      state.capFactor = sc.cap_factor ?? {};
      render();
    };
    presetsBox.appendChild(b);
  }
  const viewsBox = panel.querySelector("#views")!;
  for (const v of VIEWS) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = VIEW_LABEL[v]; b.dataset.v = v;
    b.onclick = () => { view = v; render(); };
    viewsBox.appendChild(b);
  }
  const div = panel.querySelector<HTMLInputElement>("#div")!;
  div.value = String(Math.round(state.diversion * 100));
  div.oninput = () => { state.diversion = Number(div.value) / 100; render(); };
  const focus = panel.querySelector<HTMLSelectElement>("#focus")!;
  focus.onchange = () => { state.focus = focus.value || null; render(); };

  function render() {
    const ev: Evaluation = evaluate(state);
    map.update(ev, state);
    presetsBox.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String((b as HTMLElement).dataset.k === preset)));
    viewsBox.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String((b as HTMLElement).dataset.v === view)));
    panel.querySelector("#view-help")!.textContent = VIEW_HELP[view];
    panel.querySelector("#div-v")!.textContent = pct(state.diversion);

    const gap = ev.demand - ev.supply;
    const out = ev.rows.filter((r) => r.share[view] < 0.01).map((r) => r.name);
    panel.querySelector("#headline")!.innerHTML = `
      <p class="lbl">Gas Asia can physically receive</p>
      <p class="big">${fmt(ev.supply, 0)} <small>of ${fmt(ev.demand, 0)} mtpa · gap ${fmt(gap, 1)}</small></p>
      <div class="meter"><i style="width:${(100 * ev.supply) / ev.demand}%"></i></div>
      <p class="note">${gap < 0.05 ? "Every importer can be fully supplied: the network routes around this closure." : `Equal rationing would give everyone ${pct(ev.lambda)}. ${out.length ? `Under “${VIEW_LABEL[view]}”, shut out: <b>${out.join(", ")}</b>.` : ""}`}</p>`;

    // min cut list
    const cut = ev.map.cut.filter((c) => c.meta.type !== "demand");
    const met = ev.map.cut.filter((c) => c.meta.type === "demand").map((c) => name(c.meta.id));
    const rows = cut.sort((a, b) => Number(b.closed) - Number(a.closed) || b.capacity - a.capacity).map((c) =>
      `<li class="${c.label === "route bottleneck" ? "route" : ""}"><span>${name(c.meta.id)}${c.closed ? " (closed)" : ""} <em>${CUT_HELP[c.label] ?? c.label}</em></span><span>${fmt(c.capacity)}</span></li>`);
    if (met.length) rows.push(`<li><span>Fully supplied: ${met.join(", ")}</span><span></span></li>`);
    rows.push(`<li class="sum"><span>Cut capacity = max flow</span><span>${fmt(ev.map.total)}</span></li>`);
    panel.querySelector("#cut")!.innerHTML = rows.join("");

    // allocation table
    table.innerHTML = `
      <table>
        <caption>By importer. Shares are % of 2025 import demand; days = how long storage lasts after fuel switching, under “${VIEW_LABEL[view]}”.</caption>
        <thead><tr><th scope="col">Importer</th><th scope="col">Demand (mtpa)</th><th scope="col">Via Hormuz in 2025</th>
          ${VIEWS.map((v) => `<th scope="col" class="${v === view ? "sel" : ""}">${VIEW_LABEL[v]}</th>`).join("")}
          <th scope="col">Days of cover</th><th scope="col">Gap after storage runs dry (mtpa)</th></tr></thead>
        <tbody>${ev.rows.map((r) => `<tr>
          <th scope="row">${r.name}</th><td>${fmt(r.demand)}</td><td>${pct(r.exposure)}</td>
          ${VIEWS.map((v) => `<td class="${v === view ? "sel" : ""} ${r.share[v] < 0.995 ? "low" : ""}">${pct(r.share[v])}</td>`).join("")}
          <td>${days(r.cover[view])}</td><td>${fmt(r.cover[view].unmetAfterDry)}</td></tr>`).join("")}</tbody>
      </table>`;
  }
  render();
}
