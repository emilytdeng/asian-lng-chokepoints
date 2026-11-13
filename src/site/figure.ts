/** An interactive flow figure that can be shown as a map or as a network graph, with a toggle between them. */
import type { Evaluation, State } from "./compute";
import { ChartGraph } from "./graphview";
import { ChartMap, type MapOptions } from "./map";

type Mode = "map" | "graph";
const KEY = "flowFigure";

export class FlowFigure {
  private map: ChartMap;
  private graph: ChartGraph;
  private mode: Mode = "map";
  private boxes: Record<Mode, HTMLElement>;
  private notes: Record<Mode, string> = {
    map: "Click a diamond (a strait), a dot (an exporter) or a dotted line (a pipeline) to close or reopen it. Line width shows how much gas flows.",
    graph: "The same network as a graph. Gas starts at the source S, which supplies each exporter up to what it can sell to Asia, and ends at the sink T, which takes up to each importer's needs. Sea lanes have no limit unless closed. Numbers show gas flowing / the most possible, in mtpa. Click a diamond, exporter or pipeline square to close or reopen it.",
  };

  constructor(host: HTMLElement, opts: MapOptions, private note?: HTMLElement) {
    const bar = document.createElement("div");
    bar.className = "seg fig-toggle";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "Show the network as");
    const box = (m: Mode) => { const d = document.createElement("div"); d.className = `fig-${m}`; return d; };
    this.boxes = { map: box("map"), graph: box("graph") };
    for (const [m, label] of [["map", "Map"], ["graph", "Network graph"]] as const) {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = label; b.dataset.m = m;
      b.onclick = () => this.setMode(m);
      bar.appendChild(b);
    }
    host.append(bar, this.boxes.map, this.boxes.graph);
    if (!this.note) {
      // no shared note: explain the graph under it, and say nothing extra under the map
      this.note = document.createElement("p");
      this.note.className = "note fig-note";
      host.appendChild(this.note);
      this.notes.map = "";
    }
    this.map = new ChartMap(this.boxes.map, opts);
    this.graph = new ChartGraph(this.boxes.graph, opts);
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* storage unavailable */ }
    this.setMode(saved === "graph" ? "graph" : "map", false);
  }

  setMode(m: Mode, save = true) {
    this.mode = m;
    this.boxes.map.hidden = m !== "map";
    this.boxes.graph.hidden = m !== "graph";
    this.boxes.map.parentElement?.querySelectorAll<HTMLButtonElement>(".fig-toggle button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.m === m)));
    if (this.note) { this.note.textContent = this.notes[m]; this.note.hidden = !this.notes[m]; }
    if (save) try { localStorage.setItem(KEY, m); } catch { /* ignore */ }
  }

  update(ev: Evaluation, s: State, highlight: string[] = []) {
    this.map.update(ev, s, highlight);
    this.graph.update(ev, s, highlight);
  }
}
