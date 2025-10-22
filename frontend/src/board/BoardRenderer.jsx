import gsap from 'gsap';
import { useEffect, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';
import { positionForIndex } from './layout';
import PlayerAvatar from '../components/PlayerAvatar.jsx';

export function animateToken(element, toX, toY) {
  gsap.to(element, { x: toX, y: toY, duration: 0.4, ease: 'power2.out' });
}

export default function BoardRenderer() {
  const game = useSelector((s) => s.game.game);
  const turnIndex = useSelector((s) => s.game.turnIndex);
  const containerRef = useRef(null);
  const tokensRef = useRef({});

  const flatTokens = useMemo(() => {
    const arr = [];
    (game?.players || []).forEach((p, pi) => {
      (p.tokens || []).forEach((t, ti) => {
        arr.push({ playerIndex: pi, tokenIndex: ti, position: t.position, color: p.color });
      });
    });
    return arr;
  }, [game]);

  useEffect(() => {
    flatTokens.forEach(({ playerIndex, tokenIndex, position }) => {
      const key = `${playerIndex}-${tokenIndex}`;
      const el = tokensRef.current[key];
      if (!el) return;
      const { x, y } = positionForIndex(position);
      gsap.to(el, { x, y, duration: 0.5, ease: 'power2.out', yoyo: false, onStart: () => {
        el.style.filter = 'drop-shadow(0 6px 6px rgba(0,0,0,.3))';
      }, onComplete: () => {
        el.style.filter = 'drop-shadow(0 4px 4px rgba(0,0,0,.25))';
      }});
    });
  }, [flatTokens]);

  return (
    <div ref={containerRef} className="relative w-[480px] h-[480px] rounded overflow-hidden glass">
      {/* Quadrants */}
      <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
        <div className="border border-white/10" style={{ background: 'linear-gradient(145deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05))' }} />
        <div className="border border-white/10" style={{ background: 'linear-gradient(145deg, rgba(250,204,21,0.15), rgba(250,204,21,0.05))' }} />
        <div className="border border-white/10" style={{ background: 'linear-gradient(145deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05))' }} />
        <div className="border border-white/10" style={{ background: 'linear-gradient(145deg, rgba(59,130,246,0.15), rgba(59,130,246,0.05))' }} />
      </div>
      {/* Center star/triangle blend */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 480 480">
        <polygon points="240,140 280,240 200,240" fill="rgba(255,255,255,0.12)" />
        <polygon points="240,340 280,240 200,240" fill="rgba(255,255,255,0.12)" />
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
      {flatTokens.map(({ playerIndex, tokenIndex, color }) => {
        const key = `${playerIndex}-${tokenIndex}`;
        return (
          <div
            key={key}
            ref={(el) => {
              if (el) tokensRef.current[key] = el;
            }}
            className={`absolute w-6 h-6 rounded-full shadow ${playerIndex === turnIndex ? 'ring-2 ring-black' : ''}`}
            style={{ backgroundColor: color || '#3b82f6', transform: 'translate(0px, 0px)' }}
          />
        );
      })}
      {/* Avatars at corners */}
      {(game?.players || []).slice(0, 4).map((p, idx) => (
        <PlayerAvatar key={String(p.userId)} name={p.name || p.userId?.slice(-4)} color={p.color} position={['top-left','top-right','bottom-left','bottom-right'][idx]} />
      ))}
    </div>
  );
}
