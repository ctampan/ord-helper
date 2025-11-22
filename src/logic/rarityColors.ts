// Rarity color definitions - each rarity has a unique color for easy identification
export const RARITY_COLORS: Record<string, string> = {
  'Common': '#9ca3af',        // Gray
  'Uncommon': '#84cc16',      // Lime Green
  'Rare': '#0ea5e9',          // Sky Blue
  'Legendary': '#a855f7',     // Purple
  'Hidden': '#facc15',        // Gold
  'Distortion': '#ec4899',    // Hot Pink
  'Alternate': '#14b8a6',     // Teal
  'Special': '#f97316',       // Orange
  'Transcendence': '#eab308', // Yellow
  'Limited': '#e11d48',       // Crimson
  'Immortal': '#ef4444',      // Red
  'Eternal': '#3b82f6',       // Blue
  'Mystic': '#d946ef',        // Magenta
};

// Get the color for a given rarity, defaults to gray if rarity not found
export const getRarityColor = (rarity: string): string => {
  return RARITY_COLORS[rarity] || RARITY_COLORS['Common'];
};
