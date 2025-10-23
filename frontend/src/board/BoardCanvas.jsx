import { useEffect, useMemo, useRef } from 'react';
import * as PIXI from 'pixi.js';
import gsap from 'gsap';
import { getPawnPosition, scalePosition } from '../logic/getPawnPosition';
import { SAFE_SQUARES, STAR_CONFIG } from '../constants/boardConfig';

// Minimal PixiJS board renderer placeholder (Ludo King–style sample)
// - Draws a simple board grid and four home quadrants
// - Renders tokens as colored circles
// - Highlights legal tokens and supports onTokenClick
// Props:
//   - game: full game state (players with tokens)
//   - turnIndex: current turn index
//   - legalTokens: array of tokenIndex that are legal for the current player
//   - onTokenClick: function(tokenIndex)
export default function BoardCanvas({ game, turnIndex, legalTokens = [], onTokenClick }) {
  const containerRef = useRef(null);
  const appRef = useRef(null);
  const spritesRef = useRef({}); // key: `${playerIdx}-${tokenIndex}` -> PIXI.DisplayObject
  const boardLayerRef = useRef(null);
  const tokenLayerRef = useRef(null);
  const texturesRef = useRef({});
  const prevRef = useRef(new Map()); // key -> { state, stepsFromStart }

  const size = 640; // canvas size (responsive scaling could be added later)

  // Basic mapping: board geometry for drawing only; pawn world positions come from getPawnPosition()
  const posFor = useMemo(() => {
    const padding = 40;
    const boardSize = size - padding * 2;
    const center = { x: size / 2, y: size / 2 };
    const slots = 52;

    function buildTrack() {
      // Build track positions based on 15x15 grid system
      const gridSize = 15;
      const cellSize = boardSize / gridSize;
      const pts = [];
      
      // Track path follows classic Ludo: 52 squares in clockwise direction
      // Start index 0 is at top-right entrance (green's start)
      
      // Path mapping (row, col) for each of the 52 track squares
      // Clockwise from index 0 (Red player starting square at top)
      const trackPath = [
        // Side 1: Top-right vertical track going UP (Red's entrance, indices 0-5)
        [6, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8],
        // Corner turn
        [0, 8],
        // Side 2: Top horizontal track going LEFT (indices 7-12)
        [0, 7], [0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
        // Side 3: Top-left vertical going DOWN (Green's entrance at 13, indices 13-19)
        [6, 6], [7, 6], [8, 6], [9, 6], [10, 6], [11, 6], [12, 6],
        // Corner turn
        [13, 6], [14, 6],
        // Side 4: Bottom horizontal going RIGHT (Yellow's entrance at 26, indices 21-25)
        [14, 7], [14, 8], [13, 8], [12, 8], [11, 8],
        // Continue (index 26 - Yellow start)
        [10, 8],
        // Going up right side (indices 27-32)
        [9, 8], [8, 8], [8, 9], [8, 10], [8, 11], [8, 12],
        // Corner turn right edge
        [8, 13], [8, 14],
        // Side continuing (indices 35-38)
        [7, 14], [6, 14], [7, 13], [7, 12],
        // Blue's entrance (index 39)
        [7, 11], [7, 10],
        // Completing loop back to start (indices 41-51)
        [7, 9], [7, 8], [7, 7], [6, 7], [5, 7], [4, 7], [3, 7], [2, 7], [1, 7], [0, 7], [6, 9]
      ];
      
      trackPath.forEach(([row, col]) => {
        const x = padding + col * cellSize + cellSize / 2;
        const y = padding + row * cellSize + cellSize / 2;
        pts.push({ x, y });
      });
      
      // Ensure we have exactly 52 points
      while (pts.length < 52) {
        pts.push(pts[pts.length - 1]); // Duplicate last if needed
      }
      
      return pts.slice(0, 52);
    }

    const trackPts = buildTrack();

    function trackCoord(stepsFromStart) {
      const idx = ((stepsFromStart % slots) + slots) % slots;
      return trackPts[idx];
    }
    function baseCoord(playerIdx, tokenIndex) {
      const offsets = [
        { x: -1, y: -1 },
        { x: 1, y: -1 },
        { x: -1, y: 1 },
        { x: 1, y: 1 },
      ];
      const cell = tokenIndex % 4;
      const grid = [
        { x: -20, y: -20 },
        { x: 20, y: -20 },
        { x: -20, y: 20 },
        { x: 20, y: 20 },
      ][cell];
      const off = offsets[playerIdx % 4];
      return { x: center.x + off.x * (boardSize * 0.28) + grid.x, y: center.y + off.y * (boardSize * 0.28) + grid.y };
    }
    function homeStretchCoord(playerIdx, stepsFromStart) {
      // 52..58 relative count
      const rel = Math.max(0, stepsFromStart - 52);
      const inner = boardSize * 0.18;
      // Directions per player: 0=up,1=right,2=down,3=left toward center
      if ((playerIdx % 4) === 0) {
        // from bottom to center (upwards)
        const y = center.y + inner - rel * 8;
        return { x: center.x, y };
      }
      if ((playerIdx % 4) === 1) {
        // from left to center (rightwards)
        const x = center.x - inner + rel * 8;
        return { x, y: center.y };
      }
      if ((playerIdx % 4) === 2) {
        // from top to center (downwards)
        const y = center.y - inner + rel * 8;
        return { x: center.x, y };
      }
      // player 3: from right to center (leftwards)
      const x = center.x + inner - rel * 8;
      return { x, y: center.y };
    }
    return { trackCoord, baseCoord, homeStretchCoord, center };
  }, [size]);

  // Player color mapping
  const colorFor = (idx) => {
    return [0xff3b30, 0x34c759, 0xffcc00, 0x0a84ff][idx % 4];
  };

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    const app = new PIXI.Application();
    (async () => {
      try {
        await app.init({ width: size, height: size, antialias: true, background: '#0e0e10' });
        if (cancelled) { try { await app.destroy(); } catch (_) {} return; }
        containerRef.current.innerHTML = '';
        containerRef.current.appendChild(app.canvas);
        appRef.current = app;

        // Layers
        const boardLayer = new PIXI.Container();
        const tokenLayer = new PIXI.Container();
        app.stage.addChild(boardLayer);
        app.stage.addChild(tokenLayer);
        boardLayerRef.current = boardLayer;
        tokenLayerRef.current = tokenLayer;

        // Procedural Ludo-style board (no external assets)
        const g = new PIXI.Graphics();
        const plate = { x: 10, y: 10, w: size - 20, h: size - 20, r: 26 };
        // Base plate with shadow edge
        g.beginFill(0x0a0a0f, 1).drawRoundedRect(plate.x + 6, plate.y + 6, plate.w, plate.h, plate.r).endFill();
        g.beginFill(0x121218, 1).drawRoundedRect(plate.x, plate.y, plate.w, plate.h, plate.r).endFill();

        const margin = 28;
        const boardX = plate.x + margin;
        const boardY = plate.y + margin;
        const boardW = plate.w - margin * 2;
        const boardH = plate.h - margin * 2;
        const quadW = boardW / 2;
        const quadH = boardH / 2;

        // Quadrants
        const colors = [0xff3b30, 0x34c759, 0xffcc00, 0x0a84ff]; // R,G,Y,B
        const quads = [
          { x: boardX, y: boardY, c: colors[0] },
          { x: boardX + quadW, y: boardY, c: colors[1] },
          { x: boardX, y: boardY + quadH, c: colors[2] },
          { x: boardX + quadW, y: boardY + quadH, c: colors[3] },
        ];
        quads.forEach((q) => {
          g.lineStyle(3, 0xffffff, 0.06);
          g.beginFill(q.c, 0.9).drawRoundedRect(q.x, q.y, quadW - 6, quadH - 6, 12).endFill();
          // inner pad
          g.lineStyle(2, 0x000000, 0.18);
          g.drawRoundedRect(q.x + 14, q.y + 14, quadW - 34, quadH - 34, 10);
        });

        // Center star
        const cx = plate.x + plate.w / 2;
        const cy = plate.y + plate.h / 2;
        const starR = Math.min(quadW, quadH) * 0.22;
        const star = new PIXI.Graphics();
        const starColors = [colors[0], colors[1], colors[2], colors[3]];
        for (let i = 0; i < 4; i++) {
          star.beginFill(starColors[i], 0.9);
          star.moveTo(cx, cy);
          star.lineTo(cx + starR * Math.cos((i * Math.PI) / 2), cy + starR * Math.sin((i * Math.PI) / 2));
          star.lineTo(cx + starR * Math.cos(((i + 1) * Math.PI) / 2), cy + starR * Math.sin(((i + 1) * Math.PI) / 2));
          star.lineTo(cx, cy);
          star.endFill();
        }
        star.lineStyle(2, 0x000000, 0.2);
        star.drawCircle(cx, cy, 4);
        boardLayer.addChild(g);
        boardLayer.addChild(star);

        // Home lanes with colored squares (6 each) like traditional Ludo
        const homeLanes = new PIXI.Graphics();
        const laneW = quadW * 0.18; // lane width
        const homeLaneSquareSize = laneW * 0.8;
        
        // Helper to draw colored home lane squares with arrow pointing to center
        function drawHomeLane(startX, startY, direction, color) {
          // direction: 'up', 'down', 'left', 'right'
          for (let i = 0; i < 6; i++) {
            let x, y;
            if (direction === 'up') {
              x = startX;
              y = startY - i * homeLaneSquareSize - i * 2;
            } else if (direction === 'down') {
              x = startX;
              y = startY + i * homeLaneSquareSize + i * 2;
            } else if (direction === 'left') {
              x = startX - i * homeLaneSquareSize - i * 2;
              y = startY;
            } else { // right
              x = startX + i * homeLaneSquareSize + i * 2;
              y = startY;
            }
            
            // Draw colored square
            homeLanes.lineStyle(2, 0x000000, 0.2);
            homeLanes.beginFill(color, 0.7);
            homeLanes.drawRect(x - homeLaneSquareSize / 2, y - homeLaneSquareSize / 2, homeLaneSquareSize, homeLaneSquareSize);
            homeLanes.endFill();
            
            // Draw arrow on last square (pointing to center)
            if (i === 5) {
              homeLanes.beginFill(0xffffff, 0.9);
              const arrowSize = homeLaneSquareSize * 0.4;
              if (direction === 'up' || direction === 'down') {
                const dy = direction === 'up' ? -arrowSize / 2 : arrowSize / 2;
                homeLanes.moveTo(x, y + dy);
                homeLanes.lineTo(x - arrowSize / 2, y - dy);
                homeLanes.lineTo(x + arrowSize / 2, y - dy);
              } else {
                const dx = direction === 'left' ? -arrowSize / 2 : arrowSize / 2;
                homeLanes.moveTo(x + dx, y);
                homeLanes.lineTo(x - dx, y - arrowSize / 2);
                homeLanes.lineTo(x - dx, y + arrowSize / 2);
              }
              homeLanes.closePath();
              homeLanes.endFill();
            }
          }
        }
        
        // Draw home lanes for each player (pointing toward center)
        drawHomeLane(cx, boardY + quadH - 20, 'up', colors[0]); // Red: up
        drawHomeLane(boardX + quadW + 20, cy, 'right', colors[1]); // Green: right
        drawHomeLane(cx, cy + 20, 'down', colors[2]); // Yellow: down
        drawHomeLane(boardX + quadW - 20, cy, 'left', colors[3]); // Blue: left
        
        boardLayer.addChild(homeLanes);

        // Classic Ludo 15x15 grid track (like Image 2)
        const trackGrid = new PIXI.Graphics();
        const gridSize = 15; // 15x15 grid
        const cellSize = (boardW / gridSize); // Each cell size
        
        // Define which cells are track squares (rest are empty/quadrant space)
        // Traditional Ludo has track in columns 6,7,8 (vertical) and rows 6,7,8 (horizontal)
        const trackCells = new Set();
        
        // Vertical track columns (6, 7, 8 - middle 3 columns)
        for (let row = 0; row < gridSize; row++) {
          for (let col = 6; col <= 8; col++) {
            // Skip center 3x3 (rows 6-8, cols 6-8) - that's the home area
            if (row < 6 || row > 8) {
              trackCells.add(`${row},${col}`);
            }
          }
        }
        
        // Horizontal track rows (6, 7, 8 - middle 3 rows)
        for (let col = 0; col < gridSize; col++) {
          for (let row = 6; row <= 8; row++) {
            // Skip center 3x3
            if (col < 6 || col > 8) {
              trackCells.add(`${row},${col}`);
            }
          }
        }
        
        // Draw all track squares
        trackCells.forEach((key) => {
          const [row, col] = key.split(',').map(Number);
          const x = boardX + col * cellSize;
          const y = boardY + row * cellSize;
          
          // Alternating colors for visual clarity
          const isLight = (row + col) % 2 === 0;
          const fillColor = isLight ? 0xffffff : 0xf5f5f5;
          
          trackGrid.lineStyle(1.5, 0xcccccc, 0.8); // Grid lines
          trackGrid.beginFill(fillColor, 1);
          trackGrid.drawRect(x, y, cellSize, cellSize);
          trackGrid.endFill();
        });
        
        // Draw center home triangle (4-colored)
        const centerSquare = new PIXI.Graphics();
        const centerStart = boardX + 6 * cellSize;
        const centerSize = 3 * cellSize;
        
        // Divide center into 4 triangles
        const centerX = centerStart + centerSize / 2;
        const centerY = boardY + 6 * cellSize + centerSize / 2;
        
        // Red triangle (top)
        centerSquare.beginFill(colors[0], 0.8);
        centerSquare.moveTo(centerX, boardY + 6 * cellSize);
        centerSquare.lineTo(centerStart, centerY);
        centerSquare.lineTo(centerStart + centerSize, centerY);
        centerSquare.closePath();
        centerSquare.endFill();
        
        // Green triangle (right)
        centerSquare.beginFill(colors[1], 0.8);
        centerSquare.moveTo(centerStart + centerSize, centerY);
        centerSquare.lineTo(centerX, boardY + 6 * cellSize);
        centerSquare.lineTo(centerX, boardY + 9 * cellSize);
        centerSquare.closePath();
        centerSquare.endFill();
        
        // Yellow triangle (bottom)
        centerSquare.beginFill(colors[2], 0.8);
        centerSquare.moveTo(centerX, boardY + 9 * cellSize);
        centerSquare.lineTo(centerStart, centerY);
        centerSquare.lineTo(centerStart + centerSize, centerY);
        centerSquare.closePath();
        centerSquare.endFill();
        
        // Blue triangle (left)
        centerSquare.beginFill(colors[3], 0.8);
        centerSquare.moveTo(centerStart, centerY);
        centerSquare.lineTo(centerX, boardY + 6 * cellSize);
        centerSquare.lineTo(centerX, boardY + 9 * cellSize);
        centerSquare.closePath();
        centerSquare.endFill();
        
        boardLayer.addChild(trackGrid);
        boardLayer.addChild(centerSquare);

        // Draw safe square markers (stars) with animation
        const starsContainer = new PIXI.Container();
        SAFE_SQUARES.forEach((idx, i) => {
          const trackPos = posFor.trackCoord(idx);
          if (!trackPos) return;
          
          // Create a container for each star (for individual animation)
          const starGroup = new PIXI.Container();
          starGroup.x = trackPos.x;
          starGroup.y = trackPos.y;
          
          // Draw glow circle (background layer)
          const glow = new PIXI.Graphics();
          glow.beginFill(STAR_CONFIG.glowColor, STAR_CONFIG.glowAlpha);
          glow.drawCircle(0, 0, STAR_CONFIG.radius + 6);
          glow.endFill();
          starGroup.addChild(glow);
          
          // Draw star icon
          const star = new PIXI.Graphics();
          const innerRadius = STAR_CONFIG.radius * 0.4;
          const outerRadius = STAR_CONFIG.radius;
          
          star.beginFill(STAR_CONFIG.color, STAR_CONFIG.alpha);
          star.lineStyle(2, 0xffffff, 0.8);
          
          for (let j = 0; j < STAR_CONFIG.spikes * 2; j++) {
            const angle = (j * Math.PI) / STAR_CONFIG.spikes - Math.PI / 2;
            const radius = j % 2 === 0 ? outerRadius : innerRadius;
            const x = radius * Math.cos(angle);
            const y = radius * Math.sin(angle);
            
            if (j === 0) {
              star.moveTo(x, y);
            } else {
              star.lineTo(x, y);
            }
          }
          star.closePath();
          star.endFill();
          starGroup.addChild(star);
          
          starsContainer.addChild(starGroup);
          
          // Animate star: subtle pulse effect with staggered start
          gsap.to(starGroup.scale, {
            x: 1.15,
            y: 1.15,
            duration: 1.2,
            ease: 'sine.inOut',
            repeat: -1,
            yoyo: true,
            delay: i * 0.15, // Stagger animation
          });
          
          // Animate glow: fade in/out
          gsap.to(glow, {
            alpha: 0.3,
            duration: 1.2,
            ease: 'sine.inOut',
            repeat: -1,
            yoyo: true,
            delay: i * 0.15,
          });
        });
        boardLayer.addChild(starsContainer);

        // Starting pads (four circles per quadrant)
        const pads = new PIXI.Graphics();
        function drawPads(qx, qy, color) {
          const padR = 14;
          const gap = 28;
          const ox = qx + quadW / 2 - gap / 2;
          const oy = qy + quadH / 2 - gap / 2;
          pads.beginFill(color, 0.9).drawCircle(ox - gap, oy - gap, padR).endFill();
          pads.beginFill(color, 0.9).drawCircle(ox + gap, oy - gap, padR).endFill();
          pads.beginFill(color, 0.9).drawCircle(ox - gap, oy + gap, padR).endFill();
          pads.beginFill(color, 0.9).drawCircle(ox + gap, oy + gap, padR).endFill();
        }
        drawPads(boardX, boardY, colors[0]); // red
        drawPads(boardX + quadW, boardY, colors[1]); // green
        drawPads(boardX, boardY + quadH, colors[2]); // yellow
        drawPads(boardX + quadW, boardY + quadH, colors[3]); // blue
        boardLayer.addChild(pads);

        spritesRef.current = {};
      } catch (_err) {
        // swallow init errors; React will re-run when fixed
      }
    })();

    return () => {
      cancelled = true;
      (async () => { try { await app.destroy(); } catch (_) {} appRef.current = null; })();
    };
  }, [size]);

  useEffect(() => {
    const app = appRef.current;
    if (!app || !tokenLayerRef.current) return;

    const tokens = [];
    (game?.players || []).forEach((p, pIdx) => {
      (p.tokens || []).forEach((t) => tokens.push({ pIdx, t }));
    });

    const colorNameFor = (idx) => (['red', 'yellow', 'blue', 'green'][idx % 4]);

    // Create/update sprites; animate movements
    tokens.forEach(({ pIdx, t }) => {
      const key = `${pIdx}-${t.tokenIndex}`;
      const isMyTurn = turnIndex === pIdx;
      const isLegal = isMyTurn && legalTokens.includes(t.tokenIndex);
      const baseColor = colorFor(pIdx);

      // Resolve target position
      let pos;
      try {
        const colorName = colorNameFor(pIdx);
        const src = getPawnPosition(colorName, t.state, typeof t.stepsFromStart === 'number' ? t.stepsFromStart : t.tokenIndex);
        pos = scalePosition(src, size);
      } catch (_e) {
        // Fallback to procedural mapping
        if (t.state === 'base') pos = posFor.baseCoord(pIdx, t.tokenIndex);
        else if (t.state === 'track') pos = posFor.trackCoord(t.stepsFromStart);
        else if (t.state === 'homeStretch') pos = posFor.homeStretchCoord(pIdx, t.stepsFromStart);
        else pos = posFor.center;
      }

      let sprite = spritesRef.current[key];
      if (!sprite) {
        // Try token texture, else draw vector circle
        let tex = null;
        const { redPng, greenPng, yellowPng, bluePng, redSvg, greenSvg, yellowSvg, blueSvg } = texturesRef.current;
        const cand = [[redPng, redSvg], [greenPng, greenSvg], [yellowPng, yellowSvg], [bluePng, blueSvg]][pIdx % 4];
        tex = (cand[0]?.baseTexture?.valid ? cand[0] : cand[1]);
        if (tex && tex.baseTexture && tex.baseTexture.valid) {
          sprite = new PIXI.Sprite(tex);
          sprite.anchor.set(0.5);
          sprite.width = 28; sprite.height = 28;
        } else {
          const g = new PIXI.Graphics();
          g.beginFill(baseColor, 0.95); g.lineStyle(3, 0xffffff, 0.6); g.drawCircle(0, 0, 12); g.endFill();
          sprite = g;
        }
        spritesRef.current[key] = sprite;
        tokenLayerRef.current.addChild(sprite);
        sprite.x = pos.x; sprite.y = pos.y; sprite.alpha = 0.95;
        // Initialize prev state
        prevRef.current.set(key, { state: t.state, stepsFromStart: t.stepsFromStart });
      } else {
        // Animate to new position if changed
        if (Math.hypot(sprite.x - pos.x, sprite.y - pos.y) > 1) {
          const tl = gsap.timeline();
          tl.to(sprite, { duration: 0.35, x: pos.x, y: pos.y, ease: 'power2.out' });
          // Subtle move bounce
          tl.fromTo(sprite.scale, { x: 0.95, y: 0.95 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(2)' }, '<');
          
          const prev = prevRef.current.get(key);
          
          // Home landing pulse if arriving to home
          if (prev && t.state === 'home' && prev.state !== 'home') {
            tl.to(sprite.scale, { x: 1.12, y: 1.12, duration: 0.12, ease: 'power1.out' })
              .to(sprite.scale, { x: 1, y: 1, duration: 0.18, ease: 'back.out(3)' });
          }
          
          // Safe square landing effect (golden glow)
          if (t.state === 'track' && SAFE_SQUARES.includes(t.stepsFromStart)) {
            const prevWasNotSafe = !prev || prev.state !== 'track' || !SAFE_SQUARES.includes(prev.stepsFromStart);
            if (prevWasNotSafe) {
              console.log(`[Board] Token P${pIdx}-T${t.tokenIndex} landed on SAFE square ${t.stepsFromStart} ⭐`);
              // Create temporary glow effect
              const glowCircle = new PIXI.Graphics();
              glowCircle.beginFill(0xffd700, 0.4);
              glowCircle.drawCircle(pos.x, pos.y, 20);
              glowCircle.endFill();
              tokenLayerRef.current.addChild(glowCircle);
              
              gsap.to(glowCircle, { 
                alpha: 0, 
                duration: 0.6, 
                ease: 'power2.out',
                onComplete: () => {
                  tokenLayerRef.current.removeChild(glowCircle);
                  glowCircle.destroy();
                }
              });
              gsap.to(glowCircle.scale, { 
                x: 1.5, 
                y: 1.5, 
                duration: 0.6, 
                ease: 'power2.out'
              });
            }
          }
          
          // Update prev after movement
          tl.add(() => prevRef.current.set(key, { state: t.state, stepsFromStart: t.stepsFromStart }));
        }
      }

      // Interactivity state
      sprite.interactive = !!isLegal;
      sprite.cursor = isLegal ? 'pointer' : 'default';
      if (isLegal && onTokenClick && !sprite.__bindClick) {
        sprite.__bindClick = true;
        sprite.on('pointertap', () => onTokenClick(t.tokenIndex));
      }

      // Active turn halo
      if (!sprite.__halo) {
        const halo = new PIXI.Graphics();
        halo.lineStyle(2, baseColor, 0.5); halo.drawCircle(0, 0, 18);
        halo.visible = turnIndex === pIdx;
        sprite.addChild(halo);
        sprite.__halo = halo;
      } else {
        sprite.__halo.visible = turnIndex === pIdx;
      }

      // Legal token highlight ring
      if (!sprite.__legalRing) {
        const ring = new PIXI.Graphics();
        ring.lineStyle(2, 0xffffff, 0.9); ring.drawCircle(0, 0, 20);
        ring.visible = isLegal;
        sprite.addChild(ring);
        sprite.__legalRing = ring;
      } else {
        sprite.__legalRing.visible = isLegal;
      }
    });

    // Capture bounce for tokens sent back to base (state transition: !base -> base)
    Object.entries(spritesRef.current).forEach(([key, s]) => {
      const [pIdxStr, tokStr] = key.split('-');
      const pIdx = Number(pIdxStr), tokenIndex = Number(tokStr);
      const player = (game?.players || [])[pIdx];
      const t = player?.tokens?.find((tt) => Number(tt.tokenIndex) === tokenIndex);
      if (!t) return;
      const prev = prevRef.current.get(key);
      if (prev && prev.state !== 'base' && t.state === 'base') {
        const tl = gsap.timeline();
        tl.to(s.scale, { x: 1.2, y: 1.2, duration: 0.1, ease: 'power1.out' })
          .to(s, { y: '+=-6', duration: 0.08, ease: 'power1.out' }, '<')
          .to(s, { y: '+=6', duration: 0.14, ease: 'bounce.out' })
          .to(s.scale, { x: 1, y: 1, duration: 0.18, ease: 'back.out(2)' });
        prevRef.current.set(key, { state: t.state, stepsFromStart: t.stepsFromStart });
      }
    });

    // Cleanup sprites that no longer exist in state
    const existingKeys = new Set(tokens.map(({ pIdx, t }) => `${pIdx}-${t.tokenIndex}`));
    Object.entries(spritesRef.current).forEach(([key, s]) => {
      if (!existingKeys.has(key)) {
        s.destroy();
        delete spritesRef.current[key];
        prevRef.current.delete(key);
      }
    });
  }, [game, turnIndex, legalTokens, posFor, onTokenClick]);

  // Responsive scaling to fit container width
  useEffect(() => {
    const app = appRef.current;
    if (!app || !containerRef.current) return;
    const el = containerRef.current;
    function resize() {
      const w = Math.max(320, Math.min(el.clientWidth || size, 1024));
      const scale = w / size;
      app.stage.scale.set(scale);
      app.canvas.style.width = `${w}px`;
      app.canvas.style.height = `${w}px`;
    }
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [size]);

  return (
    <div className="w-full flex items-center justify-center">
      <div ref={containerRef} style={{ width: size, height: size }} />
    </div>
  );
}
