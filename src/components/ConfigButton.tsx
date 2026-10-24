import type { ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";
import styles from "./OptionsPanel.module.css";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  status?: string;
  active?: boolean;
  danger?: boolean;
  shortcut?: string;
}

export function ConfigButton({ icon, label, status, active = false, danger = false, shortcut, title, className = "", ...props }: Props) {
  return <button type="button"
    className={`${styles.iconBtn} ${active ? styles.active : ""} ${danger ? styles.danger : ""} ${className}`}
    aria-description={status}
    aria-keyshortcuts={shortcut || undefined}
    title={shortcut ? `${title}\nShortcut: ${shortcut.toUpperCase()}` : title}
    {...props}>
    <Icon name={icon} size={18} className={styles.buttonIcon} />
    <span className={styles.buttonLabel}>{label}</span>
    {status && <span className={styles.buttonStatus}>{status}</span>}
  </button>;
}
