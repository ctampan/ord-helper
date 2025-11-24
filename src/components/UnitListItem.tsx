import React, { useState, useRef, useMemo, useDeferredValue } from "react";
import { getUnitDetails, type Unit } from "../logic/combination";
import { getRarityColor } from "../logic/rarityColors";
import styles from "./UnitListItem.module.css";
import { RecipeTooltip } from "./RecipeTooltip";

interface UnitListItemProps {
  unit: Unit;
  count: number;
  inventory: Record<string, number>;
  bans: Set<string>;
  effectiveBans: Set<string>;
  unitsMap: Map<string, Unit>;
  onAction: (
    unitId: string,
    isRightClick: boolean,
    isCtrlPressed: boolean,
    isAltPressed: boolean
  ) => void;
  onCountChange: (newCount: number) => void;
  isTooltipEnabled: boolean;
  isShiftPressed: boolean;
  isWispEnabled: boolean;
}

export const UnitListItem: React.FC<UnitListItemProps> = React.memo(
  ({
    unit,
    count,
    inventory,
    bans,
    effectiveBans,
    unitsMap,
    onAction,
    onCountChange,
    isTooltipEnabled,
    isShiftPressed,
    isWispEnabled,
  }) => {
    const [isHovered, setIsHovered] = useState(false);
    const [imageError, setImageError] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Defer the inventory and bans updates to prevent blocking the UI
    // The count (input) will update immediately, but the status colors will update slightly later
    const deferredInventory = useDeferredValue(inventory);
    const deferredBans = useDeferredValue(bans);

    const effectiveInventory = useMemo(() => {
      if (isWispEnabled) return deferredInventory;
      return { ...deferredInventory, common_wisp: 0 };
    }, [deferredInventory, isWispEnabled]);

    const {
      status,
      buildableCount,
      progress,
      materialProgress,
      wispProgress,
      wispCost,
      isWispAssisted,
    } = useMemo(
      () => getUnitDetails(unit.id, unitsMap, effectiveInventory, deferredBans),
      [unit.id, unitsMap, effectiveInventory, deferredBans]
    );

    // Use effectiveBans for visual disabling
    const isBanned = effectiveBans.has(unit.id);

    const handleImageError = () => {
      setImageError(true);
    };

    const [prevImage, setPrevImage] = useState(unit.image);
    if (unit.image !== prevImage) {
      setPrevImage(unit.image);
      setImageError(false);
    }

    // Determine tooltip visibility
    // Logic: Default is hidden. Shift key toggles it ON temporarily.
    // If option is "Always On", then it's always visible on hover.
    const showTooltip = isHovered && (isTooltipEnabled || isShiftPressed);

    const handleLeftClick = (e: React.MouseEvent) => {
      e.preventDefault();
      onAction(unit.id, false, e.ctrlKey, e.altKey);
    };

    const handleRightClick = (e: React.MouseEvent) => {
      e.preventDefault();
      onAction(unit.id, true, e.ctrlKey, false);
    };

    return (
      <div
        ref={containerRef}
        className={`${styles.container} ${styles[status]} ${
          isBanned ? styles.banned : ""
        }`}
        onClick={handleLeftClick}
        onContextMenu={handleRightClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Background Progress Bar */}
        {progress > 0 && !isBanned && (
          <div
            className={`${styles.progressBackground} ${
              progress < 100 ? styles.gray : ""
            }`}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        )}

        <div className={styles.contentWrapper}>
          <div className={styles.iconWrapper}>
            {!imageError ? (
              <img
                src={unit.image}
                alt={unit.name}
                className={styles.icon}
                onError={handleImageError}
                style={{
                  border: `2px solid ${getRarityColor(unit.rarity)}`,
                  boxSizing: "border-box",
                }}
              />
            ) : (
              <div className={styles.fallbackIcon}>
                {unit.name.substring(0, 2)}
              </div>
            )}
            {isBanned && <div className={styles.banOverlay}>BAN</div>}
          </div>

          {progress > 0 &&
            !isBanned &&
            unit.rarity !== "Common" &&
            (isWispAssisted || progress < 100) && (
              <div className={styles.progressContainer}>
                {isWispAssisted ? (
                  <div className={styles.splitProgress}>
                    <span className={styles.textGreen}>
                      {Math.round(materialProgress)}%
                    </span>
                    <span className={styles.separator}>+</span>
                    <span className={styles.textOrange}>
                      {Math.round(wispProgress)}%
                    </span>
                  </div>
                ) : (
                  <span className={styles.textGreen}>
                    {Math.round(progress)}%
                  </span>
                )}
              </div>
            )}

          <div className={styles.info}>
            <div className={styles.nameRow}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <span className={styles.name}>{unit.name}</span>
                {buildableCount > 0 && !isBanned && (
                  <span className={styles.buildableBadge}>
                    +{buildableCount}
                  </span>
                )}
              </div>
              {status === "orange" && wispCost > 0 && (
                <span className={styles.wispCost}>{wispCost} 👻</span>
              )}
            </div>
          </div>

          <div className={styles.controls} onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={count}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                onCountChange(isNaN(val) ? 0 : val);
              }}
              onFocus={(e) => e.target.select()}
              className={styles.input}
            />
          </div>
        </div>

        {showTooltip && (
          <RecipeTooltip
            unit={unit}
            unitsMap={unitsMap}
            inventory={inventory}
            visible={showTooltip}
            parentElement={containerRef}
            bans={bans}
            isWispEnabled={isWispEnabled}
          />
        )}
      </div>
    );
  }
);
