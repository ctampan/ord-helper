import { CAPABILITIES, displayAbilityText } from "../logic/capabilities";
import type { Unit } from "../logic/combination";
import styles from "./UnitCapabilities.module.css";

export function UnitCapabilities({ unit, expandedDetails = false }: { unit: Unit; expandedDetails?: boolean }) {
  if (!unit.capabilities?.length && !unit.abilityDetails) return null;
  return (
    <section className={styles.section} aria-label="Unit capabilities">
      <div className={styles.tags}>
        {CAPABILITIES.map(({ id, label }) => {
          const effects = unit.capabilities?.filter((capability) => capability.category === id);
          if (!effects?.length) return null;
          return <div key={id} className={styles.tag}>
            <strong>{label}</strong>
            {effects.map((effect, index) => <span key={index}>
              {index ? "; " : effect.detail || effect.condition ? ": " : ""}
              {displayAbilityText(effect.detail || "")}
              {effect.condition && <span className={styles.condition}> (Requires {displayAbilityText(effect.condition)})</span>}
            </span>)}
          </div>;
        })}
      </div>
      {unit.abilityDetails && (expandedDetails ?
        <div className={styles.details} data-ability-details>
          <strong>More ability details</strong>
          <p>{displayAbilityText(unit.abilityDetails)}</p>
        </div> :
        <details key={unit.id} className={styles.details}>
          <summary>More ability details</summary>
          <p>{displayAbilityText(unit.abilityDetails)}</p>
        </details>)}
    </section>
  );
}
