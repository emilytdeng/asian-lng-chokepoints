/** Directed arc with capacity. Node ids are 0..n-1. */
export type Arc = [u: number, v: number, cap: number];

export interface FlowResult {
  total: number;
  flows: number[]; // flow on each input arc, same order as `arcs`
  reach: boolean[]; // nodes reachable from s in the final residual graph (source side of the min cut)
}

export const EPS = 1e-9;

interface ResArc { v: number; c: number; f: number }

function buildResidual(n: number, arcs: Arc[]) {
  const g: number[][] = Array.from({ length: n }, () => []);
  const A: ResArc[] = [];
  const ids = arcs.map(([u, v, c]) => {
    if (!(c >= 0)) throw new Error(`arc ${u}->${v} has invalid capacity ${c}`);
    const i = A.length;
    A.push({ v, c, f: 0 }); g[u].push(i);
    A.push({ v: u, c: 0, f: 0 }); g[v].push(i + 1);
    return i;
  });
  return { g, A, ids };
}

function residualReach(n: number, g: number[][], A: ResArc[], s: number): boolean[] {
  const reach = new Array<boolean>(n).fill(false);
  reach[s] = true;
  const q = [s];
  for (let h = 0; h < q.length; h++) {
    const u = q[h];
    for (const i of g[u]) {
      const a = A[i];
      if (!reach[a.v] && a.c - a.f > EPS) { reach[a.v] = true; q.push(a.v); }
    }
  }
  return reach;
}

/**
 * Edmonds–Karp (BFS augmenting paths). Ported from the chokepoint-cut.html prototype.
 * Capacities may be Infinity as long as every s–t path has a finite arc.
 */
export function edmondsKarp(n: number, arcs: Arc[], s: number, t: number): FlowResult {
  const { g, A, ids } = buildResidual(n, arcs);
  let total = 0;
  for (;;) {
    const prev = new Array<number>(n).fill(-1);
    prev[s] = -2;
    const q = [s];
    for (let h = 0; h < q.length && prev[t] === -1; h++) {
      const u = q[h];
      for (const i of g[u]) {
        const a = A[i];
        if (prev[a.v] === -1 && a.c - a.f > EPS) { prev[a.v] = i; q.push(a.v); }
      }
    }
    if (prev[t] === -1) break;
    let b = Infinity;
    for (let v = t; v !== s; v = A[prev[v] ^ 1].v) b = Math.min(b, A[prev[v]].c - A[prev[v]].f);
    if (!isFinite(b)) throw new Error("unbounded s–t path (all arcs infinite)");
    for (let v = t; v !== s; v = A[prev[v] ^ 1].v) { A[prev[v]].f += b; A[prev[v] ^ 1].f -= b; }
    total += b;
  }
  return { total, flows: ids.map((i) => A[i].f), reach: residualReach(n, g, A, s) };
}

/** Dinic's algorithm. Used as an independent cross-check of edmondsKarp in tests. */
export function dinic(n: number, arcs: Arc[], s: number, t: number): FlowResult {
  const { g, A, ids } = buildResidual(n, arcs);
  let total = 0;
  const level = new Array<number>(n);
  const it = new Array<number>(n);
  const bfs = () => {
    level.fill(-1); level[s] = 0;
    const q = [s];
    for (let h = 0; h < q.length; h++) {
      const u = q[h];
      for (const i of g[u]) {
        const a = A[i];
        if (level[a.v] < 0 && a.c - a.f > EPS) { level[a.v] = level[u] + 1; q.push(a.v); }
      }
    }
    return level[t] >= 0;
  };
  const dfs = (u: number, pushed: number): number => {
    if (u === t) return pushed;
    for (; it[u] < g[u].length; it[u]++) {
      const i = g[u][it[u]], a = A[i];
      if (level[a.v] !== level[u] + 1 || a.c - a.f <= EPS) continue;
      const d = dfs(a.v, Math.min(pushed, a.c - a.f));
      if (d > EPS) { a.f += d; A[i ^ 1].f -= d; return d; }
    }
    return 0;
  };
  while (bfs()) {
    it.fill(0);
    for (let p = dfs(s, Infinity); p > EPS; p = dfs(s, Infinity)) {
      if (!isFinite(p)) throw new Error("unbounded s–t path (all arcs infinite)");
      total += p;
    }
  }
  return { total, flows: ids.map((i) => A[i].f), reach: residualReach(n, g, A, s) };
}

/** Arcs crossing from the source side to the sink side of the cut defined by `reach`. */
export function cutArcs(arcs: Arc[], reach: boolean[]): number[] {
  const out: number[] = [];
  arcs.forEach(([u, v], i) => { if (reach[u] && !reach[v]) out.push(i); });
  return out;
}
