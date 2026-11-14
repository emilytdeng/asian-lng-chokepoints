/** Step-by-step replay of the max-flow algorithm: each step is one augmenting path. */
import type { Solution } from "../model/allocation";
import type { ArcMeta } from "../model/graph";
import type { AugmentStep } from "../model/maxflow";
import { fmt, name, type Evaluation } from "./compute";

export interface Frame { arcFlow: Record<string, number>; delivered: Record<string, number>; total: number; path: Set<string> }

const key = (m: ArcMeta) => `${m.type}:${m.id}`;
const node = (k: string) => (k === "__S" ? "Source" : k === "__T" ? "Sink" : name(k.replace(/:(in|out)$/, "")));

/** What limited a step, in words. */
function limitText(m: ArcMeta, amount: number) {
  switch (m.type) {
    case "supply": return `${name(m.id)} has only ${fmt(amount)} mtpa left of its 2025 sales to Asia`;
    case "divert": return `${name(m.id)} has only ${fmt(amount)} mtpa left of the cargoes it could pull away from Europe and others`;
    case "demand": return `${name(m.id)} needs only ${fmt(amount)} mtpa more`;
    case "pipeline": return `the ${name(m.id)} pipeline has only ${fmt(amount)} mtpa of capacity left`;
    default: return `this route has only ${fmt(amount)} mtpa of capacity left`;
  }
}

export class Stepper {
  private frames: Frame[] = [];
  private captions: string[] = [];
  private k = 0;
  private timer: number | undefined;
  private range: HTMLInputElement;
  private play: HTMLButtonElement;
  private count: HTMLElement;
  private cap: HTMLElement;

  constructor(host: HTMLElement, private show: (f: Frame | null, final: boolean) => void) {
    host.classList.add("stepper");
    host.innerHTML = `
      <p class="lbl">Watch the algorithm</p>
      <div class="st-row">
        <button type="button" class="st-play"></button>
        <button type="button" class="st-btn st-prev" aria-label="Previous step">‹</button>
        <input type="range" class="st-range" min="0" value="0" aria-label="Algorithm step" />
        <button type="button" class="st-btn st-next" aria-label="Next step">›</button>
        <span class="st-count"></span>
      </div>
      <p class="st-cap" aria-live="polite"></p>`;
    this.range = host.querySelector(".st-range")!;
    this.play = host.querySelector(".st-play")!;
    this.count = host.querySelector(".st-count")!;
    this.cap = host.querySelector(".st-cap")!;
    this.range.oninput = () => { this.stop(); this.go(Number(this.range.value)); };
    host.querySelector<HTMLButtonElement>(".st-prev")!.onclick = () => { this.stop(); this.go(this.k - 1); };
    host.querySelector<HTMLButtonElement>(".st-next")!.onclick = () => { this.stop(); this.go(this.k + 1); };
    this.play.onclick = () => (this.timer ? this.stop() : this.start());
  }

  get last() { return this.frames.length - 1; }
  get atEnd() { return this.k >= this.last; }

  /** New scenario: rebuild the frames and jump to the finished result. */
  load(sol: Solution, steps: AugmentStep[], ev: Evaluation) {
    this.stop();
    const g = sol.graph;
    const f = new Array<number>(g.arcs.length).fill(0);
    const snapshot = (path: Set<string>): Frame => {
      const arcFlow: Record<string, number> = {}, delivered: Record<string, number> = {};
      let total = 0;
      g.meta.forEach((m, i) => {
        arcFlow[key(m)] = (arcFlow[key(m)] ?? 0) + f[i];
        if (m.type === "demand") { delivered[m.id] = f[i]; total += f[i]; }
      });
      return { arcFlow, delivered, total, path };
    };
    this.frames = [snapshot(new Set())];
    this.captions = [`Start: nothing flows yet. The algorithm (Edmonds–Karp) repeatedly looks for the shortest route from the source to the sink that still has spare capacity, then pushes as much gas along it as the tightest link allows. First it uses only each exporter's 2025 sales to Asia.`];
    let phase = 1, total = 0;
    steps.forEach((st, n) => {
      // what limited this step: the arc whose spare room equalled the amount pushed
      let limit: ArcMeta | undefined;
      for (const { i, fwd } of st.arcs) {
        const room = fwd ? g.arcs[i][2] - f[i] : f[i];
        if (!limit && Math.abs(room - st.amount) < 1e-9) limit = g.meta[i];
      }
      const names: string[] = ["__S"];
      for (const { i, fwd } of st.arcs) {
        const [u, v] = g.arcs[i];
        const to = g.nodeName[fwd ? v : u];
        if (node(to) !== node(names[names.length - 1])) names.push(to);
        f[i] += fwd ? st.amount : -st.amount;
      }
      total += st.amount;
      const back = st.arcs.filter((a) => !a.fwd).map((a) => g.meta[a.i]);
      const round = st.phase !== phase ? `<b>Round 2.</b> The 2025 sales are used up as far as they can go, so exporters now also offer cargoes pulled away from Europe and other buyers. ` : "";
      phase = st.phase;
      this.captions.push(`${round}<b>Path ${n + 1}:</b> ${names.map(node).join(" → ")}. It can carry <b>${fmt(st.amount)} mtpa</b>, because ${limit ? limitText(limit, st.amount) : "that is the tightest link"}.` +
        (back.length ? ` It also sends gas back along ${back.map((m) => ("from" in m ? `${name(m.from)} → ${name(m.to)}` : name(m.id))).join(", ")}, rerouting an earlier path.` : "") +
        ` Delivered so far: <b>${fmt(total)} mtpa</b>.`);
      this.frames.push(snapshot(new Set(st.arcs.map((a) => key(g.meta[a.i])))));
    });
    const cut = ev.map.cut;
    const uniq = (xs: string[]) => [...new Set(xs)];
    const shut = uniq(cut.filter((c) => c.closed).map((c) => name(c.meta.id)));
    const sellers = uniq(cut.filter((c) => !c.closed && (c.meta.type === "supply" || c.meta.type === "divert")).map((c) => name(c.meta.id)));
    const pipes = uniq(cut.filter((c) => !c.closed && c.meta.type === "pipeline").map((c) => name(c.meta.id)));
    const met = uniq(cut.filter((c) => c.meta.type === "demand").map((c) => name(c.meta.id)));
    const parts = [
      shut.length ? `${shut.join(", ")} closed` : "",
      sellers.length ? `${sellers.length === 1 ? "one exporter" : `${sellers.length} exporters`} selling all they can (${sellers.join(", ")})` : "",
      pipes.length ? `${pipes.length === 1 ? "a pipeline" : `${pipes.length} pipelines`} full` : "",
      met.length ? `${met.join(", ")} already getting all ${met.length === 1 ? "it needs" : "they need"}` : "",
    ].filter(Boolean);
    this.captions[this.last] += ` <b>Done:</b> no route with spare capacity is left. The red dotted lines are the <b>minimum cut</b>, the limits that stop more gas getting through: ${parts.join("; ")}. ` +
      `Their capacities add up to ${fmt(ev.map.total)} mtpa, exactly the gas delivered. That match is the proof that no better answer exists.`;
    this.range.max = String(this.last);
    this.go(this.last, true);
  }

  private go(k: number, quiet = false) {
    this.k = Math.max(0, Math.min(this.last, k));
    this.range.value = String(this.k);
    const done = this.k === this.last;
    this.count.textContent = done ? `Finished · ${this.last} paths` : this.k === 0 ? `Start · 0 of ${this.last}` : `Path ${this.k} of ${this.last}`;
    this.cap.innerHTML = quiet ? `Press play to watch max-flow find the answer one path at a time, or drag the slider to step through it (${this.last} paths for this scenario).` : this.captions[this.k];
    this.play.textContent = this.timer ? "❚❚ Pause" : done ? "▶ Watch it solve" : "▶ Play";
    this.show(done ? null : this.frames[this.k], done);
  }

  /** Redraw the current frame (e.g. after the sharing rule changed). */
  redraw() { this.show(this.k === this.last ? null : this.frames[this.k], this.k === this.last); }

  private start() {
    if (this.k >= this.last) this.go(0);
    this.timer = window.setInterval(() => {
      if (this.k >= this.last) { this.stop(); return; }
      this.go(this.k + 1);
    }, 1100);
    this.play.textContent = "❚❚ Pause";
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = undefined; }
    this.play.textContent = this.k >= this.last ? "▶ Watch it solve" : "▶ Play";
  }
}

