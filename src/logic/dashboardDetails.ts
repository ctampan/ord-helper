import { getUnitDetails, type Bans, type Inventory, type Unit, type UnitDetails } from "./combination.ts";
import { getRecipeIndex } from "./recipeIndex.ts";

interface Snapshot {
  inventory: Inventory;
  bans: Bans;
  details: ReadonlyMap<string, UnitDetails>;
}
const snapshots = new WeakMap<Map<string, Unit>, Snapshot>();

/** Inputs are immutable React state snapshots; only the latest snapshot is retained. */
export function getDashboardDetails(
  unitsMap: Map<string, Unit>, inventory: Inventory, bans: Bans,
): ReadonlyMap<string, UnitDetails> {
  const previous = snapshots.get(unitsMap);
  if (previous?.inventory === inventory && previous.bans === bans) return previous.details;
  const affected = new Set<string>();
  const { inventoryDependents } = getRecipeIndex(unitsMap);
  const invalidate = (id: string) => {
    for (const target of inventoryDependents.get(id) || []) affected.add(target);
  };
  if (previous) {
    for (const id of new Set([...Object.keys(previous.inventory), ...Object.keys(inventory)])) {
      if ((previous.inventory[id] || 0) !== (inventory[id] || 0)) invalidate(id);
    }
    for (const id of previous.bans) if (!bans.has(id)) invalidate(id);
    for (const id of bans) if (!previous.bans.has(id)) invalidate(id);
  }
  const details = new Map(previous?.details);
  for (const id of previous ? affected : unitsMap.keys()) {
    const next = getUnitDetails(id, unitsMap, inventory, bans);
    const old = details.get(id);
    // Keep row props stable when a dependency changed without changing its status.
    if (!old || (Object.keys(next) as (keyof UnitDetails)[]).some((key) => old[key] !== next[key])) {
      details.set(id, next);
    }
  }
  snapshots.set(unitsMap, { inventory, bans, details });
  return details;
}
