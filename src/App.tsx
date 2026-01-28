import { useEffect, useState, useMemo, useCallback } from "react";
import type { Data, Inventory, Bans, Unit } from "./logic/combination";
import { consumeMaterials, getEffectiveBans } from "./logic/combination";
import { UnitGroup } from "./components/UnitGroup";
import { OptionsPanel } from "./components/OptionsPanel";
import { RecipeTreeModal } from "./components/RecipeTreeModal";
import { useShortcuts } from "./hooks/useShortcuts";
import { ShortcutSettingsModal } from "./components/ShortcutSettingsModal";
import "./index.css";
import "./App.css";

function App() {
  const [data, setData] = useState<Data | null>(null);
  const [inventory, setInventory] = useState<Inventory>(() => {
    const saved = localStorage.getItem("ord_inventory");
    return saved ? JSON.parse(saved) : {};
  });
  const [bans, setBans] = useState<Bans>(() => {
    const saved = localStorage.getItem("ord_bans");
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [isBanMode, setIsBanMode] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    return (localStorage.getItem("ord_theme") as "dark" | "light") || "dark";
  });
  const [isWispEnabled, setIsWispEnabled] = useState(() => {
    return localStorage.getItem("ord_wisp_enabled") !== "false"; // Default true
  });

  const [isTooltipEnabled, setIsTooltipEnabled] = useState(() => {
    return localStorage.getItem("ord_tooltip_enabled") === "true";
  });
  const [removeSubGroup, setRemoveSubGroup] = useState(() => {
    return localStorage.getItem("ord_remove_subgroup") === "true";
  });
  const [sortByAlphabetical, setSortByAlphabetical] = useState(() => {
    return localStorage.getItem("ord_sort_alphabetical") === "true";
  });
  const [isShiftPressed, setIsShiftPressed] = useState(false);

  const [selectedUnitForTree, setSelectedUnitForTree] = useState<string | null>(
    null,
  );

  // Shortcuts Hook
  const {
    unitShortcuts,
    globalShortcuts,
    setUnitShortcut,
    setGlobalShortcut,
    removeUnitShortcut,
    removeGlobalShortcut,
    resetShortcuts,
    getUnitIdByKey,
    getActionIdByKey,
  } = useShortcuts();

  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("ord_wisp_enabled", String(isWispEnabled));
  }, [isWispEnabled]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") setIsShiftPressed(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") setIsShiftPressed(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("ord_tooltip_enabled", String(isTooltipEnabled));
  }, [isTooltipEnabled]);

  useEffect(() => {
    localStorage.setItem("ord_remove_subgroup", String(removeSubGroup));
  }, [removeSubGroup]);

  useEffect(() => {
    localStorage.setItem("ord_sort_alphabetical", String(sortByAlphabetical));
  }, [sortByAlphabetical]);

  const [notification, setNotification] = useState<{
    message: string;
    type: "success" | "error" | "info" | "warning";
  } | null>(null);

  const showNotification = (
    message: string,
    type: "success" | "error" | "info" | "warning" = "info",
  ) => {
    setNotification({ message, type });
  };

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem("ord_inventory", JSON.stringify(inventory));
  }, [inventory]);

  useEffect(() => {
    localStorage.setItem("ord_bans", JSON.stringify(Array.from(bans)));
  }, [bans]);

  const [versions, setVersions] = useState<string[]>([]);
  const [currentVersion, setCurrentVersion] = useState<string>(() => {
    return localStorage.getItem("ord_version") || "";
  });

  // Auto-clear notifications
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Load versions
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}versions.json`)
      .then((res) => res.json())
      .then((vs: string[]) => {
        const hasCustom = !!localStorage.getItem("ord_custom_data");
        const allVersions = hasCustom ? [...vs, "Custom"] : vs;
        setVersions(allVersions);

        if (!currentVersion && vs.length > 0) {
          const latest = vs[vs.length - 1];
          setCurrentVersion(latest);
          localStorage.setItem("ord_version", latest);
        } else if (currentVersion && !allVersions.includes(currentVersion)) {
          const latest = vs[vs.length - 1];
          setCurrentVersion(latest);
          localStorage.setItem("ord_version", latest);
        }
      })
      .catch((err) => console.error("Failed to load versions:", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!currentVersion) return;

    if (currentVersion === "Custom") {
      const savedData = localStorage.getItem("ord_custom_data");
      if (savedData) {
        try {
          setData(JSON.parse(savedData));
        } catch (e) {
          console.error("Failed to load custom data:", e);
        }
      }
      return;
    }

    fetch(`${import.meta.env.BASE_URL}data/${currentVersion}.json`)
      .then((res) => res.json())
      .then((d: Data) => {
        setData(d);
      })
      .catch((err) => {
        console.error(
          `Failed to load data for version ${currentVersion}:`,
          err,
        );
        fetch(`${import.meta.env.BASE_URL}data.json`)
          .then((res) => res.json())
          .then(setData)
          .catch((e) => console.error("Fatal:", e));
      });
  }, [currentVersion]);

  const handleVersionChange = (ver: string) => {
    if (ver === currentVersion) return;

    if (
      confirm(
        "Changing version will reset your inventory and bans. Are you sure?",
      )
    ) {
      setCurrentVersion(ver);
      localStorage.setItem("ord_version", ver);
      setInventory({});
      setBans(new Set());
    }
  };

  const [uiSize, setUiSize] = useState<number>(() => {
    const saved = localStorage.getItem("ord_ui_size");
    if (!saved) return 50;
    // Migrate from old string values
    if (saved === "xs") return 0;
    if (saved === "small") return 25;
    if (saved === "medium") return 50;
    if (saved === "large") return 75;
    if (saved === "xl") return 100;
    const parsed = parseInt(saved, 10);
    return isNaN(parsed) ? 50 : parsed;
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("ord_theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("ord_ui_size", String(uiSize));
    const root = document.documentElement;
    const p = uiSize / 100;

    const h = 20 + 22 * p;
    const icon = 16 + 19 * p;
    const name = 0.65 + 0.3 * p;
    const meta = 0.55 + 0.2 * p;
    const inputW = 20 + 16 * p;
    const inputH = 16 + 11 * p;

    root.style.setProperty("--unit-height", `${h}px`);
    root.style.setProperty("--unit-icon-size", `${icon}px`);
    root.style.setProperty("--unit-font-size-name", `${name}rem`);
    root.style.setProperty("--unit-font-size-meta", `${meta}rem`);
    root.style.setProperty("--unit-input-width", `${inputW}px`);
    root.style.setProperty("--unit-input-height", `${inputH}px`);
  }, [uiSize]);

  const handleExportData = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ord-data-${data.version || "custom"}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification("Game Data exported!", "success");
  };

  const handleImportData = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedData = JSON.parse(e.target?.result as string);

        if (!importedData.units || !Array.isArray(importedData.units)) {
          throw new Error("Invalid data format");
        }

        localStorage.setItem("ord_custom_data", JSON.stringify(importedData));

        if (!versions.includes("Custom")) {
          setVersions([...versions, "Custom"]);
        }
        setCurrentVersion("Custom");
        localStorage.setItem("ord_version", "Custom");

        setData(importedData);
        showNotification("Game Data imported!", "success");
      } catch (err) {
        console.error("Failed to import data:", err);
        showNotification("Failed to import data", "error");
      }
    };
    reader.readAsText(file);
  };

  const unitsMap = useMemo(() => {
    if (!data) return new Map();
    return new Map(data.units.map((u) => [u.id, u]));
  }, [data]);

  const effectiveBans = useMemo(() => {
    return getEffectiveBans(unitsMap, bans);
  }, [unitsMap, bans]);

  const handleUnitClick = useCallback(
    (
      unitId: string,
      isRightClick: boolean,
      isCtrlPressed: boolean,
      isAltPressed: boolean,
    ) => {
      // Handle Recipe Tree (Alt + Click)
      if (isAltPressed) {
        setSelectedUnitForTree(unitId);
        return;
      }

      // Handle Ban Mode: Toggling bans takes precedence over other interactions.
      if (isBanMode) {
        setBans((prev) => {
          const newBans = new Set(prev);
          if (newBans.has(unitId)) {
            newBans.delete(unitId);
          } else {
            newBans.add(unitId);
          }
          return newBans;
        });
        return;
      }

      // If a unit is explicitly banned, we shouldn't be able to interact with it.
      if (effectiveBans.has(unitId)) {
        return;
      }

      if (isRightClick) {
        if (isCtrlPressed) {
          // Ctrl + Right Click: Reduce quantity and refund recipe materials
          if (!data) return;

          setInventory((prev) => {
            const currentCount = prev[unitId] || 0;
            if (currentCount <= 0) {
              showNotification("Cannot reduce: Count is 0", "warning");
              return prev;
            }

            const newInventory = { ...prev };
            newInventory[unitId] = currentCount - 1;

            const unit = data.units.find((u) => u.id === unitId);
            if (unit && unit.recipe) {
              // Refund materials
              unit.recipe.forEach((req) => {
                newInventory[req.unitId] =
                  (newInventory[req.unitId] || 0) + req.count;
              });
              showNotification(
                `Reduced ${unit.name} and refunded materials`,
                "success",
              );
            } else {
              showNotification(`Reduced ${unit?.name || "unit"}`, "success");
            }
            return newInventory;
          });
        } else {
          // Right click: Build unit (consume materials)
          if (!data) return;
          const unitsMap = new Map(data.units.map((u) => [u.id, u]));

          try {
            setInventory((prev) => {
              try {
                const newInventory = consumeMaterials(unitId, unitsMap, prev);
                return newInventory;
              } catch (e) {
                console.warn("Cannot build unit:", e);
                showNotification(
                  e instanceof Error ? e.message : "Cannot build unit",
                  "error",
                );
                return prev;
              }
            });
          } catch (e) {
            console.warn("Cannot build unit:", e);
            showNotification(
              e instanceof Error ? e.message : "Cannot build unit",
              "error",
            );
          }
        }
      } else {
        if (isCtrlPressed) {
          // Ctrl + Left Click: Simply reduce quantity without refunding
          setInventory((prev) => {
            const newCount = Math.max(0, (prev[unitId] || 0) - 1);
            if (newCount === (prev[unitId] || 0)) {
              showNotification("Cannot reduce: Count is 0", "warning");
              return prev;
            }
            showNotification("Reduced quantity", "success");
            return {
              ...prev,
              [unitId]: newCount,
            };
          });
        } else {
          // Left click: Add unit to inventory
          setInventory((prev) => ({
            ...prev,
            [unitId]: (prev[unitId] || 0) + 1,
          }));
        }
      }
    },
    [isBanMode, data, effectiveBans],
  );

  // Global Shortcut Listener
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      const key = e.key.toLowerCase();

      // Check for Global Shortcuts
      const actionId = getActionIdByKey(key);
      if (actionId) {
        e.preventDefault();
        switch (actionId) {
          case "TOGGLE_TOOLTIP":
            setIsTooltipEnabled((prev) => !prev);
            showNotification("Tooltip toggled", "info");
            break;
          case "TOGGLE_BAN_MODE":
            setIsBanMode((prev) => !prev);
            showNotification("Ban Mode toggled", "info");
            break;
          case "TOGGLE_WISP_MODE":
            setIsWispEnabled((prev) => !prev);
            showNotification("Wisp Mode toggled", "info");
            break;
          case "RESET_INVENTORY":
            if (confirm("Reset inventory and bans?")) {
              setInventory({});
              setBans(new Set());
              showNotification("Inventory and bans reset", "success");
            }
            break;
          // Add other global actions here
        }
        return;
      }

      // Check for Unit Shortcuts
      const unitId = getUnitIdByKey(key);
      if (unitId) {
        e.preventDefault();
        // Ctrl + Key = Remove (Right Click Logic with Ctrl)
        // Key = Add (Left Click Logic)
        handleUnitClick(unitId, false, e.ctrlKey, false);
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [getUnitIdByKey, getActionIdByKey, handleUnitClick]);

  const handleCountChange = useCallback((unitId: string, newCount: number) => {
    setInventory((prev) => ({
      ...prev,
      [unitId]: Math.max(0, newCount),
    }));
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  // Memoize expensive computations
  const unitsByRarity = useMemo(() => {
    if (!data) return {};
    return data.rarities.reduce(
      (acc, rarity) => {
        acc[rarity] = data.units.filter((u) => u.rarity === rarity);
        return acc;
      },
      {} as Record<string, Unit[]>,
    );
  }, [data]);

  if (!data) return <div className="container">Loading...</div>;

  return (
    <div className="container">
      {notification && (
        <div
          style={{
            position: "fixed",
            top: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor:
              notification.type === "success"
                ? "rgba(76, 175, 80, 0.9)"
                : notification.type === "error"
                  ? "rgba(244, 67, 54, 0.9)"
                  : notification.type === "warning"
                    ? "rgba(255, 152, 0, 0.9)"
                    : "rgba(33, 150, 243, 0.9)",
            color: "white",
            padding: "10px 20px",
            borderRadius: "5px",
            zIndex: 1000,
            pointerEvents: "none",
            fontWeight: "500",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          }}
        >
          {notification.message}
        </div>
      )}

      {selectedUnitForTree && (
        <RecipeTreeModal
          unitId={selectedUnitForTree}
          unitsMap={unitsMap}
          inventory={inventory}
          onClose={() => setSelectedUnitForTree(null)}
        />
      )}

      <ShortcutSettingsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
        unitShortcuts={unitShortcuts}
        globalShortcuts={globalShortcuts}
        setUnitShortcut={setUnitShortcut}
        setGlobalShortcut={setGlobalShortcut}
        removeUnitShortcut={removeUnitShortcut}
        removeGlobalShortcut={removeGlobalShortcut}
        resetShortcuts={resetShortcuts}
        unitsMap={unitsMap}
      />

      <main className="dashboard">
        {/* Column 1: Options + Common + Uncommon + Random */}
        <div className="column">
          <OptionsPanel
            isBanMode={isBanMode}
            onToggleBanMode={() => setIsBanMode(!isBanMode)}
            onReset={() => {
              if (confirm("Reset inventory and bans?")) {
                setInventory({});
                setBans(new Set());
              }
            }}
            theme={theme}
            onToggleTheme={toggleTheme}
            uiSize={uiSize}
            onUiSizeChange={setUiSize}
            isTooltipEnabled={isTooltipEnabled}
            onToggleTooltip={() => setIsTooltipEnabled(!isTooltipEnabled)}
            isWispEnabled={isWispEnabled}
            onToggleWisp={() => setIsWispEnabled(!isWispEnabled)}
            removeSubGroup={removeSubGroup}
            onToggleRemoveSubGroup={() => setRemoveSubGroup(!removeSubGroup)}
            sortByAlphabetical={sortByAlphabetical}
            onToggleSortByAlphabetical={() =>
              setSortByAlphabetical(!sortByAlphabetical)
            }
            versions={versions}
            currentVersion={currentVersion}
            onVersionChange={handleVersionChange}
            onExport={handleExportData}
            onImport={handleImportData}
            onOpenShortcuts={() => setIsShortcutsModalOpen(true)}
          />
          {unitsByRarity["Common"] && (
            <UnitGroup
              title="Common"
              units={unitsByRarity["Common"]}
              inventory={inventory}
              bans={bans}
              effectiveBans={effectiveBans}
              unitsMap={unitsMap}
              onUnitClick={handleUnitClick}
              onCountChange={handleCountChange}
              isTooltipEnabled={isTooltipEnabled}
              isShiftPressed={isShiftPressed}
              isWispEnabled={isWispEnabled}
              removeSubGroup={removeSubGroup}
              sortByAlphabetical={false}
              unitShortcuts={unitShortcuts}
            />
          )}
          {["Uncommon", "Random"].map(
            (rarity) =>
              unitsByRarity[rarity] && (
                <UnitGroup
                  key={rarity}
                  title={rarity}
                  units={unitsByRarity[rarity]}
                  inventory={inventory}
                  bans={bans}
                  effectiveBans={effectiveBans}
                  unitsMap={unitsMap}
                  onUnitClick={handleUnitClick}
                  onCountChange={handleCountChange}
                  isTooltipEnabled={isTooltipEnabled}
                  isShiftPressed={isShiftPressed}
                  isWispEnabled={isWispEnabled}
                  removeSubGroup={removeSubGroup}
                  sortByAlphabetical={sortByAlphabetical}
                  unitShortcuts={unitShortcuts}
                />
              ),
          )}
        </div>

        {/* Column 2: Special + Combination Item + Other */}
        <div className="column">
          {["Special", "Combination Item", "Other"].map(
            (rarity) =>
              unitsByRarity[rarity] && (
                <UnitGroup
                  key={rarity}
                  title={rarity}
                  units={unitsByRarity[rarity]}
                  inventory={inventory}
                  bans={bans}
                  effectiveBans={effectiveBans}
                  unitsMap={unitsMap}
                  onUnitClick={handleUnitClick}
                  onCountChange={handleCountChange}
                  isTooltipEnabled={isTooltipEnabled}
                  isShiftPressed={isShiftPressed}
                  isWispEnabled={isWispEnabled}
                  removeSubGroup={removeSubGroup}
                  sortByAlphabetical={sortByAlphabetical}
                  unitShortcuts={unitShortcuts}
                />
              ),
          )}
        </div>

        {/* Column 3: Rare */}
        <div className="column">
          {unitsByRarity["Rare"] && (
            <UnitGroup
              title="Rare"
              units={unitsByRarity["Rare"]}
              inventory={inventory}
              bans={bans}
              effectiveBans={effectiveBans}
              unitsMap={unitsMap}
              onUnitClick={handleUnitClick}
              onCountChange={handleCountChange}
              isTooltipEnabled={isTooltipEnabled}
              isShiftPressed={isShiftPressed}
              isWispEnabled={isWispEnabled}
              removeSubGroup={removeSubGroup}
              sortByAlphabetical={sortByAlphabetical}
              unitShortcuts={unitShortcuts}
            />
          )}
        </div>

        {/* Column 4: Legendary */}
        <div className="column">
          {unitsByRarity["Legendary"] && (
            <UnitGroup
              title="Legendary"
              units={unitsByRarity["Legendary"]}
              inventory={inventory}
              bans={bans}
              effectiveBans={effectiveBans}
              unitsMap={unitsMap}
              onUnitClick={handleUnitClick}
              onCountChange={handleCountChange}
              isTooltipEnabled={isTooltipEnabled}
              isShiftPressed={isShiftPressed}
              subGroupBy="subGroup"
              isWispEnabled={isWispEnabled}
              removeSubGroup={removeSubGroup}
              sortByAlphabetical={sortByAlphabetical}
              unitShortcuts={unitShortcuts}
            />
          )}
        </div>

        {/* Column 5: Hidden + Distortion + Alternate */}
        <div className="column">
          {["Hidden", "Distortion", "Alternate"].map(
            (rarity) =>
              unitsByRarity[rarity] && (
                <UnitGroup
                  key={rarity}
                  title={rarity}
                  units={unitsByRarity[rarity]}
                  inventory={inventory}
                  bans={bans}
                  effectiveBans={effectiveBans}
                  unitsMap={unitsMap}
                  onUnitClick={handleUnitClick}
                  onCountChange={handleCountChange}
                  isTooltipEnabled={isTooltipEnabled}
                  isShiftPressed={isShiftPressed}
                  subGroupBy={rarity !== "Alternate" ? "subGroup" : undefined}
                  isWispEnabled={isWispEnabled}
                  removeSubGroup={removeSubGroup}
                  sortByAlphabetical={sortByAlphabetical}
                  unitShortcuts={unitShortcuts}
                />
              ),
          )}
        </div>

        {/* Column 6: Transcendence + Limited */}
        <div className="column">
          {["Transcendence", "Limited"].map(
            (rarity) =>
              unitsByRarity[rarity] && (
                <UnitGroup
                  key={rarity}
                  title={rarity}
                  units={unitsByRarity[rarity]}
                  inventory={inventory}
                  bans={bans}
                  effectiveBans={effectiveBans}
                  unitsMap={unitsMap}
                  onUnitClick={handleUnitClick}
                  onCountChange={handleCountChange}
                  isTooltipEnabled={isTooltipEnabled}
                  isShiftPressed={isShiftPressed}
                  subGroupBy="subGroup"
                  isWispEnabled={isWispEnabled}
                  removeSubGroup={removeSubGroup}
                  sortByAlphabetical={sortByAlphabetical}
                  unitShortcuts={unitShortcuts}
                />
              ),
          )}
        </div>

        {/* Column 7: Immortal + Eternal + Mystic */}
        <div className="column">
          {["Immortal", "Eternal", "Mystic"].map(
            (rarity) =>
              unitsByRarity[rarity] && (
                <UnitGroup
                  key={rarity}
                  title={rarity}
                  units={unitsByRarity[rarity]}
                  inventory={inventory}
                  bans={bans}
                  effectiveBans={effectiveBans}
                  unitsMap={unitsMap}
                  onUnitClick={handleUnitClick}
                  onCountChange={handleCountChange}
                  isTooltipEnabled={isTooltipEnabled}
                  isShiftPressed={isShiftPressed}
                  subGroupBy="subGroup"
                  isWispEnabled={isWispEnabled}
                  removeSubGroup={removeSubGroup}
                  sortByAlphabetical={sortByAlphabetical}
                  unitShortcuts={unitShortcuts}
                />
              ),
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
