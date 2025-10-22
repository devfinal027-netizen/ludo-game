import gsap from 'gsap';

export function animateToken(element, toX, toY) {
  gsap.to(element, { x: toX, y: toY, duration: 0.4, ease: 'power2.out' });
}

export default function BoardRenderer() {
  return null;
}
