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
export function calculateConsumption(
  targetUnitId: string,
  unitsMap: Map<string, Unit>,
  inventory: Inventory,
  bans: Bans,
  count: number = 1,
  allowWisp: boolean = false
): Inventory | null {
  const toConsume: Inventory = {};
  // Clone inventory to track usage during calculation
  const tempInventory = { ...inventory };

  // When checking if we can build/craft a unit, we should NOT use the unit itself from inventory.
  // We want to know if we can create *new* ones from materials.
  // So we temporarily hide the target unit from the available inventory.
  if (tempInventory[targetUnitId]) {
    tempInventory[targetUnitId] = 0;
  }

  // Helper to recursively fulfill requirements
  const fulfill = (id: string, amount: number): boolean => {
    if (amount <= 0) return true;

    // 1. Try to take from inventory
    const available = tempInventory[id] || 0;
    const take = Math.min(available, amount);

    if (take > 0) {
      tempInventory[id] -= take;
      toConsume[id] = (toConsume[id] || 0) + take;
      amount -= take;
    }

    if (amount === 0) return true;

    const unit = unitsMap.get(id);
    if (!unit) return false;

    // 2. If allowed, try to use Wisps for Common units
    if (allowWisp && unit.rarity === 'Common' && id !== 'common_wisp') {
      const wispId = 'common_wisp';
      const availableWisps = tempInventory[wispId] || 0;
      const takeWisps = Math.min(availableWisps, amount);

      if (takeWisps > 0) {
        tempInventory[wispId] -= takeWisps;
        toConsume[wispId] = (toConsume[wispId] || 0) + takeWisps;
        amount -= takeWisps;
      }

      if (amount === 0) return true;
    }

    // 3. If still needed, try to craft
    // If unit is banned, we cannot craft it (unless we already had it in inventory, which step 1 covered)
    if (bans.has(id)) return false;

    if (!unit.recipe || unit.recipe.length === 0) return false; // Cannot craft base units

    // Check if we can craft the remaining amount
    for (const req of unit.recipe) {
      if (!fulfill(req.unitId, req.count * amount)) {
        return false;
      }
    }
    return true;
  };

  // Start the process
  if (!fulfill(targetUnitId, count)) {
    return null;
  }

  return toConsume;
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
  // Most units will be 0, so this avoids the binary search overhead for them.
  if (!calculateConsumption(targetUnitId, unitsMap, inventory, bans, 1, true)) {
    return 0;
  }

  // Optimization: Binary search for max buildable [0, 100]
  let low = 1;
  let high = 100; // Reasonable upper bound for a game like this
  let max = 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (mid <= max) {
      low = mid + 1;
      continue;
    }

    // Check if we can build 'mid' amount
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
 * Base units are those with no recipe (or explicitly Common if we want to force that).
 * For simplicity, we count leaf nodes in the recipe tree.
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
 * This considers existing inventory.
 */
export function calculateMissingCost(
  unitId: string,
  unitsMap: Map<string, Unit>,
  inventory: Inventory,
  bans: Bans
): number {
  // Clone inventory to simulate consumption
  const tempInventory = { ...inventory };
  // Ignore the target unit itself in inventory, similar to calculateConsumption
  if (tempInventory[unitId]) tempInventory[unitId] = 0;

  const calculateRecursive = (id: string, amount: number): number => {
    if (amount <= 0) return 0;

    // 1. Use inventory
    const available = tempInventory[id] || 0;
    const take = Math.min(available, amount);
    if (take > 0) {
      tempInventory[id] -= take;
      amount -= take;
    }

    if (amount === 0) return 0;

    const unit = unitsMap.get(id);
    if (!unit) return amount; // Should not happen if data is good

    // If no recipe or banned, we can't craft, so the remaining amount is missing cost
    // Note: For base units, cost is 1 per unit.
    if (!unit.recipe || unit.recipe.length === 0 || bans.has(id)) {
      return amount;
    }

    // Craft
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
  const tempInventory = { ...inventory };
  if (tempInventory[unitId]) tempInventory[unitId] = 0;

  const calculateRecursive = (id: string, amount: number): number => {
    if (amount <= 0) return 0;

    const available = tempInventory[id] || 0;
    const take = Math.min(available, amount);
    if (take > 0) {
      tempInventory[id] -= take;
      amount -= take;
    }

    if (amount === 0) return 0;

    const unit = unitsMap.get(id);
    if (!unit) return 0;

    if (!unit.recipe || unit.recipe.length === 0 || bans.has(id)) {
      // Only count as wispable if it's Common and NOT the wisp itself
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
  // We check normal consumption first.
  const normalConsumption = calculateConsumption(targetUnitId, unitsMap, inventory, bans, 1, false);

  if (normalConsumption) {
    // Optimization: If status is green, we don't need to calculate missing costs or wisp progress.
    // We just need buildable count.
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

  // Check wisp consumption
  let status: 'green' | 'orange' | 'red' = 'red';
  let wispCost = 0;
  const wispConsumption = calculateConsumption(targetUnitId, unitsMap, inventory, bans, 1, true);

  if (wispConsumption) {
    status = 'orange';
    wispCost = wispConsumption['common_wisp'] || 0;
  }

  // 2. Calculate Progress
  // Only needed if not Green.
  const totalCost = calculateTotalCost(targetUnitId, unitsMap);

  // Optimization: If total cost is 0 (shouldn't happen) or very small, handle gracefully
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

  // Calculate wisp contribution to progress
  const availableWisps = inventory['common_wisp'] || 0;
  const missingWispable = calculateMissingWispableCost(targetUnitId, unitsMap, inventory, bans);
  const wispContribution = Math.min(missingWispable, availableWisps);

  const effectiveMissing = Math.max(0, missingCost - wispContribution);

  // Progress is (Total - EffectiveMissing) / Total
  let progress = ((totalCost - effectiveMissing) / totalCost) * 100;

  // Material progress (without wisps)
  let materialProgress = ((totalCost - missingCost) / totalCost) * 100;

  // Wisp progress
  let wispProgress = (wispContribution / totalCost) * 100;

  if (status === 'orange') {
    progress = 100;
    // materialProgress stays as is
    wispProgress = 100 - materialProgress;
  }

  const isWispAssisted = wispContribution > 0 && missingCost > 0;

  // Buildable count is 0 if not green (and we already handled green), 
  // BUT it could be > 0 if status is orange (buildable with wisps).
  // So we need to calculate it if orange.
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
 * Throws an error if materials are insufficient.
 */
export function consumeMaterials(
  targetUnitId: string,
  unitsMap: Map<string, Unit>,
  inventory: Inventory
): Inventory {
  // Try without wisps first
  let consumption = calculateConsumption(targetUnitId, unitsMap, inventory, new Set(), 1, false);

  // If not possible, try with wisps
  if (!consumption) {
    consumption = calculateConsumption(targetUnitId, unitsMap, inventory, new Set(), 1, true);
  }

  if (!consumption) {
    throw new Error(`Insufficient materials for ${targetUnitId}`);
  }

  const newInventory = { ...inventory };

  // Remove consumed materials
  for (const id in consumption) {
    newInventory[id] = (newInventory[id] || 0) - consumption[id];
  }

  // Add target unit
  newInventory[targetUnitId] = (newInventory[targetUnitId] || 0) + 1;

  return newInventory;
}
