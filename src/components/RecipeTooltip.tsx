import React, { useState, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Unit } from "../logic/combination";
import { RecipeContent } from "./RecipeContent";
import styles from "./RecipeTooltip.module.css";

interface RecipeTooltipProps {
  unit: Unit;
  unitsMap: Map<string, Unit>;
  inventory: Record<string, number>;
  visible: boolean;
  parentElement: HTMLElement | null | React.RefObject<HTMLElement | null>;
  bans: Set<string>;
  isWispEnabled: boolean;
}

export const RecipeTooltip: React.FC<RecipeTooltipProps> = ({
  unit,
  unitsMap,
  inventory,
  visible,
  parentElement,
  bans,
  isWispEnabled,
}) => {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [position, setPosition] = useState<"top" | "bottom">("top");

  useLayoutEffect(() => {
    const targetElement =
      parentElement && "current" in parentElement
        ? parentElement.current
        : parentElement;
    if (visible && targetElement && tooltipRef.current) {
      const parentRect = targetElement.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();

      let top = parentRect.top - tooltipRect.height - 10;
      let left = parentRect.left + parentRect.width / 2 - tooltipRect.width / 2;
      let newPosition: "top" | "bottom" = "top";

      if (top < 10) {
        top = parentRect.bottom + 10;
        newPosition = "bottom";
      }

      if (left < 10) left = 10;
      if (left + tooltipRect.width > window.innerWidth - 10) {
        left = window.innerWidth - tooltipRect.width - 10;
      }

      setCoords((prev) => {
        if (prev.top === top && prev.left === left) return prev;
        return { top, left };
      });
      setPosition((prev) => (prev === newPosition ? prev : newPosition));
    }
  }, [visible, parentElement]);

  if (!visible) return null;

  return createPortal(
    <div
      ref={tooltipRef}
      className={`${styles.tooltip} ${visible ? styles.visible : ""} ${
        position === "bottom" ? styles.bottom : ""
      }`}
      style={{
        top: coords.top,
        left: coords.left,
        position: "fixed",
        transform: "none",
        margin: 0,
        minWidth: "300px",
        backgroundColor: "#1a1a1a",
        border: "1px solid #404040",
        borderRadius: "8px",
        padding: "12px",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
        zIndex: 9999,
        opacity: visible ? 1 : 0,
        height: "fit-content",
      }}
    >
      <RecipeContent
        unit={unit}
        unitsMap={unitsMap}
        inventory={inventory}
        bans={bans}
        isWispEnabled={isWispEnabled}
      />

      <div
        className={`${styles.arrow} ${
          position === "bottom" ? styles.bottom : styles.top
        }`}
      />
    </div>,
    document.body,
  );
};
