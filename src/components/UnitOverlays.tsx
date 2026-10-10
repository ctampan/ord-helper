import { memo, useLayoutEffect, useSyncExternalStore } from "react";
import type { Bans, Inventory, Unit } from "../logic/combination";
import type { UnitOverlayStore } from "../logic/unitOverlays";
import { RecipeTooltip } from "./RecipeTooltip";
import { RecipeModal } from "./RecipeModal";

interface Props {
  store: UnitOverlayStore;
  unitsMap: Map<string, Unit>;
  inventory: Inventory;
  bans: Bans;
  isWispEnabled: boolean;
  isTooltipEnabled: boolean;
  isShiftPressed: boolean;
  visibleUnitIds?: ReadonlySet<string>;
}

export const UnitOverlays = memo(function UnitOverlays({
  store, unitsMap, inventory, bans, isWispEnabled, isTooltipEnabled, isShiftPressed, visibleUnitIds,
}: Props) {
  const { hovered, recipeUnitId } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useLayoutEffect(() => {
    const current = store.getSnapshot();
    if (current.recipeUnitId && !unitsMap.has(current.recipeUnitId)) store.clear();
    else if (current.hovered && (!current.hovered.anchor.isConnected ||
      !unitsMap.has(current.hovered.unitId) ||
      (visibleUnitIds && !visibleUnitIds.has(current.hovered.unitId)))) store.clearHover();
  }, [store, unitsMap, visibleUnitIds, hovered]);
  const hoveredUnit = hovered && unitsMap.get(hovered.unitId);
  const recipeUnit = recipeUnitId && unitsMap.get(recipeUnitId);
  return <>
    {hoveredUnit && hovered.anchor.isConnected && (isTooltipEnabled || isShiftPressed) && <RecipeTooltip
      key={hoveredUnit.id} unit={hoveredUnit} parentElement={hovered.anchor}
      unitsMap={unitsMap} inventory={inventory} bans={bans} isWispEnabled={isWispEnabled}
      visible onHoverChange={store.hover} />}
    {recipeUnit && <RecipeModal key={recipeUnit.id} unit={recipeUnit} unitsMap={unitsMap}
      inventory={inventory} bans={bans} isWispEnabled={isWispEnabled}
      isOpen onClose={store.closeRecipe} />}
  </>;
});
