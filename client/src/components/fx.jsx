import { useEffect, useRef, useSyncExternalStore } from 'react';
import { motion, useReducedMotion, useSpring } from 'motion/react';

/**
 * Shared motion + motivation building blocks (rules: .claude/skills/level-up-design).
 * Everything animates transform/opacity only and respects "reduce motion"
 * (the app is wrapped in <MotionConfig reducedMotion="user">; effects below also check useReducedMotion()).
 */

const TILT_SPRING = { stiffness: 300, damping: 20 };
export const ENTER_SPRING = { type: 'spring', stiffness: 260, damping: 24 };
const STAGGER_STEP = 0.05;
const STAGGER_MAX = 12; // after 12 items, the rest appear together

function useMedia(query) {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(query); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
const tag = (as) => motion[as] || motion.div;

/** 3D hover tilt (max 8° per axis) with a glare that follows the pointer. Mouse/trackpad only; off with reduce motion. */
export function TiltCard({ as = 'div', max = 8, className = '', style, children, ...rest }) {
  const reduce = useReducedMotion();
  const fine = useMedia('(hover: hover) and (pointer: fine)');
  const enabled = fine && !reduce;
  const ref = useRef(null);
  const rotateX = useSpring(0, TILT_SPRING);
  const rotateY = useSpring(0, TILT_SPRING);
  const Comp = tag(as);

  function onPointerMove(e) {
    if (!enabled || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    rotateY.set((px - 0.5) * 2 * max);
    rotateX.set(-(py - 0.5) * 2 * max);
    ref.current.style.setProperty('--gx', `${px * 100}%`);
    ref.current.style.setProperty('--gy', `${py * 100}%`);
  }
  function onPointerLeave() { rotateX.set(0); rotateY.set(0); }

  return (
    <Comp
      ref={ref}
      className={`tilt ${className}`}
      style={enabled ? { ...style, rotateX, rotateY, transformPerspective: 900 } : style}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      {...rest}
    >
      {children}
      {enabled && <span className="tilt-glare" aria-hidden="true" />}
    </Comp>
  );
}

/** Animated conic-gradient border: use on the ONE current/active item only (next lesson, active level). */
export function GlowBorder({ as = 'div', active = true, className = '', children, ...rest }) {
  const Comp = as;
  return <Comp className={`${active ? 'glow-active ' : ''}${className}`} {...rest}>{children}</Comp>;
}

/** Staggered spring entrance: wrap a list in <Stagger>, give each child <StaggerItem index={i}>. */
export function Stagger({ as = 'div', children, ...rest }) {
  const Comp = tag(as);
  // data-reveal="off": the app-wide auto reveal (motion.jsx) leaves these items to their own stagger
  return <Comp initial="hidden" animate="show" data-reveal="off" {...rest}>{children}</Comp>;
}
// design-to-motion `up` kind: 10px rise + 4px blur to sharp, eased (no bounce)
const itemVariants = {
  hidden: { opacity: 0, y: 10, filter: 'blur(4px)' },
  show: (i = 0) => ({ opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: Math.min(i, STAGGER_MAX) * STAGGER_STEP } }),
};
export function StaggerItem({ as = 'div', index = 0, children, ...rest }) {
  const Comp = tag(as);
  return <Comp variants={itemVariants} custom={index} {...rest}>{children}</Comp>;
}

/** Encouraging empty state: never a bare zero. One friendly line and (ideally) one action. */
export function EmptyState({ icon = '✨', title, children, action }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon" aria-hidden="true">{icon}</div>
      {title && <div className="empty-state-title">{title}</div>}
      {children && <div className="empty-state-text">{children}</div>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}

/** Lock chip with the reason ("Finish Level 3 to unlock"). Pair with the .is-locked class on the dimmed item. */
export function LockBadge({ reason }) {
  return (
    <span className="lock-badge">
      <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
      {reason}
    </span>
  );
}

/**
 * Floating "+XP" that rises and fades (~0.9 s) from where it's rendered (inside a position: relative parent).
 * With reduce motion it's a static toast for 2 s instead. Calls onDone when finished.
 */
export function XpFloat({ amount, onDone }) {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!reduce) return undefined;
    const t = setTimeout(() => onDone?.(), 2000);
    return () => clearTimeout(t);
  }, [reduce, onDone]);
  if (reduce) return <span className="xp-toast" role="status">+{amount} XP</span>;
  return (
    <motion.span
      className="xp-float"
      role="status"
      initial={{ opacity: 0, y: 0, x: '-50%', scale: 0.9 }}
      animate={{ opacity: [0, 1, 1, 0], y: -36, scale: 1 }}
      transition={{ duration: 0.9, ease: 'easeOut' }}
      onAnimationComplete={() => onDone?.()}
    >
      +{amount} XP
    </motion.span>
  );
}
