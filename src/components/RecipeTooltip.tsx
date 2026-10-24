import React, { useState, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Unit } from "../logic/combination";
import { RecipeContent } from "./RecipeContent";
import { UnitCapabilities } from "./UnitCapabilities";
import styles from "./RecipeTooltip.module.css";

interface RecipeTooltipProps {
  unit: Unit;
  unitsMap: Map<string, Unit>;
  inventory: Record<string, number>;
  visible: boolean;
  parentElement: HTMLElement | null | React.RefObject<HTMLElement | null>;
  bans: Set<string>;
  isWispEnabled: boolean;
  onHoverChange?: (unitId: string | null) => void;
}

export const RecipeTooltip: React.FC<RecipeTooltipProps> = ({
  unit, unitsMap, inventory, visible, parentElement, bans, isWispEnabled, onHoverChange,
}) => {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ top: 10, left: 10, side: "below", sideWidth: 280, ready: false });
  const hasAbilities = !!(unit.capabilities?.length || unit.abilityDetails);

  useLayoutEffect(() => {
    const target = parentElement && "current" in parentElement ? parentElement.current : parentElement;
    const tooltip = tooltipRef.current;
    if (!visible || !target || !tooltip) return;
    let frame = 0;
    const update = () => {
      const anchor = target.getBoundingClientRect();
      const rect = tooltip.getBoundingClientRect();
      const left = Math.max(10, Math.min(anchor.left + anchor.width / 2 - rect.width / 2,
        window.innerWidth - rect.width - 10));
      let top = anchor.top - rect.height - 10;
      if (top < 10) top = anchor.bottom + 10;
      top = Math.max(10, Math.min(top, window.innerHeight - rect.height - 10));
      const rightSpace = window.innerWidth - (left + rect.width) - 18;
      const leftSpace = left - 18;
      const side = rightSpace >= 220 ? "right" : leftSpace >= 220 ? "left" : "below";
      const sideWidth = side === "below" ? 280 : Math.min(280, side === "right" ? rightSpace : leftSpace);
      setLayout((previous) => previous.top === top && previous.left === left &&
        previous.side === side && previous.sideWidth === sideWidth && previous.ready ? previous :
        { top, left, side, sideWidth,
          // Re-measure the final side/fallback markup before its first paint.
          ready: previous.side === side && previous.sideWidth === sideWidth });
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    update();
    const observer = new ResizeObserver(schedule);
    observer.observe(tooltip);
    observer.observe(target);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      observer.disconnect(); cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [visible, parentElement, unit.id, layout.side, layout.sideWidth]);

  if (!visible) return null;
  return createPortal(
    <div ref={tooltipRef} data-tooltip-unit-id={unit.id} data-ability-position={layout.side}
      className={styles.tooltip} style={{ top: layout.top, left: layout.left,
        visibility: layout.ready ? "visible" : "hidden" }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
      onMouseEnter={() => onHoverChange?.(unit.id)}
      onMouseLeave={(event) => {
        if (event.relatedTarget instanceof Element) {
          const anchor = event.relatedTarget.closest<HTMLElement>("[data-unit-id], [data-unit-preview-id]");
          if ((anchor?.dataset.unitId || anchor?.dataset.unitPreviewId) === unit.id) return;
        }
        onHoverChange?.(null);
      }}>
      <div className={styles.recipePanel}>
        <RecipeContent unit={unit} unitsMap={unitsMap} inventory={inventory}
          bans={bans} isWispEnabled={isWispEnabled} />
      </div>
      {hasAbilities && layout.side !== "below" && <span aria-hidden="true" className={styles.hoverBridge}
        style={layout.side === "right" ? { left: "100%" } : { right: "100%" }} />}
      {hasAbilities && (layout.side === "below" ?
        <details key={unit.id + "-fallback"} className={styles.fallback}>
          <summary>Abilities</summary>
          <div className={styles.fallbackContent}><UnitCapabilities unit={unit} expandedDetails /></div>
        </details> :
        <aside aria-label="Ability panel" className={styles.abilityPanel}
          style={{ width: layout.sideWidth, maxHeight: "calc(100vh - " + (layout.top + 10) + "px)",
            ...(layout.side === "right" ? { left: "calc(100% + 8px)" } : { right: "calc(100% + 8px)" }) }}>
          <UnitCapabilities unit={unit} expandedDetails />
        </aside>)}
    </div>, document.body,
  );
};
