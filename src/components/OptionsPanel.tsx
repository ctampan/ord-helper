import React from 'react';
import styles from './OptionsPanel.module.css';

interface OptionsPanelProps {
  isBanMode: boolean;
  onToggleBanMode: () => void;
  onReset: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  uiSize: 'small' | 'medium' | 'large';
  onUiSizeChange: (size: 'small' | 'medium' | 'large') => void;
  isTooltipEnabled: boolean;
  onToggleTooltip: () => void;
  isWispEnabled: boolean;
  onToggleWisp: () => void;
  versions: string[];
  currentVersion: string;
  onVersionChange: (version: string) => void;
  onExport: () => void;
  onImport: (file: File) => void;
}

import { HelpModal } from './HelpModal';

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
  versions,
  currentVersion,
  onVersionChange,
  onExport,
  onImport
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isHelpOpen, setIsHelpOpen] = React.useState(() => {
    return !localStorage.getItem('ord_has_seen_help');
  });

  React.useEffect(() => {
    if (isHelpOpen) {
      localStorage.setItem('ord_has_seen_help', 'true');
    }
  }, [isHelpOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onImport(e.target.files[0]);
    }
    // Reset value so same file can be selected again
    if (e.target) e.target.value = '';
  };

  const cycleUiSize = () => {
    const sizes: ('small' | 'medium' | 'large')[] = ['small', 'medium', 'large'];
    const nextIndex = (sizes.indexOf(uiSize) + 1) % sizes.length;
    onUiSizeChange(sizes[nextIndex]);
  };

  return (
    <div className={styles.panel}>
      <div className={styles.row}>
        <div className={styles.leftGroup}>
          <button
            className={`${styles.iconBtn} ${isBanMode ? styles.active : ''}`}
            onClick={onToggleBanMode}
            title={`Ban Mode: ${isBanMode ? 'ON' : 'OFF'}\nWhen ON, click a unit to ban/unban it.`}
          >
            {isBanMode ? '🔒' : '🔓'}
          </button>

          <button
            className={styles.iconBtn}
            onClick={onToggleTheme}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>

          <button
            className={styles.iconBtn}
            onClick={cycleUiSize}
            title={`UI Size: ${uiSize.charAt(0).toUpperCase() + uiSize.slice(1)}\nClick to cycle size.`}
          >
            {uiSize === 'small' ? 'S' : uiSize === 'medium' ? 'M' : 'L'}
          </button>

          <button
            className={`${styles.iconBtn} ${isTooltipEnabled ? styles.active : ''}`}
            onClick={onToggleTooltip}
            title={`Tooltips: ${isTooltipEnabled ? 'Always ON' : 'Shift to Show'}\nClick to toggle default visibility.`}
          >
            {isTooltipEnabled ? '👁️' : '🗨️'}
          </button>

          <button
            className={`${styles.iconBtn} ${isWispEnabled ? styles.active : ''}`}
            onClick={onToggleWisp}
            title={`Wisp Calculation: ${isWispEnabled ? 'ON' : 'OFF'}\nClick to toggle wisp usage in calculations.`}
          >
            {isWispEnabled ? '👻' : '🚫'}
          </button>

          <div className={styles.dividerVertical} />

          <button className={styles.iconBtn} onClick={onExport} title="Export Game Version">
            💾
          </button>
          <button className={styles.iconBtn} onClick={() => fileInputRef.current?.click()} title="Import Game Version">
            📂
          </button>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept=".json"
            onChange={handleFileChange}
          />

          <div className={styles.dividerVertical} />

          <button className={styles.iconBtn} onClick={onReset} title="Reset Inventory & Bans">
            🗑️
          </button>

          <div className={styles.dividerVertical} />

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
            {versions.map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </div>
  );
};
