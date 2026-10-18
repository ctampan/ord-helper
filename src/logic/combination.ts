import type { Capability } from "./capabilities";
import type { DamageProfile } from "./damage";
import { getRecipeIndex } from "./recipeIndex.ts";

export interface Unit {
  id: string;
  name: string;
  rarity: string;
  image: string;
  recipe?: { unitId: string; count: number }[];
  subGroup?: string;
  note?: string;
  capabilities?: Capability[];
  abilityDetails?: string;
  damageProfile?: DamageProfile;
}

export interface Data {
  version: string;
  units: Unit[];
  rarities: string[];
}

export type Inventory = Record<string, number>;
export type Bans = Set<string>;

export interface UnitDetails {
  status: "green" | "orange" | "red";
  buildableCount: number;
  progress: number; // Total progress 0 to 100
  materialProgress: number; // 0 to 100
  wispProgress: number; // 0 to 100
  wispCost: number;
  isWispAssisted: boolean;
}

/** Reversible inventory changes avoid copying the whole simulation per attempt. */
class SimulationInventory {
  private base: Inventory;
  private modified: Map<string, number>;
  private changes: [string, number | undefined][] = [];

  constructor(base: Inventory) {
    this.base = base;
    this.modified = new Map();
  }

  get(id: string): number {
    if (this.modified.has(id)) {
      return this.modified.get(id)!;
    }
    return this.base[id] || 0;
  }

  remove(id: string, amount: number) {
    const current = this.get(id);
    this.changes.push([id, this.modified.get(id)]);
    this.modified.set(id, current - amount);
  }

  getConsumed(): Inventory {
    const consumed: Inventory = {};
    for (const [id, val] of this.modified.entries()) {
      const original = this.base[id] || 0;
      if (val < original) {
        consumed[id] = original - val;
      }
    }
    return consumed;
  }

  snapshot(): number {
    return this.changes.length;
  }

  restore(snapshot: number) {
    while (this.changes.length > snapshot) {
      const [id, previous] = this.changes.pop()!;
      if (previous === undefined) this.modified.delete(id);
      else this.modified.set(id, previous);
    }
  }
}

/** Keep ingredient ordering and Wisp fallback identical for single/batch crafting. */
function createCraftSimulation(
  targetUnitId: string,
  unitsMap: Map<string, Unit>,
  inventory: Inventory,
  bans: Bans,
  allowWisp: boolean = false
) {
  const simInventory = new SimulationInventory(inventory);

  // We temporarily remove the target unit from the inventory simulation.
  // This ensures we calculate the cost to build a *new* unit from scratch,
  // rather than using the one we already have.
  if (simInventory.get(targetUnitId) > 0) {
    simInventory.remove(targetUnitId, simInventory.get(targetUnitId));
  }

  // Helper function to recursively check if we can fulfill the material requirements.
  const fulfill = (id: string, amount: number): boolean => {
    if (amount <= 0) return true;

    // 1. Try to use materials from inventory first.
    const available = simInventory.get(id);
    const take = Math.min(available, amount);

    if (take > 0) {
      simInventory.remove(id, take);
      amount -= take;
    }

    if (amount === 0) return true;

    const unit = unitsMap.get(id);
    if (!unit) return false;

    // 2. Try to craft from recipe BEFORE using wisps.
    // We do this greedily: try to craft as many as possible using base materials.
    if (unit.recipe && unit.recipe.length > 0 && !bans.has(id)) {
      // We need to craft 'amount' more units.
      // We try to craft them one by one. If a craft fails (e.g. missing materials and no wisps allowed/available),
      // we stop trying to craft and fall through to wisp usage (if applicable).

      let craftedCount = 0;
      for (let i = 0; i < amount; i++) {
        const snapshot = simInventory.snapshot();
        let success = true;
        for (const req of unit.recipe) {
          if (!fulfill(req.unitId, req.count)) {
            success = false;
            break;
          }
        }

        if (success) {
          craftedCount++;
        } else {
          // If we failed to craft this single unit, revert changes for this attempt
          simInventory.restore(snapshot);
          break;
        }
      }
      amount -= craftedCount;
    }

    if (amount === 0) return true;

    // 3. If allowed, use Wisps as a substitute for Common units.
    // Only use wisps if we couldn't craft enough.
    if (allowWisp && unit.rarity === "Common" && id !== "common_wisp") {
      const wispId = "common_wisp";
      const availableWisps = simInventory.get(wispId);
      const takeWisps = Math.min(availableWisps, amount);

      if (takeWisps > 0) {
        simInventory.remove(wispId, takeWisps);
        amount -= takeWisps;
      }

      if (amount === 0) return true;
    }

    return false;
  };

  return { simInventory, fulfill };
}

export function calculateConsumption(
  targetUnitId: string,
  unitsMap: Map<string, Unit>,
  inventory: Inventory,
  bans: Bans,
  count: number = 1,
  allowWisp: boolean = false,
): Inventory | null {
  const { simInventory, fulfill } = createCraftSimulation(targetUnitId, unitsMap, inventory, bans, allowWisp);
  if (!fulfill(targetUnitId, count)) {
    return null;
  }

  const consumed = simInventory.getConsumed();

  // Since we temporarily removed the target unit earlier, the simulation counts it as "consumed".
  // We remove it from the final list because we didn't actually consume the existing unit.
  if (consumed[targetUnitId]) {
    delete consumed[targetUnitId];
  }

  return consumed;
}

/**
 * Calculates how many of a target unit can be built given the current inventory and bans.
 */
export function calculateBuildable(
  targetUnitId: string,
  unitsMap: Map<string, Unit>,
  inventory: Inventory,
  bans: Bans
): number {
  // Legacy Custom permits craftable Common units. Bulk Wisp fallback can choose
  // different ingredients there, so retain its original batch-search semantics.
  if (getRecipeIndex(unitsMap).batchCraftTargets.has(targetUnitId)) {
    if (!calculateConsumption(targetUnitId, unitsMap, inventory, bans, 1, true)) return 0;
    let low = 1;
    let high = 100;
    let max = 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (mid <= max) {
        low = mid + 1;
      } else if (calculateConsumption(targetUnitId, unitsMap, inventory, bans, mid, true)) {
        max = mid;
        low = mid + 1;
      } else high = mid - 1;
    }
    return max;
  }
  // Reuse one simulation instead of replaying all earlier crafts for each search.
  // Keep the existing greedy ingredient order and the dashboard's 100-unit cap.
  const { fulfill } = createCraftSimulation(targetUnitId, unitsMap, inventory, bans, true);
  let count = 0;
  while (count < 100 && fulfill(targetUnitId, 1)) count++;
  return count;
}

/**
 * Calculates the total "base unit cost" of a unit.
 */
const totalCostCaches = new WeakMap<Map<string, Unit>, Map<string, number>>();

export function calculateTotalCost(
  unitId: string,
  unitsMap: Map<string, Unit>
): number {
  let totalCostCache = totalCostCaches.get(unitsMap);
  if (!totalCostCache) {
    totalCostCache = new Map();
    totalCostCaches.set(unitsMap, totalCostCache);
  }
  if (totalCostCache.has(unitId)) {
    return totalCostCache.get(unitId)!;
  }

  const unit = unitsMap.get(unitId);
  if (!unit) return 0;
  if (!unit.recipe || unit.recipe.length === 0) {
    totalCostCache.set(unitId, 1);
    return 1;
  }

  let total = 0;
  for (const req of unit.recipe) {
    total += calculateTotalCost(req.unitId, unitsMap) * req.count;
  }

  totalCostCache.set(unitId, total);
  return total;
}

/** Missing totals share the same inventory traversal and ingredient ordering. */
function calculateMissingCosts(
  unitId: string, unitsMap: Map<string, Unit>, inventory: Inventory, bans: Bans,
): { missingCost: number; missingWispable: number } {
  const simInventory = new SimulationInventory(inventory);
  if (simInventory.get(unitId) > 0) simInventory.remove(unitId, simInventory.get(unitId));
  let missingCost = 0;
  let missingWispable = 0;
  const visit = (id: string, amount: number) => {
    if (amount <= 0) return;
    const take = Math.min(simInventory.get(id), amount);
    if (take > 0) {
      simInventory.remove(id, take);
      amount -= take;
    }
    if (amount === 0) return;
    const unit = unitsMap.get(id);
    if (!unit?.recipe?.length || bans.has(id)) {
      missingCost += amount;
      if (unit?.rarity === "Common" && id !== "common_wisp") missingWispable += amount;
      return;
    }
    for (const req of unit.recipe) visit(req.unitId, req.count * amount);
  };
  visit(unitId, 1);
  return { missingCost, missingWispable };
}

export function calculateMissingCost(
  unitId: string, unitsMap: Map<string, Unit>, inventory: Inventory, bans: Bans,
): number {
  return calculateMissingCosts(unitId, unitsMap, inventory, bans).missingCost;
}

export function calculateMissingWispableCost(
  unitId: string, unitsMap: Map<string, Unit>, inventory: Inventory, bans: Bans,
): number {
  return calculateMissingCosts(unitId, unitsMap, inventory, bans).missingWispable;
}

/**
 * Gets comprehensive details for a unit.
 */
export function getUnitDetails(
  targetUnitId: string,
  unitsMap: Map<string, Unit>,
  inventory: Inventory,
  bans: Bans
): UnitDetails {
  // 1. Determine Status (Green/Orange/Red)
  // Check if we can build it normally first.
  const normalConsumption = calculateConsumption(
    targetUnitId,
    unitsMap,
    inventory,
    bans,
    1,
    false
  );

  if (normalConsumption) {
    // If we can build it normally, we're done.
    const buildableCount = calculateBuildable(
      targetUnitId,
      unitsMap,
      inventory,
      bans
    );
    return {
      status: "green",
      buildableCount,
      progress: 100,
      materialProgress: 100,
      wispProgress: 0,
      wispCost: 0,
      isWispAssisted: false,
    };
  }

  // If normal build fails, check if we can build with Wisps.
  let status: "green" | "orange" | "red" = "red";
  let wispCost = 0;
  const wispConsumption = calculateConsumption(
    targetUnitId,
    unitsMap,
    inventory,
    bans,
    1,
    true
  );

  if (wispConsumption) {
    status = "orange";
    wispCost = wispConsumption["common_wisp"] || 0;
  }

  // 2. Calculate Progress
  const totalCost = calculateTotalCost(targetUnitId, unitsMap);

  if (totalCost === 0) {
    return {
      status,
      buildableCount: 0,
      progress: 0,
      materialProgress: 0,
      wispProgress: 0,
      wispCost,
      isWispAssisted: false,
    };
  }

  const { missingCost, missingWispable } = calculateMissingCosts(
    targetUnitId, unitsMap, inventory, bans,
  );
  const availableWisps = inventory["common_wisp"] || 0;
  const wispContribution = Math.min(missingWispable, availableWisps);

  const effectiveMissing = Math.max(0, missingCost - wispContribution);

  // Calculate percentages.
  let progress = ((totalCost - effectiveMissing) / totalCost) * 100;
  const materialProgress = ((totalCost - missingCost) / totalCost) * 100;
  let wispProgress = (wispContribution / totalCost) * 100;

  if (status === "orange") {
    progress = 100;
    // materialProgress remains the same to show actual material ownership.
    wispProgress = 100 - materialProgress;
  }

  const isWispAssisted = wispContribution > 0 && missingCost > 0;

  // If status is orange, we need to calculate how many we can build with wisps.
  let buildableCount = 0;
  if (status === "orange") {
    buildableCount = calculateBuildable(
      targetUnitId,
      unitsMap,
      inventory,
      bans
    );
  }

  return {
    status,
    buildableCount,
    progress: Math.min(100, Math.max(0, progress)),
    materialProgress: Math.min(100, Math.max(0, materialProgress)),
    wispProgress: Math.min(100, Math.max(0, wispProgress)),
    wispCost,
    isWispAssisted,
  };
}

/**
 * Consumes materials for a unit and returns the new inventory.
 */
export function consumeMaterials(
  targetUnitId: string,
  unitsMap: Map<string, Unit>,
  inventory: Inventory
): Inventory {
  // Try normal consumption first.
  let consumption = calculateConsumption(
    targetUnitId,
    unitsMap,
    inventory,
    new Set(),
    1,
    false
  );

  // If that fails, try with wisps.
  if (!consumption) {
    consumption = calculateConsumption(
      targetUnitId,
      unitsMap,
      inventory,
      new Set(),
      1,
      true
    );
  }

  if (!consumption) {
    const unit = unitsMap.get(targetUnitId);
    throw new Error(`Insufficient materials for ${unit?.name} ${unit?.rarity}`);
  }

  const newInventory = { ...inventory };

  // Remove consumed materials.
  for (const id in consumption) {
    newInventory[id] = (newInventory[id] || 0) - consumption[id];
  }

  // Add the new unit.
  newInventory[targetUnitId] = (newInventory[targetUnitId] || 0) + 1;

  return newInventory;
}

/**
 * Calculates the detailed breakdown of missing base units.
 */
export function calculateMissingBaseUnits(
  unitId: string,
  unitsMap: Map<string, Unit>,
  inventory: Inventory,
  bans: Bans
): Record<string, number> {
  const missingUnits: Record<string, number> = {};
  const simInventory = new SimulationInventory(inventory);

  if (simInventory.get(unitId) > 0) {
    simInventory.remove(unitId, simInventory.get(unitId));
  }

  const calculateRecursive = (id: string, amount: number): void => {
    if (amount <= 0) return;

    const available = simInventory.get(id);
    const take = Math.min(available, amount);
    if (take > 0) {
      simInventory.remove(id, take);
      amount -= take;
    }

    if (amount === 0) return;

    const unit = unitsMap.get(id);
    if (!unit) return;

    if (!unit.recipe || unit.recipe.length === 0 || bans.has(id)) {
      missingUnits[id] = (missingUnits[id] || 0) + amount;
      return;
    }

    for (const req of unit.recipe) {
      calculateRecursive(req.unitId, req.count * amount);
    }
  };

  calculateRecursive(unitId, 1);
  return missingUnits;
}

/**
 * Calculates the set of "effectively banned" units.
 * A unit is effectively banned if it is explicitly banned OR if any of its required ingredients are effectively banned.
 */
export function getEffectiveBans(
  unitsMap: Map<string, Unit>,
  explicitBans: Bans
): Set<string> {
  const effectiveBans = new Set<string>();
  const memo = new Map<string, boolean>();

  const isBanned = (unitId: string, visited = new Set<string>()): boolean => {
    if (memo.has(unitId)) return memo.get(unitId)!;
    if (visited.has(unitId)) return false; // Cycle detection (shouldn't happen in DAG)
    visited.add(unitId);

    if (explicitBans.has(unitId)) {
      memo.set(unitId, true);
      effectiveBans.add(unitId);
      return true;
    }

    const unit = unitsMap.get(unitId);
    if (!unit || !unit.recipe || unit.recipe.length === 0) {
      memo.set(unitId, false);
      return false;
    }

    // Check dependencies
    let banned = false;
    for (const req of unit.recipe) {
      if (isBanned(req.unitId, visited)) {
        banned = true;
        break;
      }
    }

    memo.set(unitId, banned);
    if (banned) effectiveBans.add(unitId);
    return banned;
  };

  // Iterate over all units to populate the set
  for (const unitId of unitsMap.keys()) {
    isBanned(unitId);
  }

  return effectiveBans;
}
