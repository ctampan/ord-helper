import React from "react";
import styles from "./OptionsPanel.module.css";
import { BanToggle } from "./BanToggle";
import { HelpModal } from "./HelpModal";
import { ConfigButton } from "./ConfigButton";
import { Icon } from "./Icon";
import type { ShortcutMap } from "../hooks/useShortcuts";

interface OptionsPanelProps {
  globalShortcuts: ShortcutMap;
  showTeamStats: boolean;
  onToggleTeamStats: () => void;
  showCapabilityFilters: boolean;
  activeFilterCount: number;
  onToggleFilter: () => void;
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
  showRecipeButtons: boolean;
  onToggleRecipeButtons: () => void;
  versions: string[];
  currentVersion: string;
  onVersionChange: (version: string) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onOpenShortcuts: () => void;
}

export const OptionsPanel: React.FC<OptionsPanelProps> = ({
  globalShortcuts,
  showTeamStats,
  onToggleTeamStats,
  showCapabilityFilters,
  activeFilterCount,
  onToggleFilter,
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
  showRecipeButtons,
  onToggleRecipeButtons,
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

  const cycleUiSize = (isRightClick = false, isCtrlPressed = false) => {
    const step = isCtrlPressed ? 5 : 1;
    let nextSize;
    if (isRightClick) {
      nextSize = uiSize - step;
      if (nextSize < 0) nextSize = 100;
    } else {
      nextSize = (uiSize + step) % (100 + step);
      if (nextSize > 100) nextSize = 0;
    }
    onUiSizeChange(nextSize);
  };

  const [isConfigCollapsed, setIsConfigCollapsed] = React.useState(false);
  const contentId = React.useId();

  return (
    <section className={styles.panel} aria-label="Configuration">
      <button type="button" className={styles.header} aria-expanded={!isConfigCollapsed}
        aria-controls={contentId} onClick={() => setIsConfigCollapsed(!isConfigCollapsed)}>
        <span className={styles.headerTitle}>Config</span>
        <Icon name={isConfigCollapsed ? "down" : "up"} size={14} className={styles.collapseIcon} />
      </button>
      {!isConfigCollapsed && <div id={contentId} className={styles.content}>
        <div className={styles.grid}>
          <ConfigButton icon="help" label="Help" onClick={() => setIsHelpOpen(true)} title="Help & Features" />
          <ConfigButton icon="keyboard" label="Shortcuts" onClick={onOpenShortcuts} title="Keyboard Shortcuts" />
          <ConfigButton icon={theme === "dark" ? "moon" : "sun"} label="Theme"
            status={theme === "dark" ? "Dark" : "Light"} onClick={onToggleTheme}
            title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`} aria-label="Toggle theme" />

          <ConfigButton icon="size" label="UI Size" status={`${uiSize}%`} aria-label="Adjust UI size"
            onClick={(e) => cycleUiSize(false, e.ctrlKey)}
            onContextMenu={(e) => { e.preventDefault(); cycleUiSize(true, e.ctrlKey); }}
            title={`UI Zoom: ${uiSize}%\nLeft Click: +1% | Right Click: -1%\nCtrl + Click: ±5%`} />
          <ConfigButton icon="stats" label="Team Stats" status={showTeamStats ? "On" : "Off"}
            shortcut={globalShortcuts.TOGGLE_TEAM_STATS}
            active={showTeamStats} aria-pressed={showTeamStats} aria-label="Toggle team stats"
            aria-controls="team-stats" onClick={onToggleTeamStats}
            title={`Team Stats: ${showTeamStats ? "shown" : "hidden"}`} />
          <ConfigButton icon="filter" label="Filters" status={`${showCapabilityFilters ? "On" : "Off"} · ${activeFilterCount}`}
            shortcut={globalShortcuts.TOGGLE_FILTERS}
            active={showCapabilityFilters} aria-pressed={showCapabilityFilters} aria-label="Toggle ability filters"
            aria-controls="capability-filters" onClick={onToggleFilter}
            title={`Ability filters: ${showCapabilityFilters ? "shown" : "hidden"}${activeFilterCount ? ` · ${activeFilterCount} active` : ""}`} />

          <ConfigButton icon={removeSubGroup ? "flat" : "groups"} label="Subgroups" status={removeSubGroup ? "Flat" : "Grouped"}
            active={!removeSubGroup} aria-pressed={!removeSubGroup} aria-label="Toggle subgroups"
            onClick={onToggleRemoveSubGroup} title={`Remove Subgroups: ${removeSubGroup ? "ON" : "OFF"}`} />
          <ConfigButton icon="sort" label="Sort" status={sortByAlphabetical ? "A–Z" : "Default"}
            active={sortByAlphabetical} aria-pressed={sortByAlphabetical} aria-label="Toggle alphabetical sort"
            onClick={onToggleSortByAlphabetical} title={`Alphabetical Sort: ${sortByAlphabetical ? "ON" : "OFF"}`} />
          <ConfigButton icon="recipe" label="Recipes" status={showRecipeButtons ? "On" : "Off"}
            active={showRecipeButtons} aria-pressed={showRecipeButtons} aria-label="Toggle recipe icons"
            onClick={onToggleRecipeButtons} title={`Recipe Icons: ${showRecipeButtons ? "ON" : "OFF"}`} />

          <ConfigButton icon="tooltip" label="Tooltips" status={isTooltipEnabled ? "Always" : "Shift"}
            active={isTooltipEnabled} aria-pressed={isTooltipEnabled} aria-label="Toggle tooltips"
            onClick={onToggleTooltip}
            title={`Tooltips: ${isTooltipEnabled ? "Always ON" : "Shift to Show"}\nClick to toggle default visibility.`} />
          <BanToggle isBanMode={isBanMode} onToggle={onToggleBanMode} />
          <ConfigButton icon="wisp" label="Wisp" status={isWispEnabled ? "On" : "Off"}
            active={isWispEnabled} aria-pressed={isWispEnabled} aria-label="Toggle Wisp calculation"
            onClick={onToggleWisp}
            title={`Wisp Calculation: ${isWispEnabled ? "ON" : "OFF"}\nClick to toggle wisp usage in calculations.`} />

          <ConfigButton icon="export" label="Export" onClick={onExport} title="Export Game Version" />
          <ConfigButton icon="import" label="Import" onClick={() => fileInputRef.current?.click()} title="Import Game Version" />
          <ConfigButton icon="reset" label="Reset" danger shortcut={globalShortcuts.RESET_INVENTORY}
            onClick={onReset} title="Reset Inventory & Bans" />
        </div>
        <input type="file" ref={fileInputRef} hidden accept=".json" onChange={handleFileChange} aria-label="Import game data" />
        <label className={styles.version}>
          <span>Game version</span>
          <select className={styles.select} value={currentVersion} onChange={(e) => onVersionChange(e.target.value)}
            title="Select Game Version">
            {versions.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
      </div>}
      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </section>
  );
};
