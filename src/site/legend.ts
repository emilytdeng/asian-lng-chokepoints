/** "How to read the pictures": what every line and point colour means, shared by the story and the sandbox. */
const sw = (inner: string) => `<svg class="key-sw" viewBox="0 0 56 22" aria-hidden="true">${inner}</svg>`;
const line = (style: string) => sw(`<line x1="4" y1="11" x2="52" y2="11" style="stroke-linecap:round;${style}" />`);

const LINES: [string, string, string][] = [
  [line("stroke:var(--flow);stroke-width:6"), "Blue line", "Gas flowing. The thicker the line, the more gas."],
  [line("stroke:var(--cut);stroke-width:6"), "Red line", "Full: carrying all it can. An exporter selling everything it has, a full pipeline, or an importer getting all it needs. (Graph only.)"],
  [line("stroke:var(--track);stroke-width:2"), "Thin grey line", "A route that carries no gas in this scenario."],
  [line("stroke:var(--closed);stroke-width:2;stroke-dasharray:5 5"), "Grey dashed line", "A closed route."],
  [line("stroke:var(--track);stroke-width:2.5;stroke-dasharray:1 4"), "Grey dotted line", "An overland pipeline. (Map only; the graph draws pipelines from S along the bottom.)"],
  [line("stroke:var(--cut);stroke-width:3;stroke-dasharray:9 6"), "Red dashed line", "The min cut: the limits holding supply back. It separates what the start S can still reach from what it can't."],
  [line("stroke:var(--ink);stroke-width:3;stroke-dasharray:7 4"), '<span class="lt">Black</span><span class="dk">White</span> moving dashes', "The route the algorithm is adding right now, while you step through it."],
];
const POINTS: [string, string, string][] = [
  [sw(`<circle cx="28" cy="11" r="6" style="fill:var(--ink)" />`), '<span class="lt">Black</span><span class="dk">White</span> dot', "An exporter: a country selling LNG."],
  [sw(`<rect x="22" y="5" width="12" height="12" rx="2" style="fill:var(--ink)" />`), '<span class="lt">Black</span><span class="dk">White</span> square', "A pipeline. (Graph only.)"],
  [sw(`<circle cx="28" cy="11" r="7" style="fill:var(--flow)" />`), "Blue dot", "An importing economy that gets all the gas it needs."],
  [sw(`<circle cx="28" cy="11" r="7" style="fill:var(--cut)" />`), "Red dot", "An importing economy that is short of gas."],
  [sw(`<path d="M28,2 L37,11 L28,20 L19,11 Z" style="fill:var(--paper);stroke:var(--ink);stroke-width:1.6" />`), "Outlined diamond", "A chokepoint: a narrow strait or canal ships must pass through."],
  [sw(`<path d="M28,2 L37,11 L28,20 L19,11 Z" style="fill:var(--cut);stroke:var(--cut);stroke-width:1.6" />`), "Red diamond", "A closed chokepoint."],
  [sw(`<circle cx="28" cy="11" r="4.5" style="fill:var(--wash);stroke:var(--muted);stroke-width:1.4" />`), "Small grey circle", "Open sea (the Indian Ocean or the Pacific), where routes meet."],
  [sw(`<circle cx="28" cy="11" r="9" style="fill:var(--ink)" /><text x="28" y="15" text-anchor="middle" style="fill:var(--paper);font:700 11px var(--sans)">S</text>`), "S and T", "The start and the finish, as in the toy. S supplies every exporter and pipeline; T collects what each importer needs. (Graph only.)"],
  [sw(`<circle cx="28" cy="11" r="5" style="fill:var(--ink)" /><circle cx="28" cy="11" r="9.5" style="fill:none;stroke:var(--cut);stroke-width:2;stroke-dasharray:4 3" />`), "Dashed red ring", "On the map, the min cut: an exporter selling everything it has, or an importer already getting all it needs. A short red slash marks a full pipeline or a closed strait."],
];

export function colorKey(title = "How to read the map and graph"): HTMLElement {
  const el = document.createElement("section");
  el.className = "key";
  el.setAttribute("aria-label", title);
  const rows = (xs: [string, string, string][]) => xs.map(([s, n, t]) => `<li>${s}<span><b>${n}.</b> ${t}</span></li>`).join("");
  el.innerHTML = `<h3 class="key-h">${title}</h3>
    <div class="key-cols">
      <div><p class="lbl">Lines (routes)</p><ul class="key-list">${rows(LINES)}</ul></div>
      <div><p class="lbl">Points (places)</p><ul class="key-list">${rows(POINTS)}</ul></div>
    </div>`;
  return el;
}

/** A one-line key that travels with a figure. `on` picks which items apply ("map", "graph" or both). */
type MiniItem = [swatch: string, label: string, tip: string, where: "map" | "graph" | "both"];
const mini = (s: string) => `<svg class="mk-sw" viewBox="0 0 28 14" aria-hidden="true">${s}</svg>`;
const mline = (style: string) => mini(`<line x1="2" y1="7" x2="26" y2="7" style="stroke-linecap:round;${style}" />`);
const MINI: MiniItem[] = [
  [mline("stroke:var(--flow);stroke-width:5"), "Gas flow", "Thicker means more gas.", "both"],
  [mline("stroke:var(--cut);stroke-width:5"), "Full", "Carrying all it can.", "graph"],
  [mline("stroke:var(--closed);stroke-width:2;stroke-dasharray:4 4"), "Closed", "A closed route.", "both"],
  [mline("stroke:var(--track);stroke-width:2.5;stroke-dasharray:1 4"), "Pipeline", "An overland pipeline.", "map"],
  [mline("stroke:var(--cut);stroke-width:2.5;stroke-dasharray:6 4"), "Min cut", "The limits holding supply back.", "both"],
  [mini(`<circle cx="14" cy="7" r="4.5" style="fill:var(--ink)" />`), "Exporter", "A country selling LNG.", "both"],
  [mini(`<circle cx="9" cy="7" r="4.5" style="fill:var(--flow)" /><circle cx="20" cy="7" r="4.5" style="fill:var(--cut)" />`), "Importer: supplied / short", "Blue gets all it needs; red is short of gas.", "both"],
  [mini(`<path d="M14,1.5 L19.5,7 L14,12.5 L8.5,7 Z" style="fill:var(--paper);stroke:var(--ink);stroke-width:1.4" />`), "Chokepoint", "A narrow strait or canal. Red when closed.", "map"],
  [mini(`<circle cx="14" cy="7" r="3" style="fill:var(--ink)" /><circle cx="14" cy="7" r="6" style="fill:none;stroke:var(--cut);stroke-width:1.6;stroke-dasharray:3 2" />`), "On the cut", "An exporter selling all it has, or an importer fully supplied.", "map"],
];
export function miniKey(on: "map" | "graph" | "both" = "both"): HTMLElement {
  const el = document.createElement("ul");
  el.className = "minikey";
  el.setAttribute("aria-label", "Key");
  el.innerHTML = MINI.filter((m) => on === "both" || m[3] === "both" || m[3] === on)
    .map(([s, l, t]) => `<li title="${t}">${s}<span>${l}</span></li>`).join("");
  return el;
}
