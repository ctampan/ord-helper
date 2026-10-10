import React, { useState } from "react";
import { createPortal } from "react-dom";
import type { Unit } from "../logic/combination";
import { RecipeContent, RecipeHeader } from "./RecipeContent";
import { UnitCapabilities } from "./UnitCapabilities";
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
  const [history, setHistory] = useState<Unit[]>([]);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setCurrentUnit(unit);
      setHistory([]);
    }
  }

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  };

  const handleUnitClick = (nextUnit: Unit) => {
    if (nextUnit.id === currentUnit.id) return;
    setHistory((prev) => [...prev, currentUnit]);
    setCurrentUnit(nextUnit);
  };

  const handleUndo = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    setCurrentUnit(last);
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  };

  return createPortal(
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Recipe details" onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalActions}>
          {history.length > 0 && (
            <button
              className={styles.backBtn}
              onClick={handleUndo}
              title="Go Back"
            >
              ↩
            </button>
          )}
          <button className={styles.closeBtn} aria-label="Close recipe" onClick={handleClose}>
            ×
          </button>
        </div>
        <RecipeHeader unit={currentUnit} size="large" />
        <UnitCapabilities unit={currentUnit} />
        <RecipeContent
          unit={currentUnit}
          unitsMap={unitsMap}
          inventory={inventory}
          bans={bans}
          isWispEnabled={isWispEnabled}
          onUnitClick={handleUnitClick}
          size="large"
          showHeader={false}
        />
      </div>
    </div>,
    document.body,
  );
};
