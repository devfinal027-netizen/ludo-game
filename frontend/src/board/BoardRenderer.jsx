import gsap from 'gsap';
import { useEffect, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';
import { positionForIndex } from './layout';

export function animateToken(element, toX, toY) {
  gsap.to(element, { x: toX, y: toY, duration: 0.4, ease: 'power2.out' });
}

export default function BoardRenderer() {
  const game = useSelector((s) => s.game.game);
  const containerRef = useRef(null);
  const tokensRef = useRef({});

  const flatTokens = useMemo(() => {
    const arr = [];
    (game?.players || []).forEach((p, pi) => {
      (p.tokens || []).forEach((t, ti) => {
        arr.push({ playerIndex: pi, tokenIndex: ti, position: t.position });
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
      animateToken(el, x, y);
    });
  }, [flatTokens]);

  return (
    <div ref={containerRef} className="relative w-[480px] h-[480px] bg-green-100 rounded">
      {flatTokens.map(({ playerIndex, tokenIndex }) => {
        const key = `${playerIndex}-${tokenIndex}`;
        return (
          <div
            key={key}
            ref={(el) => {
              if (el) tokensRef.current[key] = el;
            }}
            className="absolute w-6 h-6 rounded-full bg-blue-500"
            style={{ transform: 'translate(0px, 0px)' }}
          />
        );
      })}
    </div>
  );
}
