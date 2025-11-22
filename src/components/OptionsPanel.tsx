import React from 'react';
import styles from './OptionsPanel.module.css';

interface OptionsPanelProps {
  isBanMode: boolean;
  onToggleBanMode: () => void;
  onReset: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  versions: string[];
  currentVersion: string;
  onVersionChange: (version: string) => void;
  onExport: () => void;
  onImport: (file: File) => void;
}

export const OptionsPanel: React.FC<OptionsPanelProps> = ({
  isBanMode,
  onToggleBanMode,
  onReset,
  theme,
  onToggleTheme,
  versions,
  currentVersion,
  onVersionChange,
  onExport,
  onImport
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onImport(e.target.files[0]);
    }
    // Reset value so same file can be selected again
    if (e.target) e.target.value = '';
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
    </div>
  );
};
