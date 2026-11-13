import "./style.css";
import wasmUrl from "highs/runtime?url";
import { configureHighs } from "../model/lp";
import { pct } from "./compute";
import { ChartMap } from "./map";
import { renderMethod, renderReality } from "./sources";
import { mountSandbox } from "./sandbox";

configureHighs({ locateFile: () => wasmUrl });

// ---------------------------------------------------------------- theme
const root = document.documentElement;
const themeBtn = document.getElementById("theme")!;
try { const t = localStorage.getItem("theme"); if (t) root.dataset.theme = t; } catch { /* storage unavailable */ }
themeBtn.addEventListener("click", () => {
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = dark ? "light" : "dark";
  try { localStorage.setItem("theme", root.dataset.theme); } catch { /* ignore */ }
});

// ---------------------------------------------------------------- one story, chapters in order
import { mountAlgo, mountHormuz, mountLNG, mountToy, S_2025, S_BASE, ev } from "./story";
import { mountBidding } from "./bidding";

// old links from the two-tab version
const oldHash = () => {
  if (location.hash === "#full") location.replace("#model");
  else if (location.hash === "#simple") { history.replaceState(null, "", location.pathname); scrollTo(0, 0); }
};
oldHash();
addEventListener("hashchange", oldHash);

const B = ev(S_BASE);
const hzShare = B.rows.reduce((a, r) => a + r.exposure * r.demand, 0) / B.demand;
document.getElementById("lede")!.innerHTML =
  `Asia's big economies run partly on liquefied natural gas, shipped across oceans through a handful of narrow straits. In 2025 about <b>${pct(hzShare)}</b> of the LNG these eight economies imported came through just one: the Strait of Hormuz. What happens if it closes?`;
new ChartMap(document.getElementById("hook-map")!, { interactive: false }).update(ev(S_2025), S_2025);
mountToy(document.getElementById("ch-toy")!);
mountAlgo(document.getElementById("ch-algo")!);
mountLNG(document.getElementById("ch-lng")!);
mountHormuz(document.getElementById("ch-hormuz")!);
mountBidding(document.getElementById("ch-bid")!);
mountSandbox();
renderReality(document.getElementById("reality")!);
renderMethod(document.getElementById("method")!);

const toTop = document.getElementById("to-top")!;
addEventListener("scroll", () => toTop.classList.toggle("on", scrollY > innerHeight), { passive: true });
document.getElementById("foot")!.innerHTML = `Final project, The Geoeconomics of Asian Energy Security, Schwarzman College, Tsinghua University, 2026. Model, data and code: every number is sourced in <code>data/network.json</code>.`;
