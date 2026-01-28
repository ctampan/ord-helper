import React from "react";
import type { Unit } from "../logic/combination";
import { UnitListItem } from "./UnitListItem";
import styles from "./UnitGroup.module.css";

interface UnitGroupProps {
  title: string;
  units: Unit[];
  inventory: Record<string, number>;
  bans: Set<string>;
  effectiveBans: Set<string>;
  unitsMap: Map<string, Unit>;
  onUnitClick: (
    unitId: string,
    isRightClick: boolean,
    isCtrlPressed: boolean,
    isAltPressed: boolean,
  ) => void;
  onCountChange: (unitId: string, newCount: number) => void;
  subGroupBy?: keyof Unit;
  removeSubGroup: boolean;
  sortByAlphabetical: boolean;
  isTooltipEnabled: boolean;
  isShiftPressed: boolean;
  isWispEnabled: boolean;
  showRecipeButtons: boolean;
  unitShortcuts: Record<string, string>;
  activeHoveredId: string | null;
  onHoverChange: (unitId: string | null) => void;
}

export const UnitGroup: React.FC<UnitGroupProps> = React.memo(
  ({
    title,
    units,
    inventory,
    bans,
    effectiveBans,
    unitsMap,
    onUnitClick,
    onCountChange,
    subGroupBy,
    removeSubGroup,
    sortByAlphabetical,
    isTooltipEnabled,
    isShiftPressed,
    isWispEnabled,
    showRecipeButtons,
    unitShortcuts,
    activeHoveredId,
    onHoverChange,
  }) => {
    const [isCollapsed, setIsCollapsed] = React.useState(false);

    if (units.length === 0) return null;

    const renderUnit = (unit: Unit) => {
      return (
        <UnitListItem
          key={unit.id}
          unit={unit}
          count={inventory[unit.id] || 0}
          inventory={inventory}
          bans={bans}
          effectiveBans={effectiveBans}
          unitsMap={unitsMap}
          onAction={onUnitClick}
          onCountChange={(newCount) => onCountChange(unit.id, newCount)}
          isTooltipEnabled={isTooltipEnabled}
          isShiftPressed={isShiftPressed}
          isWispEnabled={isWispEnabled}
          showRecipeButtons={showRecipeButtons}
          shortcut={unitShortcuts[unit.id]}
          activeHoveredId={activeHoveredId}
          onHoverChange={onHoverChange}
        />
      );
    };

    const renderContent = () => {
      if (isCollapsed) return null;

      const unitsToRender = [...units];
      if (sortByAlphabetical) {
        unitsToRender.sort((a, b) => a.name.localeCompare(b.name));
      }

      if (subGroupBy && !removeSubGroup) {
        // 1. Determine original subgroup order
        const subGroupOrder: string[] = [];
        units.forEach((u) => {
          const key = (u[subGroupBy] as string) || "Other";
          if (!subGroupOrder.includes(key)) subGroupOrder.push(key);
        });

        // 2. Group units (unitsToRender is already sorted if needed)
        const groups: Record<string, Unit[]> = {};
        unitsToRender.forEach((unit) => {
          const key = (unit[subGroupBy] as string) || "Other";
          if (!groups[key]) groups[key] = [];
          groups[key].push(unit);
        });

        return subGroupOrder.map((key) => {
          const groupUnits = groups[key];
          if (!groupUnits || groupUnits.length === 0) return null;

          return (
            <div key={key} className={styles.subGroup}>
              <h4 className={styles.subTitle}>{key}</h4>
              <div className={styles.list}>{groupUnits.map(renderUnit)}</div>
            </div>
          );
        });
      }

      return <div className={styles.list}>{unitsToRender.map(renderUnit)}</div>;
    };

    return (
      <div className={styles.group}>
        <h3
          className={styles.title}
          onClick={() => setIsCollapsed(!isCollapsed)}
          style={{
            cursor: "pointer",
            userSelect: "none",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          {title}
          <span style={{ fontSize: "0.8em", opacity: 0.7 }}>
            {isCollapsed ? "▼" : "▲"}
          </span>
        </h3>
        {renderContent()}
      </div>
    );
  },
);
