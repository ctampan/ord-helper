import React, { useState, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Unit } from '../logic/combination';
import { calculateMissingBaseUnits } from '../logic/combination';
import styles from './RecipeTooltip.module.css';

interface RecipeTooltipProps {
  unit: Unit;
  unitsMap: Map<string, Unit>;
  inventory: Record<string, number>;
  visible: boolean;
  parentElement: HTMLElement | null;
  bans: Set<string>;
}

export const RecipeTooltip: React.FC<RecipeTooltipProps> = ({ unit, unitsMap, inventory, visible, parentElement, bans }) => {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [position, setPosition] = useState<'top' | 'bottom'>('top');

  useLayoutEffect(() => {
    if (visible && parentElement && tooltipRef.current) {
      const parentRect = parentElement.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();

      let top = parentRect.top - tooltipRect.height - 10;
      let left = parentRect.left + (parentRect.width / 2) - (tooltipRect.width / 2);
      let newPosition: 'top' | 'bottom' = 'top';

      if (top < 10) {
        top = parentRect.bottom + 10;
        newPosition = 'bottom';
      }

      if (left < 10) left = 10;
      if (left + tooltipRect.width > window.innerWidth - 10) {
        left = window.innerWidth - tooltipRect.width - 10;
      }

      setCoords({ top, left });
      setPosition(newPosition);
    }
  }, [visible, parentElement]);

  if (!visible) return null;

  const hasRecipe = unit.recipe && unit.recipe.length > 0;

  if (!hasRecipe) return null;

  const missingBaseUnits = calculateMissingBaseUnits(unit.id, unitsMap, inventory, bans);
  const hasMissing = Object.keys(missingBaseUnits).length > 0;

  return createPortal(
    <div
      ref={tooltipRef}
      className={`${styles.tooltip} ${visible ? styles.visible : ''} ${position === 'bottom' ? styles.bottom : ''}`}
      style={{
        top: coords.top,
        left: coords.left,
        position: 'fixed',
        transform: 'none',
        margin: 0,
        backgroundColor: '#1a1a1a',
        border: '1px solid #404040',
        borderRadius: '8px',
        padding: '12px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
        zIndex: 9999,
        opacity: visible ? 1 : 0,
        height: 'fit-content',
      }}
    >
      <div className={styles.title}>{unit.name}</div>
      {unit.note && <div className={styles.note}>{unit.note}</div>}
      <div className={styles.ingredients}>
        {unit.recipe!.map((req, index) => {
          const ingredient = unitsMap.get(req.unitId);
          if (!ingredient) return null;

          const have = inventory[req.unitId] || 0;
          const need = req.count;
          const isEnough = have >= need;

          return (
            <div key={index} className={styles.ingredient}>
              <img src={ingredient.image} alt={ingredient.name} className={styles.icon} />
              <span>{ingredient.name} - {ingredient.rarity}</span>
              <span className={styles.count} style={{ color: isEnough ? 'inherit' : '#ff6b6b' }}>
                x{need} <span style={{ opacity: 0.7, fontSize: '0.9em' }}>(Have: {have})</span>
              </span>
            </div>
          );
        })}
      </div>

      {hasMissing && (
        <>
          <div style={{ borderTop: '1px solid #404040', margin: '8px 0' }} />
          <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '4px', color: '#ff6b6b' }}>
            Missing Base Units: {Object.values(missingBaseUnits).reduce((sum, count) => sum + count, 0)} total
          </div>
          <div className={styles.ingredients}>
            {Object.entries(missingBaseUnits)
              .sort(([idA], [idB]) => {
                const unitsArray = Array.from(unitsMap.values());
                const indexA = unitsArray.findIndex(u => u.id === idA);
                const indexB = unitsArray.findIndex(u => u.id === idB);
                return indexA - indexB;
              })
              .map(([unitId, count]) => {
                const baseUnit = unitsMap.get(unitId);
                if (!baseUnit) return null;

                return (
                  <div key={unitId} className={styles.ingredient}>
                    <img src={baseUnit.image} alt={baseUnit.name} className={styles.icon} />
                    <span>{baseUnit.name}</span>
                    <span className={styles.count} style={{ color: '#ff6b6b' }}>
                      -{count}
                    </span>
                  </div>
                );
              })}
          </div>
        </>
      )}

      <div className={`${styles.arrow} ${position === 'bottom' ? styles.bottom : styles.top}`} />
    </div>,
    document.body
  );
};
