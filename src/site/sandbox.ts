import type { LPSolution } from "../model/lp";
import { NET, VIEWS, VIEW_LABEL, days, evaluate, evaluateLP, fmt, name, needsLP, pct, type Evaluation, type HormuzMode, type State, type View } from "./compute";
import { ChartMap } from "./map";

const PRESETS: { label: string; key: string }[] = [
  { label: "Baseline 2025", key: "baseline" },
  { label: "Hormuz closed", key: "hormuz" },
  { label: "2026 as it happened", key: "hormuz_2026" },
  { label: "Red Sea closed", key: "redsea" },
  { label: "Malacca closed", key: "malacca" },
  { label: "Panama restricted", key: "panama" },
  { label: "Russia sanctioned", key: "russia" },
];
const HORMUZ_MODES: { mode: HormuzMode; label: string }[] = [
  { mode: "open", label: "Open" },
  { mode: "closed", label: "Closed" },
  { mode: "pakistan", label: "Pakistan-bound only" },
  { mode: "share37", label: "37% (2026 average)" },
];
const VIEW_HELP: Record<View, string> = {
  priority: "Buyers are served by ability to pay: Japan, Korea, Taiwan, China, Thailand, India, Bangladesh, Pakistan. The prediction made before the 2026 evidence.",
  market2026: "Calibrated to 2026: China, which has pipelines, storage and coal, steps back; Pakistan is priced out last. Order: Japan, Korea, Taiwan, Thailand, India, Bangladesh, China, Pakistan.",
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

/** Readable name for a shadow-price row; supply and diverted supply of one exporter merge. */
function dualName(d: LPSolution["duals"][number]) {
  const m = d.meta;
  if (m.type === "supply" || m.type === "divert") return `${name(m.id)} (more LNG)`;
  if (m.type === "pipeline") return name(m.id);
  if (m.type === "route") return `${name(m.id)} (reopen)`;
  if (m.type === "regas") return `${name(m.id)} regas`;
  if (m.type === "demand") return `${name(m.id)} demand`;
  return `${m.type} ${"id" in m ? m.id : ""}`;
}

export function mountSandbox() {
  const state: State = { closed: new Set(), diversion: NET.meta.diversion.value, focus: null, hormuz: "closed", fleet: false };
  let view: View = "priority";
  let preset = "hormuz";
  let token = 0;

  const panel = document.getElementById("panel")!;
  const table = document.getElementById("sb-table")!;
  const map = new ChartMap(document.getElementById("sb-map")!, {
    interactive: true,
    view: () => view,
    onToggle: (id) => {
      if (id === "HORMUZ") state.hormuz = state.hormuz === "open" ? "closed" : "open";
      else state.closed.has(id) ? state.closed.delete(id) : state.closed.add(id);
      preset = ""; render();
    },
  });
  document.getElementById("sb-legend")!.innerHTML =
    `<span><i class="sw flow"></i>Gas flow (width ∝ mtpa)</span><span><i class="sw cut"></i>Binding constraint (min cut)</span><span><i class="sw closed"></i>Closed</span><span><i class="sw track"></i>Unused route</span>`;

  panel.innerHTML = `
    <div><p class="lbl">Scenario</p><div class="seg" id="presets"></div></div>
    <div><p class="lbl">Strait of Hormuz</p><div class="seg" id="hz"></div></div>
    <div><p class="lbl">How gas is shared</p><div class="seg" id="views"></div><p class="note" id="view-help"></p></div>
    <div><label class="lbl" for="div">Share of other buyers' cargoes Asia can bid away: <span id="div-v"></span></label>
      <input type="range" id="div" min="0" max="50" step="5" /></div>
    <div class="row2">
      <label class="check"><input type="checkbox" id="fleet" /> Limit by LNG-carrier fleet</label>
      <span class="engine" id="engine"></span>
    </div>
    <div><label class="lbl" for="focus">Map shows flows for</label>
      <select id="focus"><option value="">All importers</option>${NET.importers.map((i) => `<option value="${i.id}">${i.name} alone (outbids everyone)</option>`).join("")}</select></div>
    <div class="headline" id="headline"></div>
    <div><p class="lbl">Value of one more mtpa of capacity</p><ul class="cut" id="duals"><li class="muted">Computing…</li></ul>
      <p class="note">Shadow prices from the linear program: points of λ (the share every importer gets) per extra mtpa. They generalise the min cut.</p></div>
    <div><p class="lbl">Min cut: what limits supply</p><ul class="cut" id="cut"></ul></div>`;

  const seg = (box: Element, items: { key: string; label: string }[], onClick: (k: string) => void) => {
    for (const it of items) {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = it.label; b.dataset.k = it.key;
      b.onclick = () => onClick(it.key);
      box.appendChild(b);
    }
  };
  const presetsBox = panel.querySelector("#presets")!, hzBox = panel.querySelector("#hz")!, viewsBox = panel.querySelector("#views")!;
  seg(presetsBox, PRESETS.map((p) => ({ key: p.key, label: p.label })), (k) => {
    preset = k;
    const sc = NET.scenarios[k];
    state.closed = new Set((sc.close ?? []).filter((x) => x !== "HORMUZ"));
    state.hormuz = sc.close?.includes("HORMUZ") ? "closed" : sc.hormuz?.destinations ? "pakistan" : sc.hormuz?.share ? "share37" : "open";
    state.capFactor = sc.cap_factor ?? {};
    state.fleet = !!sc.fleet || state.fleet;
    fleetBox.checked = !!state.fleet;
    render();
  });
  seg(hzBox, HORMUZ_MODES.map((h) => ({ key: h.mode, label: h.label })), (k) => { state.hormuz = k as HormuzMode; preset = ""; render(); });
  seg(viewsBox, VIEWS.map((v) => ({ key: v, label: VIEW_LABEL[v] })), (k) => { view = k as View; render(); });
  const div = panel.querySelector<HTMLInputElement>("#div")!;
  div.value = String(Math.round(state.diversion * 100));
  div.oninput = () => { state.diversion = Number(div.value) / 100; render(); };
  const focus = panel.querySelector<HTMLSelectElement>("#focus")!;
  focus.onchange = () => { state.focus = focus.value || null; render(); };
  const fleetBox = panel.querySelector<HTMLInputElement>("#fleet")!;
  fleetBox.onchange = () => { state.fleet = fleetBox.checked; preset = ""; render(); };

  function draw(ev: Evaluation) {
    map.update(ev, { ...state, closed: new Set(ev.scenario.close ?? []) });
    const pressed = (box: Element, k: string) => box.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String((b as HTMLElement).dataset.k === k)));
    pressed(presetsBox, preset); pressed(hzBox, state.hormuz ?? "open"); pressed(viewsBox, view);
    panel.querySelector("#view-help")!.textContent = VIEW_HELP[view];
    panel.querySelector("#div-v")!.textContent = pct(state.diversion);
    panel.querySelector("#engine")!.textContent = ev.engine === "LP" ? "Solved as a linear program (HiGHS)" : "Solved by max-flow";

    const gap = ev.demand - ev.supply;
    const out = ev.rows.filter((r) => r.share[view] < 0.01).map((r) => r.name);
    const fleetNote = ev.fleet ? ` Ships: ${pct(ev.fleet.needed / ev.fleet.available)} of available ship-time needed${ev.fleet.binds ? ", and the fleet is cutting supply" : ", enough to carry the gas"}.` : "";
    panel.querySelector("#headline")!.innerHTML = `
      <p class="lbl">Gas Asia can physically receive</p>
      <p class="big">${fmt(ev.supply, 0)} <small>of ${fmt(ev.demand, 0)} mtpa · gap ${fmt(Math.max(0, gap), 1)}</small></p>
      <div class="meter"><i style="width:${(100 * ev.supply) / ev.demand}%"></i></div>
      <p class="note">${gap < 0.05 ? "Every importer can be fully supplied: the network routes around this closure." : `Equal rationing would give everyone ${pct(ev.lambda)}. ${out.length ? `Under “${VIEW_LABEL[view]}”, shut out: <b>${out.join(", ")}</b>.` : ""}`}${fleetNote}</p>`;

    // min cut
    const cut = ev.map.cut.filter((c) => c.meta.type !== "demand");
    const met = ev.map.cut.filter((c) => c.meta.type === "demand").map((c) => name(c.meta.id));
    const merged = new Map<string, { c: typeof cut[number]; cap: number }>();
    for (const c of cut) { const k = `${c.label}|${"id" in c.meta ? c.meta.id : ""}`; const e = merged.get(k); merged.set(k, { c, cap: (e?.cap ?? 0) + c.capacity }); }
    const rows = [...merged.values()].sort((a, b) => Number(b.c.closed) - Number(a.c.closed) || b.cap - a.cap).map(({ c, cap }) =>
      `<li class="${c.label === "route bottleneck" ? "route" : ""}"><span>${name(c.meta.id)}${c.closed ? " (closed)" : ""} <em>${CUT_HELP[c.label] ?? c.label}</em></span><span>${fmt(cap)}</span></li>`);
    if (met.length) rows.push(`<li><span>Fully supplied: ${met.join(", ")}</span><span></span></li>`);
    if (ev.engine === "max-flow") rows.push(`<li class="sum"><span>Cut capacity = max flow</span><span>${fmt(ev.map.total)}</span></li>`);
    panel.querySelector("#cut")!.innerHTML = rows.join("");

    // shadow prices
    if (ev.duals) {
      const groups = new Map<string, Set<string>>();
      for (const d of ev.duals) {
        if (d.meta.type === "demand") continue;
        const v = (100 * d.dual).toFixed(2);
        groups.set(v, (groups.get(v) ?? new Set()).add(dualName(d)));
      }
      const items = [...groups.entries()].sort((a, b) => +b[0] - +a[0]).map(([v, ns]) =>
        `<li><span>${[...ns].join(", ")}</span><span>+${v} pts</span></li>`);
      panel.querySelector("#duals")!.innerHTML = items.length ? items.join("") : `<li><span>Nothing binds: every importer is fully supplied.</span><span>0</span></li>`;
    }

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

  function render() {
    const my = ++token;
    if (!needsLP(state)) draw(evaluate(state));
    else panel.querySelector("#engine")!.textContent = "Solving the linear program…";
    if (!needsLP(state)) panel.querySelector("#duals")!.innerHTML = `<li class="muted"><span>Computing…</span></li>`;
    evaluateLP(state).then((ev) => { if (my === token) draw(ev); }).catch((e) => {
      if (my !== token) return;
      panel.querySelector("#engine")!.textContent = "The LP solver could not run in this browser; showing max-flow results.";
      panel.querySelector("#duals")!.innerHTML = `<li class="muted"><span>Unavailable: ${String(e).slice(0, 80)}</span></li>`;
    });
  }
  render();
}
