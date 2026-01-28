import React from "react";
import styles from "./OptionsPanel.module.css";
import { BanToggle } from "./BanToggle";
import { HelpModal } from "./HelpModal";

interface OptionsPanelProps {
  isBanMode: boolean;
  onToggleBanMode: () => void;
  onReset: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  uiSize: number;
  onUiSizeChange: (size: number) => void;
  isTooltipEnabled: boolean;
  onToggleTooltip: () => void;
  isWispEnabled: boolean;
  onToggleWisp: () => void;
  removeSubGroup: boolean;
  onToggleRemoveSubGroup: () => void;
  sortByAlphabetical: boolean;
  onToggleSortByAlphabetical: () => void;
  versions: string[];
  currentVersion: string;
  onVersionChange: (version: string) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onOpenShortcuts: () => void;
}

export const OptionsPanel: React.FC<OptionsPanelProps> = ({
  isBanMode,
  onToggleBanMode,
  onReset,
  theme,
  onToggleTheme,
  uiSize,
  onUiSizeChange,
  isTooltipEnabled,
  onToggleTooltip,
  isWispEnabled,
  onToggleWisp,
  removeSubGroup,
  onToggleRemoveSubGroup,
  sortByAlphabetical,
  onToggleSortByAlphabetical,
  versions,
  currentVersion,
  onVersionChange,
  onExport,
  onImport,
  onOpenShortcuts,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isHelpOpen, setIsHelpOpen] = React.useState(() => {
    return !localStorage.getItem("ord_has_seen_help");
  });

  React.useEffect(() => {
    if (isHelpOpen) {
      localStorage.setItem("ord_has_seen_help", "true");
    }
  }, [isHelpOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onImport(e.target.files[0]);
    }
    // Reset value so same file can be selected again
    if (e.target) e.target.value = "";
  };

  const cycleUiSize = (isRightClick = false) => {
    let nextSize;
    if (isRightClick) {
      nextSize = uiSize - 5;
      if (nextSize < 0) nextSize = 100;
    } else {
      nextSize = (uiSize + 5) % 105;
    }
    onUiSizeChange(nextSize);
  };

  const [isConfigCollapsed, setIsConfigCollapsed] = React.useState(false);

  return (
    <div className={styles.panel}>
      <div
        className={styles.header}
        onClick={() => setIsConfigCollapsed(!isConfigCollapsed)}
      >
        <span className={styles.headerTitle}>Config</span>
        <span className={styles.collapseIcon}>
          {isConfigCollapsed ? "▼" : "▲"}
        </span>
      </div>
      {!isConfigCollapsed && (
        <div className={styles.row}>
          <div className={styles.leftGroup}>
            {/* Group 1: Interactions */}
            <BanToggle isBanMode={isBanMode} onToggle={onToggleBanMode} />
            <button
              className={styles.iconBtn}
              onClick={onOpenShortcuts}
              title="Keyboard Shortcuts"
            >
              ⌨️
            </button>

            <div className={styles.dividerVertical} />

            {/* Group 2: Appearance */}
            <button
              className={styles.iconBtn}
              onClick={onToggleTheme}
              title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            <button
              className={styles.iconBtn}
              onClick={() => cycleUiSize(false)}
              onContextMenu={(e) => {
                e.preventDefault();
                cycleUiSize(true);
              }}
              title={`UI Zoom: ${uiSize}%\nLeft Click: +5%\nRight Click: -5%`}
            >
              <span style={{ fontSize: "0.75rem", fontWeight: "bold" }}>
                {uiSize}%
              </span>
            </button>

            <div className={styles.dividerVertical} />

            {/* Group 3: Game Settings */}
            <button
              className={`${styles.iconBtn} ${
                isTooltipEnabled ? styles.active : ""
              }`}
              onClick={onToggleTooltip}
              title={`Tooltips: ${
                isTooltipEnabled ? "Always ON" : "Shift to Show"
              }\nClick to toggle default visibility.`}
            >
              {isTooltipEnabled ? "👁️" : "🗨️"}
            </button>
            <button
              className={`${styles.iconBtn} ${
                isWispEnabled ? styles.active : ""
              }`}
              onClick={onToggleWisp}
              title={`Wisp Calculation: ${
                isWispEnabled ? "ON" : "OFF"
              }\nClick to toggle wisp usage in calculations.`}
            >
              {isWispEnabled ? "👻" : "🚫"}
            </button>

            <div className={styles.dividerVertical} />

            {/* Group 4: Sorting & Grouping */}
            <button
              className={`${styles.iconBtn} ${
                removeSubGroup ? styles.active : ""
              }`}
              onClick={onToggleRemoveSubGroup}
              title={`Remove Subgroups: ${removeSubGroup ? "ON" : "OFF"}`}
            >
              {removeSubGroup ? "📦" : "📁"}
            </button>
            <button
              className={`${styles.iconBtn} ${
                sortByAlphabetical ? styles.active : ""
              }`}
              onClick={onToggleSortByAlphabetical}
              title={`Alphabetical Sort: ${sortByAlphabetical ? "ON" : "OFF"}`}
            >
              {sortByAlphabetical ? "🔤" : "🔢"}
            </button>

            <div className={styles.dividerVertical} />

            {/* Group 4: Data Management */}
            <button
              className={styles.iconBtn}
              onClick={onExport}
              title="Export Game Version"
            >
              💾
            </button>
            <button
              className={styles.iconBtn}
              onClick={() => fileInputRef.current?.click()}
              title="Import Game Version"
            >
              📂
            </button>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              accept=".json"
              onChange={handleFileChange}
            />
            <button
              className={styles.iconBtn}
              onClick={onReset}
              title="Reset Inventory & Bans"
            >
              🗑️
            </button>

            <div className={styles.dividerVertical} />

            {/* Group 5: Help */}
            <button
              className={styles.iconBtn}
              onClick={() => setIsHelpOpen(true)}
              title="Help & Features"
            >
              ❓
            </button>
          </div>

          <div className={styles.rightGroup}>
            <select
              className={styles.select}
              value={currentVersion}
              onChange={(e) => onVersionChange(e.target.value)}
              title="Select Game Version"
            >
              {versions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </div>
  );
};
