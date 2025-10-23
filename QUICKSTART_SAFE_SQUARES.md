# Quick Start - Safe Squares Feature

## ⚡ 3-Minute Test

### Step 1: Refresh the Frontend
```bash
# The frontend should auto-reload if Vite is running
# If not, restart:
cd c:\Users\X1\pro\ludo-game\frontend
npm run dev
```

**Backend restart NOT needed** - we only modified frontend code!

---

### Step 2: Start a Game
1. Open browser: `http://localhost:5173`
2. Login as Player 1
3. Create a room (2 players, Classic mode)
4. Open **incognito window** → Login as Player 2
5. Join the room
6. Game starts automatically

---

### Step 3: Look for Stars ⭐

**You should immediately see:**
- **8 gold animated stars** on the board
- Stars gently **pulsing** (growing/shrinking)
- Stars appear at corners and player starting positions

**Star positions:**
```
   ⭐ (top-right, index 0)
   ⭐ (top-left, index 8)
   ⭐ (right-top, index 13)
   ⭐ (right-bottom, index 21)
   ⭐ (bottom-right, index 26)
   ⭐ (bottom-left, index 34)
   ⭐ (left-bottom, index 39)
   ⭐ (left-top, index 47)
```

---

### Step 4: Test Safe Square Protection

#### Quick Test (30 seconds):
1. **Player 1** rolls dice (click dice button)
2. If roll = **6**, token enters at star position (index 0) ⭐
3. **Watch:** Golden expanding glow effect appears! ✨
4. **Check console:** `[Board] Token P0-T0 landed on SAFE square 0 ⭐`
5. **Player 2** rolls **6**, also enters at index 0 ⭐
6. **Result:** Both tokens stay (no capture!) ✅

---

### Step 5: Verify Backend Validation

#### Test Capture Prevention:
1. Move Player 1 token OFF safe square (roll non-6 values)
2. Move Player 2 token to same position
3. **Result:** Player 1 token captured (sent to base)

4. Move Player 1 token TO safe square (index 8, 13, 21, etc.)
5. Move Player 2 token to same safe square
6. **Result:** Both tokens stay (no capture) ✅

---

## 🎮 Expected Behavior

### Visual Effects
| Action | Visual Feedback |
|--------|----------------|
| Game starts | 8 gold stars visible and pulsing |
| Token lands on star | Golden expanding glow (0.6s) |
| Token stays on star | Protected from capture |
| Multiple tokens on star | All remain visible |

### Console Logs
```javascript
// When token lands on safe square:
[Board] Token P0-T0 landed on SAFE square 0 ⭐

// When trying to capture on safe square:
[ERROR] ui:roll:failed {error: 'Cannot capture on safe square'}
```

### Backend Logs
```json
{"level":"info","event":"token:move","playerIndex":0,"tokenIndex":0,"stepsFromStart":8}
{"level":"warn","message":"Cannot capture on safe square","destGlobal":8}
```

---

## 🐛 Troubleshooting

### Issue: Stars Not Visible

**Check 1:** Browser console for errors
```javascript
// Open DevTools (F12) → Console
// Look for: "Uncaught ReferenceError: SAFE_SQUARES is not defined"
```

**Fix:** Clear browser cache and hard refresh (Ctrl+Shift+R)

---

**Check 2:** Constants file exists
```bash
ls frontend/src/constants/boardConfig.js
# Should output: frontend/src/constants/boardConfig.js
```

**Fix:** If missing, create it:
```javascript
// frontend/src/constants/boardConfig.js
export const SAFE_SQUARES = [0, 8, 13, 21, 26, 34, 39, 47];
export const STAR_CONFIG = {
  radius: 12,
  spikes: 5,
  color: 0xffd700,
  glowColor: 0xffd700,
  glowAlpha: 0.15,
  alpha: 0.9,
};
```

---

**Check 3:** PixiJS initialized
```javascript
// Browser console
console.log(window.PIXI);
// Should output: Object {...} (PixiJS namespace)
```

**Fix:** Reinstall dependencies:
```bash
cd frontend
npm install pixi.js gsap
```

---

### Issue: Stars Not Animating

**Check:** GSAP installed
```bash
cd frontend
npm list gsap
# Should show: gsap@3.x.x
```

**Fix:** Install GSAP:
```bash
npm install gsap
```

---

### Issue: Landing Effect Not Showing

**Check:** Console log appears but no glow
```javascript
// This should log:
[Board] Token P0-T0 landed on SAFE square 8 ⭐
```

**Fix:** Check `tokenLayerRef.current` exists:
```javascript
// In BoardCanvas.jsx, add debug log:
console.log('Token layer:', tokenLayerRef.current);
// Should output: Container {children: [...]}
```

---

### Issue: Capture Not Prevented

**Check:** Backend validation working
```bash
# Check backend logs for:
{"level":"warn","message":"Cannot capture on safe square"}
```

**Fix:** Backend validator already has this! But verify:
```javascript
// backend/services/validator.js
function buildSafeSquaresDefault() {
  return new Set([0, 8, 13, 21, 26, 34, 39, 47]); // Must match frontend!
}
```

---

## 📊 Performance Check

### FPS Test
1. Open Chrome DevTools → Performance
2. Click "Record"
3. Play game for 10 seconds
4. Stop recording
5. Check **FPS** - should be **60fps consistently**

**Expected:** Green bar at top (60fps), no red drops

---

### CPU Usage
With 8 animated stars:
- **Expected:** <1% CPU usage
- **GSAP animations:** <0.1ms per frame
- **PixiJS rendering:** <2ms per frame

---

## ✅ Success Checklist

- [ ] 8 stars visible on board
- [ ] Stars pulse smoothly (1.2s cycle)
- [ ] Stars positioned at correct indices
- [ ] Landing glow effect works
- [ ] Console logs safe square events
- [ ] Tokens cannot capture on stars
- [ ] Multiple tokens can share star
- [ ] No errors in browser console
- [ ] 60fps maintained
- [ ] Backend validation works

---

## 📚 Next Steps

### If Everything Works:
1. ✅ Mark task complete
2. 📖 Read full docs: `docs/SAFE_SQUARES.md`
3. 🎨 Customize star appearance (optional)
4. 🎮 Play a full game and enjoy!

### If Issues Persist:
1. 📋 Check detailed testing guide: `tests/SAFE_SQUARES_TEST.md`
2. 🗺️ Review board layout: `docs/BOARD_LAYOUT.md`
3. 📝 Read implementation summary: `SAFE_SQUARES_IMPLEMENTATION.md`
4. 🐛 Check troubleshooting sections above

---

## 🎯 What You Got

✨ **Visual Features:**
- 8 animated gold stars on safe squares
- Golden glow when landing on stars
- Smooth pulsing animation

🛡️ **Gameplay Features:**
- Tokens protected from capture on stars
- Multiple tokens can share safe squares
- Clear visual feedback

📚 **Documentation:**
- Complete implementation guide
- Testing scenarios
- Board layout diagram
- Customization examples

🔧 **Code Quality:**
- Centralized constants
- Clean integration with existing code
- Performance optimized
- Well-commented

---

## 🎮 Enjoy Your Enhanced Ludo Game!

**The safe squares feature is now complete and matches professional Ludo games like Ludo King!** ⭐

**Time to test:** 3 minutes  
**Total implementation:** 4 files modified, 3 files created  
**Visual impact:** ⭐⭐⭐⭐⭐

---

## 📞 Support

If you encounter any issues:
1. Check browser console (F12)
2. Review error messages
3. Verify all files were modified correctly
4. Clear browser cache and restart frontend

**Most common fix:** Hard refresh browser (Ctrl+Shift+R)
