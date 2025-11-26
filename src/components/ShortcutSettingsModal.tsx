import React, { useState, useEffect } from "react";
import styles from "./ShortcutSettingsModal.module.css";
import { GLOBAL_ACTIONS } from "../hooks/useShortcuts";
import type { Unit } from "../logic/combination";

interface ShortcutSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  unitShortcuts: Record<string, string>;
  globalShortcuts: Record<string, string>;
  setUnitShortcut: (unitId: string, key: string) => void;
  setGlobalShortcut: (actionId: string, key: string) => void;
  removeUnitShortcut: (unitId: string) => void;
  removeGlobalShortcut: (actionId: string) => void;
  resetShortcuts: () => void;
  unitsMap: Map<string, Unit>;
}

export const ShortcutSettingsModal: React.FC<ShortcutSettingsModalProps> = ({
  isOpen,
  onClose,
  unitShortcuts,
  globalShortcuts,
  setUnitShortcut,
  setGlobalShortcut,
  removeUnitShortcut,
  removeGlobalShortcut,
  resetShortcuts,
  unitsMap,
}) => {
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [recordingType, setRecordingType] = useState<"unit" | "global" | null>(
    null
  );
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (recordingId && recordingType) {
        e.preventDefault();
        e.stopPropagation();

        const key = e.key.toLowerCase();

        // Ignore modifier keys alone
        if (["control", "shift", "alt", "meta"].includes(key)) return;

        if (recordingType === "unit") {
          setUnitShortcut(recordingId, key);
          setSearchTerm("");
        } else {
          setGlobalShortcut(recordingId, key);
        }

        setRecordingId(null);
        setRecordingType(null);
      }
    };

    if (recordingId) {
      window.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [recordingId, recordingType, setUnitShortcut, setGlobalShortcut]);

  if (!isOpen) return null;

  const sortedUnits = Array.from(unitsMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const filteredUnits = sortedUnits.filter((u) =>
    u.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>Shortcut Settings</span>
          <button className={styles.closeButton} onClick={onClose}>
            &times;
          </button>
        </div>

        <div className={styles.content}>
          {/* Global Shortcuts */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Global Shortcuts</div>
            <div className={styles.shortcutList}>
              {Object.entries(GLOBAL_ACTIONS).map(([id, label]) => (
                <div key={id} className={styles.shortcutItem}>
                  <span className={styles.actionName}>{label}</span>
                  <div className={styles.keyBind}>
                    <div
                      className={`${styles.keyDisplay} ${
                        recordingId === id ? styles.recording : ""
                      }`}
                      onClick={() => {
                        setRecordingId(id);
                        setRecordingType("global");
                      }}
                    >
                      {recordingId === id
                        ? "Press Key..."
                        : globalShortcuts[id] || "None"}
                    </div>
                    {globalShortcuts[id] && (
                      <button
                        className={styles.removeButton}
                        onClick={() => removeGlobalShortcut(id)}
                      >
                        &times;
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Unit Shortcuts */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Unit Shortcuts</div>

            {/* Add Unit Shortcut */}
            <div className={styles.addUnitSection}>
              <input
                type="text"
                placeholder="Search unit to add shortcut..."
                className={styles.unitSelect}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {searchTerm && (
              <div
                className={styles.shortcutList}
                style={{ maxHeight: "150px", overflowY: "auto" }}
              >
                {filteredUnits.slice(0, 5).map((unit) => (
                  <div key={unit.id} className={styles.shortcutItem}>
                    <span className={styles.actionName}>
                      {unit.name} - {unit.rarity}
                    </span>
                    <div className={styles.keyBind}>
                      <div
                        className={`${styles.keyDisplay} ${
                          recordingId === unit.id ? styles.recording : ""
                        }`}
                        onClick={() => {
                          setRecordingId(unit.id);
                          setRecordingType("unit");
                        }}
                      >
                        Assign
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className={styles.shortcutList}>
              {Object.entries(unitShortcuts).map(([unitId, key]) => {
                const unit = unitsMap.get(unitId);
                if (!unit) return null;
                return (
                  <div key={unitId} className={styles.shortcutItem}>
                    <span className={styles.actionName}>{unit.name}</span>
                    <div className={styles.keyBind}>
                      <div
                        className={`${styles.keyDisplay} ${
                          recordingId === unitId ? styles.recording : ""
                        }`}
                        onClick={() => {
                          setRecordingId(unitId);
                          setRecordingType("unit");
                        }}
                      >
                        {recordingId === unitId ? "Press Key..." : key}
                      </div>
                      <button
                        className={styles.removeButton}
                        onClick={() => removeUnitShortcut(unitId)}
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                );
              })}
              {Object.keys(unitShortcuts).length === 0 && (
                <div
                  style={{
                    color: "var(--text-secondary)",
                    fontStyle: "italic",
                  }}
                >
                  No unit shortcuts set. Search above to add one.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <button
            className={styles.resetButton}
            onClick={() => {
              if (confirm("Reset all shortcuts to default?")) {
                resetShortcuts();
              }
            }}
          >
            Reset All
          </button>
        </div>
      </div>
    </div>
  );
};
