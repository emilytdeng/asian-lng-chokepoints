/** Chapters 2–5: the toy network, Edmonds–Karp step by step, from toy to LNG, and closing Hormuz. */
import { coverChart } from "./charts";
import { MTPA_NOTE, NET, evaluate, fmt, pct, type Evaluation, type State } from "./compute";
import { holdingBack } from "./explain";
import { ChartGraph } from "./graphview";
import { ChartMap, type MapOptions } from "./map";
import { scrolly, type Step } from "./scrolly";
import { ToyGraph, type ToyFrame } from "./toy";
import { TOY_ARCS, arcName, flowsAfter, pathNodes, toyTrace } from "./toydata";

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
        <p>Below is a made-up network of pipes. Gas enters at <b>S</b> and must reach <b>T</b>. Each pipe has a <b>capacity</b>—the maximum it can carry in a year. The number beside each pipe shows its capacity; thicker pipes represent larger capacities. Arrows show the direction of flow.</p>

        <p><b><a href="https://en.wikipedia.org/wiki/Maximum_flow_problem" target="_blank" rel="noopener noreferrer">Max-flow</a>.</b> This is the greatest amount that can travel from S to T at once without exceeding any pipe's capacity.</p>

        <p><b><a href="https://en.wikipedia.org/wiki/Max-flow_min-cut_theorem" target="_blank" rel="noopener noreferrer">Min-cut</a>.</b> This is the set of pipes with the smallest combined capacity whose removal disconnects S from T. It may include several pipes—not just one narrow pipe. The max-flow min-cut theorem says its capacity equals the maximum possible flow.</p>

        <p>How much can flow through this network? Take a guess. With only seven pipes, you can nearly work it out by eye. Asia's LNG network has more than sixty links, so let's see what a computer finds.</p>
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
  const reachNames = ["S", "A", "B", "C", "D", "T"].filter((_, k) => t.result.reach[k]);
  const fr = (o: Partial<ToyFrame>): ToyFrame => ({ flows: f(0), labels: "flow", total: 0, ...o });

  const frames: { html: string; frame: ToyFrame }[] = [
    { html: `<p>Each pipe now shows <b>flow / capacity</b>. Nothing is flowing yet.</p>`, frame: fr({}) },
    { html: `<p><b>Find the shortest route from S to T that still has capacity.</b> The computer searches outward from S one pipe at a time, so it always finds a route with the fewest pipes: ${route(0)}.</p>`, frame: fr({ path: p1 }) },
    { html: `<p><b>Push as much as the tightest pipe on that route allows: ${p1.amount}.</b> Pipes thicken as they fill; full pipes turn red. ${fullAfter(1).join(" and ")} are now full.</p>`, frame: fr({ flows: f(1), total: sum(1) }) },
    { html: `<p><b>Repeat.</b> The next shortest route with capacity is ${route(1)}. It takes ${p2.amount} more, and ${fullAfter(2).join(" and ")} ${fullAfter(2).length > 1 ? "are" : "is"} now full.</p>`, frame: fr({ flows: f(2), total: sum(2), path: p2 }) },
    { html: `<p>B still has ${TOY_ARCS[1][2]} waiting to send, but its only pipe leads to D, and D's exit to T is full. Looks stuck?</p>`, frame: fr({ flows: f(2), total: sum(2), pulse: "B" }) },
    { html: `<p><b>The trick: gas can be sent backward to undo an earlier choice.</b> B sends gas into D, and D hands back ${p3.amount} of the units A sent it, so A can send them through C instead: ${route(2)}.</p>`, frame: fr({ flows: f(2), total: sum(2), path: p3 }) },
    { html: `<p>That pushes ${p3.amount} more. ${arcName(back.i)} thins from ${f(2)[back.i]} to ${f(3)[back.i]} and turns blue again; ${fullAfter(3).join(" and ")} ${fullAfter(3).length > 1 ? "are" : "is"} now full. Total: <b>${sum(3)}</b>.</p>`, frame: fr({ flows: f(3), total: sum(3) }) },
    { html: `<p><b>Now no route has capacity left, even using the undo trick, so the computer stops.</b> The shaded circles are everything S can still reach: ${reachNames.join(", ")}.</p>`, frame: fr({ flows: f(3), total: sum(3), reach: t.result.reach }) },
    { html: `<p>The dashed line separates what S can reach from what it can't. It crosses only full pipes, ${cutNames.join(" and ")}: that's the <b>min cut</b>. (S→A is full too, but gas can get around it, so it isn't the narrowest point.)</p>`, frame: fr({ flows: f(3), total: sum(3), reach: t.result.reach, cut: true }) },
    { html: `<p class="theorem">The flow equals the capacity of the cut: ${cutCaps.join(" + ")} = ${t.result.total}. That's the <b>max-flow min-cut theorem</b>. When the algorithm stops we know two things at once: the most that can get through, and exactly which pipes are holding it back.</p>`, frame: fr({ flows: f(3), total: sum(3), reach: t.result.reach, cut: true, note: `cut: ${cutCaps.join(" + ")} = ${t.result.total}` }) },
  ];
  host.innerHTML = `${chapterHead(3, "h-algo", "How the computer finds it", "The standard method is called Edmonds–Karp, after Jack Edmonds and Richard Karp, who published it in 1972. At a high level, it finds the shortest route from S to T that still has spare capacity, pushes as much through that path as its tightest pipe allows, and repeats. If an earlier choice blocks a better route, it can send flow back to undo it. We have reached max flow when no route has capacity left. Scroll to watch it run.")}<div class="wrap" id="algo-scrolly"></div>`;
  const fig = document.createElement("figure");
  fig.className = "toy-fig sticky-toy";
  const toy = new ToyGraph(fig);
  scrolly(host.querySelector("#algo-scrolly")!, fig, frames.map((x) => ({ html: x.html, enter: () => toy.show(x.frame) })), "sticky");
}

// ------------------------------------------------------------------ real-network figure used in chapters 4–5
type Kind = "map" | "graph" | "chart";
interface Scene { kind: Kind; state: State; hl?: string[]; cut?: boolean; chart?: (h: HTMLElement, e: Evaluation, hl?: string[]) => void }

class StoryFigure {
  el = document.createElement("div");
  private mapOpts: MapOptions = { interactive: false, cut: false };
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
    this.boxes.chart.appendChild(this.chart);
  }
  show(sc: Scene) {
    for (const k of ["map", "graph", "chart"] as Kind[]) this.boxes[k].classList.toggle("on", k === sc.kind);
    const e = ev(sc.state);
    this.mapOpts.cut = this.graphOpts.cut = !!sc.cut;
    if (sc.kind === "chart") sc.chart!(this.chart, e, sc.hl);
    else (sc.kind === "map" ? this.map : this.graph).update(e, sc.state, sc.hl);
  }
}
/** Phones: a standalone copy of one scene. */
function staticScene(host: HTMLElement, sc: Scene) {
  const e = ev(sc.state);
  const o: MapOptions = { interactive: false, cut: !!sc.cut };
  if (sc.kind === "chart") { const d = document.createElement("div"); d.className = "sf-inline-chart"; host.appendChild(d); sc.chart!(d, e, sc.hl); }
  else { const box = document.createElement("div"); box.className = "sf-inline-wide"; host.appendChild(box); (sc.kind === "map" ? new ChartMap(box, o) : new ChartGraph(box, o)).update(e, sc.state, sc.hl); }
}
function sceneScrolly(host: HTMLElement, scenes: (Scene & { html: string })[]) {
  const fig = new StoryFigure();
  const steps: Step[] = scenes.map((sc) => ({ html: sc.html, enter: () => fig.show(sc), inline: (h) => staticScene(h, sc) }));
  scrolly(host, fig.el, steps, "inline");
}

// ------------------------------------------------------------------ chapter 4: from toy to LNG
export function mountLNG(host: HTMLElement) {
  const y = ev(S_2025), B = ev(S_BASE);
  const via = (r: string) => y.map.arcFlow[`route:${r}`] ?? 0;
  const hzShare = B.rows.reduce((a, r) => a + r.exposure * r.demand, 0) / B.demand;
  const japan = Math.round(NET.importers.find((i) => i.id === "JPN")!.import_demand.value);
  host.innerHTML = `${chapterHead(4, "h-lng", "From toy to LNG", "Now swap the toy pipes for the real thing.")}
    <div class="wrap">
      <ol class="lng-steps">
        <li><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 6v36M8 15l32 18M8 33l32-18" /></svg><b>Chill.</b> Natural gas is cooled to −162 °C, where it becomes a liquid that takes up about 600 times less space. That's LNG: liquefied natural gas.</li>
        <li><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 30h36l-5 9H11zM14 30v-8h20v8M19 22a3 3 0 1 1 0-.1M29 22a3 3 0 1 1 0-.1" /></svg><b>Ship.</b> Special tankers carry it across oceans. Most routes squeeze through a few narrow sea passages called <b>chokepoints</b>.</li>
        <li><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 40V22l8-6 8 6v18M24 40V14l8-6 8 6v26M4 40h40" /></svg><b>Warm.</b> At an <b>import terminal</b> it's warmed back into gas ("regasification") and piped to power plants, factories and homes.</li>
      </ol>
      <p class="prose-narrow">We measure LNG in <b>mtpa</b>: million tonnes a year. Japan, the biggest buyer in this story, imports about ${japan}.</p>
      <div class="tablewrap"><table class="maptable">
        <caption>The same puzzle, with real names</caption>
        <thead><tr><th scope="col">In the toy</th><th scope="col">In Asia's LNG trade</th></tr></thead>
        <tbody>
          <tr><td>S, the start</td><td>All the gas that exporters can sell to Asia</td></tr>
          <tr><td>Pipes out of S</td><td>Each exporter's limit: what it sold to these buyers in 2025, plus some cargoes it could pull away from Europe and others</td></tr>
          <tr><td>Junctions and pipes</td><td>Chokepoints and seas, and the shipping lanes between them (no limit unless closed)</td></tr>
          <tr><td>Pipes into T</td><td>Each importing country's needs: what it imported in 2025</td></tr>
          <tr><td>T, the finish</td><td>Gas that reaches a buyer who needs it</td></tr>
        </tbody></table></div>
      <p class="prose-narrow">China and Thailand also get gas through overland pipelines, which count as extra pipes straight from S.</p>
    </div>
    <div class="wrap" id="lng-scrolly"></div>`;
  sceneScrolly(host.querySelector("#lng-scrolly")!, [
    { kind: "map", state: S_2025, html: `<p>Here is the real network in 2025. Lines are shipping routes; the thicker the line, the more LNG it carried. Black dots are exporters; the eight blue dots are the economies in this story.</p>` },
    { kind: "map", state: S_2025, hl: ["HORMUZ"], html: `<p><b>The Strait of Hormuz</b>, between Iran and Oman, is the only way out of the Persian Gulf. Qatar and the UAE ship all their LNG through it: about ${pct(hzShare)} of what these eight economies imported in 2025.</p>` },
    { kind: "map", state: S_2025, hl: ["MALACCA"], html: `<p><b>The Strait of Malacca</b>, between Malaysia and Indonesia, links the Indian Ocean to the South China Sea. About ${fmt(via("MALACCA"), 0)} mtpa of these flows went through it. Ships can also go the long way round, through Indonesia's Lombok Strait.</p>` },
    { kind: "map", state: S_2025, hl: ["BAB_SUEZ"], html: `<p><b>The Red Sea route</b>, through Egypt's Suez Canal and the Bab el-Mandeb strait, is the short cut from the Atlantic to Asia (${fmt(via("BAB_SUEZ"), 0)} mtpa here). When it's unsafe, ships sail round Africa's Cape of Good Hope instead: slower, but they still arrive.</p>` },
    { kind: "map", state: S_2025, hl: ["PANAMA"], html: `<p><b>The Panama Canal</b> is the short cut for US cargoes heading to Asia (${fmt(via("PANAMA"), 0)} mtpa). Its locks run on rainwater, so in droughts it lets fewer ships through and the rest go the long way.</p>` },
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
