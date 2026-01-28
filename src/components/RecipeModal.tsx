import React, { useState } from "react";
import { createPortal } from "react-dom";
import type { Unit } from "../logic/combination";
import { RecipeContent } from "./RecipeContent";
import styles from "./RecipeModal.module.css";

interface RecipeModalProps {
  unit: Unit;
  unitsMap: Map<string, Unit>;
  inventory: Record<string, number>;
  bans: Set<string>;
  isWispEnabled: boolean;
  isOpen: boolean;
  onClose: () => void;
}

export const RecipeModal: React.FC<RecipeModalProps> = ({
  unit,
  unitsMap,
  inventory,
  bans,
  isWispEnabled,
  isOpen,
  onClose,
}) => {
  const [currentUnit, setCurrentUnit] = useState<Unit>(unit);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setCurrentUnit(unit);
    }
  }

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  };

  return createPortal(
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button
          className={styles.closeBtn}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          ×
        </button>
        <RecipeContent
          unit={currentUnit}
          unitsMap={unitsMap}
          inventory={inventory}
          bans={bans}
          isWispEnabled={isWispEnabled}
          onUnitClick={setCurrentUnit}
          size="large"
        />
      </div>
    </div>,
    document.body,
  );
};
