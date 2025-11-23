import React from 'react';
import type { Unit } from '../logic/combination';
import { UnitListItem } from './UnitListItem';
import styles from './UnitGroup.module.css';

interface UnitGroupProps {
  title: string;
  units: Unit[];
  inventory: Record<string, number>;
  bans: Set<string>;
  unitsMap: Map<string, Unit>;
  onUnitClick: (unitId: string, isRightClick: boolean, isCtrlPressed: boolean) => void;
  onCountChange: (unitId: string, newCount: number) => void;
  subGroupBy?: keyof Unit;
  isTooltipEnabled: boolean;
  isShiftPressed: boolean;
  isWispEnabled: boolean;
}

export const UnitGroup: React.FC<UnitGroupProps> = React.memo(({
  title,
  units,
  inventory,
  bans,
  unitsMap,
  onUnitClick,
  onCountChange,
  subGroupBy,
  isTooltipEnabled,
  isShiftPressed,
  isWispEnabled
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
        unitsMap={unitsMap}
        onClick={(e) => {
          e.preventDefault();
          onUnitClick(unit.id, false, e.ctrlKey);
        }}
        onRightClick={(e) => {
          e.preventDefault();
          onUnitClick(unit.id, true, e.ctrlKey);
        }}
        onCountChange={(newCount) => onCountChange(unit.id, newCount)}
        isTooltipEnabled={isTooltipEnabled}
        isShiftPressed={isShiftPressed}
        isWispEnabled={isWispEnabled}
      />
    );
  };

  const renderContent = () => {
    if (isCollapsed) return null;

    if (subGroupBy) {
      const groups: Record<string, Unit[]> = {};
      units.forEach(unit => {
        const key = (unit[subGroupBy] as string) || 'Other';
        if (!groups[key]) groups[key] = [];
        groups[key].push(unit);
      });

      const sortedKeys = Object.keys(groups);

      return sortedKeys.map(key => (
        <div key={key} className={styles.subGroup}>
          <h4 className={styles.subTitle}>{key}</h4>
          <div className={styles.list}>
            {groups[key].map(renderUnit)}
          </div>
        </div>
      ));
    }

    return (
      <div className={styles.list}>
        {units.map(renderUnit)}
      </div>
    );
  };

  return (
    <div className={styles.group}>
      <h3
        className={styles.title}
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        {title}
        <span style={{ fontSize: '0.8em', opacity: 0.7 }}>
          {isCollapsed ? '▼' : '▲'}
        </span>
      </h3>
      {renderContent()}
    </div>
  );
});
