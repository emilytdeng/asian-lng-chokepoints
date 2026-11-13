/** The plain-language "what's holding supply back" sentence. */
import type { CutEdge } from "../model/mincut";
import { NET, name, type Evaluation } from "./compute";

const isRoute = (c: CutEdge) => c.meta.type === "route" || c.meta.type === "link";
const isSupply = (c: CutEdge) => c.meta.type === "supply" || c.meta.type === "divert" || c.meta.type === "pipeline";
const routeName = (c: CutEdge) => (c.meta.type === "link" ? `the ${name(c.meta.from)}–${name(c.meta.to)} lane` : name(c.meta.id));
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** One plain sentence about what limits supply, plus the cut items in plain words. */
export function holdingBack(ev: Evaluation): { sentence: string; items: string[] } {
  const gap = ev.demand - ev.supply;
  const cut = ev.map.cut.filter((c) => c.meta.type !== "demand");
  const closedRoutes = [...new Set(cut.filter((c) => isRoute(c) && (c.closed || c.capacity < 1e-9)).map(routeName))];
  const fullRoutes = [...new Set(cut.filter((c) => isRoute(c) && !c.closed && c.capacity > 1e-9).map(routeName))];
  const supplies = cut.filter(isSupply);
  const items: string[] = [];
  const seen = new Set<string>();
  for (const c of [...cut].sort((a, b) => Number(b.closed) - Number(a.closed))) {
    const m = c.meta;
    let t: string;
    if (m.type === "supply" || m.type === "divert") t = `${name(m.id)}: selling all it can`;
    else if (m.type === "pipeline") t = `${name(m.id)}: pipeline full`;
    else if (isRoute(c)) t = `${routeName(c)}: ${c.closed || c.capacity < 1e-9 ? "closed" : "full"}`;
    else if (m.type === "regas") t = `${name(m.id)}: import terminals are full`;
    else if (m.type === "storage" || m.type === "fuelswitch") t = `${name(m.id)}: backup supplies at their limit`;
    else continue;
    if (!seen.has(t)) { seen.add(t); items.push(t.charAt(0).toUpperCase() + t.slice(1)); }
  }
  let sentence: string;
  if (gap < 0.05) sentence = "Nothing is short: ships simply take another route.";
  else if (fullRoutes.length) sentence = `The bottleneck is a sea lane: ${list(fullRoutes)} ${fullRoutes.length > 1 ? "are" : "is"} full. Gas exists, but it can't get through.`;
  else if (closedRoutes.length && !supplies.length) sentence = `Closing ${list(closedRoutes)} cuts off gas that has no other way out.`;
  else sentence = "Every exporter that can still reach Asia is already selling all it can. Reopening other sea lanes wouldn't help; only more gas would.";
  return { sentence, items };
}
