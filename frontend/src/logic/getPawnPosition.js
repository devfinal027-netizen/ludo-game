// Pure JS helper to map pawn state to {x, y} on a 600x600 SVG-style Ludo board
// Coordinates match the sample SVG grid the user provided.

// BOARD CONSTANTS
const BOARD_SIZE = 52; // main track
const HOME_LENGTH = 6; // home stretch
const CENTER = { x: 300, y: 300 };

// Starting positions (2x2 base per player)
const START_POS = {
  red: [
    { x: 90, y: 90 },
    { x: 150, y: 90 },
    { x: 90, y: 150 },
    { x: 150, y: 150 },
  ],
  yellow: [
    { x: 450, y: 90 },
    { x: 510, y: 90 },
    { x: 450, y: 150 },
    { x: 510, y: 150 },
  ],
  green: [
    { x: 90, y: 450 },
    { x: 150, y: 450 },
    { x: 90, y: 510 },
    { x: 150, y: 510 },
  ],
  blue: [
    { x: 450, y: 450 },
    { x: 510, y: 450 },
    { x: 450, y: 510 },
    { x: 510, y: 510 },
  ],
};

// Main track positions (52 steps, clockwise)
// Layout matches arms/lanes around the 600x600 board
const TRACK_POSITIONS = [
  { x: 240, y: 0 },
  { x: 280, y: 0 },
  { x: 320, y: 0 },
  { x: 360, y: 0 },
  { x: 400, y: 0 },
  { x: 440, y: 0 },
  { x: 480, y: 0 },
  { x: 480, y: 40 },
  { x: 480, y: 80 },
  { x: 480, y: 120 },
  { x: 480, y: 160 },
  { x: 480, y: 200 },
  { x: 480, y: 240 },
  { x: 440, y: 240 },
  { x: 400, y: 240 },
  { x: 360, y: 240 },
  { x: 320, y: 240 },
  { x: 280, y: 240 },
  { x: 240, y: 240 },
  { x: 240, y: 280 },
  { x: 240, y: 320 },
  { x: 240, y: 360 },
  { x: 280, y: 360 },
  { x: 320, y: 360 },
  { x: 360, y: 360 },
  { x: 400, y: 360 },
  { x: 440, y: 360 },
  { x: 480, y: 360 },
  { x: 480, y: 400 },
  { x: 480, y: 440 },
  { x: 480, y: 480 },
  { x: 480, y: 520 },
  { x: 440, y: 520 },
  { x: 400, y: 520 },
  { x: 360, y: 520 },
  { x: 320, y: 520 },
  { x: 280, y: 520 },
  { x: 240, y: 520 },
  { x: 240, y: 480 },
  { x: 240, y: 440 },
  { x: 240, y: 400 },
  { x: 240, y: 360 },
  { x: 200, y: 360 },
  { x: 160, y: 360 },
  { x: 120, y: 360 },
  { x: 80, y: 360 },
  { x: 40, y: 360 },
  { x: 40, y: 320 },
  { x: 40, y: 280 },
  { x: 40, y: 240 },
  { x: 80, y: 240 },
  { x: 120, y: 240 },
];

// Home stretch positions (6 steps per player)
const HOME_STRETCH = {
  red: Array.from({ length: 6 }, (_, i) => ({ x: 280, y: 40 + i * 40 })), // vertical down
  yellow: Array.from({ length: 6 }, (_, i) => ({ x: 360 + i * 40, y: 280 })), // horizontal left->center
  blue: Array.from({ length: 6 }, (_, i) => ({ x: 320, y: 360 + i * 40 })), // vertical up
  green: Array.from({ length: 6 }, (_, i) => ({ x: 40 + i * 40, y: 320 })), // horizontal right->center
};

// Start index on track for each player
const START_INDEX = { red: 0, yellow: 13, blue: 26, green: 39 };

/**
 * Get SVG coordinates for a pawn based on state
 * @param {('red'|'yellow'|'green'|'blue')} color
 * @param {('base'|'track'|'homeStretch'|'home')} state
 * @param {number} stepsFromStart
 *  - base: tokenIndex 0..3
 *  - track: steps since leaving base
 *  - homeStretch: absolute steps (>= BOARD_SIZE)
 */
function getPawnPosition(color, state, stepsFromStart) {
  if (!['red', 'yellow', 'green', 'blue'].includes(color)) {
    throw new Error('Invalid color: ' + color);
  }
  if (state === 'base') {
    return START_POS[color][Math.abs(Number(stepsFromStart)) % 4];
  }
  if (state === 'track') {
    const step = Math.abs(Number(stepsFromStart)) % BOARD_SIZE;
    const globalStep = (START_INDEX[color] + step) % BOARD_SIZE;
    return TRACK_POSITIONS[globalStep];
  }
  if (state === 'homeStretch') {
    const rel = Math.max(0, Math.min(HOME_LENGTH - 1, Number(stepsFromStart) - BOARD_SIZE));
    return HOME_STRETCH[color][rel];
  }
  if (state === 'home') {
    return CENTER;
  }
  throw new Error('Invalid token state: ' + state);
}

/** Optional: scale a 600x600 coordinate to target canvas size */
function scalePosition(pos, targetSize = 600) {
  const s = targetSize / 600;
  return { x: pos.x * s, y: pos.y * s };
}

// Exports for Node (CommonJS) and ESM
// Guard CommonJS export to avoid ReferenceError in browsers/ESM builds
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getPawnPosition, scalePosition, BOARD_SIZE, HOME_LENGTH, CENTER, START_POS, TRACK_POSITIONS, HOME_STRETCH, START_INDEX };
}
export { getPawnPosition, scalePosition, BOARD_SIZE, HOME_LENGTH, CENTER, START_POS, TRACK_POSITIONS, HOME_STRETCH, START_INDEX };
export default getPawnPosition;
