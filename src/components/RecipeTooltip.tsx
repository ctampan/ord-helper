import React, { useState, useLayoutEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import type { Unit } from "../logic/combination";
import {
  calculateMissingBaseUnits,
  getUnitDetails,
} from "../logic/combination";
import { getRarityColor } from "../logic/rarityColors";
import styles from "./RecipeTooltip.module.css";

interface RecipeTooltipProps {
  unit: Unit;
  unitsMap: Map<string, Unit>;
  inventory: Record<string, number>;
  visible: boolean;
  parentElement: HTMLElement | null | React.RefObject<HTMLElement | null>;
  bans: Set<string>;
  isWispEnabled: boolean;
}

export const RecipeTooltip: React.FC<RecipeTooltipProps> = ({
  unit,
  unitsMap,
  inventory,
  visible,
  parentElement,
  bans,
  isWispEnabled,
}) => {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [position, setPosition] = useState<"top" | "bottom">("top");

  useLayoutEffect(() => {
    const targetElement =
      parentElement && "current" in parentElement
        ? parentElement.current
        : parentElement;
    if (visible && targetElement && tooltipRef.current) {
      const parentRect = targetElement.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();

      let top = parentRect.top - tooltipRect.height - 10;
      let left = parentRect.left + parentRect.width / 2 - tooltipRect.width / 2;
      let newPosition: "top" | "bottom" = "top";

      if (top < 10) {
        top = parentRect.bottom + 10;
        newPosition = "bottom";
      }

      if (left < 10) left = 10;
      if (left + tooltipRect.width > window.innerWidth - 10) {
        left = window.innerWidth - tooltipRect.width - 10;
      }

      setCoords({ top, left });
      setPosition(newPosition);
    }
  }, [visible, parentElement]);

  const effectiveInventory = useMemo(() => {
    if (isWispEnabled) return inventory;
    return { ...inventory, common_wisp: 0 };
  }, [inventory, isWispEnabled]);

  if (!visible) return null;

  const hasRecipe = unit.recipe && unit.recipe.length > 0;

  const missingBaseUnits = hasRecipe
    ? calculateMissingBaseUnits(unit.id, unitsMap, inventory, bans)
    : {};
  const hasMissing = Object.keys(missingBaseUnits).length > 0;

  // Find units that directly use this unit in their recipe
  const usedInUnits = Array.from(unitsMap.values()).filter((u) =>
    u.recipe?.some((req) => req.unitId === unit.id)
  );

  // Find top-tier units (Transcendence onward) that eventually need this unit
  const topTierRarities = [
    "Transcendence",
    "Limited",
    "Immortal",
    "Eternal",
    "Mystic",
  ];
  const findUnitInRecipeTree = (
    targetUnit: Unit,
    searchUnitId: string,
    visited = new Set<string>()
  ): boolean => {
    if (visited.has(targetUnit.id)) return false;
    visited.add(targetUnit.id);

    if (!targetUnit.recipe) return false;

    for (const req of targetUnit.recipe) {
      if (req.unitId === searchUnitId) return true;
      const reqUnit = unitsMap.get(req.unitId);
      if (reqUnit && findUnitInRecipeTree(reqUnit, searchUnitId, visited)) {
        return true;
      }
    }
    return false;
  };

  const topTierUnits = Array.from(unitsMap.values()).filter(
    (u) =>
      topTierRarities.includes(u.rarity) && findUnitInRecipeTree(u, unit.id)
  );

  return createPortal(
    <div
      ref={tooltipRef}
      className={`${styles.tooltip} ${visible ? styles.visible : ""} ${
        position === "bottom" ? styles.bottom : ""
      }`}
      style={{
        top: coords.top,
        left: coords.left,
        position: "fixed",
        transform: "none",
        margin: 0,
        minWidth: "300px",
        backgroundColor: "#1a1a1a",
        border: "1px solid #404040",
        borderRadius: "8px",
        padding: "12px",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
        zIndex: 9999,
        opacity: visible ? 1 : 0,
        height: "fit-content",
      }}
    >
      <div className={styles.title}>{unit.name}</div>
      {unit.note && <div className={styles.note}>{unit.note}</div>}

      {hasRecipe && (
        <div className={styles.ingredients}>
          {unit.recipe!.map((req, index) => {
            const ingredient = unitsMap.get(req.unitId);
            if (!ingredient) return null;

            const have = inventory[req.unitId] || 0;
            const need = req.count;
            const isEnough = have >= need;

            // Check if ingredient is buildable if we don't have enough
            let buildStatus: string = "gray";
            if (!isEnough) {
              const details = getUnitDetails(
                req.unitId,
                unitsMap,
                effectiveInventory,
                bans
              );
              buildStatus = details.status;
            }

            return (
              <div key={index} className={styles.ingredient}>
                <div style={{ position: "relative", display: "inline-block" }}>
                  <img
                    src={ingredient.image}
                    alt={ingredient.name}
                    className={styles.icon}
                    style={{
                      border: `2px solid ${getRarityColor(ingredient.rarity)}`,
                      borderRadius: "2px",
                      boxSizing: "border-box",
                    }}
                  />
                  {!isEnough &&
                    buildStatus !== "gray" &&
                    buildStatus !== "red" && (
                      <div
                        style={{
                          position: "absolute",
                          top: "-2px",
                          right: "-2px",
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          backgroundColor:
                            buildStatus === "green" ? "#22c55e" : "#f97316",
                          border: "1px solid #000",
                        }}
                      />
                    )}
                </div>
                <span>
                  {ingredient.name} - {ingredient.rarity}
                </span>
                <span
                  className={styles.count}
                  style={{ color: isEnough ? "inherit" : "#ff6b6b" }}
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
          <div style={{ borderTop: "1px solid #404040", margin: "8px 0" }} />
          <div
            style={{
              fontSize: "0.75rem",
              fontWeight: "bold",
              marginBottom: "4px",
              color: "#ff6b6b",
            }}
          >
            Missing Base Units (
            {Object.values(missingBaseUnits).reduce(
              (sum, count) => sum + count,
              0
            )}
            ):
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(32px, 1fr))",
              gap: "4px",
            }}
          >
            {Object.entries(missingBaseUnits)
              .sort(([idA], [idB]) => {
                const unitsArray = Array.from(unitsMap.values());
                const indexA = unitsArray.findIndex((u) => u.id === idA);
                const indexB = unitsArray.findIndex((u) => u.id === idB);
                return indexA - indexB;
              })
              .slice(0, 15)
              .map(([unitId, count]) => {
                const baseUnit = unitsMap.get(unitId);
                if (!baseUnit) return null;

                // Check if base unit is buildable (unlikely for base units, but possible for uncommons etc if they appear here)
                const details = getUnitDetails(
                  unitId,
                  unitsMap,
                  effectiveInventory,
                  bans
                );
                const buildStatus = details.status;

                return (
                  <div key={unitId} style={{ position: "relative" }}>
                    <img
                      src={baseUnit.image}
                      alt={baseUnit.name}
                      title={`${baseUnit.name} (-${count})`}
                      style={{
                        width: "32px",
                        height: "32px",
                        objectFit: "cover",
                        borderRadius: "2px",
                        cursor: "help",
                        border: `2px solid ${getRarityColor(baseUnit.rarity)}`,
                      }}
                    />
                    {buildStatus !== "red" && (
                      <div
                        style={{
                          position: "absolute",
                          top: "-2px",
                          right: "-2px",
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          backgroundColor:
                            buildStatus === "green" ? "#22c55e" : "#f97316",
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
                        backgroundColor: "rgba(0, 0, 0, 0.8)",
                        color: "#ff6b6b",
                        fontSize: "0.8rem",
                        fontWeight: "bold",
                        padding: "0 2px",
                        borderRadius: "2px",
                        lineHeight: "1",
                      }}
                    >
                      -{count}
                    </div>
                  </div>
                );
              })}
          </div>
          {Object.keys(missingBaseUnits).length > 15 && (
            <div style={{ fontSize: "0.7rem", opacity: 0.6, marginTop: "2px" }}>
              +{Object.keys(missingBaseUnits).length - 15} more
            </div>
          )}
        </>
      )}

      {usedInUnits.length > 0 && (
        <>
          <div style={{ borderTop: "1px solid #404040", margin: "8px 0" }} />
          <div
            style={{
              fontSize: "0.75rem",
              fontWeight: "bold",
              marginBottom: "4px",
              color: "#4ade80",
            }}
          >
            Used In ({usedInUnits.length}):
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(32px, 1fr))",
              gap: "4px",
            }}
          >
            {usedInUnits.slice(0, 15).map((usedUnit) => (
              <img
                key={usedUnit.id}
                src={usedUnit.image}
                alt={usedUnit.name}
                title={`${usedUnit.name} (${usedUnit.rarity})`}
                style={{
                  width: "32px",
                  height: "32px",
                  objectFit: "cover",
                  borderRadius: "2px",
                  cursor: "help",
                  border: `2px solid ${getRarityColor(usedUnit.rarity)}`,
                }}
              />
            ))}
          </div>
          {usedInUnits.length > 15 && (
            <div style={{ fontSize: "0.7rem", opacity: 0.6, marginTop: "2px" }}>
              +{usedInUnits.length - 15} more
            </div>
          )}
        </>
      )}

      {topTierUnits.length > 0 && (
        <>
          <div style={{ borderTop: "1px solid #404040", margin: "8px 0" }} />
          <div
            style={{
              fontSize: "0.75rem",
              fontWeight: "bold",
              marginBottom: "4px",
              color: "#fbbf24",
            }}
          >
            Top Tier ({topTierUnits.length}):
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(32px, 1fr))",
              gap: "4px",
            }}
          >
            {topTierUnits.slice(0, 15).map((topUnit) => (
              <img
                key={topUnit.id}
                src={topUnit.image}
                alt={topUnit.name}
                title={`${topUnit.name} (${topUnit.rarity})`}
                style={{
                  width: "32px",
                  height: "32px",
                  objectFit: "cover",
                  borderRadius: "2px",
                  cursor: "help",
                  border: `2px solid ${getRarityColor(topUnit.rarity)}`,
                }}
              />
            ))}
          </div>
          {topTierUnits.length > 15 && (
            <div style={{ fontSize: "0.7rem", opacity: 0.6, marginTop: "2px" }}>
              +{topTierUnits.length - 15} more
            </div>
          )}
        </>
      )}

      <div
        className={`${styles.arrow} ${
          position === "bottom" ? styles.bottom : styles.top
        }`}
      />
    </div>,
    document.body
  );
};
