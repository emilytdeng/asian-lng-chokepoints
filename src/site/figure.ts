/** An interactive flow figure shown as a map, a network graph, or both stacked, with a toggle between them. */
import type { Evaluation, State } from "./compute";
import { ChartGraph } from "./graphview";
import { ChartMap, type MapOptions } from "./map";
import { panZoom } from "./panzoom";

export type FigMode = "both" | "map" | "graph";
const KEY = "flowFigure2";
const MAP_NOTE = "Click a diamond (a strait), a dot (an exporter) or a dotted line (a pipeline) to close or reopen it. Line width shows how much gas flows. Hover anything for its numbers; use + and − to zoom (or ⌘/Ctrl + scroll), then drag to look around.";
const GRAPH_NOTE = "In the graph, gas starts at S, which supplies each exporter up to what it can sell to Asia, and ends at T, which takes up to each importer's needs. Sea lanes have no limit unless closed. Numbers under each exporter, pipeline and importer show gas flowing / the most possible, in mtpa; hover a line for its flow.";

export class FlowFigure {
  private map: ChartMap;
  private graph: ChartGraph;
  mode: FigMode = "both";
  private boxes: Record<"map" | "graph", HTMLElement>;
  private bar: HTMLElement;
  private note: HTMLElement;

  constructor(host: HTMLElement, opts: MapOptions) {
    this.bar = document.createElement("div");
    this.bar.className = "seg fig-toggle";
    this.bar.setAttribute("role", "group");
    this.bar.setAttribute("aria-label", "Show the network as");
    for (const [m, label] of [["both", "Map and graph"], ["map", "Map"], ["graph", "Network graph"]] as const) {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = label; b.dataset.m = m;
      b.onclick = () => this.setMode(m);
      this.bar.appendChild(b);
    }
    const box = (m: "map" | "graph", cap: string) => {
      const d = document.createElement("div");
      d.className = `fig-${m}`;
      d.innerHTML = `<p class="fig-cap">${cap}</p>`;
      return d;
    };
    this.boxes = { map: box("map", "On the map"), graph: box("graph", "As a graph, like the toy") };
    this.note = document.createElement("p");
    this.note.className = "note fig-note";
    host.append(this.bar, this.boxes.map, this.boxes.graph, this.note);
    this.map = new ChartMap(this.boxes.map, opts);
    this.graph = new ChartGraph(this.boxes.graph, opts);
    if (opts.interactive) { panZoom(this.map.svg, this.boxes.map); panZoom(this.graph.svg, this.boxes.graph); }
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* storage unavailable */ }
    this.setMode(saved === "map" || saved === "graph" ? saved : "both", false);
  }

  setMode(m: FigMode, save = true) {
    this.mode = m;
    this.boxes.map.hidden = m === "graph";
    this.boxes.graph.hidden = m === "map";
    this.boxes.map.parentElement!.classList.toggle("fig-both", m === "both");
    this.bar.querySelectorAll<HTMLButtonElement>("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.m === m)));
    this.note.textContent = m === "map" ? MAP_NOTE : m === "graph" ? GRAPH_NOTE : `${MAP_NOTE} ${GRAPH_NOTE}`;
    if (save) try { localStorage.setItem(KEY, m); } catch { /* ignore */ }
  }

  update(ev: Evaluation, s: State, highlight: string[] = []) {
    this.map.update(ev, s, highlight);
    this.graph.update(ev, s, highlight);
  }
}
