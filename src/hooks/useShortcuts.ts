import { useState, useEffect, useCallback } from "react";

export interface ShortcutMap {
  [id: string]: string; // id -> key
}

const STORAGE_KEY = "ord_shortcuts";

export const GLOBAL_ACTIONS = {
  TOGGLE_TOOLTIP: "Toggle Tooltip",
  TOGGLE_BAN_MODE: "Toggle Ban Mode",
  TOGGLE_WISP_MODE: "Toggle Wisp Mode",
  RESET_INVENTORY: "Reset Inventory",
};

const DEFAULT_GLOBAL_SHORTCUTS: ShortcutMap = {
  TOGGLE_TOOLTIP: "t",
  TOGGLE_BAN_MODE: "b",
  TOGGLE_WISP_MODE: "w",
};

export function useShortcuts() {
  const [unitShortcuts, setUnitShortcuts] = useState<ShortcutMap>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.unitShortcuts || {};
      } catch (e) {
        console.error("Failed to load shortcuts:", e);
      }
    }
    return {};
  });

  const [globalShortcuts, setGlobalShortcuts] = useState<ShortcutMap>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_GLOBAL_SHORTCUTS,
          ...(parsed.globalShortcuts || {}),
        };
      } catch (e) {
        console.error("Failed to load shortcuts:", e);
      }
    }
    return DEFAULT_GLOBAL_SHORTCUTS;
  });

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
        if (next[k] === key) delete next[k];
      });
      return next;
    });
  }, []);

  const setGlobalShortcut = useCallback((actionId: string, key: string) => {
    setGlobalShortcuts((prev) => {
      const next = { ...prev };
      // Remove key if assigned to another global action
      Object.keys(next).forEach((k) => {
        if (next[k] === key) delete next[k];
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
      delete next[actionId];
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
