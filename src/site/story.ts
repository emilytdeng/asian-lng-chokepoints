/** Chapters 2–5: the toy network, Edmonds–Karp step by step, from toy to LNG, and closing Hormuz. */
import { coverChart } from "./charts";
import { MTPA_NOTE, NET, evaluate, fmt, pct, type Evaluation, type State } from "./compute";
import { holdingBack } from "./explain";
import { miniKey } from "./legend";
import { ChartGraph } from "./graphview";
import { ChartMap, type MapOptions } from "./map";
import { scrolly, type Step } from "./scrolly";
import { ToyGraph, type ToyFrame } from "./toy";
import { TOY_ARCS, TOY_NODES, arcName, flowsAfter, pathNodes, toyTrace } from "./toydata";

const D = NET.meta.diversion.value;
export const S_BASE: State = { closed: new Set(), diversion: D, focus: null };
export const S_2025: State = { ...S_BASE, diversion: 0 }; // 2025 as it was: each exporter ships exactly its 2025 Asian sales
export const S_HZ: State = { closed: new Set(["HORMUZ"]), diversion: D, focus: null };
const S_HZ0: State = { ...S_HZ, diversion: 0 };

const cache = new Map<State, Evaluation>();
export const ev = (s: State) => { if (!cache.has(s)) cache.set(s, evaluate(s)); return cache.get(s)!; };

const chapterHead = (n: number, id: string, title: string, dek = "") =>
  `<div class="wrap chap-head"><p class="chap-n">Chapter ${n}</p><h2 id="${id}">${title}</h2>${dek ? `<p class="dek">${dek}</p>` : ""}</div>`;

// ------------------------------------------------------------------ chapter 2: a toy network
export function mountToy(host: HTMLElement): void {
  host.innerHTML = `
    ${chapterHead(2, "h-toy", "A toy network", "Before any real gas, a small puzzle.")}
    <div class="wrap two-col">
      <div class="prose">
        <p>Below is a made-up network of pipes. Gas enters at <b>S</b> and must reach <b>T</b>. Each pipe has a <b>capacity</b>—the maximum it can carry in a year. The number beside each pipe shows its capacity. Arrows show the direction of flow.</p>

        <p><b><a href="https://en.wikipedia.org/wiki/Maximum_flow_problem" target="_blank" rel="noopener noreferrer">Max-flow</a>.</b> This is the greatest amount that can travel from S to T at once without exceeding any pipe's capacity.</p>

        <p><b><a href="https://en.wikipedia.org/wiki/Max-flow_min-cut_theorem" target="_blank" rel="noopener noreferrer">Min-cut</a>.</b> This is the set of pipes with the smallest combined capacity whose removal disconnects S from T. It may include several pipes—not just one narrow pipe. A cut is measured by its pipes' <b>capacities</b>, not by how much gas happens to be flowing through them.</p>

        <p class="theorem-box"><b>The max-flow min-cut theorem</b> says the min cut's capacity equals the maximum possible flow.</p>
      </div>
      <figure class="toy-fig" id="toy-static"></figure>
    </div>
  `;

  new ToyGraph(host.querySelector("#toy-static")!).show({
    flows: TOY_ARCS.map(() => 0),
    labels: "cap",
  });
}

// ------------------------------------------------------------------ chapter 3: Edmonds–Karp on the toy
export function mountAlgo(host: HTMLElement) {
  const t = toyTrace();
  const [p1, p2, p3] = t.steps;
  const f = (k: number) => flowsAfter(t.steps, k);
  const sum = (k: number) => t.steps.slice(0, k).reduce((a, s) => a + s.amount, 0);
  const route = (k: number) => pathNodes(t.steps[k]).join(" → ");
  const fullAfter = (k: number) => TOY_ARCS.map((a, i) => (f(k)[i] >= a[2] && (k === 0 || f(k - 1)[i] < a[2]) ? arcName(i) : "")).filter(Boolean);
  const back = p3.arcs.find((a) => !a.fwd)!;
  const cutNames = t.cut.map(arcName);
  const cutCaps = t.cut.map((i) => TOY_ARCS[i][2]);
  const reachNames = TOY_NODES.filter((_, k) => t.result.reach[k]);
  const sOnly = TOY_NODES.map((x) => x === "S");
  const otherCut = TOY_ARCS.filter(([u, v]) => sOnly[u] && !sOnly[v]).map(([, , c]) => c);
  const fr = (o: Partial<ToyFrame>): ToyFrame => ({ flows: f(0), labels: "flow", total: 0, ...o });

  const frames: { html: string; frame: ToyFrame }[] = [
    { html: `<p>Each pipe now shows <b>flow / capacity</b>. Nothing is flowing yet.</p>`, frame: fr({}) },
    { html: `<p><b>Find the shortest route from S to T that still has capacity.</b> "Shortest" means fewest pipes, not distance. ${route(0)} uses ${p1.arcs.length}; every other route needs at least ${p2.arcs.length}.</p>`, frame: fr({ path: p1 }) },
    { html: `<p><b>Push as much as the tightest pipe on that route allows: ${p1.amount}.</b> Pipes thicken as they fill; full pipes turn red. ${fullAfter(1).join(" and ")} are now full.</p>`, frame: fr({ flows: f(1), total: sum(1) }) },
    { html: `<p><b>Repeat.</b> With F→T full, the shortest route that still has capacity is longer: ${route(1)}, ${p2.arcs.length} pipes. It takes ${p2.amount} more, and ${fullAfter(2).join(" and ")} ${fullAfter(2).length > 1 ? "are" : "is"} now full.</p>`, frame: fr({ flows: f(2), total: sum(2), path: p2 }) },
    { html: `<p>B still has ${TOY_ARCS[1][2]} waiting to send, but its route runs B → D → F, and F's exit to T is full. Looks stuck?</p>`, frame: fr({ flows: f(2), total: sum(2), pulse: "B" }) },
    { html: `<p><b>The trick: gas can be sent backward to undo an earlier choice.</b> B's gas flows on to F, and F hands back ${p3.amount} of the units A sent it, so A can send them along the top instead: ${route(2)} (${p3.arcs.length} pipes).</p>`, frame: fr({ flows: f(2), total: sum(2), path: p3 }) },
    { html: `<p>That pushes ${p3.amount} more. ${arcName(back.i)} thins from ${f(2)[back.i]} to ${f(3)[back.i]} and turns blue again; ${fullAfter(3).join(" and ")} ${fullAfter(3).length > 1 ? "are" : "is"} now full. Total: <b>${sum(3)}</b>.</p>`, frame: fr({ flows: f(3), total: sum(3) }) },
    { html: `<p><b>Now no route has capacity left, even using the undo trick, so the computer stops.</b> The shaded circles are everything S can still reach: ${reachNames.join(", ")}.</p>`, frame: fr({ flows: f(3), total: sum(3), reach: t.result.reach }) },
    { html: `<p>The dashed line separates what S can reach from what it can't. It crosses only full pipes, ${cutNames.join(" and ")}: that's the <b>min cut</b>. (S→A is full too, but gas can get around it, so it isn't the narrowest point.)</p>`, frame: fr({ flows: f(3), total: sum(3), reach: t.result.reach, cut: true }) },
    { html: `<p><b>Not every cut is the min cut.</b> This dashed line also separates S from T: it crosses S→A and S→B, whose capacities add up to ${otherCut.join(" + ")} = ${otherCut.reduce((x, y) => x + y, 0)}. That's more than ${t.result.total}, so it isn't the narrowest point: there's more capacity out of S than the network can carry further on. The min cut is the cut with the smallest total.</p>`, frame: fr({ flows: f(3), total: sum(3), reach: sOnly, cut: true, note: `not the min cut: ${otherCut.join(" + ")} = ${otherCut.reduce((x, y) => x + y, 0)}` }) },
    { html: `<p class="theorem">Back to the min cut. The flow equals its capacity: ${cutCaps.join(" + ")} = ${t.result.total}. That's the <b>max-flow min-cut theorem</b>. When the algorithm stops we know two things at once: the most that can get through, and exactly which pipes are holding it back.</p>`, frame: fr({ flows: f(3), total: sum(3), reach: t.result.reach, cut: true, note: `cut: ${cutCaps.join(" + ")} = ${t.result.total}` }) },
  ];
  host.innerHTML = `${chapterHead(3, "h-algo", "How the computer finds it", "The standard method is called Edmonds–Karp, after Jack Edmonds and Richard Karp, who published it in 1972. At a high level, it finds the shortest route (the fewest pipes) from S to T that still has spare capacity, pushes as much through that path as its tightest pipe allows, and repeats. If an earlier choice blocks a better route, it can send flow back to undo it. We have reached max flow when no route has capacity left. Scroll to watch it run.")}<div class="wrap" id="algo-scrolly"></div>`;
  const fig = document.createElement("figure");
  fig.className = "toy-fig sticky-toy";
  const toy = new ToyGraph(fig);
  scrolly(host.querySelector("#algo-scrolly")!, fig, frames.map((x) => ({ html: x.html, enter: () => toy.show(x.frame) })), "sticky");
}

// ------------------------------------------------------------------ real-network figure used in chapters 4–5
type Kind = "map" | "graph" | "chart";
interface Scene { kind: Kind; state: State; hl?: string[]; cut?: boolean; spot?: boolean; chart?: (h: HTMLElement, e: Evaluation, hl?: string[]) => void }

class StoryFigure {
  el = document.createElement("div");
  private mapOpts: MapOptions = { interactive: false, cut: false, spotlight: false };
  private graphOpts: MapOptions = { interactive: false, cut: false };
  private map: ChartMap;
  private graph: ChartGraph;
  private chart = document.createElement("div");
  private boxes: Record<Kind, HTMLElement>;
  constructor() {
    this.el.className = "story-fig";
    const box = (k: Kind) => { const d = document.createElement("div"); d.className = `sf-${k}`; this.el.appendChild(d); return d; };
    this.boxes = { map: box("map"), graph: box("graph"), chart: box("chart") };
    this.map = new ChartMap(this.boxes.map, this.mapOpts);
    this.graph = new ChartGraph(this.boxes.graph, this.graphOpts);
    this.boxes.map.appendChild(miniKey("map"));
    this.boxes.graph.appendChild(miniKey("graph"));
    this.boxes.chart.appendChild(this.chart);
  }
  show(sc: Scene) {
    for (const k of ["map", "graph", "chart"] as Kind[]) this.boxes[k].classList.toggle("on", k === sc.kind);
    const e = ev(sc.state);
    this.mapOpts.cut = this.graphOpts.cut = !!sc.cut;
    this.mapOpts.spotlight = !!sc.spot;
    if (sc.kind === "chart") sc.chart!(this.chart, e, sc.hl);
    else (sc.kind === "map" ? this.map : this.graph).update(e, sc.state, sc.hl);
  }
}
/** Phones: a standalone copy of one scene. */
function staticScene(host: HTMLElement, sc: Scene) {
  const e = ev(sc.state);
  const o: MapOptions = { interactive: false, cut: !!sc.cut, spotlight: !!sc.spot };
  if (sc.kind === "chart") { const d = document.createElement("div"); d.className = "sf-inline-chart"; host.appendChild(d); sc.chart!(d, e, sc.hl); }
  else { const box = document.createElement("div"); box.className = "sf-inline-wide"; host.appendChild(box); (sc.kind === "map" ? new ChartMap(box, o) : new ChartGraph(box, o)).update(e, sc.state, sc.hl); host.appendChild(miniKey(sc.kind === "map" ? "map" : "graph"));
    // a wide map on a phone: scroll so the place this step is about sits in the middle
    requestAnimationFrame(() => {
      const n = box.querySelector(".node.hl");
      if (!n || host.scrollWidth <= host.clientWidth) return;
      const r = n.getBoundingClientRect(), h = host.getBoundingClientRect();
      host.scrollLeft += r.left + r.width / 2 - (h.left + h.width / 2);
    });
  }
}
function sceneScrolly(host: HTMLElement, scenes: (Scene & { html: string })[]) {
  const fig = new StoryFigure();
  const steps: Step[] = scenes.map((sc) => ({ html: sc.html, enter: () => fig.show(sc), inline: (h) => staticScene(h, sc) }));
  scrolly(host, fig.el, steps, "inline");
}

// ------------------------------------------------------------------ chapter 4: from toy to LNG
const listNames = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
export function mountLNG(host: HTMLElement) {
  const y = ev(S_2025), B = ev(S_BASE);
  const hzTop = [...y.rows].filter((r) => r.exposure > 0.05).sort((p, q) => q.exposure - p.exposure).slice(0, 3);
  const hzShare = B.rows.reduce((a, r) => a + r.exposure * r.demand, 0) / B.demand;
  const japan = Math.round(NET.importers.find((i) => i.id === "JPN")!.import_demand.value);
  host.innerHTML = `${chapterHead(4, "h-lng", "From toy to LNG", "Some logistics of shipping liquefied natural gas (LNG).")}
    <div class="wrap">
      <ol class="lng-steps">
        <li><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 6v36M8 15l32 18M8 33l32-18" /></svg><b>Chill.</b> Natural gas is cooled to −162 °C, where it becomes a liquid that takes up about 600 times less space.</li>
        <li><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 30h36l-5 9H11zM14 30v-8h20v8M19 22a3 3 0 1 1 0-.1M29 22a3 3 0 1 1 0-.1" /></svg><b>Ship.</b> Special tankers carry it across oceans. Most routes squeeze through a few narrow sea passages called <b>chokepoints</b>.</li>
        <li><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 40V22l8-6 8 6v18M24 40V14l8-6 8 6v26M4 40h40" /></svg><b>Warm.</b> At an <b>import terminal</b> it's warmed back into gas ("regasification") and piped to power plants, factories and homes.</li>
      </ol>
      <p class="prose-narrow">We measure LNG in <b>mtpa</b>: million tonnes a year. Japan, the biggest buyer in this story, imports about ${japan}.</p>
      <div class="tablewrap"><table class="maptable">
        <thead><tr><th scope="col">In the toy</th><th scope="col">In Asia's LNG trade</th></tr></thead>
        <tbody>
          <tr><td>S, the start</td><td>A made-up starting point that feeds every exporter. The real network has many exporters, but max flow needs a single start.</td></tr>
          <tr><td>Pipes out of S</td><td>Each exporter's limit: what it sold to these buyers in 2025, plus some cargoes it could pull away from Europe and others</td></tr>
          <tr><td>Junctions and pipes</td><td>Chokepoints and seas, and the shipping lanes between them (no limit unless closed)</td></tr>
          <tr><td>Pipes into T</td><td>Each importing country's needs: what it imported in 2025</td></tr>
          <tr><td>T, the finish</td><td>A made-up finishing point that collects from every importer, so the many buyers become a single finish. Everything that reaches T is gas delivered to a buyer who needs it.</td></tr>
        </tbody></table></div>
      <p class="prose-narrow">China and Thailand also get gas through overland pipelines, which count as extra pipes straight from S.</p>
    </div>
    <div class="wrap" id="lng-scrolly"></div>`;
  sceneScrolly(host.querySelector("#lng-scrolly")!, [
    { kind: "map", state: S_2025, html: `<p>Here is the real network in 2025. Lines are shipping routes; the thicker the line, the more LNG it carried. Small dots are exporters; the eight blue dots are the economies in this story: ${listNames(NET.importers.map((i) => i.name))}.</p>` },
    { kind: "map", state: S_2025, spot: true, hl: ["HORMUZ", "QAT", "UAE", "IO", ...hzTop.map((r) => r.id)], html: `<p><span class="place">The Strait of Hormuz</span>, between Iran and Oman, is the only way out of the Persian Gulf. <span class="place">Qatar</span> and the <span class="place">UAE</span> ship all their LNG through it: about ${pct(hzShare)} of what these eight economies imported in 2025.</p><p>Most exposed: ${hzTop.map((r, k) => `<span class="place">${r.name}</span> (${pct(r.exposure)}${k === 0 ? " of its LNG" : ""})`).join(", ")}.</p>` },
    { kind: "map", state: S_2025, spot: true, hl: ["MALACCA", "IO", "PACIFIC", "LOMBOK", "CHN", "JPN", "KOR", "TWN", "THA"], html: `<p><span class="place">The Strait of Malacca</span>, between Malaysia and Indonesia, is the short cut from the Indian Ocean to the South China Sea. Cargoes from the Gulf and the Atlantic heading for <span class="place">China</span>, <span class="place">Japan</span>, <span class="place">South Korea</span>, <span class="place">Taiwan</span> and <span class="place">Thailand</span> pass through it.</p><p>If it shut, ships could take the longer way through Indonesia's <span class="place">Lombok Strait</span>.</p>` },
    { kind: "map", state: S_2025, spot: true, hl: ["BAB_SUEZ", "USA", "RUS_ARC", "OTH_ATL", "CAPE", "IO"], html: `<p><span class="place">The Red Sea route</span>, through Egypt's Suez Canal and the Bab el-Mandeb strait off Yemen, is the short cut to Asia for the <span class="place">United States</span>, <span class="place">Russia's Arctic</span> plants and <span class="place">other Atlantic and East African</span> exporters.</p><p>Since attacks on shipping began in late 2023, most LNG tankers sail round Africa's <span class="place">Cape of Good Hope</span> instead: slower, but they still arrive.</p>` },
    { kind: "map", state: S_2025, spot: true, hl: ["PANAMA", "USA", "PACIFIC", "CAPE"], html: `<p><span class="place">The Panama Canal</span> is the short cut from the <span class="place">US Gulf Coast</span> to buyers across the Pacific. Its locks run on rainwater, so in droughts it lets fewer ships through and the rest go round the <span class="place">Cape of Good Hope</span>.</p>` },
    { kind: "graph", state: S_2025, html: `<p>Now redraw the same network like the toy: a start <b>S</b> feeding every exporter and pipeline, and a finish <b>T</b> fed by every importer. It's the same puzzle, just bigger, and the same method solves it in a few milliseconds.</p><p class="small">Numbers show gas flowing / the most possible, in mtpa. ${MTPA_NOTE}.</p>` },
  ]);
}

// ------------------------------------------------------------------ chapter 5: close Hormuz
export function mountHormuz(host: HTMLElement) {
  const Z = ev(S_HZ), Z0 = ev(S_HZ0), B = ev(S_BASE);
  const gap = Z.demand - Z.supply;
  const recovered = Z.supply - Z0.supply;
  const row = (id: string) => Z.rows.find((r) => r.id === id)!;
  const cnPipe = NET.pipelines.filter((p) => p.to === "CHN").reduce((a, p) => a + p.capacity.value, 0) / row("CHN").demand;
  const others = ["MALACCA", "BAB_SUEZ", "PANAMA", "LOMBOK", "CAPE"];
  const lost = others.map((r) => ev({ ...S_BASE, closed: new Set([r]) })).map((e) => Math.max(0, e.demand - e.supply) - Math.max(0, B.demand - B.supply));
  const S_MAL: State = { ...S_BASE, closed: new Set(["MALACCA"]) };
  host.innerHTML = `${chapterHead(5, "h-hormuz", "Close Hormuz", "In 2026 this stopped being hypothetical. Here is what the network says happens.")}<div class="wrap" id="hz-scrolly"></div><div class="wrap reality" id="reality"></div>`;
  sceneScrolly(host.querySelector("#hz-scrolly")!, [
    { kind: "map", state: S_HZ0, hl: ["HORMUZ"], html: `<p><b>The strait shuts.</b> About <b>${fmt(Z.hormuzLost, 0)} mtpa</b> of Qatari and Emirati LNG is stuck in the Gulf, with no other way out. Every other exporter's ships keep sailing.</p>` },
    { kind: "map", state: S_HZ, hl: ["HORMUZ"], html: `<p><b>Buyers scramble.</b> Asian importers outbid Europe for some cargoes; we assume they can win ${pct(D)} of what other exporters sell outside Asia. The lines from the US, Africa and Australia thicken. That makes up about ${recovered / Z.hormuzLost > 0.4 && recovered / Z.hormuzLost < 0.6 ? "half" : pct(recovered / Z.hormuzLost)} of the loss.</p><p>The gap left over: <b>${fmt(gap, 0)} mtpa</b>, about ${pct(gap / Z.demand)} of what these economies import.</p>` },
    { kind: "graph", state: S_HZ, cut: true, html: `<p><b>Where is the narrowest point now?</b> Run the same method as on the toy and draw the min cut: the dashed line.</p><p>It doesn't cross another strait. It cuts across the pipes out of S, the exporters' own supply. ${holdingBack(Z).sentence}</p>` },
    { kind: "map", state: S_HZ, cut: true, hl: ["HORMUZ"], html: `<p>On the map, the same cut: a dashed ring round each exporter that is selling everything it has, and a dashed slash where Hormuz is shut. The pipelines into China and Thailand are full too.</p>` },
    { kind: "map", state: S_MAL, hl: ["MALACCA"], html: `<p><b>Hormuz is the only chokepoint that really matters.</b> Close any other single one (Malacca, the Red Sea, Panama, Lombok or the Cape) and ${lost.every((x) => x < 0.05) ? "no gas is lost" : "little gas is lost"}: ships take a longer way round, as they do here around Malacca. The cost is longer voyages and higher prices, not missing gas.</p>` },
    { kind: "chart", state: S_HZ, hl: ["TWN", "CHN"], chart: coverChart, html: `<p><b>How long can each country hold out?</b> Importers keep LNG in insulated tanks, and some can switch power plants to coal or oil. If everyone shared the shortage equally, <b>Taiwan's tanks would run dry in about ${Math.round(row("TWN").cover.rationed.days)} days</b>, the shortest of anyone. If it lost every bidding war: ${Math.round(row("TWN").cover.last.days)} days.</p><p><b>China</b> is the opposite. Pipelines from Russia, Central Asia and Myanmar cover ${pct(cnPipe)} of its import needs, and no LNG buyer can bid that away. Even served last, it keeps ${pct(row("CHN").share.last)} of its needs.</p>` },
  ]);
}
