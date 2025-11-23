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
export function calculateConsumption(
  targetUnitId: string,
  unitsMap: Map<string, Unit>,
  inventory: Inventory,
  bans: Bans,
  count: number = 1,
  allowWisp: boolean = false
): Inventory | null {
  const simInventory = new SimulationInventory(inventory);

  // Temporarily hide target unit from inventory
  if (simInventory.get(targetUnitId) > 0) {
    // We can't directly set, but we can simulate removal of all of it
    // Actually, for this logic, we just need to ensure we don't use the target unit itself.
    // The easiest way is to treat it as 0 in the recursive function if it matches targetUnitId.
    // But since we use a class, we can just "remove" it all.
    simInventory.remove(targetUnitId, simInventory.get(targetUnitId));
  }

  const fulfill = (id: string, amount: number): boolean => {
    if (amount <= 0) return true;

    // 1. Try to take from inventory
    const available = simInventory.get(id);
    const take = Math.min(available, amount);

    if (take > 0) {
      simInventory.remove(id, take);
      amount -= take;
    }

    if (amount === 0) return true;

    const unit = unitsMap.get(id);
    if (!unit) return false;

    // 2. If allowed, try to use Wisps for Common units
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

    // 3. If still needed, try to craft
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

  return simInventory.getConsumed();
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
  // Optimization: Check if we can build 1 first.
  if (!calculateConsumption(targetUnitId, unitsMap, inventory, bans, 1, true)) {
    return 0;
  }

  // Optimization: Binary search for max buildable [0, 100]
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
  // Ignore target unit in inventory
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
    if (!unit) return amount;

    if (!unit.recipe || unit.recipe.length === 0 || bans.has(id)) {
      return amount;
    }

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
  const normalConsumption = calculateConsumption(targetUnitId, unitsMap, inventory, bans, 1, false);

  if (normalConsumption) {
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

  const availableWisps = inventory['common_wisp'] || 0;
  const missingWispable = calculateMissingWispableCost(targetUnitId, unitsMap, inventory, bans);
  const wispContribution = Math.min(missingWispable, availableWisps);

  const effectiveMissing = Math.max(0, missingCost - wispContribution);

  let progress = ((totalCost - effectiveMissing) / totalCost) * 100;
  let materialProgress = ((totalCost - missingCost) / totalCost) * 100;
  let wispProgress = (wispContribution / totalCost) * 100;

  if (status === 'orange') {
    progress = 100;
    wispProgress = 100 - materialProgress;
  }

  const isWispAssisted = wispContribution > 0 && missingCost > 0;

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
  let consumption = calculateConsumption(targetUnitId, unitsMap, inventory, new Set(), 1, false);

  if (!consumption) {
    consumption = calculateConsumption(targetUnitId, unitsMap, inventory, new Set(), 1, true);
  }

  if (!consumption) {
    const unit = unitsMap.get(targetUnitId);
    throw new Error(`Insufficient materials for ${unit?.name} ${unit?.rarity}`);
  }

  const newInventory = { ...inventory };

  for (const id in consumption) {
    newInventory[id] = (newInventory[id] || 0) - consumption[id];
  }

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

