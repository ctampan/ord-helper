import { useDeferredValue, useEffect, useId, useMemo, useState } from "react";
import type { Bans, Inventory, Unit } from "../logic/combination";
import { CAPABILITIES, displayAbilityText, type CapabilityId } from "../logic/capabilities";
import {
  BUILD_PROFILES, conditionOptions, getRecommendations, getSummaryTotal, getTeamStats, readTeamPreferences,
  sanitizeConditions, teamStorageKey, type BuildProfile, type Recommendation, type NumericTotal,
} from "../logic/teamStats";
import styles from "./TeamStatsPanel.module.css";
import { CachedImage } from "./CachedImage";
import { damageLabel, isProfileCore } from "../logic/damage";

const label = (category: CapabilityId) => CAPABILITIES.find((c) => c.id === category)?.label || category;
const labels = (categories: CapabilityId[]) => categories.map(label).join(", ");
const roleLabels = (categories: CapabilityId[]) => categories.map((id) =>
  id === "stun" ? "Stun" : id === "boss" ? "Boss / Berserk coverage" : label(id)).join(", ");
const amount = (value: number, unit: string) => `${value > 0 ? "+" : ""}${Number(value.toFixed(3))}${unit === "%" ? "%" : ` ${unit}`}`;
const totalAmount = (total: NumericTotal, compact = false) => {
  const unit = compact && total.unit === "armor" ? "" : total.unit;
  if (total.estimate) {
    const { minimum, maximum } = total.estimate;
    return `~${amount(minimum, unit).trim()}${minimum === maximum ? "" : `…${amount(maximum, unit).trim()}`}`;
  }
  return total.value === undefined ? "" : amount(total.value, unit).trim();
};
const shortLabels: Partial<Record<CapabilityId, string>> = {
  damageb: "ATK buff", speedb: "ATK speed", regen: "Mana regen", life: "HP regen",
  docking: "Magic amp", bombup: "Explosion amp", shield: "Armor", mshield: "MR reduction",
  slow: "Slow", sstun: "Single stun", stun: "Area stun", udelete: "Deletion",
  singlelost: "ST missing HP", last: "ST total HP", single: "ST current HP",
  rangellpd: "AoE missing HP", rangetlpd: "AoE total HP", rangenlpd: "AoE current HP",
  ignore: "Armor ignore", splash: "Splash", boss: "Boss", berserk: "Berserk",
  blink: "Blink", "hp-skill": "HP skill", "mana-skill": "Mana skill",
};

interface Props {
  dataset: string;
  units: Map<string, Unit>;
  inventory: Inventory;
  bans: Bans;
  allowWisp: boolean;
  visible: boolean;
  onRecipe: (id: string) => void;
}

export function TeamStatsPanel({ dataset, units, inventory, bans, allowWisp, visible, onRecipe }: Props) {
  const [preferences, setPreferences] = useState(() => readTeamPreferences(localStorage.getItem(teamStorageKey(dataset))));
  const [previousInputs, setPreviousInputs] = useState({ units, inventory });
  // Discard unavailable copies immediately so they cannot reappear as upgraded
  // when a fresh unit is crafted later. This guarded render update is local.
  if (previousInputs.units !== units || previousInputs.inventory !== inventory) {
    setPreviousInputs({ units, inventory });
    setPreferences({ ...preferences, conditions: sanitizeConditions(units, inventory, preferences.conditions) });
  }
  const [tab, setTab] = useState<"complete" | "easy">("complete");
  const [selectedCategory, setSelectedCategory] = useState<CapabilityId>();
  const tabId = useId();
  const active = useMemo(() => sanitizeConditions(units, inventory, preferences.conditions), [units, inventory, preferences.conditions]);
  useEffect(() => {
    localStorage.setItem(teamStorageKey(dataset), JSON.stringify({ ...preferences, conditions: active }));
  }, [dataset, preferences, active]);
  const stats = useMemo(() => getTeamStats(units, inventory, active), [units, inventory, active]);
  const deferredInventory = useDeferredValue(inventory);
  const deferredActive = useDeferredValue(active);
  const recommendations = useMemo(() => visible && preferences.expanded
    ? getRecommendations(units, deferredInventory, bans, allowWisp, preferences.profile, deferredActive) : null,
  [visible, preferences.expanded, units, deferredInventory, bans, allowWisp, preferences.profile, deferredActive]);
  const conditionUnits = useMemo(() => [...units.values()].filter((u) => u.rarity !== "Common" &&
    (inventory[u.id] || 0) > 0 && conditionOptions(u).length), [units, inventory]);
  const owned = [...units.values()].filter((u) => u.rarity !== "Common" && u.capabilities?.length && inventory[u.id] > 0)
    .reduce((sum, u) => sum + inventory[u.id], 0);
  const selected = stats.find((stat) => stat.category === selectedCategory);
  if (!visible) return null;

  const renderRecommendation = (r: Recommendation) => <li key={r.unit.id} className={styles.recommendation}
    data-recommendation-id={r.unit.id} data-material-cost={r.totalCost}>
    <div className={styles.resultHeader}>
      <span className={styles.portrait} aria-hidden="true">{r.unit.name.charAt(0)}
        {r.unit.image && <CachedImage src={r.unit.image} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
      </span>
      <strong>{r.unit.name} <small>({r.unit.rarity})</small></strong>
      <button type="button" onClick={() => onRecipe(r.unit.id)} aria-label={`View recipe for ${r.unit.name} (${r.unit.rarity})`}>Recipe</button></div>
    <span>{r.craftable ? "Ready to craft" : `Materials ${Math.round(r.materialProgress)}% ready`}
      {r.wispCost > 0 && <> · <span className={styles.wisp}>{r.wispCost}</span> Wisp</>}
      <span className={styles.cost}> · Cost: {r.totalCost} base materials</span></span>
    <span>{damageLabel(r.unit)}</span>
    <span className={styles.changes}>
      {r.addsCore && <span>{preferences.profile} core.</span>}
      {!isProfileCore(r.unit, preferences.profile) && r.netGain > 0 &&
        <span>{preferences.profile} support.</span>}
      {tab === "easy" && r.damageFit > 0 && !r.addsCore &&
        <span>{preferences.profile === "Hybrid" ? "Hybrid build" : preferences.profile} damage match.</span>}
      {tab === "complete" && r.fills.length > 0 && <span>Fills: {roleLabels(r.fills)}.</span>}
      {tab === "easy" && r.gained.some((id) => id !== "mana-skill" && id !== "hp-skill") &&
        <span>Adds coverage: {labels(r.gained.filter((id) => id !== "mana-skill" && id !== "hp-skill"))}.</span>}
      {r.lost.length > 0 && <span className={styles.loss}>Loses coverage: {labels(r.lost)}.</span>}
      {r.losesCore && <span className={styles.loss}>Consumes the last {preferences.profile} core.</span>}
    </span>
    {r.projected && <span className={styles.missing}>Missing: {Object.entries(r.missing).map(([id, n]) =>
      `${n} × ${units.get(id)?.name || id} (${units.get(id)?.rarity || ""})`).join(", ") || "requirements unavailable"}.</span>}
  </li>;

  return <section className={styles.panel} id="team-stats" aria-label="Team Stats">
    <div className={styles.toolbar}>
      <button type="button" className={styles.heading} aria-expanded={preferences.expanded} aria-controls="team-stats-content"
        onClick={() => setPreferences({ ...preferences, expanded: !preferences.expanded })}>
        <span aria-hidden="true">{preferences.expanded ? "▾" : "▸"}</span> Team Stats
      </button>
      <span role="status">{owned} units · {stats.length} abilities</span>
      <label><span className={styles.profileLabel}>Build profile</span><select aria-label="Build profile" value={preferences.profile} onChange={(e) =>
        setPreferences({ ...preferences, profile: e.target.value as BuildProfile })}>
        {BUILD_PROFILES.map((p) => <option key={p}>{p}</option>)}
      </select></label>
    </div>
    <div className={styles.summary} role="group" aria-label="Team summary">
      {stats.length === 0 ? <span className={styles.hint}>Add units to your inventory to see team abilities.</span> : stats.map((stat) => {
        const total = getSummaryTotal(stat);
        const incomplete = (stat.incomplete && !total?.estimate) || stat.totals.length > 1 ||
          stat.contributions.some((c) => !c.effect.numeric);
        const value = total ? totalAmount(total, true) : "";
        const description = `${value ? `${value} ` : ""}${stat.label} · ${stat.providers} ${stat.providers === 1 ? "unit" : "units"}`;
        const title = [description, ...stat.totals.map((t) => `${t.context}: ${totalAmount(t) || "See contributions"}`),
          total?.estimate ? "Estimate: unverified effects assumed additive; shared buffs counted once. Conditions and uptime apply." : "",
          incomplete ? "Total incomplete; see contributions" : ""].filter(Boolean).join("\n");
        return <button key={stat.category} type="button" className={styles.chip} data-team-category={stat.category}
          aria-label={description} title={title} aria-expanded={preferences.expanded && selectedCategory === stat.category}
          aria-controls="team-stat-contributions" onClick={() => {
            setSelectedCategory(preferences.expanded && selectedCategory === stat.category ? undefined : stat.category);
            if (!preferences.expanded) setPreferences({ ...preferences, expanded: true });
          }}>
          {value && <strong>{value}{incomplete ? "*" : ""}</strong>}
          <span>{shortLabels[stat.category] || stat.label}</span>
          <small>×{stat.providers}</small>
        </button>;
      })}
    </div>
    {preferences.expanded && <div id="team-stats-content" className={styles.content}>
      {selected && <div id="team-stat-contributions" className={styles.detail} role="group" aria-label={`${selected.label} contributions`}>
          <div className={styles.detailHeader}><strong>{selected.label}</strong>
            {selected.totals.map((t) => <span key={`${t.context}:${t.unit}`} className={styles.metric}>
              {t.context}: {totalAmount(t) || "See individual values"}
            </span>)}
            {selected.incomplete && <small>Numeric total incomplete</small>}
          </div>
          {selected.totals.some((t) => t.estimate) && <p className={styles.hint}>~ Estimated cumulative value: unverified effects assumed additive; shared buffs counted once. Skill/proc values require activation and do not imply permanent uptime.</p>}
          <ul className={styles.contributions}>{selected.contributions.map((c) => <li key={`${c.unit.id}:${c.effectIndex}`}>
            <button type="button" onClick={() => onRecipe(c.unit.id)}>{c.unit.name} ({c.unit.rarity}) × {c.quantity}</button>
            <span>{displayAbilityText(c.effect.detail || "Effect value unspecified")}
              {c.effect.condition ? ` · ${displayAbilityText(c.effect.condition)}` : ""}</span>
          </li>)}</ul>
        </div>}
      {conditionUnits.length > 0 && <details className={styles.conditions}>
        <summary>Active upgrades &amp; forms</summary>
        <div className={styles.conditionGrid}>{conditionUnits.map((unit) => <div key={unit.id} className={styles.conditionUnit}
          role="group" aria-label={`${unit.name} (${unit.rarity}) upgrades and forms`}>
          <strong>{unit.name} <small>({unit.rarity})</small></strong>
          {conditionOptions(unit).map((option) => {
          const siblings = conditionOptions(unit).filter((o) => o.exclusiveGroup && o.exclusiveGroup === option.exclusiveGroup && o.condition !== option.condition);
          return <label key={option.condition}>
            <input type="checkbox" checked={!!active[unit.id]?.[option.condition]}
              aria-label={`${unit.name} (${unit.rarity}) · ${displayAbilityText(option.condition)}`}
              onChange={(event) => {
                const choices = { ...active[unit.id], [option.condition]: Number(event.target.checked) };
                if (event.target.checked) for (const sibling of siblings) delete choices[sibling.condition];
                setPreferences({ ...preferences, conditions: { ...active,
                  [unit.id]: choices } });
              }} />
            <span>{displayAbilityText(option.condition)}</span>
          </label>;
        })}</div>)}</div>
      </details>}
      <div className={styles.recommendations} aria-busy={inventory !== deferredInventory}>
        <div role="tablist" aria-label="Recommendation type" className={styles.tabs}>
          <strong>Recommendations</strong>
          {([['complete', 'Complete team'], ['easy', 'Easy to craft']] as const).map(([id, name], index, tabs) =>
            <button key={id} type="button" role="tab" id={`${tabId}-${id}`} aria-selected={tab === id}
              aria-controls={`${tabId}-results`} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)}
              onKeyDown={(event) => {
                let next = index;
                if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
                else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
                else if (event.key === "Home") next = 0;
                else if (event.key === "End") next = tabs.length - 1;
                else return;
                event.preventDefault();
                setTab(tabs[next][0]);
                document.getElementById(`${tabId}-${tabs[next][0]}`)?.focus();
              }}>{name}</button>)}
        </div>
        <p className={styles.hint}>{tab === "easy"
          ? "Relevant units first by crafting readiness and fewest missing materials."
          : recommendations?.corePhase
          ? `${preferences.profile} core first, then team coverage and crafting readiness.`
          : recommendations?.profileFallback
          ? `${preferences.profile} support suggestions. Still required: ${roleLabels(recommendations.missingRequired)}.`
          : tab === "complete" && recommendations?.missingRequired.length
          ? `Required first: ${roleLabels(recommendations.missingRequired)}. Team coverage, damage fit, then crafting readiness.`
          : "Team coverage, damage fit, then crafting readiness."}</p>
        {tab === "complete" && recommendations?.missingCore && !recommendations.corePhase &&
          <p className={styles.hint}>No eligible {preferences.profile} core available. Showing support suggestions.</p>}
        {recommendations?.missingCategories.length ? <p className={styles.hint}>Missing for {preferences.profile}: {roleLabels(recommendations.missingCategories)}.</p> : null}
        <div role="tabpanel" id={`${tabId}-results`} aria-labelledby={`${tabId}-${tab}`}>
          {recommendations?.[tab].length ? <ol className={styles.results}>{recommendations[tab].map(renderRecommendation)}</ol> :
            <p>{tab === "complete" ? "No eligible recipe adds a core or support for this profile. Check Easy to craft for other recipes."
              : "No relevant recipes are available for this profile."}</p>}
        </div>
      </div>
    </div>}
  </section>;
}
