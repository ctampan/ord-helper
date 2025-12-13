import React, { useState } from "react";
import type { Unit } from "../logic/combination";
import { getRarityColor } from "../logic/rarityColors";
import styles from "./RecipeTreeModal.module.css";
import { CachedImage } from "./CachedImage";

interface RecipeTreeNodeProps {
  unitId: string;
  unitsMap: Map<string, Unit>;
  inventory: Record<string, number>;
  count?: number; // How many of this unit are needed
}

export const RecipeTreeNode: React.FC<RecipeTreeNodeProps> = ({
  unitId,
  unitsMap,
  inventory,
  count = 1,
}) => {
  const unit = unitsMap.get(unitId);
  const ownedCount = inventory[unitId] || 0;
  const isOwned = unit ? ownedCount >= count : false;

  // Collapsed state: Default to true if unit is fully owned
  const [collapsed, setCollapsed] = useState(isOwned);

  if (!unit) return null;

  const rarityColor = getRarityColor(unit.rarity);

  const recipe = unit.recipe || [];

  // Split ingredients into "complex" (has recipe) and "base" (no recipe)
  const complexIngredients = recipe.filter((req) => {
    const reqUnit = unitsMap.get(req.unitId);
    return reqUnit && reqUnit.recipe && reqUnit.recipe.length > 0;
  });

  const baseIngredients = recipe.filter((req) => {
    const reqUnit = unitsMap.get(req.unitId);
    return !reqUnit || !reqUnit.recipe || reqUnit.recipe.length === 0;
  });

  const hasChildren =
    complexIngredients.length > 0 || baseIngredients.length > 0;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasChildren) {
      setCollapsed(!collapsed);
    }
  };

  return (
    <div className={styles.nodeContainer}>
      <div
        className={`${styles.nodeContent} ${
          hasChildren ? styles.clickable : ""
        }`}
        onClick={handleToggle}
        style={{
          borderColor: isOwned ? "#4ade80" : "var(--border-color)",
          opacity: isOwned ? 1 : 0.9,
        }}
      >
        <CachedImage
          src={unit.image}
          alt={unit.name}
          className={styles.nodeIcon}
          style={{ border: `2px solid ${rarityColor}` }}
        />
        <span className={styles.nodeName}>{unit.name}</span>
        <span
          className={styles.nodeCount}
          style={{ color: isOwned ? "#4ade80" : "#ef4444" }}
        >
          {ownedCount} / {count}
        </span>
        {hasChildren && (
          <div className={styles.toggleIndicator}>{collapsed ? "+" : "-"}</div>
        )}
      </div>

      {!collapsed && hasChildren && (
        <div className={styles.childrenContainer}>
          {/* Render Complex Ingredients (Recursive Tree Nodes) */}
          {complexIngredients.map((req, index) => (
            <RecipeTreeNode
              key={`complex-${req.unitId}-${index}`}
              unitId={req.unitId}
              unitsMap={unitsMap}
              inventory={inventory}
              count={req.count * count}
            />
          ))}

          {/* Render Base Ingredients (Compact Grid) */}
          {baseIngredients.length > 0 && (
            <div className={styles.nodeContainer}>
              <div className={styles.baseIngredientsGrid}>
                {baseIngredients.map((req, index) => {
                  const reqUnit = unitsMap.get(req.unitId);
                  if (!reqUnit) return null;

                  const reqCount = req.count * count;
                  const reqOwned = inventory[req.unitId] || 0;
                  const reqIsOwned = reqOwned >= reqCount;
                  const reqRarityColor = getRarityColor(reqUnit.rarity);

                  return (
                    <div
                      key={`base-${req.unitId}-${index}`}
                      className={styles.baseIngredientItem}
                      style={{
                        borderColor: reqIsOwned
                          ? "#4ade80"
                          : "var(--border-color)",
                        opacity: reqIsOwned ? 1 : 0.8,
                      }}
                    >
                      <CachedImage
                        src={reqUnit.image}
                        className={styles.baseIcon}
                        style={{ border: `1px solid ${reqRarityColor}` }}
                      />
                      <span className={styles.baseName}>{reqUnit.name}</span>
                      <span
                        className={styles.baseCount}
                        style={{ color: reqIsOwned ? "#4ade80" : "#ef4444" }}
                      >
                        {reqOwned}/{reqCount}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
