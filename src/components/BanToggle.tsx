import React from "react";
import { ConfigButton } from "./ConfigButton";

interface BanToggleProps {
  isBanMode: boolean;
  onToggle: () => void;
}

export const BanToggle: React.FC<BanToggleProps> = ({
  isBanMode,
  onToggle,
}) => {
  return (
    <ConfigButton
      icon={isBanMode ? "ban" : "unban"} label="Ban Mode" status={isBanMode ? "On" : "Off"}
      active={isBanMode} danger={isBanMode} aria-label="Toggle ban mode" aria-pressed={isBanMode}
      onClick={onToggle}
      title={isBanMode ? "Ban Mode: ON" : "Ban Mode: OFF"}
    />
  );
};
