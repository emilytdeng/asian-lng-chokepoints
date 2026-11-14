/** A sourced number. Every numeric input in data/network.json uses this shape. */
export interface Datum {
  value: number;
  unit: string;
  source_url: string;
  year: number;
  is_estimate: boolean;
  note: string;
  /** Optional plausible range for robustness checks; perturbations are clamped to it. */
  range?: [number, number];
}

export interface Exporter {
  id: string;
  name: string;
  capacity: Datum; // nameplate liquefaction capacity, mtpa (reference only; not the flow edge)
  asia_deliveries: Datum; // 2025 deliveries to the 8 modeled importers, mtpa
  total_exports: Datum; // 2025 total LNG exports, mtpa
  /** Breakdown of asia_deliveries by importer id (Mt, 2025, GIIGNL trade matrix). Same source as asia_deliveries. */
  deliveries_2025?: Record<string, number>;
  /** One-way laden voyage to this exporter's other (non-modeled) buyers, days: ship-time a diverted cargo frees. LP fleet constraint. */
  other_voyage_days?: Datum;
  lonlat?: [number, number];
}

export interface Route {
  id: string;
  name: string;
  kind: "chokepoint" | "lane";
  capacity: Datum | null; // null = not binding (limited upstream/downstream)
  lonlat?: [number, number];
}

export interface Link {
  id: string;
  from: string; // exporter id or route id
  to: string; // route id or importer id (enters importer "in" node)
  capacity: Datum | null; // null = unbounded
  voyage_days?: Datum; // used by the LP fleet constraint (stage 6)
}

export interface Pipeline {
  id: string;
  name: string;
  to: string; // importer id (enters importer "out" node, bypassing regas)
  capacity: Datum; // modeled capacity (2025 flow for supply-limited pipelines)
  design_capacity?: Datum; // nameplate (reference only)
}

export interface Importer {
  id: string;
  name: string;
  regas: Datum; // regasification capacity, mtpa (in → out split edge)
  import_demand: Datum; // gas demand that must be met by imports (LNG + pipeline), mtpa
  /**
   * inventory in Mt LNG-eq; max_withdrawal in mtpa.
   * enters "in": LNG tank stock, must pass through regas (default). "out": underground storage, after regas.
   */
  storage: { inventory: Datum; max_withdrawal: Datum; enters?: "in" | "out" };
  fuel_switch: Datum; // power-sector gas demand shiftable to coal/oil, mtpa
  lonlat?: [number, number];
}

export interface Change {
  target: string; // e.g. "importers.PAK.regas", "importers.TWN.storage.inventory", "pipelines.POS.capacity"
  delta: number;
}

export interface Investment {
  id: string;
  label: string;
  changes: Change[];
  note?: string;
}

export interface Scenario {
  label: string;
  close?: string[]; // ids of exporters, routes, links or pipelines
  cap_factor?: Record<string, number>; // multiply a route/link/exporter/pipeline capacity, e.g. Panama 0.5
  diversion?: number; // override meta.diversion for this scenario
  horizon_days?: number; // override meta.horizon_days
  /** LP only: enforce the LNG-carrier fleet constraint. */
  fleet?: boolean;
  /** LP only: selective passage through Hormuz. Gulf cargoes pass only if origin AND destination are allowed. */
  hormuz?: { origins?: string[]; destinations?: string[]; share?: number };
}

export interface Network {
  meta: {
    baseline_year: number;
    unit: string;
    bcm_per_mtpa: number;
    /** Share of each exporter's non-Asian exports that Asian buyers can bid away in a crisis (0..1). */
    diversion: Datum;
    /** Crisis length (days) used to turn storage inventory into a sustainable rate in buffered λ. */
    horizon_days: Datum;
    /** Spare LNG-carrier capacity beyond the ship-time the 2025 Asian trade needed (share). LP fleet constraint. */
    fleet_slack?: Datum;
    /** Tonnes of LNG per m³ (≈ 0.45): converts carrier volume to Mt. */
    lng_t_per_m3?: number;
    [k: string]: unknown;
  };
  exporters: Exporter[];
  routes: Route[];
  links: Link[];
  pipelines: Pipeline[];
  importers: Importer[];
  investments: Investment[];
  scenarios: Record<string, Scenario>;
  [k: string]: unknown;
}
