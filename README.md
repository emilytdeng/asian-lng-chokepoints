# Close Hormuz: who runs out of gas first?

An interactive briefing on Asian LNG security, built as the final project for *The Geoeconomics of Asian Energy Security* (Schwarzman College, Tsinghua University, 2026).

**Question:** if an LNG chokepoint closes, how much gas can each Asian importer still physically get, how long can it hold out, and which single investment would reduce that vulnerability most?

The site models Asian LNG supply as a flow network: 13 exporters, 6 chokepoints and 8 importers (Japan, South Korea, Taiwan, China, India, Pakistan, Bangladesh, Thailand), plus China's and Thailand's pipelines, storage and fuel switching. Max-flow and min-cut run in the browser on every click.

## Run it

```bash
npm install
npm run dev        # site at http://localhost:5173
npm test           # model unit tests
npm run analysis   # writes results/findings.md and results/*.csv
```

## Layout

| Path | What it is |
|---|---|
| `data/network.json` | Every number in the model, each with value, unit, source URL, year, estimate flag and note |
| `scripts/build_network.py` | Generates `network.json`; edit values here |
| `data/ESTIMATES.md` | Every estimated value and its basis (`python3 scripts/list_estimates.py`) |
| `src/model/` | Max-flow (Edmonds–Karp, Dinic), min cut, allocation views, days of cover, N−1, investments |
| `tests/` | Textbook max-flow graphs, cut = flow, conservation, hand-computed λ, data checks |
| `scripts/analysis.ts` | Scenarios, N−1 table, investment ranking, robustness checks |
| `src/site/` | The site (Vite + TypeScript + d3-geo) |

## Main sources

GIIGNL Annual Report 2026; IEA Strait of Hormuz Factsheet (Feb 2026) and Gas Market Report Q2-2026; Energy Institute Statistical Review of World Energy 2026; Global Energy Monitor gas infrastructure tracker; Kpler; Columbia CGEP; Thailand EPPO. The full list, with every estimate and its basis, is generated on the site from `data/network.json`.

## Key assumptions

Gas is pooled and fungible; there are no prices or contracts; rates are annual and static (2025 baseline). Asian buyers can bid away 20% of non-Asian cargoes (varied 0–50%). The "market order" allocation is an assumed ranking by ability to pay. See the Method section on the site.
