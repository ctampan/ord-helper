import type { Unit } from "./combination";

export const DAMAGE_TYPES = ["Physical", "Magic", "Explosion"] as const;
export type DamageType = typeof DAMAGE_TYPES[number];
export interface DamageProfile {
  types: DamageType[];
  dominant: DamageType | null;
  core: boolean;
}

export function isDamageProfile(value: unknown): value is DamageProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as DamageProfile;
  return Array.isArray(profile.types) && profile.types.every((t) => DAMAGE_TYPES.includes(t)) &&
    new Set(profile.types).size === profile.types.length && typeof profile.core === "boolean" &&
    (profile.dominant === null || profile.types.includes(profile.dominant)) &&
    (!profile.core || profile.types.length > 0);
}

/** Dominant matches outrank secondary damage; unknown data never implies a match. */
export function damageFit(unit: Unit, profile: string): number {
  const damage = unit.damageProfile;
  if (!damage) return 0;
  if (profile === "Hybrid") return damage.types.some((t) => t === "Physical" || t === "Magic") ? 2 : 0;
  return damage.dominant === profile ? 2 : damage.types.some((t) => t === profile) ? 1 : 0;
}

export function isProfileCore(unit: Unit, profile: string): boolean {
  return unit.damageProfile?.core === true && damageFit(unit, profile) === 2;
}

export function damageLabel(unit: Unit): string {
  const damage = unit.damageProfile;
  if (!damage?.types.length) return "Damage unclassified";
  const hybrid = damage.types.includes("Physical") && damage.types.includes("Magic");
  const types = hybrid ? ["Hybrid", ...(damage.types.includes("Explosion") ? ["Explosion"] : [])] : damage.types;
  return types.join(" / ") + (damage.dominant ? ` · ${damage.dominant} dominant` : " · dominance unclassified");
}
