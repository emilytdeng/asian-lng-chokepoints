/** The made-up network used to teach max-flow (chapters 2–3). Pure data plus the real Edmonds–Karp trace. */
import { cutArcs, edmondsKarp, type Arc, type AugmentStep, type FlowResult } from "../model/maxflow";

export const TOY_NODES = ["S", "A", "B", "C", "D", "E", "F", "T"] as const;
const n = (x: (typeof TOY_NODES)[number]) => TOY_NODES.indexOf(x);
/**
 * Routes have different lengths, and each one Edmonds–Karp picks is the unique shortest at that moment:
 * S→A→F→T (3 pipes), then the top route S→A→C→E→T (4), then S→B→D→F→A→C→E→T (7), which undoes part of A→F.
 */
export const TOY_ARCS: Arc[] = [
  [n("S"), n("A"), 8], [n("S"), n("B"), 5], [n("A"), n("F"), 5], [n("A"), n("C"), 6], [n("B"), n("D"), 5],
  [n("D"), n("F"), 5], [n("C"), n("E"), 7], [n("E"), n("T"), 7], [n("F"), n("T"), 5],
];
export const arcName = (i: number) => `${TOY_NODES[TOY_ARCS[i][0]]}→${TOY_NODES[TOY_ARCS[i][1]]}`;

export interface ToyTrace { steps: AugmentStep[]; result: FlowResult; cut: number[] }
export function toyTrace(): ToyTrace {
  const steps: AugmentStep[] = [];
  const result = edmondsKarp(TOY_NODES.length, TOY_ARCS, n("S"), n("T"), undefined, (s) => steps.push(s));
  return { steps, result, cut: cutArcs(TOY_ARCS, result.reach) };
}
/** Flow on each arc after the first k augmenting paths. */
export function flowsAfter(steps: AugmentStep[], k: number): number[] {
  const f = new Array<number>(TOY_ARCS.length).fill(0);
  for (const st of steps.slice(0, k)) for (const { i, fwd } of st.arcs) f[i] += fwd ? st.amount : -st.amount;
  return f;
}
/** Node names along a path, e.g. ["S","B","D","A","C","T"]. */
export function pathNodes(st: AugmentStep): string[] {
  const out = ["S"];
  for (const { i, fwd } of st.arcs) out.push(TOY_NODES[fwd ? TOY_ARCS[i][1] : TOY_ARCS[i][0]]);
  return out;
}
