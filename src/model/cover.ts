import type { Importer } from "./types";

export type BufferOrder = "fuelswitch-first" | "storage-first";

export interface Cover {
  id: string;
  demand: number; // mtpa
  delivered: number; // LNG + pipeline received, mtpa
  shortfall: number; // demand - delivered
  fuelSwitch: number; // mtpa of shortfall covered by switching to coal/oil
  storageDraw: number; // mtpa withdrawn from storage
  unmetNow: number; // shortfall not covered even with buffers at full rate
  /** Days until storage is empty at the current draw. Infinity if storage isn't needed. */
  days: number;
  /** Unmet gap after storage runs dry (mtpa). */
  unmetAfterDry: number;
}

/**
 * Days of cover for one importer given the gas it can physically receive.
 * Buffers are importer-private (S → importer_out arcs), so their allocation is independent of the network:
 * the shortfall is covered by fuel switching and storage withdrawal in the given order, each up to its rate.
 */
export function coverFor(imp: Importer, delivered: number, order: BufferOrder = "fuelswitch-first"): Cover {
  const demand = imp.import_demand.value;
  const shortfall = Math.max(0, demand - delivered);
  const fsCap = imp.fuel_switch.value, stCap = imp.storage.max_withdrawal.value;
  let fuelSwitch: number, storageDraw: number;
  if (order === "fuelswitch-first") {
    fuelSwitch = Math.min(fsCap, shortfall);
    storageDraw = Math.min(stCap, shortfall - fuelSwitch);
  } else {
    storageDraw = Math.min(stCap, shortfall);
    fuelSwitch = Math.min(fsCap, shortfall - storageDraw);
  }
  const unmetNow = shortfall - fuelSwitch - storageDraw;
  const inv = imp.storage.inventory.value;
  const days = storageDraw > 1e-9 ? inv / (storageDraw / 365) : Infinity;
  const unmetAfterDry = Math.max(0, shortfall - Math.min(fsCap, shortfall));
  return { id: imp.id, demand, delivered, shortfall, fuelSwitch, storageDraw, unmetNow, days, unmetAfterDry };
}
