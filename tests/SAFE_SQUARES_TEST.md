# Safe Squares Feature - Testing Guide

## Quick Visual Test

### 1. Start the Game
```bash
# Start backend
npm start

# Start frontend (in another terminal)
cd frontend
npm run dev
```

### 2. Create a Game
1. Login with two players
2. Create a room
3. Join with second player
4. Game starts

### 3. Verify Stars Are Visible
**Expected:** You should see **8 gold animated stars ⭐** on the board at these positions:
- 1 star at the top (index 0)
- 1 star at the right (index 13)
- 1 star at the bottom (index 26)
- 1 star at the left (index 39)
- 4 stars at the corners (indices 8, 21, 34, 47)

**Animation:** Stars should pulse gently (scale 1.0 → 1.15 → 1.0)

---

## Gameplay Test Scenarios

### Test 1: Token Cannot Be Captured on Safe Square

**Steps:**
1. Player 1 rolls **6** and moves token to starting square (index 0 - safe)
2. Player 2 rolls **6** and moves token to starting square (index 0 - safe)
3. **Expected:** Both tokens stay on square, no capture occurs

**Console Log:**
```
[Board] Token P0-T0 landed on SAFE square 0 ⭐
[Board] Token P1-T0 landed on SAFE square 0 ⭐
```

**Backend Log:**
```json
{"level":"info","message":"socket:event:emit","event":"token:move","playerIndex":0,"tokenIndex":0}
{"level":"info","message":"socket:event:emit","event":"token:move","playerIndex":1,"tokenIndex":0}
```

---

### Test 2: Token Can Be Captured on Normal Square

**Steps:**
1. Player 1 moves token to index 5 (NOT safe)
2. Player 2 lands on index 5
3. **Expected:** Player 1's token is captured and returns to base

**Backend Validation:**
```javascript
// In validator.js, this should succeed:
const opponents = occupantsAt(occ, globalIndex);
if (opponents.length > 0 && !safeSquares.has(destGlobal)) {
  // Capture allowed
  return { legal: true, captures: [...] };
}
```

---

### Test 3: Golden Glow Effect on Landing

**Steps:**
1. Roll dice and move token to a safe square (e.g., index 8)
2. **Expected:** 
   - Golden expanding circle appears and fades out (0.6s)
   - Console logs: `[Board] Token P0-T0 landed on SAFE square 8 ⭐`

**Visual:**
- Golden glow starts at 100% opacity, radius 20px
- Expands to 150% scale while fading to 0% opacity
- Disappears after animation completes

---

### Test 4: Multiple Tokens on Safe Square

**Steps:**
1. Player 1 moves 2 tokens to index 0 (safe)
2. **Expected:** Both tokens occupy the same square without issue
3. Player 2 tries to land on index 0
4. **Expected:** Player 2 cannot capture, all 3 tokens remain

**Note:** Unlike normal squares where only same-player tokens can stack, safe squares allow any configuration.

---

## Automated Testing (Optional)

### Backend Unit Test

Create `tests/validator.test.js`:

```javascript
const { validateMove } = require('../services/validator');

describe('Safe Squares', () => {
  test('Token on safe square cannot be captured', () => {
    const game = {
      players: [
        { tokens: [{ tokenIndex: 0, state: 'track', stepsFromStart: 8 }] }, // P0 on safe square 8
        { tokens: [{ tokenIndex: 0, state: 'base', stepsFromStart: 0 }] },
      ],
    };
    
    // Player 1 tries to enter board (lands on index 0, which wraps to P1's perspective)
    const result = validateMove(game, 1, 0, 6);
    
    // Should not allow landing on opponent's safe square
    expect(result.legal).toBe(false);
    expect(result.reason).toContain('safe square');
  });
});
```

Run:
```bash
npm test validator.test.js
```

---

## Browser Console Tests

### Check Constants Are Loaded
```javascript
// Open browser console on game page
import { SAFE_SQUARES } from './constants/boardConfig';
console.log(SAFE_SQUARES);
// Expected: [0, 8, 13, 21, 26, 34, 39, 47]
```

### Verify Star Positions Match Game State
```javascript
// After game starts, check Redux state
const game = window.__REDUX_STORE__.getState().game.game;
console.log('Game turnIndex:', game.turnIndex);
console.log('Player 0 tokens:', game.players[0].tokens);

// Manually check if token is on safe square
const token = game.players[0].tokens[0];
console.log('Token at:', token.stepsFromStart);
console.log('Is safe?', [0,8,13,21,26,34,39,47].includes(token.stepsFromStart));
```

---

## Performance Test

### Check Animation Frame Rate

Open Chrome DevTools → Performance:

1. Start recording
2. Let game run for 10 seconds with stars visible
3. Stop recording
4. Check **FPS** (should be 60fps consistently)
5. Check **Main thread** - GSAP star animations should use <1ms per frame

**Benchmark:**
- 8 stars × 2 animations (scale + alpha) = 16 simultaneous tweens
- Expected CPU usage: <0.5% on modern hardware

---

## Troubleshooting

### Stars Not Visible
**Check:**
1. `SAFE_SQUARES` imported correctly in BoardCanvas.jsx
2. PixiJS board layer initialized (check browser console for errors)
3. `posFor.trackCoord()` returns valid coordinates

**Fix:**
```javascript
// Add debug logging in BoardCanvas.jsx
SAFE_SQUARES.forEach((idx) => {
  const pos = posFor.trackCoord(idx);
  console.log(`Star ${idx} at:`, pos);
});
```

### Stars Not Animating
**Check:**
1. GSAP imported correctly
2. No JS errors in console
3. `starsContainer` added to board layer

**Fix:**
```javascript
// Test GSAP works
import gsap from 'gsap';
gsap.to(document.body, { backgroundColor: 'red', duration: 1 });
```

### Landing Effect Not Showing
**Check:**
1. `tokenLayerRef.current` exists
2. `SAFE_SQUARES.includes()` check working
3. Console log appears but no visual

**Fix:**
```javascript
// Check if glow is created
console.log('Token layer children:', tokenLayerRef.current.children.length);
```

---

## Success Criteria

✅ All 8 gold stars visible and pulsing smoothly  
✅ Stars positioned correctly on track squares  
✅ Tokens cannot capture opponents on safe squares  
✅ Golden glow effect plays when landing on safe square  
✅ Console logs confirm safe square landings  
✅ No performance degradation (60fps maintained)  
✅ Backend validation prevents illegal captures  

---

## Next Steps After Testing

1. **User Feedback:** Add tooltip/hint showing safe square rules
2. **Sound Effects:** Add audio cue when landing on safe square
3. **Tutorial:** Highlight safe squares during first game
4. **Accessibility:** Add ARIA labels for screen readers
5. **Mobile:** Test touch interactions on mobile devices
