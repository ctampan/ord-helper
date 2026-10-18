import { CAPABILITIES, type Capability, type CapabilityId, type CapabilityNumeric } from "./capabilities.ts";
import { damageFit, isProfileCore } from "./damage.ts";
import {
  calculateConsumption, calculateMissingBaseUnits, calculateTotalCost, getEffectiveBans,
  type Bans, type Inventory, type Unit,
} from "./combination.ts";

export const BUILD_PROFILES = ["Hybrid", "Physical", "Magic", "Explosion"] as const;
export type BuildProfile = typeof BUILD_PROFILES[number];
export type ActiveConditions = Record<string, Record<string, number>>;
export interface TeamPreferences {
  visible: boolean;
  expanded: boolean;
  profile: BuildProfile;
  conditions: ActiveConditions;
}
export const teamStorageKey = (dataset: string) => `ord_team_stats:${dataset}`;
const count = (value: number | undefined) => Number.isSafeInteger(value) && value! > 0 ? value! : 0;

export function conditionOptions(unit: Unit): { condition: string; exclusiveGroup?: string }[] {
  return [...new Map((unit.capabilities || []).filter((c) => c.condition).map((c) =>
    [c.condition!, { condition: c.condition!, exclusiveGroup: c.exclusiveGroup }])).values()];
}

export function sanitizeConditions(units: Map<string, Unit>, inventory: Inventory, saved: ActiveConditions): ActiveConditions {
  const result: ActiveConditions = Object.create(null);
  for (const [id, unit] of units) {
    const available = count(inventory[id]);
    if (!available || unit.rarity === "Common" || !saved?.[id]) continue;
    const used = new Map<string, number>();
    for (const option of conditionOptions(unit)) {
      const remaining = option.exclusiveGroup ? 1 - (used.get(option.exclusiveGroup) || 0) : 1;
      const active = Math.min(remaining, count(saved?.[id]?.[option.condition]));
      if (!active) continue;
      (result[id] ||= Object.create(null))[option.condition] = active;
      if (option.exclusiveGroup) used.set(option.exclusiveGroup, (used.get(option.exclusiveGroup) || 0) + active);
    }
  }
  return result;
}

export function readTeamPreferences(saved: string | null): TeamPreferences {
  const fallback: TeamPreferences = { visible: true, expanded: false, profile: "Hybrid", conditions: {} };
  try {
    const value = JSON.parse(saved || "null");
    if (!value || typeof value !== "object") return fallback;
    const conditions: ActiveConditions = Object.create(null);
    if (value.conditions && typeof value.conditions === "object") {
      for (const [id, choices] of Object.entries(value.conditions)) {
        if (!choices || typeof choices !== "object") continue;
        const valid = Object.entries(choices).filter(([, n]) => typeof n === "number" && count(n) > 0);
        if (valid.length) conditions[id] = Object.fromEntries(valid.map(([key]) => [key, 1]));
      }
    }
    const profile = value.profile === "Balanced" || value.profile === "Balance" ? "Hybrid" : value.profile;
    return { visible: value.visible !== false, expanded: value.expanded === true,
      profile: BUILD_PROFILES.includes(profile) ? profile : "Hybrid", conditions };
  } catch { return fallback; }
}

export interface TeamContribution { unit: Unit; effect: Capability; quantity: number; effectIndex: number }
export interface NumericTotal {
  context: string;
  target: CapabilityNumeric["target"];
  activation: CapabilityNumeric["activation"];
  value?: number;
  /** Nominal cumulative values under explicitly displayed stacking assumptions. */
  estimate?: { minimum: number; maximum: number };
  unit: CapabilityNumeric["unit"];
  incomplete: boolean;
}
export interface TeamCategory {
  category: CapabilityId;
  label: string;
  providers: number;
  contributions: TeamContribution[];
  totals: NumericTotal[];
  incomplete: boolean;
}

/** A single context, or the area-aura subtotal when other contexts coexist. */
export function getSummaryTotal(stat: TeamCategory): NumericTotal | undefined {
  return stat.totals.length === 1 ? stat.totals[0] :
    stat.totals.find((t) => t.target !== "self" && t.activation === "aura" && (t.value !== undefined || t.estimate)) ||
    stat.totals.find((t) => t.target !== "self" && (t.value !== undefined || t.estimate));
}
const estimatedCategories = new Set<CapabilityId>(["damageb", "speedb", "regen", "life", "slow", "shield", "mshield", "docking", "bombup", "armorbreak"]);
const numericCategories = new Set<CapabilityId>([
  "damageb", "speedb", "regen", "life", "docking", "bombup", "sstun", "stun", "slow", "shield", "mshield", "armorbreak",
  "singlelost", "last", "single", "rangellpd", "rangetlpd", "rangenlpd",
]);

function numericTotals(contributions: TeamContribution[]): NumericTotal[] {
  const contexts = new Map<string, TeamContribution[]>();
  for (const c of contributions) {
    const n = c.effect.numeric;
    if (!n) continue;
    const key = JSON.stringify([n.target, n.activation, n.duration, n.unit]);
    const list = contexts.get(key) || [];
    list.push(c);
    contexts.set(key, list);
  }
  return [...contexts.values()].map((entries) => {
    const n = entries[0].effect.numeric!;
    const buckets = new Map<string, TeamContribution[]>();
    for (const c of entries) {
      const metric = c.effect.numeric!;
      const key = metric.stackGroup || `${c.unit.id}:${c.effectIndex}`;
      const list = buckets.get(key) || [];
      list.push(c);
      buckets.set(key, list);
    }
    const values: { value: number; additiveGroup?: string }[] = [];
    const scenarios: { minimum: number; maximum: number }[] = [];
    let incomplete = false;
    for (const group of buckets.values()) {
      const metric = group[0].effect.numeric!;
      const consistent = group.every((c) => c.effect.numeric!.stacking === metric.stacking &&
        c.effect.numeric!.cap === metric.cap && c.effect.numeric!.additiveGroup === metric.additiveGroup);
      const nonAdditive = metric.unit === "s" || group.some((c) =>
        ["stun", "sstun", "hp-skill", "mana-skill"].includes(c.effect.category) ||
        CAPABILITIES.some((definition) => definition.id === c.effect.category && definition.group === "Damage"));
      const copies = group.reduce((sum, c) => sum + c.quantity, 0);
      const capped = (value: number) => metric.cap === undefined ? value : Math.sign(value) * Math.min(Math.abs(value), metric.cap);
      if (consistent && !nonAdditive && n.target !== "self") {
        if (metric.stacking === "once") {
          const options = group.map((c) => capped(c.effect.numeric!.value));
          scenarios.push({ minimum: Math.min(...options), maximum: Math.max(...options) });
        } else if (metric.stacking === "highest") {
          const strongest = group.reduce((best, c) => Math.abs(c.effect.numeric!.value) > Math.abs(best) ? c.effect.numeric!.value : best, 0);
          scenarios.push({ minimum: capped(strongest), maximum: capped(strongest) });
        } else {
          const nominal = capped(group.reduce((sum, c) => sum + c.effect.numeric!.value * c.quantity, 0));
          scenarios.push({ minimum: nominal, maximum: nominal });
        }
      }
      if (!consistent || (metric.stacking === "unknown" && copies > 1) ||
        (metric.target === "self" && copies > 1) ||
        (nonAdditive && metric.stacking === "sum" && copies > 1)) {
        incomplete = true;
        continue;
      }
      let value: number;
      if (metric.stacking === "highest") {
        // Explicit magnitude-based Custom rule; never infer this for a native
        // negative aura, whose signed winner may differ or depend on triggers.
        value = group.reduce((best, c) => Math.abs(c.effect.numeric!.value) > Math.abs(best) ? c.effect.numeric!.value : best, 0);
      } else if (metric.stacking === "once") {
        if (!group.every((c) => c.effect.numeric!.value === metric.value)) { incomplete = true; continue; }
        value = metric.value;
      } else value = group.reduce((sum, c) => sum + c.effect.numeric!.value * c.quantity, 0);
      if (metric.cap !== undefined) value = Math.sign(value) * Math.min(Math.abs(value), metric.cap);
      if (!Number.isFinite(value)) { incomplete = true; continue; }
      values.push({ value, additiveGroup: nonAdditive ? undefined : metric.additiveGroup });
    }
    // Only an explicit shared scope permits adding different exclusion groups.
    // An unresolved effect never contaminates the verified subtotal.
    let value = buckets.size === 1 ? values[0]?.value : undefined;
    if (buckets.size > 1) {
      const additive = values.filter((v) => v.additiveGroup);
      if (additive.length && new Set(additive.map((v) => v.additiveGroup)).size === 1) {
        value = additive.reduce((sum, v) => sum + v.value, 0);
        incomplete ||= additive.length !== buckets.size;
      } else incomplete = true;
    }
    if (value !== undefined && !Number.isFinite(value)) { value = undefined; incomplete = true; }
    const scenario = scenarios.length === buckets.size ? scenarios.reduce((sum, part) =>
      ({ minimum: sum.minimum + part.minimum, maximum: sum.maximum + part.maximum }), { minimum: 0, maximum: 0 }) : undefined;
    const estimate = incomplete && estimatedCategories.has(entries[0].effect.category) && scenario &&
      Number.isFinite(scenario.minimum) && Number.isFinite(scenario.maximum) ? scenario : undefined;
    const target = { area: "Area", single: "Single-target", boss: "Boss", lane: "Lane", allies: "Allies", self: "Self", unknown: "Target unspecified" }[n.target];
    const activation = { aura: "Aura", attack: "On attack", skill: "Skill", proc: "Proc", passive: "Passive", unknown: "Activation unspecified" }[n.activation];
    return { context: [target, activation, n.duration ? `${n.duration} s` : ""].filter(Boolean).join(" · "),
      target: n.target, activation: n.activation, unit: n.unit, value, estimate, incomplete };
  });
}

export function getTeamStats(units: Map<string, Unit>, inventory: Inventory, conditions: ActiveConditions = {}): TeamCategory[] {
  const active = sanitizeConditions(units, inventory, conditions);
  const categories = new Map<CapabilityId, TeamContribution[]>();
  for (const unit of units.values()) {
    const quantity = count(inventory[unit.id]);
    if (!quantity || unit.rarity === "Common") continue;
    (unit.capabilities || []).forEach((effect, effectIndex) => {
      const copies = effect.condition ? active[unit.id]?.[effect.condition] || 0 : quantity;
      if (!copies) return;
      const list = categories.get(effect.category) || [];
      list.push({ unit, effect, quantity: copies, effectIndex });
      categories.set(effect.category, list);
    });
  }
  return CAPABILITIES.flatMap(({ id, label }) => {
    const contributions = categories.get(id);
    if (!contributions) return [];
    const providers = new Map<string, number>();
    for (const c of contributions) {
      const own = contributions.filter((other) => other.unit.id === c.unit.id);
      const groups = new Map<string, Map<string, number>>();
      for (const item of own) {
        const key = item.effect.exclusiveGroup || "independent";
        const choices = groups.get(key) || new Map();
        choices.set(item.effect.condition || "base", item.quantity);
        groups.set(key, choices);
      }
      providers.set(c.unit.id, Math.max(...[...groups].map(([key, choices]) => key === "independent"
        ? Math.max(...choices.values()) : [...choices.values()].reduce((a, b) => a + b, 0))));
    }
    const totals = numericTotals(contributions);
    return [{ category: id, label, contributions, totals, providers: [...providers.values()].reduce((a, b) => a + b, 0),
      incomplete: (numericCategories.has(id) && contributions.some((c) => !c.effect.numeric)) || totals.some((t) => t.incomplete) }];
  }).sort((a, b) => Number(!!getSummaryTotal(b)?.estimate || getSummaryTotal(b)?.value !== undefined) -
    Number(!!getSummaryTotal(a)?.estimate || getSummaryTotal(a)?.value !== undefined));
}

export const PROFILE_CATEGORIES: Record<BuildProfile, readonly CapabilityId[]> = {
  Hybrid: ["slow", "stun", "shield", "mshield", "damageb", "speedb", "regen", "boss"],
  Physical: ["slow", "stun", "shield", "damageb", "speedb", "boss"],
  Magic: ["slow", "stun", "mshield", "docking", "regen", "boss"],
  Explosion: ["slow", "stun", "bombup", "mshield", "regen", "boss"],
};
function teamCoverage(units: Map<string, Unit>, inventory: Inventory, conditions: ActiveConditions) {
  const active = sanitizeConditions(units, inventory, conditions);
  const coverage = new Set<CapabilityId>();
  for (const unit of units.values()) {
    if (unit.rarity === "Common" || !count(inventory[unit.id])) continue;
    for (const effect of unit.capabilities || []) {
      if (!effect.condition || active[unit.id]?.[effect.condition]) coverage.add(effect.category);
    }
  }
  return coverage;
}
const satisfies = (coverage: Set<CapabilityId>, category: CapabilityId) => coverage.has(category) ||
  (category === "stun" && coverage.has("sstun")) || (category === "boss" && coverage.has("berserk"));
const recommendationExcludedRarities = new Set(["Common", "Uncommon", "Special", "Rare"]);

export interface Recommendation {
  unit: Unit;
  totalCost: number;
  craftable: boolean;
  missing: Inventory;
  missingCost: number;
  wispCost: number;
  materialProgress: number;
  gained: CapabilityId[];
  lost: CapabilityId[];
  netGain: number;
  requiredGained: CapabilityId[];
  requiredLost: CapabilityId[];
  fills: CapabilityId[];
  projected: boolean;
  damageFit: number;
  addsCore: boolean;
  losesCore: boolean;
}

/** Simulates one recipe without manufacturing missing ingredients. A projected
 * result excludes only materials the recipe would actually consume. */
export function previewCraft(unitId: string, units: Map<string, Unit>, inventory: Inventory, bans: Bans, allowWisp: boolean) {
  const consumed = calculateConsumption(unitId, units, inventory, bans, 1, allowWisp);
  const missing = consumed ? {} : calculateMissingBaseUnits(unitId, units, inventory, bans);
  let wispCost = consumed?.common_wisp || 0;
  if (!consumed && allowWisp) {
    let available = count(inventory.common_wisp);
    for (const id of Object.keys(missing)) {
      if (id === "common_wisp" || units.get(id)?.rarity !== "Common") continue;
      const take = Math.min(available, missing[id]);
      missing[id] -= take;
      available -= take;
      wispCost += take;
      if (!missing[id]) delete missing[id];
    }
  }
  // Supply only the missing leaves to obtain the exact ordinary ingredient
  // order of the shared crafting engine, then subtract only owned materials.
  const augmented = { ...inventory };
  for (const [id, quantity] of Object.entries(missing)) augmented[id] = (augmented[id] || 0) + quantity;
  const projectedConsumption = consumed || calculateConsumption(unitId, units, augmented, bans, 1, allowWisp);
  const after = { ...inventory };
  for (const [id, quantity] of Object.entries(projectedConsumption || {})) after[id] = Math.max(0, (after[id] || 0) - quantity);
  after[unitId] = count(inventory[unitId]) + 1;
  return { after, craftable: consumed !== null, missing, wispCost };
}

export function getRecommendations(units: Map<string, Unit>, inventory: Inventory, bans: Bans,
  allowWisp: boolean, profile: BuildProfile, conditions: ActiveConditions = {}) {
  const effectiveBans = getEffectiveBans(units, bans);
  const active = sanitizeConditions(units, inventory, conditions);
  const before = teamCoverage(units, inventory, active);
  const desired = PROFILE_CATEGORIES[profile];
  const required: CapabilityId[] = ["slow", "stun"];
  const missingRequired = required.filter((c) => !satisfies(before, c));
  const hasCore = (stock: Inventory) => [...units.values()].some((u) => count(stock[u.id]) > 0 && isProfileCore(u, profile));
  const missingCore = !hasCore(inventory);
  const results: Recommendation[] = [];
  // Stop at special ingredients even when Custom supplies a recipe for them.
  // The shared traversal respects quantities and already-owned intermediates.
  const specialRarities = new Set(["Random", "Combination Item", "Combination Items", "Other"]);
  const materialStops = new Set([...bans, ...[...units.values()]
    .filter((u) => specialRarities.has(u.rarity)).map((u) => u.id)]);
  for (const unit of units.values()) {
    if (recommendationExcludedRarities.has(unit.rarity) || !unit.recipe?.length || effectiveBans.has(unit.id)) continue;
    const stops = materialStops.has(unit.id) ? new Set([...materialStops].filter((id) => id !== unit.id)) : materialStops;
    const requiredMaterials = calculateMissingBaseUnits(unit.id, units, inventory, stops);
    if (Object.keys(requiredMaterials).some((id) => specialRarities.has(units.get(id)?.rarity || ""))) continue;
    const simulation = previewCraft(unit.id, units, inventory, bans, allowWisp);
    const after = teamCoverage(units, simulation.after, active);
    const gained = [...after].filter((c) => !before.has(c));
    const lost = [...before].filter((c) => !after.has(c));
    const missingCost = Object.entries(simulation.missing).reduce((sum, [id, quantity]) => sum + calculateTotalCost(id, units) * quantity, 0);
    const rawMissing = calculateMissingBaseUnits(unit.id, units, inventory, bans);
    const rawCost = Object.entries(rawMissing).reduce((sum, [id, quantity]) => sum + calculateTotalCost(id, units) * quantity, 0);
    results.push({ unit, totalCost: calculateTotalCost(unit.id, units), ...simulation, missingCost, gained, lost, projected: !simulation.craftable,
      damageFit: damageFit(unit, profile),
      addsCore: missingCore && hasCore(simulation.after),
      losesCore: !missingCore && !hasCore(simulation.after),
      requiredGained: required.filter((c) => !satisfies(before, c) && satisfies(after, c)),
      requiredLost: required.filter((c) => satisfies(before, c) && !satisfies(after, c)),
      fills: desired.filter((c) => !satisfies(before, c) && satisfies(after, c)),
      materialProgress: Math.max(0, Math.min(100, (1 - rawCost / Math.max(1, calculateTotalCost(unit.id, units))) * 100)),
      netGain: desired.filter((c) => satisfies(after, c) && !satisfies(before, c)).length -
        desired.filter((c) => satisfies(before, c) && !satisfies(after, c)).length });
  }
  const readiness = (a: Recommendation, b: Recommendation) => Number(b.craftable) - Number(a.craftable) || a.missingCost - b.missingCost;
  const tie = (a: Recommendation, b: Recommendation) => a.wispCost - b.wispCost ||
    b.totalCost - a.totalCost || a.unit.id.localeCompare(b.unit.id);
  const safe = results.filter((r) => r.requiredLost.length === 0 && !r.losesCore);
  const coreImprovements = safe.filter((r) => r.addsCore);
  const profileImprovements = safe.filter((r) => r.netGain > 0);
  const controlImprovements = missingRequired.length ? profileImprovements.filter((r) => r.requiredGained.length > 0) : [];
  const corePhase = missingCore && coreImprovements.length > 0;
  const profileFallback = !corePhase && missingRequired.length > 0 && controlImprovements.length === 0 && profileImprovements.length > 0;
  const complete = corePhase ? coreImprovements : controlImprovements.length ? controlImprovements : profileImprovements;
  return {
    complete: complete.sort((a, b) => (corePhase
      ? b.damageFit - a.damageFit || b.netGain - a.netGain
      : b.requiredGained.length - a.requiredGained.length || b.netGain - a.netGain || b.damageFit - a.damageFit) ||
      readiness(a, b) || tie(a, b)).slice(0, 5),
    easy: results.filter((r) => r.damageFit > 0 || r.netGain > 0).sort((a, b) => readiness(a, b) ||
      b.damageFit - a.damageFit || b.netGain - a.netGain || b.materialProgress - a.materialProgress ||
      a.wispCost - b.wispCost || a.unit.id.localeCompare(b.unit.id)).slice(0, 5),
    missingCategories: desired.filter((c) => !satisfies(before, c)),
    missingRequired,
    profileFallback,
    missingCore,
    corePhase,
  };
}
