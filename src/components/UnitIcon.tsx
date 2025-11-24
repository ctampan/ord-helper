import React, { useState, useRef } from "react";
import type { Unit } from "../logic/combination";
import { getRarityColor } from "../logic/rarityColors";
import styles from "./UnitIcon.module.css";
import { RecipeTooltip } from "./RecipeTooltip";

interface UnitIconProps {
  unit: Unit;
  count: number;
  buildableCount: number;
  progress: number;
  materialProgress: number;
  wispProgress: number;
  wispCost: number;
  isWispAssisted: boolean;
  status: "green" | "orange" | "red" | "normal";
  isBanned: boolean;
  unitsMap: Map<string, Unit>;
  inventory: Record<string, number>;
  onClick: (e: React.MouseEvent) => void;
  onRightClick: (e: React.MouseEvent) => void;
  onCountChange: (newCount: number) => void;
  bans: Set<string>;
  isWispEnabled: boolean;
}

export const UnitIcon: React.FC<UnitIconProps> = ({
  unit,
  count,
  buildableCount,
  progress,
  materialProgress,
  wispProgress,
  wispCost,
  isWispAssisted,
  status,
  isBanned,
  unitsMap,
  inventory,
  onClick,
  onRightClick,
  onCountChange,
  bans,
  isWispEnabled,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [imageError, setImageError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleImageError = () => {
    setImageError(true);
  };

  const [prevImage, setPrevImage] = useState(unit.image);
  if (unit.image !== prevImage) {
    setPrevImage(unit.image);
    setImageError(false);
  }

  return (
    <div
      ref={containerRef}
      className={`${styles.container} ${styles[status]} ${
        isBanned ? styles.banned : ""
      }`}
      onClick={onClick}
      onContextMenu={onRightClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={styles.imageWrapper}>
        {!imageError ? (
          <img
            src={unit.image}
            alt={unit.name}
            className={styles.image}
            onError={handleImageError}
            style={{
              border: `2px solid ${getRarityColor(unit.rarity)}`,
              boxSizing: "border-box",
            }}
          />
        ) : (
          <div className={styles.fallbackIcon}>{unit.name.substring(0, 2)}</div>
        )}

        {isBanned && <div className={styles.banOverlay}>BAN</div>}

        {buildableCount > 0 && !isBanned && (
          <div className={styles.buildableBadge}>+{buildableCount}</div>
        )}

        {status === "orange" && wispCost > 0 && (
          <div className={styles.wispBadge}>{wispCost} 👻</div>
        )}

        {progress > 0 && materialProgress < 100 && !isBanned && (
          <>
            <div
              className={styles.progressBar}
              style={{ width: `${progress}%` }}
            />
            <div className={styles.progressText}>
              {isWispAssisted ? (
                <>
                  <span className={styles.textGreen}>
                    {Math.round(materialProgress)}%
                  </span>
                  <span className={styles.textOrange}>
                    {" "}
                    +{Math.round(wispProgress)}%
                  </span>
                </>
              ) : (
                <span className={styles.textGreen}>
                  {Math.round(progress)}%
                </span>
              )}
            </div>
          </>
        )}
      </div>
      <div className={styles.controls} onClick={(e) => e.stopPropagation()}>
        <input
          type="number"
          min="0"
          value={count}
          onChange={(e) => onCountChange(parseInt(e.target.value) || 0)}
          className={styles.input}
        />
      </div>
      <div className={styles.name}>{unit.name}</div>
      <RecipeTooltip
        unit={unit}
        unitsMap={unitsMap}
        inventory={inventory}
        visible={isHovered}
        parentElement={containerRef}
        bans={bans}
        isWispEnabled={isWispEnabled}
      />
    </div>
  );
};
