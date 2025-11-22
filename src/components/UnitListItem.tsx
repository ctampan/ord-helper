import React, { useState, useRef, useMemo } from 'react';
import { getUnitDetails, type Unit } from '../logic/combination';
import styles from './UnitListItem.module.css';
import { RecipeTooltip } from './RecipeTooltip';

interface UnitListItemProps {
  unit: Unit;
  count: number;
  inventory: Record<string, number>;
  bans: Set<string>;
  unitsMap: Map<string, Unit>;
  onClick: (e: React.MouseEvent) => void;
  onRightClick: (e: React.MouseEvent) => void;
  onCountChange: (newCount: number) => void;
}

export const UnitListItem: React.FC<UnitListItemProps> = React.memo(({
  unit,
  count,
  inventory,
  bans,
  unitsMap,
  onClick,
  onRightClick,
  onCountChange
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [imageError, setImageError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    status,
    buildableCount,
    progress,
    materialProgress,
    wispProgress,
    wispCost,
    isWispAssisted
  } = useMemo(() => getUnitDetails(unit.id, unitsMap, inventory, bans), [unit.id, unitsMap, inventory, bans]);

  const isBanned = bans.has(unit.id);

  const handleImageError = () => {
    setImageError(true);
  };

  // Reset error when image changes
  React.useEffect(() => {
    setImageError(false);
  }, [unit.image]);

  return (
    <div
      ref={containerRef}
      className={`${styles.container} ${styles[status]} ${isBanned ? styles.banned : ''}`}
      onClick={onClick}
      onContextMenu={onRightClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={styles.iconWrapper}>
        {!imageError ? (
          <img
            src={unit.image}
            alt={unit.name}
            className={styles.icon}
            onError={handleImageError}
          />
        ) : (
          <div className={styles.fallbackIcon}>
            {unit.name.substring(0, 2)}
          </div>
        )}
        {isBanned && <div className={styles.banOverlay}>BAN</div>}
      </div>

      <div className={styles.info}>
        <div className={styles.nameRow}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, minWidth: 0 }}>
            <span className={styles.name}>{unit.name}</span>
            {buildableCount > 0 && !isBanned && (
              <span className={styles.buildableBadge}>+{buildableCount}</span>
            )}
          </div>
          {status === 'orange' && wispCost > 0 && (
            <span className={styles.wispCost}>{wispCost} 👻</span>
          )}
        </div>

        {progress > 0 && materialProgress < 100 && !isBanned && (
          <div className={styles.progressRow}>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className={styles.progressText}>
              {isWispAssisted ? (
                <>
                  <span className={styles.textGreen}>{Math.round(materialProgress)}%</span>
                  <span className={styles.textOrange}> +{Math.round(wispProgress)}%</span>
                </>
              ) : (
                <span className={styles.textGreen}>{Math.round(progress)}%</span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className={styles.controls} onClick={e => e.stopPropagation()}>
        <input
          type="number"
          min="0"
          value={count}
          onChange={(e) => onCountChange(parseInt(e.target.value) || 0)}
          onWheel={(e) => e.stopPropagation()}
          className={styles.input}
        />
      </div>

      <RecipeTooltip
        unit={unit}
        unitsMap={unitsMap}
        inventory={inventory}
        visible={isHovered}
        parentElement={containerRef.current}
      />
    </div>
  );
});
