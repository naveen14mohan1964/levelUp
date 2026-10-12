import confetti from 'canvas-confetti';

// Confetti for real completions only (never on page load). canvas-confetti skips itself when "reduce motion" is on.
const COLORS = ['#8B5CF6', '#22D3EE', '#34D399', '#FBBF24'];

function originOf(el) {
  const r = el?.getBoundingClientRect?.();
  if (!r) return { x: 0.5, y: 0.6 };
  return { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight };
}

/** A small burst from an element (e.g. the "Done" button you just pressed). */
export function burst(el) {
  return confetti({ particleCount: 80, spread: 70, startVelocity: 38, origin: originOf(el), colors: COLORS, disableForReducedMotion: true, zIndex: 1000 });
}

/** The big one for "LEVEL COMPLETE": two side cannons. */
export function levelUpConfetti() {
  const base = { particleCount: 120, spread: 80, startVelocity: 55, colors: COLORS, disableForReducedMotion: true, zIndex: 1000 };
  return Promise.all([
    confetti({ ...base, angle: 60, origin: { x: 0, y: 0.75 } }),
    confetti({ ...base, angle: 120, origin: { x: 1, y: 0.75 } }),
  ]);
}
