import { useEffect, useState, useMemo, useCallback } from 'react';
import type { Data, Inventory, Bans } from './logic/combination';
import { consumeMaterials } from './logic/combination';
import { UnitGroup } from './components/UnitGroup';
import { OptionsPanel } from './components/OptionsPanel';
import './index.css';
import './App.css';

function App() {
  const [data, setData] = useState<Data | null>(null);
  const [inventory, setInventory] = useState<Inventory>(() => {
    const saved = localStorage.getItem('ord_inventory');
    return saved ? JSON.parse(saved) : {};
  });
  const [bans, setBans] = useState<Bans>(() => {
    const saved = localStorage.getItem('ord_bans');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [isBanMode, setIsBanMode] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('ord_theme') as 'dark' | 'light') || 'dark';
  });
  const [isWispEnabled, setIsWispEnabled] = useState(() => {
    return localStorage.getItem('ord_wisp_enabled') !== 'false'; // Default true
  });

  const [isTooltipEnabled, setIsTooltipEnabled] = useState(() => {
    return localStorage.getItem('ord_tooltip_enabled') === 'true';
  });
  const [isShiftPressed, setIsShiftPressed] = useState(false);

  useEffect(() => {
    localStorage.setItem('ord_wisp_enabled', String(isWispEnabled));
  }, [isWispEnabled]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftPressed(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftPressed(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('ord_tooltip_enabled', String(isTooltipEnabled));
  }, [isTooltipEnabled]);

  const [notification, setNotification] = useState<string | null>(null);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('ord_inventory', JSON.stringify(inventory));
  }, [inventory]);

  useEffect(() => {
    localStorage.setItem('ord_bans', JSON.stringify(Array.from(bans)));
  }, [bans]);

  const [versions, setVersions] = useState<string[]>([]);
  const [currentVersion, setCurrentVersion] = useState<string>(() => {
    return localStorage.getItem('ord_version') || '';
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
    fetch('/versions.json')
      .then(res => res.json())
      .then((vs: string[]) => {
        const hasCustom = !!localStorage.getItem('ord_custom_data');
        const allVersions = hasCustom ? [...vs, 'Custom'] : vs;
        setVersions(allVersions);

        if (!currentVersion && vs.length > 0) {
          const latest = vs[vs.length - 1];
          setCurrentVersion(latest);
          localStorage.setItem('ord_version', latest);
        } else if (currentVersion && !allVersions.includes(currentVersion)) {
          const latest = vs[vs.length - 1];
          setCurrentVersion(latest);
          localStorage.setItem('ord_version', latest);
        }
      })
      .catch(err => console.error('Failed to load versions:', err));
  }, []);


  useEffect(() => {
    if (!currentVersion) return;

    if (currentVersion === 'Custom') {
      const savedData = localStorage.getItem('ord_custom_data');
      if (savedData) {
        try {
          setData(JSON.parse(savedData));
        } catch (e) {
          console.error('Failed to load custom data:', e);
        }
      }
      return;
    }

    fetch(`/data/${currentVersion}.json`)
      .then(res => res.json())
      .then((d: Data) => {
        setData(d);
      })
      .catch(err => {
        console.error(`Failed to load data for version ${currentVersion}:`, err);
        fetch('/data.json').then(res => res.json()).then(setData).catch(e => console.error('Fatal:', e));
      });
  }, [currentVersion]);

  const handleVersionChange = (ver: string) => {
    if (ver === currentVersion) return;

    if (confirm('Changing version will reset your inventory and bans. Are you sure?')) {
      setCurrentVersion(ver);
      localStorage.setItem('ord_version', ver);
      setInventory({});
      setBans(new Set());
    }
  };

  const [uiSize, setUiSize] = useState<'small' | 'medium' | 'large'>(() => {
    return (localStorage.getItem('ord_ui_size') as 'small' | 'medium' | 'large') || 'medium';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ord_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('ord_ui_size', uiSize);
    const root = document.documentElement;
    if (uiSize === 'small') {
      root.style.setProperty('--unit-height', '28px');
      root.style.setProperty('--unit-icon-size', '24px');
      root.style.setProperty('--unit-font-size-name', '0.75rem');
      root.style.setProperty('--unit-font-size-meta', '0.6rem');
      root.style.setProperty('--unit-input-width', '26px');
      root.style.setProperty('--unit-input-height', '20px');
    } else if (uiSize === 'medium') {
      root.style.setProperty('--unit-height', '36px');
      root.style.setProperty('--unit-icon-size', '30px');
      root.style.setProperty('--unit-font-size-name', '0.85rem');
      root.style.setProperty('--unit-font-size-meta', '0.7rem');
      root.style.setProperty('--unit-input-width', '32px');
      root.style.setProperty('--unit-input-height', '24px');
    } else if (uiSize === 'large') {
      root.style.setProperty('--unit-height', '44px');
      root.style.setProperty('--unit-icon-size', '38px');
      root.style.setProperty('--unit-font-size-name', '1rem');
      root.style.setProperty('--unit-font-size-meta', '0.8rem');
      root.style.setProperty('--unit-input-width', '40px');
      root.style.setProperty('--unit-input-height', '30px');
    }
  }, [uiSize]);

  const handleExportData = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ord-data-${data.version || 'custom'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setNotification('Game Data exported!');
  };

  const handleImportData = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedData = JSON.parse(e.target?.result as string);

        if (!importedData.units || !Array.isArray(importedData.units)) {
          throw new Error('Invalid data format');
        }


        localStorage.setItem('ord_custom_data', JSON.stringify(importedData));


        if (!versions.includes('Custom')) {
          setVersions([...versions, 'Custom']);
        }
        setCurrentVersion('Custom');
        localStorage.setItem('ord_version', 'Custom');

        setData(importedData);
        setNotification('Game Data imported!');
      } catch (err) {
        console.error('Failed to import data:', err);
        setNotification('Failed to import data');
      }
    };
    reader.readAsText(file);
  };

  const handleUnitClick = useCallback((unitId: string, isRightClick: boolean) => {
    if (isBanMode) {

      setBans(prev => {
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


    if (bans.has(unitId)) {
      return;
    }

    if (isRightClick) {
      // Right click: build unit
      if (!data) return;
      const unitsMap = new Map(data.units.map(u => [u.id, u]));

      try {
        setInventory(prev => {
          const newInventory = consumeMaterials(unitId, unitsMap, prev);
          return newInventory;
        });
      } catch (e) {

        console.warn('Cannot build unit:', e);
        setNotification(e instanceof Error ? e.message : 'Cannot build unit');
      }
    } else {
      // Left click: add unit
      setInventory(prev => ({
        ...prev,
        [unitId]: (prev[unitId] || 0) + 1
      }));
    }
  }, [isBanMode, bans, data]);

  const handleCountChange = useCallback((unitId: string, newCount: number) => {
    setInventory(prev => ({
      ...prev,
      [unitId]: Math.max(0, newCount)
    }));
  }, []);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  // Memoize expensive computations
  const unitsByRarity = useMemo(() => {
    if (!data) return {};
    return data.rarities.reduce((acc, rarity) => {
      acc[rarity] = data.units.filter(u => u.rarity === rarity);
      return acc;
    }, {} as Record<string, any[]>);
  }, [data]);

  const unitsMap = useMemo(() => {
    if (!data) return new Map();
    return new Map(data.units.map(u => [u.id, u]));
  }, [data]);

  if (!data) return <div className="container">Loading...</div>;

  return (
    <div className="container">

      {notification && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(255, 0, 0, 0.8)',
          color: 'white',
          padding: '10px 20px',
          borderRadius: '5px',
          zIndex: 1000,
          pointerEvents: 'none'
        }}>
          {notification}
        </div>
      )}

      <main className="dashboard">
        {/* Column 1: Options + Common + Uncommon + Random */}
        <div className="column">
          <OptionsPanel
            isBanMode={isBanMode}
            onToggleBanMode={() => setIsBanMode(!isBanMode)}
            onReset={() => {
              if (confirm('Reset inventory and bans?')) {
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
            versions={versions}
            currentVersion={currentVersion}
            onVersionChange={handleVersionChange}
            onExport={handleExportData}
            onImport={handleImportData}
          />
          {unitsByRarity['Common'] && (
            <UnitGroup
              title="Common"
              units={unitsByRarity['Common']}
              inventory={inventory}
              bans={bans}
              unitsMap={unitsMap}
              onUnitClick={handleUnitClick}
              onCountChange={handleCountChange}
              isTooltipEnabled={isTooltipEnabled}
              isShiftPressed={isShiftPressed}
              isWispEnabled={isWispEnabled}
            />
          )}
          {['Uncommon', 'Random'].map(rarity => unitsByRarity[rarity] && (
            <UnitGroup
              key={rarity}
              title={rarity}
              units={unitsByRarity[rarity]}
              inventory={inventory}
              bans={bans}
              unitsMap={unitsMap}
              onUnitClick={handleUnitClick}
              onCountChange={handleCountChange}
              isTooltipEnabled={isTooltipEnabled}
              isShiftPressed={isShiftPressed}
              isWispEnabled={isWispEnabled}
            />
          ))}
        </div>

        {/* Column 2: Special + Combination Item + Other */}
        <div className="column">
          {['Special', 'Combination Item', 'Other'].map(rarity => unitsByRarity[rarity] && (
            <UnitGroup
              key={rarity}
              title={rarity}
              units={unitsByRarity[rarity]}
              inventory={inventory}
              bans={bans}
              unitsMap={unitsMap}
              onUnitClick={handleUnitClick}
              onCountChange={handleCountChange}
              isTooltipEnabled={isTooltipEnabled}
              isShiftPressed={isShiftPressed}
              isWispEnabled={isWispEnabled}
            />
          ))}
        </div>

        {/* Column 3: Rare */}
        <div className="column">
          {unitsByRarity['Rare'] && (
            <UnitGroup
              title="Rare"
              units={unitsByRarity['Rare']}
              inventory={inventory}
              bans={bans}
              unitsMap={unitsMap}
              onUnitClick={handleUnitClick}
              onCountChange={handleCountChange}
              isTooltipEnabled={isTooltipEnabled}
              isShiftPressed={isShiftPressed}
              isWispEnabled={isWispEnabled}
            />
          )}
        </div>

        {/* Column 4: Legendary */}
        <div className="column">
          {unitsByRarity['Legendary'] && (
            <UnitGroup
              title="Legendary"
              units={unitsByRarity['Legendary']}
              inventory={inventory}
              bans={bans}
              unitsMap={unitsMap}
              onUnitClick={handleUnitClick}
              onCountChange={handleCountChange}
              isTooltipEnabled={isTooltipEnabled}
              isShiftPressed={isShiftPressed}
              subGroupBy="subGroup"
              isWispEnabled={isWispEnabled}
            />
          )}
        </div>

        {/* Column 5: Hidden + Distortion + Alternate */}
        <div className="column">
          {['Hidden', 'Distortion', 'Alternate'].map(rarity => unitsByRarity[rarity] && (
            <UnitGroup
              key={rarity}
              title={rarity}
              units={unitsByRarity[rarity]}
              inventory={inventory}
              bans={bans}
              unitsMap={unitsMap}
              onUnitClick={handleUnitClick}
              onCountChange={handleCountChange}
              isTooltipEnabled={isTooltipEnabled}
              isShiftPressed={isShiftPressed}
              subGroupBy={rarity !== 'Alternate' ? "subGroup" : undefined}
              isWispEnabled={isWispEnabled}
            />
          ))}
        </div>

        {/* Column 6: Transcendence + Limited */}
        <div className="column">
          {['Transcendence', 'Limited'].map(rarity => unitsByRarity[rarity] && (
            <UnitGroup
              key={rarity}
              title={rarity}
              units={unitsByRarity[rarity]}
              inventory={inventory}
              bans={bans}
              unitsMap={unitsMap}
              onUnitClick={handleUnitClick}
              onCountChange={handleCountChange}
              isTooltipEnabled={isTooltipEnabled}
              isShiftPressed={isShiftPressed}
              subGroupBy="subGroup"
              isWispEnabled={isWispEnabled}
            />
          ))}
        </div>

        {/* Column 7: Immortal + Eternal + Mystic */}
        <div className="column">
          {['Immortal', 'Eternal', 'Mystic'].map(rarity => unitsByRarity[rarity] && (
            <UnitGroup
              key={rarity}
              title={rarity}
              units={unitsByRarity[rarity]}
              inventory={inventory}
              bans={bans}
              unitsMap={unitsMap}
              onUnitClick={handleUnitClick}
              onCountChange={handleCountChange}
              isTooltipEnabled={isTooltipEnabled}
              isShiftPressed={isShiftPressed}
              subGroupBy="subGroup"
              isWispEnabled={isWispEnabled}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

export default App;
