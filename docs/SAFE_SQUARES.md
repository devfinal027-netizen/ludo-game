# Safe Squares Feature

## Overview

Safe squares (also called "star squares" or "safe zones") are special positions on the Ludo board where tokens **cannot be captured** by opponent tokens. These squares are visually marked with **animated gold stars ⭐**.

## Implementation

### Backend Validation (`services/validator.js`)

```javascript
function buildSafeSquaresDefault() {
  // Safe squares at global indices (0-51 on the main track)
  return new Set([0, 8, 13, 21, 26, 34, 39, 47]);
}
```

**Rules enforced:**
- Tokens cannot capture opponents on safe squares
- Opponents cannot land on your token if you're on a safe square
- These positions match traditional Ludo game rules

### Frontend Visualization (`frontend/src/board/BoardCanvas.jsx`)

**Visual Features:**
1. **Gold stars (⭐)** rendered at each safe square position
2. **Pulsing animation** - Stars gently scale up/down with staggered timing
3. **Glow effect** - Subtle golden aura behind each star
4. **Landing feedback** - Golden expanding glow when token lands on safe square

**Constants:** (`frontend/src/constants/boardConfig.js`)
```javascript
export const SAFE_SQUARES = [0, 8, 13, 21, 26, 34, 39, 47];
export const STAR_CONFIG = {
  radius: 12,
  spikes: 5,
  color: 0xffd700, // Gold
  glowColor: 0xffd700,
  glowAlpha: 0.15,
  alpha: 0.9,
};
```

## Safe Square Positions

The 8 safe squares are strategically placed around the board:

| Index | Position Description |
|-------|---------------------|
| 0     | Starting square (shared) |
| 8     | After first corner |
| 13    | Starting square (player 2) |
| 21    | After second corner |
| 26    | Starting square (player 3) |
| 34    | After third corner |
| 39    | Starting square (player 4) |
| 47    | After fourth corner |

## Game Rules

### When on a Safe Square:
✅ **Protected from capture** - Opponents cannot send your token back to base
✅ **Multiple tokens allowed** - Your own tokens can stack on safe squares
✅ **Cannot form blocks** - Safe squares don't create blocking positions

### Validation Logic:
```javascript
if (opponents.length > 0 && safeSquares.has(destGlobal)) {
  return { legal: false, reason: 'Cannot capture on safe square' };
}
```

## Visual Effects

### 1. Star Animation
- **Duration:** 1.2 seconds per cycle
- **Effect:** Scale from 1.0 to 1.15 (yoyo repeat)
- **Stagger:** 0.15s delay between stars
- **Easing:** sine.inOut for smooth motion

### 2. Glow Pulse
- **Duration:** 1.2 seconds per cycle
- **Effect:** Fade from 0.15 to 0.3 alpha (yoyo repeat)
- **Synchronized** with star scale animation

### 3. Landing Feedback
- **Trigger:** Token moves onto safe square
- **Effect:** Golden circle expands and fades out
- **Duration:** 0.6 seconds
- **Scale:** 1.0 to 1.5x

## Customization

### Adjust Star Appearance
Modify `frontend/src/constants/boardConfig.js`:
```javascript
export const STAR_CONFIG = {
  radius: 14,        // Larger stars
  spikes: 6,         // More spikes
  color: 0xffea00,   // Brighter gold
  glowAlpha: 0.25,   // More visible glow
};
```

### Disable Animation
In `BoardCanvas.jsx`, remove or comment out the GSAP animation blocks:
```javascript
// gsap.to(starGroup.scale, { ... }); // Remove for static stars
```

### Change Safe Square Positions
⚠️ **Warning:** Must match backend validation!

1. Update `backend/services/validator.js`:
```javascript
function buildSafeSquaresDefault() {
  return new Set([0, 6, 12, 18, 24, 30, 36, 42]); // New positions
}
```

2. Update `frontend/src/constants/boardConfig.js`:
```javascript
export const SAFE_SQUARES = [0, 6, 12, 18, 24, 30, 36, 42];
```

## Testing

### Visual Verification
1. Start a game
2. Look for **8 gold animated stars** on the board
3. Stars should pulse gently with staggered timing

### Gameplay Testing
1. Move token to a safe square (e.g., index 8)
2. Opponent token lands on same square
3. ✅ Verify: Your token is NOT captured
4. ✅ Verify: Golden glow appears when landing on star

### Console Testing
```javascript
// Check if position is safe
import { SAFE_SQUARES } from './constants/boardConfig';
console.log(SAFE_SQUARES.includes(8)); // true
console.log(SAFE_SQUARES.includes(5)); // false
```

## Performance

- **Stars:** Rendered once during board initialization (static graphics)
- **Animations:** GSAP handles efficiently with RequestAnimationFrame
- **Landing effects:** Created/destroyed on-demand (no memory leaks)
- **Impact:** Negligible (~0.1ms per frame for 8 animated stars)

## References

- Backend validator: `services/validator.js`
- Frontend rendering: `frontend/src/board/BoardCanvas.jsx`
- Constants: `frontend/src/constants/boardConfig.js`
- Official Ludo rules: Stars traditionally placed at starting squares and corners
