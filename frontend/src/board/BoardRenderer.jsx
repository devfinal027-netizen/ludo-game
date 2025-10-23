import gsap from 'gsap';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { positionForToken, positionForIndex } from './layout';
import PlayerAvatar from '../components/PlayerAvatar.jsx';
// positionForIndex already imported above

export function animateToken(element, toX, toY) {
  gsap.to(element, { x: toX, y: toY, duration: 0.4, ease: 'power2.out' });
}

export default function BoardRenderer({ legalTokens = [], onTokenClick }) {
  const game = useSelector((s) => s.game.game);
  const turnIndex = useSelector((s) => s.game.turnIndex);
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const tokensRef = useRef({});
  const prevPosRef = useRef({}); // key -> { state, stepsFromStart, color, tokenIndex }
  const timelinesRef = useRef({}); // key -> GSAP timeline
  const posIndexCacheRef = useRef(new Map()); // index -> {x,y}
  const [scale, setScale] = useState(1);
  const reduceMotion = useMemo(() => {
    try {
      const lm = localStorage.getItem('reduceMotion');
      if (lm === 'true') return true;
    } catch {}
    return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const flatTokens = useMemo(() => {
    const arr = [];
    (game?.players || []).forEach((p, pi) => {
      (p.tokens || []).forEach((t, ti) => {
        arr.push({
          playerIndex: pi,
          tokenIndex: ti,
          token: { state: t.state, stepsFromStart: t.stepsFromStart, color: p.color, tokenIndex: ti },
          color: p.color,
        });
      });
    });
    return arr;
  }, [game]);

  // Responsive scale: keep a 480x480 stage, scale to container width
  useEffect(() => {
    function handleResize() {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth || 480;
      const s = Math.max(0.5, Math.min(1.5, w / 480));
      setScale(s);
    }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    flatTokens.forEach(({ playerIndex, tokenIndex, token }) => {
      const key = `${playerIndex}-${tokenIndex}`;
      const el = tokensRef.current[key];
      if (!el) return;
      const prev = prevPosRef.current[key];
      const target = token;

      // Helper: animate path through intermediate indices on track
      const animatePath = (indices) => {
        // Kill any existing tweens/timelines to avoid overlaps
        gsap.killTweensOf(el);
        const prevTl = timelinesRef.current[key];
        if (prevTl) prevTl.kill();

        if (reduceMotion || !indices || indices.length === 0) {
          const { x, y } = positionForToken(target);
          const tl = gsap.timeline({ onStart: () => (el.style.zIndex = 30), onComplete: () => (el.style.zIndex = '') });
          tl.to(el, { x, y, duration: 0.3, ease: 'power2.out' });
          timelinesRef.current[key] = tl;
          return;
        }
        const tl = gsap.timeline({ onStart: () => (el.style.zIndex = 30), onComplete: () => (el.style.zIndex = '') });
        indices.forEach((idx, i) => {
          let cached = posIndexCacheRef.current.get(idx);
          if (!cached) {
            cached = positionForIndex(idx);
            posIndexCacheRef.current.set(idx, cached);
          }
          const { x, y } = cached;
          tl.to(el, { x, y, duration: 0.12, ease: 'power1.out' }, i === 0 ? 0 : '+=0');
        });
        tl.to(el, { duration: 0.08, y: '+=-4', ease: 'power1.out' }).to(el, { duration: 0.12, y: '+=4', ease: 'bounce.out' });
        timelinesRef.current[key] = tl;
      };

      if (prev && prev.state === 'track' && target.state === 'track') {
        const start = prev.stepsFromStart;
        const end = target.stepsFromStart;
        if (typeof start === 'number' && typeof end === 'number' && end >= start) {
          const indices = [];
          for (let i = start + 1; i <= end; i++) indices.push(i);
          animatePath(indices);
        } else if (typeof start === 'number' && typeof end === 'number' && end < start && end >= 0) {
          // Handle wrap-around by animating through the ring end then to end
          const indices = [];
          for (let i = start + 1; i <= 52; i++) indices.push(i % 52);
          for (let i = 0; i <= end; i++) indices.push(i);
          animatePath(indices);
        } else {
          const { x, y } = positionForToken(target);
          gsap.killTweensOf(el);
          const tl = gsap.timeline({ onStart: () => (el.style.zIndex = 30), onComplete: () => (el.style.zIndex = '') });
          tl.to(el, { x, y, duration: 0.3, ease: 'power2.out' });
          timelinesRef.current[key] = tl;
        }
      } else {
        // Generic move (base->track, track->homeStretch, homeStretch advance, into home)
        const { x, y } = positionForToken(target);
        gsap.killTweensOf(el);
        const tl = gsap.timeline({ onStart: () => (el.style.zIndex = 30), onComplete: () => (el.style.zIndex = '') });
        tl.to(el, { x, y, duration: 0.3, ease: 'power2.out' });
        timelinesRef.current[key] = tl;
      }

      prevPosRef.current[key] = { ...target };
    });
  }, [flatTokens, reduceMotion]);

  return (
    <div ref={containerRef} className="relative w-full max-w-[600px] aspect-square rounded overflow-hidden glass">
      <div ref={stageRef} className="absolute top-0 left-0" style={{ width: 480, height: 480, transformOrigin: 'top left', transform: `scale(${scale})` }}>
      {/* Quadrants (bases) */}
      <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
        <div className="border border-white/10" style={{ background: 'linear-gradient(145deg, rgba(239,68,68,0.18), rgba(239,68,68,0.05))' }} />
        <div className="border border-white/10" style={{ background: 'linear-gradient(145deg, rgba(250,204,21,0.18), rgba(250,204,21,0.05))' }} />
        <div className="border border-white/10" style={{ background: 'linear-gradient(145deg, rgba(34,197,94,0.18), rgba(34,197,94,0.05))' }} />
        <div className="border border-white/10" style={{ background: 'linear-gradient(145deg, rgba(59,130,246,0.18), rgba(59,130,246,0.05))' }} />
      </div>
      {/* Base peg holes (2x2 per quadrant) */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 480 480">
        {[
          // red (top-left)
          [96, 96], [160, 96], [96, 160], [160, 160],
          // yellow (top-right)
          [320, 96], [384, 96], [320, 160], [384, 160],
          // green (bottom-left)
          [96, 320], [160, 320], [96, 384], [160, 384],
          // blue (bottom-right)
          [320, 320], [384, 320], [320, 384], [384, 384],
        ].map(([cx, cy], i) => (
          <g key={i}>
            <circle cx={cx} cy={cy} r={20} fill="rgba(255,255,255,0.35)" stroke="rgba(0,0,0,0.25)" strokeWidth="2" />
            <circle cx={cx} cy={cy} r={10} fill="rgba(255,255,255,0.9)" />
          </g>
        ))}
      </svg>
      {/* Classic home lanes toward center (approximate) */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 480 480">
        {/* Up lane (red) */}
        <rect x="224" y="48" width="32" height="176" fill="rgba(239,68,68,0.45)" />
        {/* Right lane (yellow) */}
        <rect x="256" y="224" width="176" height="32" fill="rgba(250,204,21,0.45)" />
        {/* Down lane (blue) */}
        <rect x="224" y="256" width="32" height="176" fill="rgba(59,130,246,0.45)" />
        {/* Left lane (green) */}
        <rect x="48" y="224" width="176" height="32" fill="rgba(34,197,94,0.45)" />
      </svg>
      {/* Classic center star */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 480 480">
        <polygon points="240,200 280,240 240,280 200,240" fill="rgba(255,255,255,0.5)" />
        <polygon points="240,180 300,240 240,300 180,240" fill="rgba(255,255,255,0.12)" />
      </svg>
      {/* Grid backdrop (light) */}
      <svg className="absolute inset-0 w-full h-full opacity-20" viewBox="0 0 480 480">
        {Array.from({ length: 15 }).map((_, i) => (
          <line key={`v-${i}`} x1={i * 32} y1={0} x2={i * 32} y2={480} stroke="#000" strokeWidth="0.5" />
        ))}
        {Array.from({ length: 15 }).map((_, i) => (
          <line key={`h-${i}`} x1={0} y1={i * 32} x2={480} y2={i * 32} stroke="#000" strokeWidth="0.5" />
        ))}
      </svg>
      {/* Safe squares markers (stars) per backend indices */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 480 480">
        {([0, 8, 13, 21, 26, 34, 39, 47]).map((idx) => {
          const { x, y } = positionForIndex(idx);
          const cx = x; const cy = y;
          const r = 8;
          const star = [
            [0, -r], [2.5, -2.5], [r, -2.2], [4, 1.5], [6, r], [0, 5], [-6, r], [-4, 1.5], [-r, -2.2], [-2.5, -2.5],
          ];
          const points = star.map(([dx, dy]) => `${cx + dx},${cy + dy}`).join(' ');
          return <polyline key={idx} points={points} fill="rgba(255,255,255,0.9)" stroke="rgba(0,0,0,0.35)" strokeWidth="1" />
        })}
      </svg>
      {flatTokens.map(({ playerIndex, tokenIndex, color, token }) => {
        const key = `${playerIndex}-${tokenIndex}`;
        const isLegal = Array.isArray(legalTokens) && legalTokens.includes(tokenIndex);
        return (
          <div
            key={key}
            ref={(el) => {
              if (el) tokensRef.current[key] = el;
            }}
            onClick={isLegal && typeof onTokenClick === 'function' ? () => onTokenClick(tokenIndex) : undefined}
            onKeyDown={(e) => {
              if (!isLegal || typeof onTokenClick !== 'function') return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onTokenClick(tokenIndex);
              }
            }}
            role={isLegal ? 'button' : 'img'}
            aria-label={`Token ${tokenIndex + 1} ${isLegal ? 'selectable' : 'non-selectable'}`}
            tabIndex={isLegal ? 0 : -1}
            className={`absolute w-6 h-6 rounded-full shadow ${playerIndex === turnIndex ? 'ring-2 ring-amber-300' : ''} ${isLegal ? 'cursor-pointer outline outline-2 outline-amber-300 animate-pulse' : ''}`}
            style={{
              background: `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.85), ${color || '#3b82f6'} 60%)`,
              border: '2px solid rgba(255,255,255,0.9)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.35) inset, 0 4px 12px rgba(0,0,0,0.25)',
              transform: 'translate(0px, 0px)',
              zIndex: playerIndex === turnIndex ? 10 : 5,
            }}
          />
        );
      })}
      {/* Avatars at corners */}
      {(game?.players || []).slice(0, 4).map((p, idx) => (
        <PlayerAvatar key={String(p.userId)} name={p.name || p.userId?.slice(-4)} color={p.color} position={['top-left','top-right','bottom-left','bottom-right'][idx]} />
      ))}
      </div>
    </div>
  );
}
