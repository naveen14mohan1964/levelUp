// Tiny 2-D stick-figure rig for exercise demos (side view, facing right, SVG units: 200 × 150, floor at y = 140).
// A pose pins the hip, the torso angle and where the hands and feet are; elbows and knees are solved with 2-bone IK,
// so a hand placed on a wall stays exactly on the wall while the body moves.

export const LEN = { torso: 46, neck: 6, head: 8, upperArm: 25, forearm: 23, thigh: 36, shin: 36, foot: 10 };
export const FLOOR = 140;

const rad = (d) => (d * Math.PI) / 180;
const add = ([x, y], len, deg) => [x + len * Math.cos(rad(deg)), y + len * Math.sin(rad(deg))];

/**
 * 2-bone IK: joint between `root` and `target`. `bend` picks the side: 'forward' (+x, knees), 'back' (−x, elbows),
 * 'up' or 'down'. If the target is out of reach the limb points straight at it.
 */
const PICK = {
  forward: (p, q) => p[0] >= q[0],
  back: (p, q) => p[0] <= q[0],
  up: (p, q) => p[1] <= q[1],
  down: (p, q) => p[1] >= q[1],
};

function solve(root, target, l1, l2, bend) {
  const dx = target[0] - root[0];
  const dy = target[1] - root[1];
  const dist = Math.hypot(dx, dy);
  const base = Math.atan2(dy, dx);
  if (dist >= l1 + l2) {
    // Out of reach: the limb points straight at the target.
    return { joint: add(root, l1, (base * 180) / Math.PI), end: add(root, l1 + l2, (base * 180) / Math.PI) };
  }
  const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist))));
  const j1 = [root[0] + l1 * Math.cos(base + a), root[1] + l1 * Math.sin(base + a)];
  const j2 = [root[0] + l1 * Math.cos(base - a), root[1] + l1 * Math.sin(base - a)];
  return { joint: (PICK[bend] || PICK.forward)(j1, j2) ? j1 : j2, end: target };
}

/**
 * pose: { hip:[x,y], torso: deg (−90 = upright), head?: extra tilt deg,
 *         hand: [x,y], hand2: [x,y], foot: [x,y], foot2: [x,y]   (near = dark, far = light)
 *         toe?: deg, toe2?: deg  (foot direction; 0 = toes forward)
 *         elbow?, elbow2?, knee?, knee2?: bend side ('back' / 'forward' / 'up' / 'down') }
 * returns joint positions for drawing.
 */
export function rig(pose) {
  // `lean` (deg) = a rigid plank pivoting on the feet: the hip sits on the straight line from the ankle, so the body
  // stays straight in every in-between frame (wall push-ups, planks). Otherwise the hip is pinned directly.
  const hip = pose.lean != null ? add(pose.foot, LEN.thigh + LEN.shin - 0.01, pose.lean) : pose.hip;
  if (pose.lean != null && pose.torso == null) pose = { ...pose, torso: pose.lean };
  const shoulder = add(hip, LEN.torso, pose.torso);
  const neck = add(shoulder, LEN.neck, pose.torso + (pose.head || 0));
  const head = add(neck, LEN.head, pose.torso + (pose.head || 0));
  const arm = (hand, bend) => solve(shoulder, hand, LEN.upperArm, LEN.forearm, bend || 'back');
  const leg = (ankle, bend) => solve(hip, ankle, LEN.thigh, LEN.shin, bend || 'forward');
  const a1 = arm(pose.hand, pose.elbow);
  const a2 = arm(pose.hand2 || pose.hand, pose.elbow2 || pose.elbow);
  const l1 = leg(pose.foot, pose.knee);
  const l2 = leg(pose.foot2 || pose.foot, pose.knee2 || pose.knee);
  return {
    hip, shoulder, neck, head,
    near: { elbow: a1.joint, hand: a1.end, knee: l1.joint, ankle: l1.end, toe: add(l1.end, LEN.foot, pose.toe ?? 0) },
    far: { elbow: a2.joint, hand: a2.end, knee: l2.joint, ankle: l2.end, toe: add(l2.end, LEN.foot, pose.toe2 ?? pose.toe ?? 0) },
  };
}

const lerp = (a, b, t) => a + (b - a) * t;
const lerpPt = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

/** Blends two poses (numbers and [x,y] points); bend sides switch at the midpoint. */
export function blend(a, b, t) {
  const out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const va = a[k] ?? b[k];
    const vb = b[k] ?? a[k];
    if (Array.isArray(va)) out[k] = lerpPt(va, vb, t);
    else if (typeof va === 'number') out[k] = lerp(va, vb, t);
    else out[k] = t < 0.5 ? va : vb;
  }
  return out;
}

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * The pose at time `ms` in a looping move: frames = [{ pose, hold (ms), move (ms to the next frame) }].
 */
export function poseAt(frames, ms) {
  const total = frames.reduce((s, f) => s + (f.hold || 0) + (f.move || 600), 0);
  let t = ms % total;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const next = frames[(i + 1) % frames.length];
    if (t < (f.hold || 0)) return f.pose;
    t -= f.hold || 0;
    const move = f.move || 600;
    if (t < move) return blend(f.pose, next.pose, ease(t / move));
    t -= move;
  }
  return frames[0].pose;
}
