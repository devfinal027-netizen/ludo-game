// Simple 15x15 grid Ludo-style layout mapped to a 480x480 board
// Track indices 0..51 run clockwise around the ring (shared for all players, matching backend)
const CELL = 32; // px
const OFFSET = 16; // center offset inside cell for token sprite

// Precompute a rough ring path (starting top-left corner moving right, then down, left, up)
// This is a simplified approximation sufficient for visual feedback.
const RING = [];
// top row (skip corners overlap rules for simplicity)
for (let x = 2; x <= 12; x++) RING.push([x, 2]);
// right column
for (let y = 3; y <= 12; y++) RING.push([12, y]);
// bottom row
for (let x = 11; x >= 2; x--) RING.push([x, 12]);
// left column
for (let y = 11; y >= 3; y--) RING.push([2, y]);

// Ensure 52 length by trimming or cycling
while (RING.length > 52) RING.pop();
while (RING.length < 52) RING.push(RING[RING.length - 1]);

export function positionForIndex(index) {
  if (index == null || index < 0) return { x: 0, y: 0 };
  const [gx, gy] = RING[index % RING.length];
  return { x: gx * CELL + OFFSET, y: gy * CELL + OFFSET };
}

// Base pads (4 tokens) per player quadrant
// Layout small 2x2 grids inside each quadrant
const BASE_ORIGINS = {
  red: [3, 3],
  green: [9, 3],
  yellow: [9, 9],
  blue: [3, 9],
};

function baseSlot(color = 'blue', tokenIndex = 0) {
  const origin = BASE_ORIGINS[color] || BASE_ORIGINS.blue;
  const dx = tokenIndex % 2;
  const dy = Math.floor(tokenIndex / 2);
  return { x: (origin[0] + dx) * CELL + OFFSET, y: (origin[1] + dy) * CELL + OFFSET };
}

// Home stretch mapping: indices 52..57 advance toward center on a simple diagonal
// Since backend does not offset per color, we render a neutral inward path
function homeStretchPosition(stepsFromStart) {
  const t = Math.min(57, Math.max(52, stepsFromStart)) - 52; // 0..5
  const center = { x: 240, y: 240 };
  // simple upward path toward center
  return { x: center.x, y: center.y - t * (CELL * 0.6) };
}

// Compute screen position from backend token fields
export function positionForToken({ state, stepsFromStart, color, tokenIndex = 0 }) {
  if (!state || state === 'base' || stepsFromStart == null || stepsFromStart < 0) {
    return baseSlot(color, tokenIndex);
  }
  if (state === 'track') {
    return positionForIndex(stepsFromStart);
  }
  if (state === 'homeStretch') {
    return homeStretchPosition(stepsFromStart);
  }
  // home: place at center star
  return { x: 240, y: 240 };
}

