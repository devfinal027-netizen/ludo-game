// Simple 15x15 grid Ludo-style layout mapped to a 480x480 board
// Track indices 0..51 run clockwise around the ring
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

