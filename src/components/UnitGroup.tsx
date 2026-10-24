import React from "react";
import type { Unit, UnitDetails } from "../logic/combination";
import { UnitListItem } from "./UnitListItem";
import styles from "./UnitGroup.module.css";
import { Icon } from "./Icon";

interface UnitGroupProps {
  title: string;
  units: Unit[];
  visibleUnitIds?: ReadonlySet<string>;
  inventory: Record<string, number>;
  details: ReadonlyMap<string, UnitDetails>;
  effectiveBans: Set<string>;
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
  showRecipeButtons: boolean;
  unitShortcuts: Record<string, string>;
  onHoverChange: (unitId: string | null, anchor?: HTMLElement) => void;
  onShowRecipe: (unitId: string) => void;
}

export const UnitGroup: React.FC<UnitGroupProps> = React.memo(
  ({
    title,
    units,
    visibleUnitIds,
    inventory,
    details,
    effectiveBans,
    onUnitClick,
    onCountChange,
    subGroupBy,
    removeSubGroup,
    sortByAlphabetical,
    showRecipeButtons,
    unitShortcuts,
    onHoverChange,
    onShowRecipe,
  }) => {
    const [isCollapsed, setIsCollapsed] = React.useState(false);

    const orderedGroups = React.useMemo(() => {
      const ordered = sortByAlphabetical ? [...units].sort((a, b) => a.name.localeCompare(b.name)) : units;
      if (!subGroupBy || removeSubGroup) return [{ name: null, units: ordered }];
      const groupOrder = [...new Set(units.map((unit) => (unit[subGroupBy] as string) || "Other"))];
      const grouped = new Map<string, Unit[]>();
      for (const unit of ordered) {
        const name = (unit[subGroupBy] as string) || "Other";
        if (!grouped.has(name)) grouped.set(name, []);
        grouped.get(name)!.push(unit);
      }
      return groupOrder.map((name) => ({ name, units: grouped.get(name)! }));
    }, [units, sortByAlphabetical, subGroupBy, removeSubGroup]);
    const visibleGroups = React.useMemo(() => orderedGroups.map((group) => ({
      ...group, units: visibleUnitIds ? group.units.filter((unit) => visibleUnitIds.has(unit.id)) : group.units,
    })).filter((group) => group.units.length), [orderedGroups, visibleUnitIds]);
    if (!visibleGroups.length) return null;

    const renderUnit = (unit: Unit) => {
      return (
        <UnitListItem
          key={unit.id}
          unit={unit}
          count={inventory[unit.id] || 0}
          details={details.get(unit.id)!}
          isBanned={effectiveBans.has(unit.id)}
          onAction={onUnitClick}
          onCountChange={onCountChange}
          showRecipeButtons={showRecipeButtons}
          shortcut={unitShortcuts[unit.id]}
          onHoverChange={onHoverChange}
          onShowRecipe={onShowRecipe}
        />
      );
    };

    return (
      <div className={styles.group} data-rarity={title}>
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
          <Icon name={isCollapsed ? "down" : "up"} size={14} style={{ opacity: 0.7 }} />
        </h3>
        {!isCollapsed && visibleGroups.map((group) => group.name === null ?
          <div key="ungrouped" className={styles.list}>{group.units.map(renderUnit)}</div> :
          <div key={group.name} className={styles.subGroup}>
            <h4 className={styles.subTitle}>{group.name}</h4>
            <div className={styles.list}>{group.units.map(renderUnit)}</div>
          </div>)}
      </div>
    );
  },
);
