/**
 * Draws the min cut as one dashed line: the boundary between the part of a drawing the source can still reach and
 * the part it can't. Each point of the picture belongs to whichever side's nodes and internal edges are nearer;
 * the zero contour of (distance to sink side − distance to source side) crosses only the cut edges.
 */
type P = [number, number];
export interface CutGeom {
  w: number; h: number;
  nodes: { p: P; source: boolean }[];
  /** polylines of edges whose two ends are on the same side (cut edges are left out) */
  edges: { pts: P[]; source: boolean }[];
}

function segDist(p: P, a: P, b: P) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** SVG path data for the cut line(s); "" if one side is empty. */
export function cutPath(g: CutGeom, step = 8): string {
  if (!g.nodes.some((n) => n.source) || !g.nodes.some((n) => !n.source)) return "";
  const cols = Math.ceil(g.w / step) + 1, rows = Math.ceil(g.h / step) + 1;
  const f = new Float64Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const p: P = [i * step, j * step];
    let ds = Infinity, dt = Infinity;
    for (const n of g.nodes) { const d = Math.hypot(p[0] - n.p[0], p[1] - n.p[1]); if (n.source) ds = Math.min(ds, d); else dt = Math.min(dt, d); }
    for (const e of g.edges) for (let k = 1; k < e.pts.length; k++) {
      const d = segDist(p, e.pts[k - 1], e.pts[k]);
      if (e.source) ds = Math.min(ds, d); else dt = Math.min(dt, d);
    }
    f[j * cols + i] = dt - ds; // > 0: source side
  }
  // marching squares: one segment per crossing cell
  const key = (p: P) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
  const segs: [P, P][] = [];
  const at = (i: number, j: number) => f[j * cols + i];
  const lerp = (i0: number, j0: number, i1: number, j1: number): P => {
    const a = at(i0, j0), b = at(i1, j1), t = a / (a - b);
    return [(i0 + (i1 - i0) * t) * step, (j0 + (j1 - j0) * t) * step];
  };
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
    const c = [at(i, j) > 0, at(i + 1, j) > 0, at(i + 1, j + 1) > 0, at(i, j + 1) > 0];
    const pts: P[] = [];
    if (c[0] !== c[1]) pts.push(lerp(i, j, i + 1, j));
    if (c[1] !== c[2]) pts.push(lerp(i + 1, j, i + 1, j + 1));
    if (c[2] !== c[3]) pts.push(lerp(i + 1, j + 1, i, j + 1));
    if (c[3] !== c[0]) pts.push(lerp(i, j + 1, i, j));
    if (pts.length === 2) segs.push([pts[0], pts[1]]);
    else if (pts.length === 4) { segs.push([pts[0], pts[1]], [pts[2], pts[3]]); }
  }
  // join segments into polylines
  const ends = new Map<string, number[]>();
  segs.forEach(([a, b], s) => { for (const p of [a, b]) ends.set(key(p), [...(ends.get(key(p)) ?? []), s]); });
  const used = new Uint8Array(segs.length);
  const lines: P[][] = [];
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue;
    used[s0] = 1;
    const line: P[] = [segs[s0][0], segs[s0][1]];
    for (const dir of [1, -1]) {
      for (;;) {
        const tip = dir === 1 ? line[line.length - 1] : line[0];
        const next = (ends.get(key(tip)) ?? []).find((s) => !used[s]);
        if (next === undefined) break;
        used[next] = 1;
        const [a, b] = segs[next];
        const other = key(a) === key(tip) ? b : a;
        if (dir === 1) line.push(other); else line.unshift(other);
      }
    }
    if (line.length > 3) lines.push(line);
  }
  return lines.map((l) => smooth(l)).join(" ");
}

/** Chaikin smoothing, then a polyline path. */
function smooth(l: P[], iters = 3): string {
  let pts = l;
  for (let k = 0; k < iters; k++) {
    const out: P[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [a, b] = [pts[i], pts[i + 1]];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return "M" + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L");
}
