interface OverlaySnapshot {
  hovered: { unitId: string; anchor: HTMLElement } | null;
  recipeUnitId: string | null;
}

/** Only the overlay subscribes: pointer movement never updates dashboard state. */
export function createUnitOverlayStore() {
  let snapshot: OverlaySnapshot = { hovered: null, recipeUnitId: null };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: OverlaySnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) clearTimeout(timer);
      };
    },
    hover: (unitId: string | null, anchor?: HTMLElement) => {
      clearTimeout(timer);
      if (unitId) {
        if (snapshot.hovered?.unitId === unitId || snapshot.recipeUnitId) return;
        if (anchor) publish({ ...snapshot, hovered: { unitId, anchor } });
      } else {
        timer = setTimeout(() => {
          if (snapshot.hovered) publish({ ...snapshot, hovered: null });
        }, 150);
      }
    },
    showRecipe: (unitId: string) => {
      clearTimeout(timer);
      publish({ hovered: null, recipeUnitId: unitId });
    },
    closeRecipe: () => publish({ ...snapshot, recipeUnitId: null }),
    clear: () => {
      clearTimeout(timer);
      if (snapshot.hovered || snapshot.recipeUnitId) publish({ hovered: null, recipeUnitId: null });
    },
    clearHover: () => {
      clearTimeout(timer);
      if (snapshot.hovered) publish({ ...snapshot, hovered: null });
    },
  };
}

export type UnitOverlayStore = ReturnType<typeof createUnitOverlayStore>;
