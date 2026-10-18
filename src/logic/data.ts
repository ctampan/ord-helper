import type { Bans, Data, Inventory } from "./combination";
import { isCapability } from "./capabilities.ts";
import { isDamageProfile } from "./damage.ts";

/** Validate imported data before recipe traversal or treating Custom as available. */
export function isGameData(value: unknown): value is Data {
  if (!value || typeof value !== "object") return false;
  const data = value as Data;
  if (
    typeof data.version !== "string" ||
    !Array.isArray(data.rarities) ||
    !data.rarities.length ||
    !data.rarities.every((rarity) => typeof rarity === "string") ||
    !Array.isArray(data.units) ||
    !data.units.length
  ) return false;

  const ids = new Set<string>();
  for (const unit of data.units) {
    if (
      !unit || typeof unit.id !== "string" || !unit.id || ids.has(unit.id) ||
      typeof unit.name !== "string" || typeof unit.image !== "string" ||
      !data.rarities.includes(unit.rarity) ||
      (unit.note !== undefined && typeof unit.note !== "string") ||
      (unit.abilityDetails !== undefined && typeof unit.abilityDetails !== "string") ||
      (unit.damageProfile !== undefined && !isDamageProfile(unit.damageProfile)) ||
      (unit.capabilities !== undefined &&
        (!Array.isArray(unit.capabilities) || !unit.capabilities.every(isCapability))) ||
      (unit.subGroup !== undefined && typeof unit.subGroup !== "string") ||
      (unit.recipe !== undefined && !Array.isArray(unit.recipe))
    ) return false;
    ids.add(unit.id);
  }
  const units = new Map(data.units.map((unit) => [unit.id, unit]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    for (const requirement of units.get(id)!.recipe || []) {
      if (
        !requirement || !ids.has(requirement.unitId) ||
        !Number.isSafeInteger(requirement.count) || requirement.count <= 0 ||
        !visit(requirement.unitId)
      ) return false;
    }
    visiting.delete(id);
    visited.add(id);
    return true;
  };
  return data.units.every((unit) => visit(unit.id));
}

export function readCustomData(saved: string | null): Data | null {
  if (!saved) return null;
  try {
    const parsed: unknown = JSON.parse(saved);
    return isGameData(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function retainValidState(data: Data, inventory: Inventory, bans: Bans) {
  const ids = new Set(data.units.map((unit) => unit.id));
  return {
    inventory: Object.fromEntries(Object.entries(inventory).filter(([id]) => ids.has(id))),
    bans: new Set([...bans].filter((id) => ids.has(id))),
  };
}

/** Filename and metadata agree; numeric sorting keeps 2.10 newer than 2.9. */
export function createGameCatalog(sources: Record<string, unknown>): Map<string, Data> {
  const datasets = Object.entries(sources).map(([path, value]) => {
    const filenameVersion = path.split(/[\\/]/).pop()?.replace(/\.json$/, "");
    if (!isGameData(value) || value.version !== filenameVersion || value.version === "Custom") {
      throw new Error(`Invalid bundled dataset: ${path}`);
    }
    return value;
  });
  const order = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
  datasets.sort((first, second) => order.compare(second.version, first.version));
  const catalog = new Map(datasets.map((data) => [data.version, data]));
  if (!catalog.size || catalog.size !== datasets.length) {
    throw new Error("Bundled datasets must have unique versions and include at least one version");
  }
  return catalog;
}

/** All discovered versions are bundled and switch without network requests. */
export function resolveGameData(
  requestedVersion: string,
  savedCustom: string | null,
  catalog: ReadonlyMap<string, Data>,
) {
  const custom = readCustomData(savedCustom);
  const builtInVersions = [...catalog.keys()];
  if (!builtInVersions.length) throw new Error("No bundled game data available");
  const versions = custom ? [...builtInVersions, "Custom"] : builtInVersions;
  const version = versions.includes(requestedVersion) ? requestedVersion : builtInVersions[0];
  const data = version === "Custom" && custom ? custom : catalog.get(version)!;
  return {
    data,
    version,
    versions,
    migrated: !!requestedVersion && version !== requestedVersion,
  };
}
