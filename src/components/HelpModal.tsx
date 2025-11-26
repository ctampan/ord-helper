import React from "react";
import { createPortal } from "react-dom";
import styles from "./HelpModal.module.css";

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>ORD Helper Features</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            ×
          </button>
        </div>
        <div className={styles.content}>
          <section>
            <h3>Unit Interaction</h3>
            <ul>
              <li>
                <strong>Left Click:</strong> Add 1 unit to inventory.
              </li>
              <li>
                <strong>Right Click:</strong> Build 1 unit (consumes materials
                from inventory).
              </li>
              <li>
                <strong>Ctrl + Left Click:</strong> Remove 1 unit from
                inventory.
              </li>
              <li>
                <strong>Ctrl + Right Click:</strong> Remove 1 unit and refund
                its recipe materials.
              </li>
              <li>
                <strong>Alt + Click:</strong> Open Recipe Tree Visualizer (shows
                full recipe hierarchy).
              </li>
              <li>
                <strong>Shift + Hover:</strong> Temporarily show recipe tooltip
                (if disabled).
              </li>
            </ul>
          </section>

          <section>
            <h3>⌨️ Keyboard Shortcuts</h3>
            <ul>
              <li>
                <strong>Customizable Shortcuts:</strong> Click the keyboard icon
                (⌨️) in the options panel to configure custom shortcuts
              </li>
              <li>
                <strong>Unit Shortcuts:</strong> Assign keys to quickly
                add/remove units. Press the key to add, Ctrl+Key to remove
              </li>
              <li>
                <strong>Global Shortcuts:</strong> Default shortcuts include T
                (tooltip), B (ban mode), W (wisp mode)
              </li>
              <li>
                <strong>Visual Indicators:</strong> Units with assigned
                shortcuts show the key in a dark overlay on their icon
              </li>
            </ul>
          </section>

          <section>
            <h3>Status Colors</h3>
            <ul>
              <li>
                <span style={{ color: "#22c55e" }}>Green Border:</span> You have
                enough materials to build this unit.
              </li>
              <li>
                <span style={{ color: "#f97316" }}>Orange Border:</span> You can
                build this unit using Wisps.
              </li>
            </ul>
          </section>

          <section>
            <h3>Options</h3>
            <ul>
              <li>
                <strong>Ban Mode (🔒/🔓):</strong> Click units to ban them.
                Banned units won't be used in calculations.
              </li>
              <li>
                <strong>Theme (☀️/🌙):</strong> Toggle between Light and Dark
                mode.
              </li>
              <li>
                <strong>UI Size (S/M/L):</strong> Adjust the size of the
                interface.
              </li>
              <li>
                <strong>Tooltips (👁️/🗨️):</strong> Toggle always-on tooltips vs
                Shift-to-show.
              </li>
              <li>
                <strong>Wisp Mode (👻/🚫):</strong> Toggle whether Common Wisps
                are used in calculations.
              </li>
            </ul>
          </section>

          <section>
            <h3>Data Management</h3>
            <ul>
              <li>
                <strong>Export (💾):</strong> Save your current game
                data/version to a JSON file.
              </li>
              <li>
                <strong>Import (📂):</strong> Load a custom game data JSON file.
              </li>
              <li>
                <strong>Reset (🗑️):</strong> Clear all inventory and bans.
              </li>
            </ul>
          </section>

          <div
            style={{
              marginTop: "20px",
              textAlign: "center",
              fontSize: "0.8rem",
              color: "var(--text-secondary)",
              borderTop: "1px solid var(--border-color)",
              paddingTop: "10px",
            }}
          >
            Created by{" "}
            <strong style={{ color: "var(--text-primary)" }}>Narvaneon</strong>
            <div style={{ marginTop: "8px" }}>
              <a
                href="https://ko-fi.com/narvaneon"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "#29abe0",
                  textDecoration: "none",
                  fontWeight: "bold",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                ☕ Support on Ko-fi
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
