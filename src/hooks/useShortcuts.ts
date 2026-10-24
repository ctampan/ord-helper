import { useState, useEffect, useCallback } from "react";

export interface ShortcutMap {
  [id: string]: string; // id -> key
}

const STORAGE_KEY = "ord_shortcuts";

export const GLOBAL_ACTIONS = {
  TOGGLE_TOOLTIP: "Toggle Tooltip",
  TOGGLE_BAN_MODE: "Toggle Ban Mode",
  TOGGLE_WISP_MODE: "Toggle Wisp Mode",
  TOGGLE_TEAM_STATS: "Toggle Team Stats",
  TOGGLE_FILTERS: "Toggle Ability Filters",
  RESET_INVENTORY: "Reset Inventory",
};

const DEFAULT_GLOBAL_SHORTCUTS: ShortcutMap = {
  TOGGLE_TOOLTIP: "t",
  TOGGLE_BAN_MODE: "b",
  TOGGLE_WISP_MODE: "w",
  TOGGLE_TEAM_STATS: "s",
  TOGGLE_FILTERS: "f",
  RESET_INVENTORY: "r",
};

function readShortcuts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const unitShortcuts: ShortcutMap = parsed.unitShortcuts || {};
    const globalShortcuts: ShortcutMap = { ...parsed.globalShortcuts };
    // Add new defaults without replacing a user's existing key assignments.
    const claimed = new Set([...Object.values(unitShortcuts), ...Object.values(globalShortcuts)]);
    for (const [action, key] of Object.entries(DEFAULT_GLOBAL_SHORTCUTS)) {
      if (!(action in globalShortcuts) && !claimed.has(key)) globalShortcuts[action] = key;
    }
    return { unitShortcuts, globalShortcuts };
  } catch (e) {
    console.error("Failed to load shortcuts:", e);
    return { unitShortcuts: {} as ShortcutMap, globalShortcuts: { ...DEFAULT_GLOBAL_SHORTCUTS } };
  }
}

export function useShortcuts() {
  const [initial] = useState(readShortcuts);
  const [unitShortcuts, setUnitShortcuts] = useState<ShortcutMap>(initial.unitShortcuts);
  const [globalShortcuts, setGlobalShortcuts] = useState<ShortcutMap>(initial.globalShortcuts);

  // Save to localStorage whenever changes occur
  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ unitShortcuts, globalShortcuts })
    );
  }, [unitShortcuts, globalShortcuts]);

  const setUnitShortcut = useCallback((unitId: string, key: string) => {
    setUnitShortcuts((prev) => {
      // Remove key if it was assigned to another unit
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (next[k] === key) delete next[k];
      });
      next[unitId] = key;
      return next;
    });
    // Also remove from global if conflict
    setGlobalShortcuts((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (next[k] === key) next[k] = "";
      });
      return next;
    });
  }, []);

  const setGlobalShortcut = useCallback((actionId: string, key: string) => {
    setGlobalShortcuts((prev) => {
      const next = { ...prev };
      // Remove key if assigned to another global action
      Object.keys(next).forEach((k) => {
        if (next[k] === key) next[k] = "";
      });
      next[actionId] = key;
      return next;
    });
    // Also remove from unit if conflict
    setUnitShortcuts((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (next[k] === key) delete next[k];
      });
      return next;
    });
  }, []);

  const removeUnitShortcut = useCallback((unitId: string) => {
    setUnitShortcuts((prev) => {
      const next = { ...prev };
      delete next[unitId];
      return next;
    });
  }, []);

  const removeGlobalShortcut = useCallback((actionId: string) => {
    setGlobalShortcuts((prev) => {
      const next = { ...prev };
      // Keep an explicit disabled value so defaults stay removed after reload.
      next[actionId] = "";
      return next;
    });
  }, []);

  const resetShortcuts = useCallback(() => {
    setUnitShortcuts({});
    setGlobalShortcuts(DEFAULT_GLOBAL_SHORTCUTS);
  }, []);

  const getUnitIdByKey = useCallback(
    (key: string): string | undefined => {
      // Reverse lookup
      return Object.keys(unitShortcuts).find((id) => unitShortcuts[id] === key);
    },
    [unitShortcuts]
  );

  const getActionIdByKey = useCallback(
    (key: string): string | undefined => {
      return Object.keys(globalShortcuts).find(
        (id) => globalShortcuts[id] === key
      );
    },
    [globalShortcuts]
  );

  return {
    unitShortcuts,
    globalShortcuts,
    setUnitShortcut,
    setGlobalShortcut,
    removeUnitShortcut,
    removeGlobalShortcut,
    resetShortcuts,
    getUnitIdByKey,
    getActionIdByKey,
  };
}
