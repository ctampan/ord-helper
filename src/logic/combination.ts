export interface Unit {
  id: string;
  name: string;
  rarity: string;
  image: string;
  recipe?: { unitId: string; count: number }[];
  subGroup?: string;
  note?: string;
}

export interface Data {
  version: string;
  units: Unit[];
  rarities: string[];
}

export type Inventory = Record<string, number>;
export type Bans = Set<string>;

export interface UnitDetails {
  status: 'green' | 'orange' | 'red';
  buildableCount: number;
  progress: number; // Total progress 0 to 100
  materialProgress: number; // 0 to 100
  wispProgress: number; // 0 to 100
  wispCost: number;
  isWispAssisted: boolean;
}

/**
 * Calculates the materials needed to build a unit, prioritizing existing inventory.
 * Returns a map of unit IDs to the count that needs to be consumed.
 * Returns null if the unit cannot be built.
 */
class SimulationInventory {
  private base: Inventory;
  private modified: Map<string, number>;

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
}

/**
 * Calculates the materials needed to build a unit, prioritizing existing inventory.
 * Returns a map of unit IDs to the count that needs to be consumed.
 * Returns null if the unit cannot be built.
 */
/**
 * Calculates the materials needed to build a unit, prioritizing existing inventory.
 * Returns a map of unit IDs to the count that needs to be consumed.
 * Returns null if the unit cannot be built.
 */
/**
 * Calculates the materials needed to build a unit, prioritizing existing inventory.
 * Returns a map of unit IDs to the count that needs to be consumed.
 * Returns null if the unit cannot be built.
 */
export function calculateConsumption(
  targetUnitId: string,
  unitsMap: Map<string, Unit>,
  inventory: Inventory,
  bans: Bans,
  count: number = 1,
  allowWisp: boolean = false
): Inventory | null {
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

    // 2. If allowed, use Wisps as a substitute for Common units.
    if (allowWisp && unit.rarity === 'Common' && id !== 'common_wisp') {
      const wispId = 'common_wisp';
      const availableWisps = simInventory.get(wispId);
      const takeWisps = Math.min(availableWisps, amount);

      if (takeWisps > 0) {
        simInventory.remove(wispId, takeWisps);
        amount -= takeWisps;
      }

      if (amount === 0) return true;
    }

    // 3. If still missing materials, try to craft them from their recipes.
    // If the unit is banned, we cannot craft it.
    if (bans.has(id)) return false;
    if (!unit.recipe || unit.recipe.length === 0) return false;

    for (const req of unit.recipe) {
      if (!fulfill(req.unitId, req.count * amount)) {
        return false;
      }
    }
    return true;
  };

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
  // Optimization: Check if we can build at least one before doing more work.
  if (!calculateConsumption(targetUnitId, unitsMap, inventory, bans, 1, true)) {
    return 0;
  }

  // Use binary search to efficiently find the maximum buildable amount.
  let low = 1;
  let high = 100;
  let max = 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (mid <= max) {
      low = mid + 1;
      continue;
    }

    const consumption = calculateConsumption(targetUnitId, unitsMap, inventory, bans, mid, true);
    if (consumption) {
      max = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return max;
}

/**
 * Calculates the total "base unit cost" of a unit.
 */
const totalCostCache = new Map<string, number>();

export function calculateTotalCost(
  unitId: string,
  unitsMap: Map<string, Unit>
): number {
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

/**
 * Calculates the "missing cost" - how many base units are still needed.
 */
export function calculateMissingCost(
  unitId: string,
  unitsMap: Map<string, Unit>,
  inventory: Inventory,
  bans: Bans
): number {
  const simInventory = new SimulationInventory(inventory);
  // Ignore the target unit in inventory so we calculate the cost for a new one.
  if (simInventory.get(unitId) > 0) {
    simInventory.remove(unitId, simInventory.get(unitId));
  }

  const calculateRecursive = (id: string, amount: number): number => {
    if (amount <= 0) return 0;

    // Use available inventory first.
    const available = simInventory.get(id);
    const take = Math.min(available, amount);
    if (take > 0) {
      simInventory.remove(id, take);
      amount -= take;
    }

    if (amount === 0) return 0;

    const unit = unitsMap.get(id);
    if (!unit) return amount;

    // If we can't craft it (no recipe or banned), the remaining amount is missing.
    if (!unit.recipe || unit.recipe.length === 0 || bans.has(id)) {
      return amount;
    }

    // Otherwise, calculate missing materials for the recipe.
    let missing = 0;
    for (const req of unit.recipe) {
      missing += calculateRecursive(req.unitId, req.count * amount);
    }
    return missing;
  };

  return calculateRecursive(unitId, 1);
}

/**
 * Calculates the "missing wispable cost" - how many missing base units are Common.
 */
export function calculateMissingWispableCost(
  unitId: string,
  unitsMap: Map<string, Unit>,
  inventory: Inventory,
  bans: Bans
): number {
  const simInventory = new SimulationInventory(inventory);
  if (simInventory.get(unitId) > 0) {
    simInventory.remove(unitId, simInventory.get(unitId));
  }

  const calculateRecursive = (id: string, amount: number): number => {
    if (amount <= 0) return 0;

    const available = simInventory.get(id);
    const take = Math.min(available, amount);
    if (take > 0) {
      simInventory.remove(id, take);
      amount -= take;
    }

    if (amount === 0) return 0;

    const unit = unitsMap.get(id);
    if (!unit) return 0;

    if (!unit.recipe || unit.recipe.length === 0 || bans.has(id)) {
      // Count as wispable only if it's a Common unit (and not a wisp itself).
      return (unit.rarity === 'Common' && id !== 'common_wisp') ? amount : 0;
    }

    let missingWispable = 0;
    for (const req of unit.recipe) {
      missingWispable += calculateRecursive(req.unitId, req.count * amount);
    }
    return missingWispable;
  };

  return calculateRecursive(unitId, 1);
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
  const normalConsumption = calculateConsumption(targetUnitId, unitsMap, inventory, bans, 1, false);

  if (normalConsumption) {
    // If we can build it normally, we're done.
    const buildableCount = calculateBuildable(targetUnitId, unitsMap, inventory, bans);
    return {
      status: 'green',
      buildableCount,
      progress: 100,
      materialProgress: 100,
      wispProgress: 0,
      wispCost: 0,
      isWispAssisted: false
    };
  }

  // If normal build fails, check if we can build with Wisps.
  let status: 'green' | 'orange' | 'red' = 'red';
  let wispCost = 0;
  const wispConsumption = calculateConsumption(targetUnitId, unitsMap, inventory, bans, 1, true);

  if (wispConsumption) {
    status = 'orange';
    wispCost = wispConsumption['common_wisp'] || 0;
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
      isWispAssisted: false
    };
  }

  const missingCost = calculateMissingCost(targetUnitId, unitsMap, inventory, bans);

  // Calculate wisp contribution.
  const availableWisps = inventory['common_wisp'] || 0;
  const missingWispable = calculateMissingWispableCost(targetUnitId, unitsMap, inventory, bans);
  const wispContribution = Math.min(missingWispable, availableWisps);

  const effectiveMissing = Math.max(0, missingCost - wispContribution);

  // Calculate percentages.
  let progress = ((totalCost - effectiveMissing) / totalCost) * 100;
  let materialProgress = ((totalCost - missingCost) / totalCost) * 100;
  let wispProgress = (wispContribution / totalCost) * 100;

  if (status === 'orange') {
    progress = 100;
    // materialProgress remains the same to show actual material ownership.
    wispProgress = 100 - materialProgress;
  }

  const isWispAssisted = wispContribution > 0 && missingCost > 0;

  // If status is orange, we need to calculate how many we can build with wisps.
  let buildableCount = 0;
  if (status === 'orange') {
    buildableCount = calculateBuildable(targetUnitId, unitsMap, inventory, bans);
  }

  return {
    status,
    buildableCount,
    progress: Math.min(100, Math.max(0, progress)),
    materialProgress: Math.min(100, Math.max(0, materialProgress)),
    wispProgress: Math.min(100, Math.max(0, wispProgress)),
    wispCost,
    isWispAssisted
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
  let consumption = calculateConsumption(targetUnitId, unitsMap, inventory, new Set(), 1, false);

  // If that fails, try with wisps.
  if (!consumption) {
    consumption = calculateConsumption(targetUnitId, unitsMap, inventory, new Set(), 1, true);
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

