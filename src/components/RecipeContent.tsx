import React, { useMemo } from "react";
import { CachedImage } from "./CachedImage";
import { displayAbilityText } from "../logic/capabilities";
import type { Unit } from "../logic/combination";
import {
  calculateMissingBaseUnits,
  getEffectiveBans,
  getUnitDetails,
} from "../logic/combination";
import { getRecipeIndex } from "../logic/recipeIndex";
import { getRarityColor } from "../logic/rarityColors";
import styles from "./RecipeContent.module.css";

interface RecipeContentProps {
  unit: Unit;
  unitsMap: Map<string, Unit>;
  inventory: Record<string, number>;
  bans: Set<string>;
  isWispEnabled: boolean;
  onUnitClick?: (unit: Unit) => void;
  size?: "small" | "large";
  showHeader?: boolean;
}

export function RecipeHeader({ unit, size = "small" }: { unit: Unit; size?: "small" | "large" }) {
  return <div className={`${styles.recipeContent} ${size === "large" ? styles.large : ""}`}>
    <div className={styles.title}>{unit.name}</div>
    {unit.note && <div className={styles.note}>{displayAbilityText(unit.note)}</div>}
  </div>;
}

export const RecipeContent: React.FC<RecipeContentProps> = React.memo(({
  unit,
  unitsMap,
  inventory,
  bans,
  isWispEnabled,
  onUnitClick,
  size = "small",
  showHeader = true,
}) => {
  const isLarge = size === "large";

  const effectiveInventory = useMemo(() => {
    if (isWispEnabled) return inventory;
    return { ...inventory, common_wisp: 0 };
  }, [inventory, isWispEnabled]);

  const effectiveBans = useMemo(() => getEffectiveBans(unitsMap, bans), [unitsMap, bans]);
  const isEffectivelyBanned = (unitId: string) => effectiveBans.has(unitId);

  // Special handling for Common units and Common Wisp
  const isWisp = unit.id === "common_wisp";
  const isCommon = unit.rarity === "Common" && !isWisp;

  const displayRecipe = useMemo(() => {
    if (isCommon) {
      return [{ unitId: "common_wisp", count: 1 }];
    }
    return unit.recipe;
  }, [unit, isCommon]);

  const hasRecipe = displayRecipe && displayRecipe.length > 0;

  const missingBaseUnits = useMemo(() => hasRecipe
    ? calculateMissingBaseUnits(unit.id, unitsMap, inventory, bans) : {},
  [hasRecipe, unit.id, unitsMap, inventory, bans]);
  const hasMissing = Object.keys(missingBaseUnits).length > 0;

  // Calculate missing stats for display
  let totalMissingCount = 0;

  if (hasMissing) {
    totalMissingCount = Object.values(missingBaseUnits).reduce(
      (sum, count) => (sum as number) + (count as number),
      0,
    ) as number;
  }

  const recipeIndex = getRecipeIndex(unitsMap);
  const usedInUnits = recipeIndex.usedIn.get(unit.id) || [];
  const topTierUnits = recipeIndex.topTier.get(unit.id) || [];

  return (
    <div className={`${styles.recipeContent} ${isLarge ? styles.large : ""}`}>
      {showHeader && <RecipeHeader unit={unit} size={size} />}
      {hasRecipe && (
        <div className={styles.ingredients}>
          {displayRecipe!.map((req, index) => {
            const ingredient = unitsMap.get(req.unitId);
            if (!ingredient) return null;

            const have = inventory[req.unitId] || 0;
            const need = req.count;
            const isEnough = have >= need;
            const isBanned = isEffectivelyBanned(req.unitId);

            // Check if ingredient is buildable if we don't have enough
            let buildStatus: string = "gray";
            if (!isEnough) {
              const details = getUnitDetails(
                req.unitId,
                unitsMap,
                effectiveInventory,
                bans,
              );
              buildStatus = details.status;
            }

            return (
              <div
                key={index}
                className={`${styles.ingredient} ${onUnitClick ? styles.clickable : ""}`}
                onClick={() => onUnitClick?.(ingredient)}
              >
                <div style={{ position: "relative", display: "inline-block" }}>
                  <CachedImage
                    src={ingredient.image}
                    alt={ingredient.name}
                    className={styles.icon}
                    style={{
                      border: `2px solid ${getRarityColor(ingredient.rarity)}`,
                      borderRadius: "2px",
                      boxSizing: "border-box",
                      filter: isBanned
                        ? "grayscale(100%) brightness(0.5)"
                        : "none",
                      opacity: isBanned ? 0.6 : 1,
                    }}
                  />
                  {(isEnough ||
                    (buildStatus !== "gray" && buildStatus !== "red")) && (
                    <div
                      style={{
                        position: "absolute",
                        top: "-2px",
                        right: "-2px",
                        width: isLarge ? "12px" : "8px",
                        height: isLarge ? "12px" : "8px",
                        borderRadius: "50%",
                        backgroundColor: isEnough
                          ? "#3b82f6"
                          : buildStatus === "green"
                            ? "#22c55e"
                            : "#f97316",
                        border: "1px solid #000",
                      }}
                    />
                  )}
                </div>
                <span
                  style={{
                    color: isBanned ? "var(--text-muted)" : "inherit",
                    textDecoration: isBanned ? "line-through" : "none",
                  }}
                >
                  {ingredient.name} - {ingredient.rarity}
                </span>
                <span
                  className={styles.count}
                  style={{ color: isEnough ? "inherit" : "var(--status-red)" }}
                >
                  x{need}{" "}
                  <span style={{ opacity: 0.7, fontSize: "0.9em" }}>
                    (Have: {have})
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {hasMissing && (
        <>
          <div
            style={{
              borderTop: "1px solid var(--border-color)",
              margin: "12px 0",
            }}
          />
          <div
            style={{
              fontSize: isLarge ? "1.1rem" : "0.75rem",
              fontWeight: "bold",
              marginBottom: "8px",
              color: "var(--status-red)",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>Missing Base Units: {totalMissingCount}</span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(auto-fill, minmax(${isLarge ? "48px" : "32px"}, 1fr))`,
              gap: "8px",
            }}
          >
            {(() => {
              const sortedEntries = Object.entries(missingBaseUnits).sort(
                ([idA], [idB]) => {
                  const unitsArray = Array.from(unitsMap.values());
                  const indexA = unitsArray.findIndex((u) => u.id === idA);
                  const indexB = unitsArray.findIndex((u) => u.id === idB);
                  return indexA - indexB;
                },
              );
              const limit = 15;
              const displayEntries = isLarge
                ? sortedEntries
                : sortedEntries.slice(0, limit);
              const moreCount = sortedEntries.length - displayEntries.length;

              return (
                <>
                  {displayEntries.map(([unitId, count]) => {
                    const baseUnit = unitsMap.get(unitId);
                    if (!baseUnit) return null;

                    const details = getUnitDetails(
                      unitId,
                      unitsMap,
                      effectiveInventory,
                      bans,
                    );
                    const buildStatus = details.status;

                    return (
                      <div
                        key={unitId}
                        style={{ position: "relative" }}
                        className={onUnitClick ? styles.clickable : ""}
                        onClick={() => onUnitClick?.(baseUnit)}
                      >
                        <CachedImage
                          src={baseUnit.image}
                          alt={baseUnit.name}
                          title={`${baseUnit.name} (-${count})`}
                          style={{
                            width: isLarge ? "48px" : "32px",
                            height: isLarge ? "48px" : "32px",
                            objectFit: "cover",
                            borderRadius: "4px",
                            cursor: "pointer",
                            border: `2px solid ${getRarityColor(baseUnit.rarity)}`,
                          }}
                        />
                        {buildStatus !== "red" && (
                          <div
                            style={{
                              position: "absolute",
                              top: "-4px",
                              right: "-4px",
                              width: isLarge ? "12px" : "8px",
                              height: isLarge ? "12px" : "8px",
                              borderRadius: "50%",
                              backgroundColor:
                                buildStatus === "green"
                                  ? "var(--status-green)"
                                  : "var(--status-orange)",
                              border: "1px solid #000",
                              zIndex: 1,
                            }}
                          />
                        )}
                        <div
                          style={{
                            position: "absolute",
                            bottom: 0,
                            right: 0,
                            backgroundColor: "rgba(0, 0, 0, 0.7)",
                            color: "#ff9b9b",
                            fontSize: isLarge ? "1rem" : "0.8rem",
                            fontWeight: "bold",
                            padding: "0 4px",
                            borderRadius: "2px",
                            lineHeight: "1",
                            textShadow: "0 0 2px black",
                          }}
                        >
                          -{count}
                        </div>
                      </div>
                    );
                  })}
                  {moreCount > 0 && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        fontSize: "0.8rem",
                        color: "var(--text-muted)",
                        paddingLeft: "4px",
                      }}
                    >
                      +{moreCount} more
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </>
      )}

      {usedInUnits.length > 0 && (
        <>
          <div
            style={{
              borderTop: "1px solid var(--border-color)",
              margin: "12px 0",
            }}
          />
          <div
            style={{
              fontSize: isLarge ? "1.1rem" : "0.75rem",
              fontWeight: "bold",
              marginBottom: "8px",
              color: "var(--status-green)",
            }}
          >
            Used In ({usedInUnits.length}):
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(auto-fill, minmax(${isLarge ? "48px" : "32px"}, 1fr))`,
              gap: "8px",
              alignItems: "center",
            }}
          >
            {(() => {
              const limit = 15;
              const displayUnits = isLarge
                ? usedInUnits
                : usedInUnits.slice(0, limit);
              const moreCount = usedInUnits.length - displayUnits.length;

              return (
                <>
                  {displayUnits.map((usedUnit) => {
                    const isBanned = isEffectivelyBanned(usedUnit.id);
                    return (
                      <div
                        key={usedUnit.id}
                        className={onUnitClick ? styles.clickable : ""}
                        onClick={() => onUnitClick?.(usedUnit)}
                      >
                        <CachedImage
                          src={usedUnit.image}
                          alt={usedUnit.name}
                          title={`${usedUnit.name} (${usedUnit.rarity})`}
                          style={{
                            width: isLarge ? "48px" : "32px",
                            height: isLarge ? "48px" : "32px",
                            objectFit: "cover",
                            borderRadius: "4px",
                            cursor: "pointer",
                            border: `2px solid ${getRarityColor(
                              usedUnit.rarity,
                            )}`,
                            filter: isBanned
                              ? "grayscale(100%) brightness(0.5)"
                              : "none",
                            opacity: isBanned ? 0.6 : 1,
                          }}
                        />
                      </div>
                    );
                  })}
                  {moreCount > 0 && (
                    <div
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--text-muted)",
                        paddingLeft: "4px",
                      }}
                    >
                      +{moreCount} more
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </>
      )}

      {topTierUnits.length > 0 && (
        <>
          <div
            style={{
              borderTop: "1px solid var(--border-color)",
              margin: "12px 0",
            }}
          />
          <div
            style={{
              fontSize: isLarge ? "1.1rem" : "0.75rem",
              fontWeight: "bold",
              marginBottom: "8px",
              color: "var(--status-orange)",
            }}
          >
            Top Tier ({topTierUnits.length}):
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(auto-fill, minmax(${isLarge ? "48px" : "32px"}, 1fr))`,
              gap: "8px",
              alignItems: "center",
            }}
          >
            {(() => {
              const limit = 15;
              const displayUnits = isLarge
                ? topTierUnits
                : topTierUnits.slice(0, limit);
              const moreCount = topTierUnits.length - displayUnits.length;

              return (
                <>
                  {displayUnits.map((topUnit) => {
                    const isBanned = isEffectivelyBanned(topUnit.id);
                    return (
                      <div
                        key={topUnit.id}
                        className={onUnitClick ? styles.clickable : ""}
                        onClick={() => onUnitClick?.(topUnit)}
                      >
                        <CachedImage
                          src={topUnit.image}
                          alt={topUnit.name}
                          title={`${topUnit.name} (${topUnit.rarity})`}
                          style={{
                            width: isLarge ? "48px" : "32px",
                            height: isLarge ? "48px" : "32px",
                            objectFit: "cover",
                            borderRadius: "4px",
                            cursor: "pointer",
                            border: `2px solid ${getRarityColor(
                              topUnit.rarity,
                            )}`,
                            filter: isBanned
                              ? "grayscale(100%) brightness(0.5)"
                              : "none",
                            opacity: isBanned ? 0.6 : 1,
                          }}
                        />
                      </div>
                    );
                  })}
                  {moreCount > 0 && (
                    <div
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--text-muted)",
                        paddingLeft: "4px",
                      }}
                    >
                      +{moreCount} more
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </>
      )}
    </div>
  );
});
