// Ludo board configuration constants
// Safe squares where tokens cannot be captured (matching backend validator.js)
export const SAFE_SQUARES = [0, 8, 13, 21, 26, 34, 39, 47];

// Board dimensions
export const BOARD_SIZE = 52; // Total track squares
export const HOME_LENGTH = 6; // Home stretch length (52-57)

// Player start positions (global track indices)
export const PLAYER_START_INDICES = [0, 13, 26, 39];

// Color mappings
export const PLAYER_COLORS = {
  0: { name: 'red', hex: 0xff3b30 },
  1: { name: 'green', hex: 0x34c759 },
  2: { name: 'yellow', hex: 0xffcc00 },
  3: { name: 'blue', hex: 0x0a84ff },
};

// Star visual config
export const STAR_CONFIG = {
  radius: 12,
  spikes: 5,
  color: 0xffd700, // Gold
  glowColor: 0xffd700,
  glowAlpha: 0.15,
  alpha: 0.9,
};
