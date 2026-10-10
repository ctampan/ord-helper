import {
  CAPABILITIES, CAPABILITY_GROUPS, hasBaseCapability,
  type CapabilityFilterPreferences, type CapabilityId,
} from "../logic/capabilities";
import type { Unit } from "../logic/combination";
import styles from "./CapabilityFilters.module.css";

interface Props {
  expanded: boolean;
  onToggleExpanded: () => void;
  units: Unit[];
  preferences: CapabilityFilterPreferences;
  resultCount: number;
  onChange: (preferences: CapabilityFilterPreferences) => void;
}

export function CapabilityFilters({ units, preferences, resultCount, onChange, expanded, onToggleExpanded }: Props) {
  const toggleCategory = (id: CapabilityId) => onChange({
    ...preferences,
    selected: preferences.selected.includes(id)
      ? preferences.selected.filter((selected) => selected !== id)
      : [...preferences.selected, id],
  });
  return (
    <section id="capability-filters" className={styles.panel} aria-label="Unit ability filters">
      <div className={styles.toolbar}>
        <button type="button" className={styles.expand} aria-expanded={expanded}
          aria-controls="capability-filter-choices" onClick={onToggleExpanded}>
          <span aria-hidden="true">{expanded ? "▾" : "▸"}</span> Ability filters
        </button>
        <span className={styles.selection}>{preferences.selected.length} selected</span>
        <button type="button" onClick={() => onChange({ ...preferences, selected: [] })}>Clear</button>
        <span role="status" aria-live="polite">{resultCount} / {units.length} units</span>
      </div>
      {expanded && <div id="capability-filter-choices">
        <div className={styles.settings}>
        <label className={styles.mode}>
          Match
          <select value={preferences.mode} onChange={(event) => onChange({
            ...preferences, mode: event.target.value === "any" ? "any" : "all",
          })}>
            <option value="all">All selected</option>
            <option value="any">Any selected</option>
          </select>
        </label>
      <p className={styles.hint}>Base abilities only. Upgrade and form requirements appear in unit details.</p>
        </div>
      <div className={styles.groups}>
        {CAPABILITY_GROUPS.map((group) => (
          <fieldset key={group}>
            <legend>{group}</legend>
            <div className={styles.choices}>
              {CAPABILITIES.filter((capability) => capability.group === group).map(({ id, label }) => (
                <label key={id} className={`${styles.choice} ${preferences.selected.includes(id) ? styles.selected : ""}`}>
                  <input type="checkbox" checked={preferences.selected.includes(id)} onChange={() => toggleCategory(id)} />
                  {label}
                  <span className={styles.count}>{units.filter((unit) => hasBaseCapability(unit, id)).length}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      </div>}
      {resultCount === 0 && (
        <div className={styles.empty}>No units match these filters. Change the selection or use Clear to show all units.</div>
      )}
    </section>
  );
}
