import type { Bans, Data, Inventory } from "./combination";

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

/** Loading has no storage side effects: callers commit migration only on success. */
export async function loadGameData(
  baseUrl: string,
  requestedVersion: string,
  savedCustom: string | null,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  const response = await fetcher(`${baseUrl}versions.json`, { signal });
  if (!response.ok) throw new Error(`Version list: HTTP ${response.status}`);
  const versions: unknown = await response.json();
  if (
    !Array.isArray(versions) || !versions.length ||
    !versions.every((version) => typeof version === "string" && /^\d[\d.-]*$/.test(version))
  ) throw new Error("Invalid version list");

  const custom = readCustomData(savedCustom);
  const availableVersions: string[] = custom ? [...versions, "Custom"] : versions;
  const version = availableVersions.includes(requestedVersion) ? requestedVersion : versions[0];
  let data: Data;
  if (version === "Custom" && custom) {
    data = custom;
  } else {
    const result = await fetcher(`${baseUrl}data/${version}.json`, { signal });
    if (!result.ok) throw new Error(`Game data: HTTP ${result.status}`);
    const parsed: unknown = await result.json();
    if (!isGameData(parsed) || parsed.version !== version) throw new Error("Invalid game data");
    data = parsed;
  }
  return {
    data,
    version,
    versions: availableVersions,
    migrated: !!requestedVersion && version !== requestedVersion,
  };
}
