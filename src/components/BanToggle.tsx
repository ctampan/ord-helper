import React from "react";
import styles from "./BanToggle.module.css";

interface BanToggleProps {
  isBanMode: boolean;
  onToggle: () => void;
}

export const BanToggle: React.FC<BanToggleProps> = ({
  isBanMode,
  onToggle,
}) => {
  return (
    <div
      className={styles.container}
      onClick={onToggle}
      title={isBanMode ? "Ban Mode: ON" : "Ban Mode: OFF"}
    >
      <div className={`${styles.toggle} ${isBanMode ? styles.active : ""}`}>
        <div className={styles.knob} />
      </div>
      <span style={{ fontSize: "1.2rem", marginLeft: "4px" }}>
        {isBanMode ? "🔒" : "🔓"}
      </span>
    </div>
  );
};
