// Camera focus guard: pure rules (no camera, no React), unit-tested in server/test/focus-rules.test.js.
//   headPose()   yaw/pitch in degrees from MediaPipe's facial transformation matrix
//   classify()   one frame's signals → focused | away | looking-away | phone | eyes-closed
//   step()       those frames over time → status, distracted time and the escalation level (0 none · 1 chime · 2 alarm)

export const RULES = {
  calibrateMs: 2000, // your posture in the first ~2 s of a visible face = "focused" (adapts to any camera angle)
  yawDeg: 25, // turned left/right this far from your calibrated pose = looking away
  pitchDeg: 22, // looked up/down this far (ignored in "reading notes" mode)
  graceMs: 3000, // glances shorter than this never count
  drowsyMs: 3000, // eyes closed this long = drowsy
  chimeAfterMs: 15_000,
  alarmAfterMs: 45_000,
  eyesClosedScore: 0.55,
  phoneScore: 0.5,
};

/** Yaw (left/right) and pitch (up/down) in degrees from a 4×4 column-major transformation matrix. */
export function headPose(m) {
  if (!m || m.length < 16) return null;
  const r20 = m[2]; const r21 = m[6]; const r22 = m[10];
  const yaw = (Math.asin(Math.max(-1, Math.min(1, -r20))) * 180) / Math.PI;
  const pitch = (Math.atan2(r21, r22) * 180) / Math.PI;
  return { yaw, pitch };
}

/**
 * One frame. Signals: { face: bool, yaw, pitch, eyesClosed: bool, phone: bool }; baseline = calibrated { yaw, pitch }.
 * A phone in view wins, then no face, then closed eyes, then head turned away.
 */
export function classify(sig, baseline, { readingNotes = false } = {}) {
  if (sig.phone) return 'phone';
  if (!sig.face) return 'away';
  if (sig.eyesClosed) return 'eyes-closed';
  if (baseline && sig.yaw != null) {
    if (Math.abs(sig.yaw - baseline.yaw) > RULES.yawDeg) return 'looking-away';
    if (!readingNotes && Math.abs(sig.pitch - baseline.pitch) > RULES.pitchDeg) return 'looking-away';
  }
  return 'focused';
}

export const initialState = () => ({
  status: 'starting', // starting | calibrating | focused | away | looking-away | phone | drowsy
  raw: null,
  rawSince: null,
  baseline: null,
  calib: [],
  calibStart: null,
  distractedSince: null, // when the current distraction started counting (after the grace period)
  distractedMs: 0, // total counted distraction this session
  focusedMs: 0,
  lastAt: null,
  level: 0,
  focusedSince: null, // for the buddy's 👍 after long focus
});

/** Advance the guard by one frame. Returns a new state (pure). */
export function step(prev, sig, now, opts = {}) {
  const s = { ...prev };
  const dt = s.lastAt ? Math.min(now - s.lastAt, 2000) : 0;
  s.lastAt = now;

  // Calibration: average the first ~2 s of a visible, open-eyed face
  // (no face or a phone before that: counted like any distraction below, so walking off early still counts)
  if (!s.baseline && sig.face && !sig.phone) {
    if (sig.yaw != null && !sig.eyesClosed) {
      if (!s.calibStart) s.calibStart = now;
      s.calib = [...s.calib, { yaw: sig.yaw, pitch: sig.pitch }];
      if (now - s.calibStart >= RULES.calibrateMs) {
        s.baseline = { yaw: avg(s.calib.map((c) => c.yaw)), pitch: avg(s.calib.map((c) => c.pitch)) };
        s.calib = [];
      }
    }
    s.status = 'calibrating';
    s.raw = null; s.rawSince = now; s.distractedSince = null; s.level = 0;
    return s;
  }

  let raw = classify(sig, s.baseline, opts);
  if (raw !== s.raw) { s.raw = raw; s.rawSince = now; }
  const held = now - s.rawSince;
  if (raw === 'eyes-closed') raw = held >= RULES.drowsyMs ? 'drowsy' : 'focused'; // a blink is not drowsiness

  if (raw === 'focused') {
    s.status = 'focused';
    s.focusedMs += dt;
    s.distractedSince = null;
    s.level = 0;
    if (!s.focusedSince) s.focusedSince = now;
    return s;
  }
  s.focusedSince = null;
  // Distracted: only after the grace period, then it counts and escalates
  if (raw !== 'drowsy' && held < RULES.graceMs) { s.status = 'focused'; s.focusedMs += dt; return s; }
  s.status = raw;
  if (!s.distractedSince) s.distractedSince = now;
  s.distractedMs += dt;
  const run = now - s.distractedSince;
  s.level = run >= RULES.alarmAfterMs ? 2 : run >= RULES.chimeAfterMs ? 1 : 0;
  return s;
}

/** Re-take "this is how I sit when focused" (button in the panel). */
export const recalibrate = (s) => ({ ...s, baseline: null, calib: [], calibStart: null, status: 'calibrating', raw: null, rawSince: null });

/** % of camera time you were focused. */
export const focusPct = (s) => {
  const total = s.focusedMs + s.distractedMs;
  return total > 0 ? Math.round((s.focusedMs / total) * 100) : 100;
};

const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

export const STATUS_TEXT = {
  starting: 'Starting the camera…',
  calibrating: 'Sit how you study: learning your focus position…',
  focused: 'Focused. The buddy is watching 👀',
  away: 'No one at the desk',
  'looking-away': 'Looking away',
  phone: 'Phone spotted 📱',
  drowsy: 'Eyes closing 😴',
  error: 'Camera guard stopped',
};
