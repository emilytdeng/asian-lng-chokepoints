"""
Builds data/network.json from the researched values below.

Every number in the model is defined here once, with its source URL, year, estimate flag and note,
then written to data/network.json (the file the model and site read). Edit values here and re-run:

    python3 scripts/build_network.py

Units: mtpa of LNG-equivalent (million tonnes per annum); storage inventory in Mt LNG-eq.
Gas conversions use 1 Mt LNG = 1.36 bcm (meta.bcm_per_mtpa).
"""
import json, pathlib

BCM_PER_MT = 1.36
TWH_TH_PER_MT = 14.4  # thermal energy in 1 Mt LNG (≈ 52 TBtu); used for power-switching arithmetic
LNG_T_PER_M3 = 0.45  # tonnes of LNG per m3 of tank volume (typical LNG density)

# ---------------------------------------------------------------- sources
GIIGNL = "https://www.giignl.org/annual-report/2026"  # GIIGNL Annual Report 2026. Read from the public PDF copy at GIIGNL_PDF (identical report; giignl.org gates downloads to members)
GIIGNL_PDF = "https://www.worldlngsummit.com/media/5stjrkng/2026-giignl-annual-report.pdf"
IEA_HORMUZ = "https://iea.blob.core.windows.net/assets/c8248eba-8689-46d9-ae4b-b858b59c0f1c/StraitofHormuz2026-Factsheet.pdf"
KPLER_CN = "https://www.kpler.com/blog/china-gas-supply-strength-caps-lng-demand-growth"
CGEP = "https://www.energypolicy.columbia.edu/asias-gas-shock-playbook-coal-curtailment-and-competing-for-lng/"
METI_JP = "https://www.bairdmaritime.com/shipping/tankers/gas/japans-lng-inventories-grow-no-emergency-supply-requests-reported"
EPPO_TH = "https://www.eppo.go.th/wp-content/uploads/2026/04/T03_01_01.xls"  # EPPO Table 3.1-1 Production and Import of Natural Gas (MMSCFD)
EI = "https://www.energyinst.org/statistical-review/resources-and-data-downloads"  # EI Statistical Review of World Energy 2026, data workbook EI-Stats-Review-ALL-data.xlsx
IEA_GMR = "https://iea.blob.core.windows.net/assets/8a1b93f9-d096-4dcd-b29a-77613f201ecc/GasMarketReport%2CQ2-2026.pdf"
ACP = "https://pancanal.com/en/panama-canal-announces-enhanced-long-term-slot-allocation-program-lotsa-2-0/"
IGU = "https://igu.org/press-releases/underground-gas-storage-a-critical-pillar-for-energy-security"
METI_WEEKLY = "https://www.enecho.meti.go.jp/category/electricity_and_gas/electricity_measures/pdf/denryoku_LNG_stock.pdf"
GEM_CAC = "https://www.gem.wiki/Central_Asia%E2%80%93China_Gas_Pipeline"
GEM_POS = "https://www.gem.wiki/Power_of_Siberia_Gas_Pipeline"
GEM_POS2 = "https://www.gem.wiki/Power_of_Siberia_2_Gas_Pipeline"
GEM_MYC = "https://www.gem.wiki/Sino-Myanmar_Gas_Pipeline"
PANAMA_SLOTS = "https://datamarnews.com/noticias/panama-canal-at-top-capacity-as-iran-war-triggers-more-lng-vessel-traffic-chief-says/"
EST = "estimate"  # marker for values with no direct source; basis is in the note


def D(value, unit, url, note, year=2025, est=False):
    return {"value": round(value, 3), "unit": unit, "source_url": url, "year": year, "is_estimate": est, "note": note}


# ---------------------------------------------------------------- 2025 trade matrix (GIIGNL 2026, p.18-19, "LNG quantities received in 2025")
# Rows: modeled exporter groups; columns: the 8 modeled importers. Gross deliveries in Mt (reloads excluded).
# The PDF table drops blank cells, so cells were assigned using the row subtotals (Atlantic / Middle East / Pacific)
# and the country commentary on p.10-13. Cells marked in AMBIG are small and their column is uncertain.
IMPORTERS = ["JPN", "CHN", "KOR", "IND", "TWN", "THA", "PAK", "BGD"]
TRADE = {
    "QAT":     {"CHN": 20.2, "JPN": 3.4, "KOR": 7.3, "IND": 11.6, "TWN": 7.8, "THA": 2.1, "BGD": 4.2, "PAK": 6.6},
    "UAE":     {"CHN": 0.4, "JPN": 0.8, "KOR": 0.2, "IND": 3.2, "TWN": 0.2, "THA": 0.1},
    "OMN":     {"CHN": 1.4, "JPN": 3.0, "KOR": 2.1, "IND": 2.1, "TWN": 1.1, "THA": 0.7},
    "USA":     {"CHN": 0.3, "JPN": 4.7, "KOR": 4.5, "IND": 3.0, "TWN": 2.5, "THA": 1.2, "BGD": 1.2},
    "RUS_ARC": {"CHN": 5.1},
    "AUS":     {"CHN": 21.2, "JPN": 26.2, "KOR": 15.4, "IND": 0.5, "TWN": 7.8, "THA": 2.0, "BGD": 0.2},
    "BRN":     {"CHN": 0.4, "JPN": 2.7, "KOR": 0.9, "TWN": 0.7, "THA": 0.2, "BGD": 0.1},
    "IDN":     {"CHN": 3.7, "JPN": 3.8, "KOR": 2.1, "TWN": 0.4, "THA": 0.2},
    "MYS":     {"CHN": 7.2, "JPN": 9.6, "KOR": 8.0, "TWN": 0.1, "THA": 1.6, "BGD": 0.1},
    "PNG":     {"CHN": 2.4, "JPN": 3.5, "KOR": 0.8, "TWN": 1.8, "THA": 0.2},
    "RUS_SAK": {"CHN": 2.4, "JPN": 5.7, "KOR": 1.7, "TWN": 0.1},
    # Other Atlantic (Algeria, Angola, Cameroon, Congo, Egypt, Eq. Guinea, Mauritania, Mexico, Nigeria, Norway, T&T) + Mozambique
    "OTH_ATL": {"CHN": 2.0, "JPN": 1.1, "KOR": 3.6, "IND": 4.8, "TWN": 0.6, "THA": 2.2, "BGD": 0.8, "PAK": 0.1},
    # Other Pacific (Canada, Peru)
    "OTH_PAC": {"CHN": 0.6, "JPN": 1.2, "KOR": 1.8, "TWN": 0.3},
}
AMBIG = {
    "RUS_ARC": "Arctic (Russia Europe) deliveries to JPN/KOR/IND/TWN set to 0: the PDF row omits blank cells and the 0.1-0.7 Mt Atlantic cells in those rows could belong to Russia Europe or to other Atlantic sellers; they are counted under OTH_ATL.",
    "BRN": "BGD 0.1 Mt and THA 0.2 Mt Pacific cells assigned to Brunei by column order; could be Indonesia/Malaysia.",
    "MYS": "TWN 0.1 and BGD 0.1 cells assigned by column order. GIIGNL's Malaysia commentary (KOR 13%) conflicts with the matrix (KOR 8.0 Mt) and Korea commentary (8.0 Mt); matrix used.",
}
TOTAL_EXPORTS = {  # GIIGNL 2026 p.15 table "Source of LNG imports in 2025" (Mt)
    "QAT": 80.5, "UAE": 5.1, "OMN": 11.5, "USA": 109.1, "RUS_ARC": 20.9, "AUS": 78.8, "BRN": 5.0, "IDN": 15.9,
    "MYS": 27.3, "PNG": 8.7, "RUS_SAK": 9.8, "OTH_ATL": 176.2 - 109.1 - 20.9 + 3.6, "OTH_PAC": 2.0 + 3.5,
}
NAMEPLATE = {  # GIIGNL 2026 p.26-31 liquefaction plant tables, end-2025 (MTPA)
    "QAT": 77.0, "UAE": 5.8, "OMN": 11.4, "USA": 115.4, "RUS_ARC": 26.4, "AUS": 85.8, "BRN": 7.2, "IDN": 24.9,
    "MYS": 32.0, "PNG": 8.3, "RUS_SAK": 10.8, "OTH_ATL": 236.5 - 115.4 - 26.4 + 3.4, "OTH_PAC": 14.3 + 4.45,
}
EXPORTERS = [
    ("QAT", "Qatar", [51.53, 25.9], "Ras Laffan; all exports except to Kuwait transit Hormuz (IEA)."),
    ("UAE", "UAE", [52.6, 25.15], "Das Island (ADNOC); inside the Gulf, transits Hormuz."),
    ("OMN", "Oman", [59.05, 22.6], "Qalhat, outside the Strait of Hormuz. Not in the original exporter list; added because it is 10.5 Mt of Asian supply that does NOT transit Hormuz."),
    ("USA", "United States", [-93.3, 29.7], "US Gulf Coast. Reaches Asia via Panama, the Cape, or Suez/Bab el-Mandeb."),
    ("RUS_ARC", "Russia (Arctic)", [72.0, 71.3], "Yamal LNG + Arctic LNG 2 (GIIGNL 'Russia Europe'). Reaches Asia via the Northern Sea Route (summer), Suez or the Cape."),
    ("AUS", "Australia", [116.8, -20.6], "NW Shelf, Gorgon, Wheatstone, Ichthys, Prelude and the Curtis Island projects."),
    ("BRN", "Brunei", [114.2, 4.6], "Brunei LNG, Lumut."),
    ("IDN", "Indonesia", [117.5, 0.1], "Bontang, Tangguh, DSLNG."),
    ("MYS", "Malaysia", [113.0, 3.2], "Bintulu MLNG + PFLNG floaters."),
    ("PNG", "Papua New Guinea", [147.0, -9.4], "PNG LNG, Port Moresby."),
    ("RUS_SAK", "Russia (Sakhalin)", [143.2, 46.6], "Sakhalin-2, Prigorodnoye (GIIGNL 'Russia Asia')."),
    ("OTH_ATL", "Other Atlantic & E. Africa", [3.0, 4.5], "Aggregate of Algeria, Angola, Cameroon, Congo, Egypt, Eq. Guinea, Mauritania, Mexico, Nigeria, Norway, Trinidad & Tobago and Mozambique. Needed so 2025 Asian imports balance."),
    ("OTH_PAC", "Other Pacific", [-129.0, 54.0], "Aggregate of LNG Canada and Peru LNG."),
]

# ---------------------------------------------------------------- importers
REGAS = {"JPN": 221.2, "CHN": 173.2, "KOR": 156.4, "IND": 52.7, "TWN": 23.0, "THA": 19.0, "PAK": 9.8, "BGD": 7.5}  # GIIGNL p.56-62 country totals, end-2025
TANKS_M3 = {"JPN": 19_978_200, "CHN": 27_915_000, "KOR": 14_920_000, "IND": 3_822_000, "TWN": 1_970_000, "THA": 1_140_000, "PAK": 320_900, "BGD": 276_000}  # sum of terminal tank capacity, GIIGNL regas tables
NAMES = {"JPN": "Japan", "CHN": "China", "KOR": "South Korea", "IND": "India", "TWN": "Taiwan", "THA": "Thailand", "PAK": "Pakistan", "BGD": "Bangladesh"}
LONLAT = {"JPN": [139.7, 35.5], "CHN": [121.5, 31.2], "KOR": [126.6, 37.4], "IND": [72.6, 21.7], "TWN": [120.3, 23.0], "THA": [101.0, 12.7], "PAK": [67.3, 24.8], "BGD": [91.9, 21.6]}

EI_LNG_BCM = {"CHN": 90.8, "JPN": 88.5, "KOR": 63.1, "IND": 35.4, "TWN": 31.8, "THA": 14.3, "PAK": 9.1}  # EI 2026, 'Gas - LNG imports bcm', 2025
EI_GAS_POWER_TWH = {"CHN": 337.6, "JPN": 308.8, "KOR": 173.7, "IND": 47.8, "TWN": 138.2, "THA": 123.3}  # EI 2026, electricity generation from gas, 2025
EI_CHECK = {k: f" Cross-check: EI Statistical Review 2026 reports {v} bcm of 2025 LNG imports (≈{v / BCM_PER_MT:.1f} Mt)." for k, v in EI_LNG_BCM.items()}
EI_CHECK["BGD"] = " EI 2026 does not report Bangladesh separately."

FUEL_SWITCH = {  # mtpa of gas burn that can move to coal/oil/nuclear within a crisis year (all estimates; see notes)
    # Arithmetic: GW × capacity factor × 8,760 h = TWh(e); ÷ CCGT efficiency (≈0.55) = TWh(th); ÷ 14.4 TWh(th)/Mt LNG.
    # Cross-check: IEA GMR Q2-2026 estimates gas-to-coal switching "including in China" could cut power-sector gas burn
    # by 60-65 bcm/yr across LNG import markets; the eight values below sum to ~27 Mt (~37 bcm).
    "JPN": (2.0, IEA_GMR, "IEA GMR Q2-2026: lifting operational restrictions on coal plants saves ~0.5 Mt LNG/yr; Kashiwazaki-Kariwa 6 (1.36 GW) entering commercial operation mid-April 2026 ≈ 1.36 × 0.8 × 8,760 h ≈ 9.5 TWh ≈ 1.2 Mt. Sum ~1.7, rounded to 2. Oil-fired backup excluded because oil is also short in a Hormuz closure. (Was 3.0 before source upgrade.)"),
    "KOR": (3.0, IEA_GMR, "IEA GMR Q2-2026: easing coal-generation restrictions, Kori-3 restart (~0.95 GW ≈ 0.8 Mt/yr), Saeul-3 (1.4 GW) from mid-2026 (≈0.6 Mt in-year); CGEP adds deferral of 1.5 GW of coal retirements (≈1.0 Mt at 60% load). Sum ~2.4-2.7, rounded to 3. (Was 4.0 before source upgrade.)"),
    "TWN": (1.0, CGEP, "CGEP: restart of a 1 GW retired coal plant: 1 GW × 80% ≈ 7 TWh ≈ 0.9 Mt LNG. Nuclear restarts (1.9 GW) take longer than a crisis horizon."),
    "CHN": (15.0, IEA_GMR, "IEA GMR Q2-2026: China's LNG imports fell 30% y-o-y in March 2026 and its 60-65 bcm regional switching estimate explicitly includes China; CGEP: Guangdong cut gas burn to 56-70% of its 2025 rate. Estimate ~20 bcm/yr (15 Mt) nationally."),
    "IND": (2.0, IEA_GMR, "IEA GMR Q2-2026: Natural Gas (Supply Regulation) Order 2026 cut industrial deliveries 10-30%, 'prompting fuel switching among industrial users to naphtha, fuel oil and diesel'; coal plants ordered to full output (CGEP). The curtailment itself is demand loss, not switching; switching share estimated at 2 Mt."),
    "PAK": (2.0, IEA_GMR, "IEA GMR Q2-2026: Qatar = 98% of Pakistan's LNG; gas burn in power already falling (-6% y-o-y Q4 2025). RLNG-fired power can shift partly to furnace oil and Thar coal; IEA factsheet: gas = 25% of the power mix (2024)."),
    "BGD": (1.5, IEA_GMR, "IEA GMR Q2-2026: supplies to power plants and fertiliser producers reduced from March 2026. Oil-fired peakers can replace part of gas power; IEA factsheet: gas = 50% of the power mix (2024)."),
    "THA": (1.5, IEA_GMR, "IEA GMR Q2-2026: the Energy Regulatory Commission ordered generators to raise the coal share and EGAT to restart two Mae Moh units (0.6 GW ≈ 0.6 Mt/yr); the remainder is higher loading of existing coal (BLCP, Gheco-One) and dual-fuel oil firing."),
}

PIPELINES = [
    # id, name, to, 2025 flow bcm, flow url, flow note, flow is estimate, design bcm, design url
    ("POS", "Power of Siberia", "CHN", 36.72, EI, "EI Statistical Review 2026, 'Gas trade 2025 - pipeline': Russia → China 36.7 bcm. Other estimates are higher (Kpler 39.2, TASS ~38.8); the pipe is at or near its 38 bcm design, so little headroom.", False, 38.0, GEM_POS),
    ("CAC", "Central Asia–China", "CHN", 30.29 + 4.89 + 1.49, EI, "EI 2026: Turkmenistan 30.3 + Kazakhstan 4.9 + Uzbekistan 1.5 bcm into China (Kpler implies ~36.7, consistent). Supply-limited, not pipe-limited: Lines A-C can carry 55 bcm but Central Asian producers are diverting gas home; Line D (30 bcm) is still proposed.", False, 55.0, GEM_CAC),
    ("MYC", "Myanmar–China", "CHN", 4.42, EI, "EI 2026: Myanmar → China 4.4 bcm (Kpler 4.8). Limited by Shwe field output, not by the pipe.", False, 12.0, GEM_MYC),
    ("MYT", "Myanmar–Thailand (Yadana/Zawtika)", "THA", 422 * 0.028317 * 365 / 1000, EPPO_TH,
     "EPPO Table 3.1-1, 2025 average imports: Yadana 174 + Yetagun 28 + Zawtika 220 = 422 MMSCFD (1,000 Btu/scf). EI 2026 cross-check: 4.2 bcm. Fields are depleting.", False, None, None),
    ("POS2", "Power of Siberia 2 (not built)", "CHN", 0.0, GEM_POS2, "Proposed (GEM: 2030 start). Legally binding construction agreement signed Sept 2025, but route and price unresolved. Modeled at zero so the investment ranking can test building it.", False, 50.0, GEM_POS2),
]

STORAGE = {  # inventory (Mt), note, url, est, enters, max_withdrawal override (mtpa)
    "JPN": (4.0, "National LNG inventories 'just under four million tonnes' (METI statement reported by Reuters, week to 8 Mar 2026). METI's own weekly series covers power utilities only: 2.20 Mt on 1 Mar 2026 (" + METI_WEEKLY + "). City-gas stocks make up the rest.", METI_JP, False, "in", None),
    "TWN": (0.7, "CGEP: Taiwan holds 11 days of storage, 0.7 Mt.", CGEP, False, "in", None),
    "CHN": (16.8 / BCM_PER_MT + TANKS_M3["CHN"] * LNG_T_PER_M3 * 0.5 / 1e6,
            "Underground storage 16.8 bcm at end-Feb 2026 (CGEP) = 12.4 Mt, consistent with IGU's 19.8 bcm working-gas capacity (Oct 2025); plus LNG tanks at an assumed 50% fill (27.9 M m3 × 0.45 t/m3 × 50% = 6.3 Mt).", CGEP, True, "out", 60.0),
}
for k in ["KOR", "IND", "THA", "PAK", "BGD"]:
    inv = TANKS_M3[k] * LNG_T_PER_M3 * 0.5 / 1e6
    STORAGE[k] = (inv, f"No published inventory. LNG tank capacity {TANKS_M3[k]:,} m3 (sum of terminals in GIIGNL 2026) × 0.45 t/m3 × assumed 50% average fill.", GIIGNL, True, "in", None)


# ---------------------------------------------------------------- build
def exporter(eid, name, lonlat, desc):
    deliveries = TRADE[eid]
    asia = sum(deliveries.get(i, 0) for i in IMPORTERS)
    breakdown = ", ".join(f"{i} {deliveries[i]}" for i in IMPORTERS if i in deliveries)
    amb = (" " + AMBIG[eid]) if eid in AMBIG else ""
    agg = eid.startswith("OTH")
    return {
        "id": eid, "name": name, "lonlat": lonlat, "note": desc,
        "capacity": D(NAMEPLATE[eid], "mtpa", GIIGNL, "Nameplate liquefaction capacity, end-2025 (GIIGNL liquefaction tables). Reference only; not the model's supply edge."
                      + (" Peru LNG (4.45) added from public project data." if eid == "OTH_PAC" else ""), est=agg),
        "asia_deliveries": D(asia, "mtpa", GIIGNL, f"2025 deliveries to the 8 modeled importers, GIIGNL trade matrix: {breakdown}.{amb}", est=eid in AMBIG or agg),
        "deliveries_2025": {i: deliveries[i] for i in IMPORTERS if i in deliveries},
        "total_exports": D(TOTAL_EXPORTS[eid], "mtpa", GIIGNL, "2025 total LNG exports (GIIGNL 'Source of LNG imports in 2025')."
                           + (" Includes ~5 Mt to Kuwait that does not transit Hormuz (IEA)." if eid == "QAT" else ""), est=agg),
    }


def power_share(iid):
    twh = EI_GAS_POWER_TWH.get(iid)
    if not twh:
        return ""
    burn = twh / 0.55 / TWH_TH_PER_MT
    return f" Scale check: EI 2026 gas-fired generation {twh} TWh ≈ {burn:.0f} Mt LNG-eq of power-sector gas burn, so this is ~{100 * FUEL_SWITCH[iid][0] / burn:.0f}% of it."


def importer(iid):
    lng = sum(TRADE[e].get(iid, 0) for e in TRADE)
    pipes = sum(p[3] for p in PIPELINES if p[2] == iid) / BCM_PER_MT
    inv, inote, iurl, iest, enters, wmax = STORAGE[iid]
    regas = REGAS[iid]
    regas_d = D(regas, "mtpa", GIIGNL, "Nominal send-out capacity, sum of terminals at end-2025 (GIIGNL regas tables).")
    if iid == "TWN":
        regas_d = D(23.5, "mtpa", GIIGNL, "GIIGNL nominal send-out is 23.0 MTPA, but Taiwan imported 23.5 Mt in 2025, so achievable throughput is at least 23.5. Set to 2025 imports so the baseline is not regas-constrained. Robustness range is bounded below by the published nameplate.", est=True)
        regas_d["range"] = [23.0, 23.5 * 1.25]
    w = wmax if wmax is not None else regas_d["value"]
    wnote = ("Peak underground-storage withdrawal. No national figure is published (IGU reports capacity, not deliverability); facility data such as Wen23 (39 mcm/d for 4 bcm working gas, ~1% of working gas per day) scaled to China's 19.8 bcm gives ~0.2 bcm/d. Estimate 60 mtpa ≈ 0.22 bcm/d."
             if wmax is not None else "Tank LNG is sent out through the regas vaporizers, so withdrawal is limited by regas capacity (and shares it with arriving cargoes).")
    return {
        "id": iid, "name": NAMES[iid], "lonlat": LONLAT[iid],
        "regas": regas_d,
        "import_demand": D(lng + pipes, "mtpa", GIIGNL,
                           f"2025 LNG imports by source {lng:.1f} Mt (GIIGNL trade matrix, gross of reloads)"
                           + (f" + pipeline imports {pipes:.1f} Mt-eq ({pipes * BCM_PER_MT:.1f} bcm; {'EI 2026' if iid == 'CHN' else 'EPPO'}, see pipelines)." if pipes else ".")
                           + " Demand that must be met by imports." + EI_CHECK.get(iid, ""), est=False),
        "storage": {
            "inventory": D(inv, "Mt", iurl, inote, year=2026 if iid in ("JPN", "TWN", "CHN") else 2025, est=iest),
            "max_withdrawal": D(w, "mtpa", EST if wmax else GIIGNL, wnote, est=wmax is not None),
            "enters": enters,
        },
        "fuel_switch": D(FUEL_SWITCH[iid][0], "mtpa", FUEL_SWITCH[iid][1], FUEL_SWITCH[iid][2] + power_share(iid), est=True),
    }


ROUTES = [
    ("HORMUZ", "Strait of Hormuz", "chokepoint", [56.4, 26.6], None),
    ("BAB_SUEZ", "Suez / Bab el-Mandeb", "chokepoint", [43.4, 12.6], None),
    ("CAPE", "Cape of Good Hope", "chokepoint", [18.5, -35.0], None),
    ("PANAMA", "Panama Canal", "chokepoint", [-79.7, 9.1],
     D(365 * 174_000 * LNG_T_PER_M3 / 1e6, "mtpa", PANAMA_SLOTS,
       "One LNG transit slot per day (Canal administrator quoted by DataMar, March 2026) × a 174,000 m3 carrier (~0.078 Mt). The ACP gives LNG carriers advance booking access from Jan 2026 but publishes no LNG slot count (" + ACP + "). Pre-drought peak was ~26 transits/month; 1H25 averaged ~4/month (S&P Global).", est=True)),
    ("MALACCA", "Strait of Malacca", "chokepoint", [100.8, 2.6], None),
    ("LOMBOK", "Lombok / Makassar", "chokepoint", [115.7, -8.8], None),
    ("IO", "Arabian Sea & Indian Ocean", "lane", [66.0, 12.0], None),
    ("PACIFIC", "East Asian seas & Pacific", "lane", [130.0, 22.0], None),
]
NULLCAP = "No physical throughput limit for LNG at 2025 volumes: modeled as unconstrained unless closed."


def link(a, b, cap=None):
    return {"id": f"{a}-{b}", "from": a, "to": b, "capacity": cap}


LINKS = [
    link("QAT", "HORMUZ"), link("UAE", "HORMUZ"), link("HORMUZ", "IO"),
    link("OMN", "IO"),
    link("USA", "PANAMA"), link("PANAMA", "PACIFIC"), link("USA", "CAPE"), link("USA", "BAB_SUEZ"),
    link("RUS_ARC", "CAPE"), link("RUS_ARC", "BAB_SUEZ"),
    link("RUS_ARC", "PACIFIC", D(3.0, "mtpa", GIIGNL, "Northern Sea Route, summer-only. Arctic LNG 2 delivered 1.3 Mt (all to China) in 2025, plus some Yamal summer cargoes; averaged over a year ~3 mtpa.", est=True)),
    link("OTH_ATL", "CAPE"), link("OTH_ATL", "BAB_SUEZ"),
    link("OTH_ATL", "IO", D(3.6, "mtpa", GIIGNL, "East African (Mozambique Coral South, 3.6 Mt in 2025) cargoes enter the Indian Ocean directly, without the Cape or Suez.")),
    link("CAPE", "IO"), link("BAB_SUEZ", "IO"),
    link("IO", "IND"), link("IO", "PAK"), link("IO", "BGD"),
    link("IO", "MALACCA"), link("MALACCA", "IO"), link("IO", "LOMBOK"), link("LOMBOK", "IO"),
    link("MALACCA", "PACIFIC"), link("PACIFIC", "MALACCA"), link("LOMBOK", "PACIFIC"), link("PACIFIC", "LOMBOK"),
    link("AUS", "PACIFIC"), link("AUS", "IO"),
    link("BRN", "PACIFIC"), link("IDN", "PACIFIC"), link("MYS", "PACIFIC"), link("PNG", "PACIFIC"),
    link("RUS_SAK", "PACIFIC"), link("OTH_PAC", "PACIFIC"),
    link("PACIFIC", "JPN"), link("PACIFIC", "KOR"), link("PACIFIC", "TWN"), link("PACIFIC", "CHN"), link("PACIFIC", "THA"),
    # Direct lanes added in stage 6 so voyage times are not inflated by the Arabian Sea hub (no capacity effect).
    link("CAPE", "MALACCA"), link("MALACCA", "THA"),
]

# ---------------------------------------------------------------- voyage times (stage 6, LP fleet constraint)
# One-way laden days per link at ~18 knots (~430 nm/day), chosen so that path sums match port-to-port sea distances
# (sea-distances.org style great-circle-on-water routes). Round trip = 2× (ballast return). Checks against full voyages:
#   Ras Laffan–Tokyo ≈ 6,500 nm ≈ 15 d: 0.5+1.5+6.5+4+3 = 15.5 · Ras Laffan–Dahej ≈ 1,300 nm ≈ 3 d: 0.5+1.5+1 = 3
#   Sabine Pass–Tokyo via Panama ≈ 9,200 nm ≈ 21 d: 3+15+3 = 21 · via Cape ≈ 14,500 nm ≈ 34 d: 17+13+4+3 = 37
#   Sabine Pass–Dahej via Suez ≈ 9,300 nm ≈ 22 d: 18+3+1 = 22 · NW Shelf–Tokyo ≈ 3,700 nm ≈ 9 d: 5+3 = 8
#   Bonny–Dahej via Cape ≈ 7,800 nm ≈ 18 d: 6+10+1 = 17 · Yamal–Shanghai via NSR (summer) ≈ 20 d: 18+2 = 20
SEA = "https://sea-distances.org/"
DAYS = {
    "QAT-HORMUZ": 0.5, "UAE-HORMUZ": 0.5, "HORMUZ-IO": 1.5, "OMN-IO": 0.5,
    "USA-PANAMA": 3, "PANAMA-PACIFIC": 15, "USA-CAPE": 17, "USA-BAB_SUEZ": 18,
    "RUS_ARC-CAPE": 20, "RUS_ARC-BAB_SUEZ": 16, "RUS_ARC-PACIFIC": 18,
    "OTH_ATL-CAPE": 6, "OTH_ATL-BAB_SUEZ": 6, "OTH_ATL-IO": 7,
    "CAPE-IO": 10, "CAPE-MALACCA": 13, "BAB_SUEZ-IO": 3,
    "IO-IND": 1, "IO-PAK": 1, "IO-BGD": 6,
    "IO-MALACCA": 6.5, "MALACCA-IO": 6.5, "IO-LOMBOK": 9, "LOMBOK-IO": 9,
    "MALACCA-PACIFIC": 4, "PACIFIC-MALACCA": 4, "LOMBOK-PACIFIC": 4, "PACIFIC-LOMBOK": 4, "MALACCA-THA": 2,
    "AUS-PACIFIC": 5, "AUS-IO": 7, "BRN-PACIFIC": 3, "IDN-PACIFIC": 3, "MYS-PACIFIC": 3, "PNG-PACIFIC": 3.5,
    "RUS_SAK-PACIFIC": 0.5, "OTH_PAC-PACIFIC": 10,
    "PACIFIC-JPN": 3, "PACIFIC-KOR": 2.5, "PACIFIC-TWN": 1, "PACIFIC-CHN": 2, "PACIFIC-THA": 3,
}
for l in LINKS:
    l["voyage_days"] = D(DAYS[l["id"]], "days", SEA, "One-way laden days for this leg at ~18 knots, set so that leg sums match port-to-port sea distances (see build_network.py for the checks).", est=True)
# One-way laden days to the exporter's typical non-modeled buyers: the ship-time a diverted cargo frees when it goes
# to Asia instead. Atlantic and Gulf sellers' other buyers are mostly in Europe (Qatar also Kuwait); Pacific sellers'
# other buyers are mostly nearby (Singapore, Malaysia, Vietnam, the Philippines, domestic).
OTHER_DAYS = {"QAT": 10, "UAE": 3, "OMN": 10, "USA": 12, "RUS_ARC": 6, "OTH_ATL": 7, "AUS": 5, "BRN": 3, "IDN": 3, "MYS": 3, "PNG": 6, "RUS_SAK": 3, "OTH_PAC": 12}

INVESTMENTS = [
    ("PAK_REGAS", "Pakistan: +5 mtpa regas (third FSRU)", [("importers.PAK.regas", 5.0)]),
    ("BGD_REGAS", "Bangladesh: +4.5 mtpa regas (land-based terminal)", [("importers.BGD.regas", 4.5)]),
    ("TWN_STORAGE", "Taiwan: double LNG storage (+0.7 Mt)", [("importers.TWN.storage.inventory", 0.7)]),
    ("JPN_STORAGE", "Japan: +2 Mt strategic LNG stock", [("importers.JPN.storage.inventory", 2.0)]),
    ("KOR_STORAGE", "South Korea: +1.5 Mt strategic LNG stock", [("importers.KOR.storage.inventory", 1.5)]),
    ("IND_STORAGE", "India: +1 Mt strategic LNG stock", [("importers.IND.storage.inventory", 1.0)]),
    ("TWN_COAL", "Taiwan: +1 mtpa coal reserve fleet", [("importers.TWN.fuel_switch", 1.0)]),
    ("POS_EXP", "Power of Siberia expansion (+6 bcm)", [("pipelines.POS.capacity", 6.0 / BCM_PER_MT)]),
    ("POS2", "Build Power of Siberia 2 (50 bcm)", [("pipelines.POS2.capacity", 50.0 / BCM_PER_MT)]),
    ("USA_LNG", "+10 mtpa new US LNG capacity contracted to Asia", [("exporters.USA.asia_deliveries", 10.0), ("exporters.USA.total_exports", 10.0)]),
]

# ---------------------------------------------------------------- 2026 outcomes (validation, stage 6)
GGSR = "https://www.iea.org/files/42bb838f-d20d-4815-8554-32146033967d/GlobalGasSecurityReview2026.pdf"
GMR_Q3 = "https://www.iea.org/reports/gas-market-report-q3-2026/executive-summary"
SP_TWN = "https://www.spglobal.com/energy/en/news-research/latest-news/lng/052926-taiwans-cpc-turns-to-spot-market-diversifies-lng-supply-amid-middle-east-conflict"
RFERL_PAK = "https://www.globalsecurity.org/wmd/library/news/iran/2026/05/iran-260512-rferl05.htm"
FORTUNE_PAK = "https://fortune.com/2026/05/10/qatar-first-lng-shipment-hormuz-strait-iran-war-pakistan/"
GIS_QAT = "https://www.gisreportsonline.com/r/gas-markets-hormuz-shock/"
CNBC_KPLER = "https://www.cnbc.com/2026/03/03/strait-of-hormuz-closure-which-countries-will-be-hit-the-most.html"
CHANNELS_LSEG = "https://www.channelstv.com/2026/04/23/asia-slashes-lng-imports-from-nigeria-others-as-closure-of-strait-cuts-off-cargoes/"
VALIDATION = [
    # id, importer (or region), metric, value, unit, period, url, note
    ("gulf_supply", None, "Qatar + UAE delivered LNG, change y-o-y", -63, "%", "Jan-Oct 2026", GGSR, "About -62 bcm; 'the largest ever LNG supply shock'. LNG vessel traffic through Hormuz ceased in March; 27 laden vessels exited in September vs ~95 a month in 2025."),
    ("global_supply", None, "Global LNG supply, change y-o-y", -2, "%", "Jan-Oct 2026", GGSR, "Net shortfall ~11 bcm: new non-Gulf liquefaction offset most of the Gulf loss (non-Gulf output +18% in Mar-Jun, IEA GMR Q3-2026)."),
    ("asia", None, "Asian LNG imports, change y-o-y", -1.8, "%", "Jan-Oct 2026", GGSR, "About -5.5 bcm. Europe -6% (-9 bcm); Middle East -40%."),
    ("CHN", "CHN", "LNG imports, change y-o-y", -10, "%", "Jan-Oct 2026", GGSR, "About -7 bcm: 'the largest single balancing market'. Weak demand, domestic output and storage withdrawals eased pressure; record cargo resales."),
    ("PAK", "PAK", "LNG imports, change y-o-y", -56, "%", "Jan-Oct 2026", GGSR, "About -4.5 bcm, second-largest fall in Asia; more than -70% in March-September. Gas-fired power -25%, coal-fired +35%, urea output -7%."),
    ("BGD", "BGD", "LNG imports, change y-o-y", -10, "%", "Mar-Sep 2026", GGSR, "Gas demand -7% in Q1-Q3; gas-fired power -12%, coal +25% (Mar-Aug). Spot purchases at high prices kept cargoes coming."),
    ("IND", "IND", "LNG imports, change y-o-y", 10, "%", "Jan-Sep 2026", GGSR, "About +2.6 bcm: North American imports doubled to 6.1 bcm and African to 9.4 bcm while Qatari volumes fell 72%; Oman became the main Middle East source. Demand -3% after sharp cuts in Mar-May; city gas protected."),
    ("THA", "THA", "LNG imports, change y-o-y", 30, "%", "Q1-Q3 2026", GGSR, "About +3.5 bcm, from the US and Australia; Hormuz LNG was only ~7% of Thai gas supply."),
    ("JKS", None, "Japan, Korea and Singapore LNG imports, combined change", -5, "bcm", "Jan-Oct 2026", GGSR, "Japan's gas demand -3.5% in H1 (coal and renewables up); Korea's demand +3% in H1 with more US LNG."),
    ("TWN", "TWN", "Qatari cargoes delivered to Taiwan", 0, "cargoes", "Apr-May 2026", SP_TWN, "CPC became Northeast Asia's most active spot buyer (1-2 spot cargoes a week); spot share expected to rise to 60-65% from ~30%. Storage was about 12 days when the war began."),
    ("PAK_pass", "PAK", "Qatari LNG cargoes allowed through Hormuz for Pakistan", 2, "cargoes", "May 2026", RFERL_PAK, "Iran approved Qatari cargoes bound for Port Qasim under an arrangement with Pakistan (Reuters, via RFE/RL; also Fortune). Selective passage by destination."),
    ("QAT_damage", None, "Qatari LNG export capacity knocked out by strikes on Ras Laffan", 17, "%", "from March 2026", GIS_QAT, "Iranian strikes took about 17% of Qatar's export capacity offline, potentially for several years (GIS Reports, July 2026)."),
]

SCENARIOS = {
    "baseline": {"label": "Baseline (2025)"},
    "hormuz": {"label": "Hormuz closed", "close": ["HORMUZ"]},
    "redsea": {"label": "Red Sea closed", "close": ["BAB_SUEZ"]},
    "malacca": {"label": "Malacca closed", "close": ["MALACCA"]},
    "panama": {"label": "Panama restricted", "cap_factor": {"PANAMA": 4 * 12 / 365}, "note": "4 LNG transits/month, the 1H25 drought-era average (S&P Global)."},
    "russia": {"label": "Russian LNG sanctioned", "close": ["RUS_ARC", "RUS_SAK"]},
    "hormuz_redsea": {"label": "Hormuz + Red Sea closed", "close": ["HORMUZ", "BAB_SUEZ"]},
    "hormuz_pakistan": {"label": "Hormuz open only for Pakistan-bound cargoes", "hormuz": {"destinations": ["PAK"]}, "note": "May 2026: Iran approved Qatari LNG cargoes bound for Pakistan (Reuters via RFE/RL, Fortune)."},
    "hormuz_2026": {"label": "2026 as it happened (Hormuz at 37%)", "hormuz": {"share": 0.37}, "fleet": True, "note": "IEA Global Gas Security Review 2026: Qatar and UAE delivered LNG fell 63% y-o-y in January-October 2026. Hormuz throughput set to 37% of normal Gulf supply."},
}

net = {
    "meta": {
        "title": "Asian LNG supply network, 2025 baseline",
        "baseline_year": 2025, "unit": "mtpa", "bcm_per_mtpa": BCM_PER_MT,
        "diversion": {**D(0.2, "share", EST, "Share of each exporter's non-Asian (mainly European) cargoes that Asian buyers can bid away in a crisis. No direct source; varied 0-50% in robustness checks. Chosen by the author with the user (stage 2).", est=True), "range": [0.0, 0.5]},
        "horizon_days": D(90, "days", EST, "Crisis length used to convert storage inventory into a sustainable withdrawal rate in buffered λ (inventory × 365 / 90). Varied in robustness checks.", est=True),
        "fleet_slack": D(0.10, "share", GIIGNL, "Spare LNG-carrier capacity beyond the least ship-time the 2025 Asian trade needed. GIIGNL: 899 vessels at end-2025, a record orderbook and weak 2025 freight rates (S&P Global) point to surplus ships; 10% is an estimate, varied in robustness checks.", est=True),
        "lng_t_per_m3": LNG_T_PER_M3,
        "source_notes": {
            "GIIGNL": "GIIGNL Annual Report 2026 data were read from the public PDF copy at " + GIIGNL_PDF + " (giignl.org gates downloads to members). Page references refer to that PDF.",
            "EI": "Energy Institute Statistical Review of World Energy 2026 data workbook (EI-Stats-Review-ALL-data.xlsx), sheets 'Gas trade 2025 - pipeline', 'Gas - LNG imports bcm', 'Gas inputs - Elec generation'. Used for China's pipeline imports and as a cross-check on GIIGNL LNG imports (agree within ~1% except Korea, ~5% lower in EI) and on fuel-switching scale.",
        },
        "notes": [
            "Gas is pooled and fungible: any cargo can serve any importer reachable by a path. Contracts, prices and destination clauses are not modeled.",
            "Rates are annualised (mtpa). A closure is assumed to last long enough that annual rates are meaningful; storage converts to days of cover.",
        ],
    },
    "exporters": [{**exporter(*e), "other_voyage_days": D(OTHER_DAYS[e[0]], "days", SEA, "One-way laden days to this exporter's typical non-modeled buyers (Europe for Atlantic and Gulf sellers, nearby Southeast Asian buyers for Pacific sellers): the ship-time a diverted cargo frees for the Asian trade.", est=True)} for e in EXPORTERS],
    "routes": [
        {"id": r, "name": n, "kind": k, "lonlat": ll,
         "capacity": cap, "note": NULLCAP if cap is None else ""}
        for r, n, k, ll, cap in ROUTES
    ],
    "links": LINKS,
    "pipelines": [
        {"id": pid, "name": name, "to": to,
         "capacity": D(bcm / BCM_PER_MT, "mtpa", url, f"{bcm:.1f} bcm/yr. Modeled capacity = 2025 flow. " + note, est=est),
         **({"design_capacity": D(dbcm / BCM_PER_MT, "mtpa", durl, f"{dbcm:.0f} bcm/yr design capacity (Global Energy Monitor, Global Gas Infrastructure Tracker). Reference only.")} if dbcm else {})}
        for pid, name, to, bcm, url, note, est, dbcm, durl in PIPELINES
    ],
    "importers": [importer(i) for i in IMPORTERS],
    "investments": [{"id": i, "label": l, "changes": [{"target": t, "delta": round(d, 3)} for t, d in ch]} for i, l, ch in INVESTMENTS],
    "scenarios": SCENARIOS,
    "validation_2026": [
        {"id": vid, "importer": imp, "metric": metric, "period": period,
         "value": D(val, unit, url, note, year=2026)}
        for vid, imp, metric, val, unit, period, url, note in VALIDATION
    ],
}

out = pathlib.Path(__file__).resolve().parent.parent / "data" / "network.json"
out.write_text(json.dumps(net, indent=2, ensure_ascii=False) + "\n")
print(f"wrote {out}")
for i in net["importers"]:
    print(f"  {i['id']}: demand {i['import_demand']['value']:6.1f}  regas {i['regas']['value']:6.1f}  inv {i['storage']['inventory']['value']:5.2f} Mt  fs {i['fuel_switch']['value']}")
for e in net["exporters"]:
    print(f"  {e['id']:8s} asia {e['asia_deliveries']['value']:6.1f} / exports {e['total_exports']['value']:6.1f}")
