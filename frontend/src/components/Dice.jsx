import { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';

const diceFaces = [
  '/dice/dice-1.svg',
  '/dice/dice-2.svg',
  '/dice/dice-3.svg',
  '/dice/dice-4.svg',
  '/dice/dice-5.svg',
  '/dice/dice-6.svg',
];

export default function Dice({ onRoll, rolling = false, disabled = false, face, glow = false }) {
  const [value, setValue] = useState(1);
  const diceRef = useRef(null);
  const timelineRef = useRef(null);

  const shownValue = useMemo(() => {
    if (typeof face === 'number' && face >= 1 && face <= 6) return face;
    return value;
  }, [face, value]);

  function startAnimation() {
    if (!diceRef.current) return;
    if (timelineRef.current) timelineRef.current.kill();
    const tl = gsap.timeline();
    // quick shuffle effect
    const shuffle = () => setValue((prev) => ((prev % 6) + 1));
    tl.to(diceRef.current, { rotation: '+=360', scale: 1.15, duration: 0.35, ease: 'power2.in' })
      .add(() => shuffle())
      .to(diceRef.current, { rotation: '+=360', scale: 1, duration: 0.45, ease: 'power2.out' })
      .add(() => shuffle())
      .to(diceRef.current, { y: -10, duration: 0.15, ease: 'power1.out' })
      .to(diceRef.current, { y: 0, duration: 0.2, ease: 'bounce.out' });
    timelineRef.current = tl;
  }

  useEffect(() => {
    if (rolling) startAnimation();
  }, [rolling]);

  useEffect(() => {
    if (typeof face === 'number' && face >= 1 && face <= 6) {
      setValue(face);
    }
  }, [face]);

  const handleClick = () => {
    if (disabled || rolling) return;
    startAnimation();
    onRoll && onRoll();
  };

  return (
    <div className="flex flex-col items-center gap-3 select-none">
      <div
        ref={diceRef}
        onClick={handleClick}
        className={[
          'w-20 h-20 rounded-2xl shadow-lg bg-gradient-to-br from-yellow-400 to-orange-500 cursor-pointer transition-all',
          disabled || rolling ? 'opacity-40 cursor-not-allowed' : 'hover:shadow-yellow-300/60',
          glow && !disabled && !rolling ? 'dice-active' : '',
        ].join(' ')}
      >
        <img src={diceFaces[shownValue - 1]} alt={`Dice ${shownValue}`} className="w-full h-full p-2" />
      </div>
      <button
        disabled={disabled || rolling}
        onClick={handleClick}
        className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition disabled:opacity-50"
      >
        Roll Dice 🎲
      </button>
    </div>
  );
}
