import type { Unit } from "./combination";

// Preserve ORDSearch IDs; additional activation/mobility categories use map evidence.
export const CAPABILITY_GROUPS = ["Support", "Control", "Damage", "Specialist & mobility", "Skill activation"] as const;
export const CAPABILITIES = [
  { id: "damageb", label: "Attack buff", group: "Support" },
  { id: "speedb", label: "Attack speed buff", group: "Support" },
  { id: "regen", label: "Mana regeneration", group: "Support" },
  { id: "life", label: "HP regeneration", group: "Support" },
  { id: "docking", label: "Magic amplification", group: "Support" },
  { id: "bombup", label: "Explosion amplification", group: "Support" },
  { id: "sstun", label: "Single-target stun", group: "Control" },
  { id: "stun", label: "Area stun", group: "Control" },
  { id: "slow", label: "Movement slow", group: "Control" },
  { id: "shield", label: "Armor reduction", group: "Control" },
  { id: "mshield", label: "Magic resistance reduction", group: "Control" },
  { id: "armorbreak", label: "Armor Break", group: "Control" },
  { id: "udelete", label: "Enemy deletion", group: "Control" },
  { id: "singlelost", label: "Single-target missing-HP damage", group: "Damage" },
  { id: "last", label: "Single-target total-HP damage", group: "Damage" },
  { id: "single", label: "Single-target current-HP damage", group: "Damage" },
  { id: "rangellpd", label: "Area missing-HP damage", group: "Damage" },
  { id: "rangetlpd", label: "Area total-HP damage", group: "Damage" },
  { id: "rangenlpd", label: "Area current-HP damage", group: "Damage" },
  { id: "ignore", label: "Armor-ignoring damage", group: "Damage" },
  { id: "splash", label: "Splash damage", group: "Damage" },
  { id: "boss", label: "Boss specialist", group: "Specialist & mobility" },
  { id: "berserk", label: "Berserk specialist", group: "Specialist & mobility" },
  { id: "sky", label: "Flying", group: "Specialist & mobility" },
  { id: "blink", label: "Blink / teleport", group: "Specialist & mobility" },
  { id: "swimming", label: "Swimming", group: "Specialist & mobility" },
  { id: "hp-skill", label: "HP skill", group: "Skill activation" },
  { id: "mana-skill", label: "Mana skill", group: "Skill activation" },
] as const;

export type CapabilityId = typeof CAPABILITIES[number]["id"];
export interface Capability {
  category: CapabilityId;
  detail?: string;
  condition?: string;
  source?: "ordsearch" | "sions" | "warcraft-map";
}
export type FilterMode = "all" | "any";
export interface CapabilityFilterPreferences {
  selected: CapabilityId[];
  mode: FilterMode;
}
export const CAPABILITY_FILTER_STORAGE_KEY = "ord_capability_filters";
// Keep the legacy key so existing saved false values hide the panel.
export const CAPABILITY_VISIBLE_STORAGE_KEY = "ord_capability_filters_expanded";
export const CAPABILITY_PANEL_EXPANDED_STORAGE_KEY = "ord_capability_filter_choices_expanded";

export function readCapabilityVisible(saved: string | null): boolean {
  return saved !== "false";
}

/** Keep legacy Custom values readable without exposing provenance in the UI. */
export function displayAbilityText(text: string): string {
  return text.replace(/−/g, "-")
    .replace(/\bGroup reference:\s*.*?(?:\.(?=\s|$)|$)/gi, "")
    .replace(/\s*\((?:Sions|ORDSearch|Warcraft map)\)/gi, "")
    .replace(/(?:(?:Armor reduction|Movement slow): )?ORDSearch values are shown in the tags; Sions values\/context are retained in ability details\./gi, "")
    .replace(/(?:Movement slow|Values) differs? between references[.;]\s*(?:Alternative values\/context are retained in ability details\.)?/gi, "")
    .replace(/(?:Sions|ORDSearch|Warcraft map)\s*[—–:-]\s*/gi, "")
    .replace(/\b(?:ORDSearch|Sions|Warcraft map)\b\s*/gi, "");
}

export function isCapabilityId(value: unknown): value is CapabilityId {
  return CAPABILITIES.some(({ id }) => id === value);
}

export function isCapability(value: unknown): value is Capability {
  if (!value || typeof value !== "object") return false;
  const capability = value as Capability;
  return isCapabilityId(capability.category) &&
    (capability.source === undefined || capability.source === "ordsearch" ||
      capability.source === "sions" || capability.source === "warcraft-map") &&
    (capability.detail === undefined || typeof capability.detail === "string") &&
    (capability.condition === undefined ||
      (typeof capability.condition === "string" && capability.condition.trim().length > 0));
}

export function readCapabilityFilters(saved: string | null): CapabilityFilterPreferences {
  try {
    const value: unknown = JSON.parse(saved || "null");
    if (value && typeof value === "object") {
      const preferences = value as Partial<CapabilityFilterPreferences>;
      return {
        selected: Array.isArray(preferences.selected)
          ? [...new Set(preferences.selected.filter(isCapabilityId))] : [],
        mode: preferences.mode === "any" ? "any" : "all",
      };
    }
  } catch { /* Invalid saved preferences fall back to an unfiltered view. */ }
  return { selected: [], mode: "all" };
}

export function hasBaseCapability(unit: Unit, category: CapabilityId): boolean {
  return unit.capabilities?.some((capability) =>
    capability.category === category && !capability.condition) ?? false;
}

export function filterUnitsByCapabilities(
  units: Unit[], selected: readonly CapabilityId[], mode: FilterMode, enabled = true,
): Unit[] {
  if (!enabled || selected.length === 0) return units;
  return units.filter((unit) => mode === "all"
    ? selected.every((category) => hasBaseCapability(unit, category))
    : selected.some((category) => hasBaseCapability(unit, category)));
}
