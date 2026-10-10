import type { Unit } from "./combination";

const indexes = new WeakMap<Map<string, Unit>, RecipeIndex>();
const topRarities = new Set(["Transcendence", "Limited", "Immortal", "Eternal", "Mystic"]);

interface RecipeIndex {
  usedIn: Map<string, Unit[]>;
  topTier: Map<string, Unit[]>;
  inventoryDependents: Map<string, Set<string>>;
  batchCraftTargets: Set<string>;
}

/** Dataset-only relationships; no inventory state or flattened crafting costs. */
export function getRecipeIndex(unitsMap: Map<string, Unit>): RecipeIndex {
  const cached = indexes.get(unitsMap);
  if (cached) return cached;
  const usedIn = new Map<string, Unit[]>();
  const topTier = new Map<string, Unit[]>();
  const inventoryDependents = new Map<string, Set<string>>();
  const batchCraftTargets = new Set<string>();
  const addDependent = (ingredient: string, target: string) => {
    if (!inventoryDependents.has(ingredient)) inventoryDependents.set(ingredient, new Set());
    inventoryDependents.get(ingredient)!.add(target);
  };
  for (const unit of unitsMap.values()) {
    for (const ingredient of new Set(unit.recipe?.map((req) => req.unitId))) {
      if (!usedIn.has(ingredient)) usedIn.set(ingredient, []);
      usedIn.get(ingredient)!.push(unit);
    }
    const descendants = new Set<string>();
    const visit = (id: string) => {
      if (descendants.has(id)) return;
      descendants.add(id);
      const dependency = unitsMap.get(id);
      addDependent(id, unit.id);
      if (dependency?.rarity === "Common" && id !== "common_wisp") {
        addDependent("common_wisp", unit.id);
        if (dependency.recipe?.length) batchCraftTargets.add(unit.id);
      }
      for (const req of dependency?.recipe || []) visit(req.unitId);
    };
    visit(unit.id);
    if (topRarities.has(unit.rarity)) {
      for (const id of descendants) {
        if (id === unit.id) continue;
        if (!topTier.has(id)) topTier.set(id, []);
        topTier.get(id)!.push(unit);
      }
    }
  }
  // Preserve the existing Wisp "Used In" display without adding synthetic recipes.
  usedIn.set("common_wisp", [
    ...(usedIn.get("common_wisp") || []),
    ...[...unitsMap.values()].filter((unit) => unit.rarity === "Common" && unit.id !== "common_wisp"),
  ]);
  const index = { usedIn, topTier, inventoryDependents, batchCraftTargets };
  indexes.set(unitsMap, index);
  return index;
}
