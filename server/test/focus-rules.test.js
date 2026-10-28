// The camera focus guard's pure rules (client/src/lib/focusRules.js): calibration, the grace period,
// chime → alarm escalation, reading-notes mode, drowsiness and the focus %.
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

let F;
before(async () => { F = await import(pathToFileURL(path.join(__dirname, '../../client/src/lib/focusRules.js')).href); });

const FACE = { face: true, yaw: 2, pitch: -5, eyesClosed: false, phone: false };
/** Feed one signal every 200 ms for `ms`; returns the final state and the time. */
function run(s, sig, from, ms, opts) {
  let t = from;
  for (; t <= from + ms; t += 200) s = F.step(s, sig, t, opts);
  return [s, t];
}
function calibrated() {
  return run(F.initialState(), FACE, 0, F.RULES.calibrateMs + 200);
}

describe('focus guard rules', () => {
  test('classify: phone wins, then no face, then closed eyes, then head turned', () => {
    const base = { yaw: 0, pitch: 0 };
    assert.equal(F.classify({ ...FACE, phone: true, face: false }, base), 'phone');
    assert.equal(F.classify({ face: false }, base), 'away');
    assert.equal(F.classify({ ...FACE, eyesClosed: true }, base), 'eyes-closed');
    assert.equal(F.classify({ ...FACE, yaw: 40 }, base), 'looking-away');
    assert.equal(F.classify({ ...FACE, pitch: -35 }, base), 'looking-away');
    assert.equal(F.classify({ ...FACE, pitch: -35 }, base, { readingNotes: true }), 'focused', 'reading notes: looking down is fine');
    assert.equal(F.classify({ ...FACE, yaw: 40 }, base, { readingNotes: true }), 'looking-away', 'but not turning away');
    assert.equal(F.classify(FACE, base), 'focused');
  });

  test('headPose: identity is straight ahead; null without a matrix', () => {
    const id = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const p = F.headPose(id);
    assert.ok(Math.abs(p.yaw) < 1e-9 && Math.abs(p.pitch) < 1e-9);
    assert.equal(F.headPose(undefined), null);
  });

  test('calibration learns your own position (any camera angle)', () => {
    let s = F.step(F.initialState(), FACE, 0);
    assert.equal(s.status, 'calibrating');
    [s] = calibrated();
    assert.deepEqual([Math.round(s.baseline.yaw), Math.round(s.baseline.pitch)], [2, -5]);
    // a webcam mounted to the side: 30° yaw is "straight" for this person
    const [side] = run(F.initialState(), { ...FACE, yaw: 30 }, 0, 2400);
    assert.equal(F.step(side, { ...FACE, yaw: 31 }, 2600).status, 'focused');
    assert.equal(F.recalibrate(side).baseline, null);
  });

  test('nobody at the desk from the start still counts (after the grace period), then calibration begins on return', () => {
    let [s, t] = run(F.initialState(), { face: false }, 0, 20_000);
    assert.equal(s.status, 'away');
    assert.equal(s.level, 1, 'chime even before calibration');
    assert.ok(s.distractedMs > 15_000);
    [s] = run(s, FACE, t, 400);
    assert.deepEqual([s.status, s.level, s.baseline], ['calibrating', 0, null]);
  });

  test('a glance under 3 s never counts; then it counts, chimes at 15 s and alarms at 45 s', () => {
    let [s, t] = calibrated();
    [s, t] = run(s, { ...FACE, yaw: 50 }, t, 2000);
    assert.deepEqual([s.status, s.distractedMs, s.level], ['focused', 0, 0], 'grace period');
    [s, t] = run(s, FACE, t, 1000);
    assert.equal(s.distractedMs, 0);
    [s, t] = run(s, { face: false }, t, 10_000);
    assert.equal(s.status, 'away');
    assert.equal(s.level, 0);
    [s, t] = run(s, { face: false }, t, 10_000);
    assert.equal(s.level, 1, 'chime');
    [s, t] = run(s, { face: false }, t, 30_000);
    assert.equal(s.level, 2, 'alarm');
    assert.ok(s.distractedMs > 45_000 && s.distractedMs < 50_000, `${s.distractedMs}`);
    [s] = run(s, FACE, t, 400);
    assert.deepEqual([s.status, s.level], ['focused', 0], 'back: alarm stops at once');
    assert.ok(s.focusedSince);
  });

  test('a phone counts after the grace period; a blink is not drowsiness, 3 s of closed eyes is', () => {
    let [s, t] = calibrated();
    [s, t] = run(s, { ...FACE, phone: true }, t, 4000);
    assert.equal(s.status, 'phone');
    [s, t] = run(s, FACE, t, 400);
    [s, t] = run(s, { ...FACE, eyesClosed: true }, t, 400);
    assert.equal(s.status, 'focused', 'a blink');
    [s] = run(s, { ...FACE, eyesClosed: true }, t, 3200);
    assert.equal(s.status, 'drowsy');
  });

  test('focus %: focused vs distracted camera time', () => {
    assert.equal(F.focusPct(F.initialState()), 100);
    assert.equal(F.focusPct({ focusedMs: 30_000, distractedMs: 10_000 }), 75);
    assert.ok(Object.keys(F.STATUS_TEXT).includes('looking-away'));
  });
});
