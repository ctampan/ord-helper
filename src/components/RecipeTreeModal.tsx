import React, { useEffect } from "react";
import type { Unit } from "../logic/combination";
import { RecipeTreeNode } from "./RecipeTreeNode";
import styles from "./RecipeTreeModal.module.css";

interface RecipeTreeModalProps {
  unitId: string;
  unitsMap: Map<string, Unit>;
  inventory: Record<string, number>;
  onClose: () => void;
}

export const RecipeTreeModal: React.FC<RecipeTreeModalProps> = ({
  unitId,
  unitsMap,
  inventory,
  onClose,
}) => {
  const unit = unitsMap.get(unitId);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!unit) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>Recipe Tree: {unit.name}</span>
          <button className={styles.closeButton} onClick={onClose}>
            ✕
          </button>
        </div>
        <div className={styles.content}>
          <div className={styles.rootNode}>
            <RecipeTreeNode
              unitId={unitId}
              unitsMap={unitsMap}
              inventory={inventory}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
