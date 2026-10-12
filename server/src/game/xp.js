// XP: small for starting a lesson, more for finishing, big for finishing a level.
// Every XP event is derived from a real timestamp (lesson done, problem solved, focus session started), so un-ticking
// something takes its XP back, a LeetCode sync earns XP, and progress made before this existed counts too.
const { localDay } = require('./days');

const XP = { start: 5, lesson: 25, level: 150, problem: { E: 15, M: 25, H: 40 } };

/**
 * @param tracks    progressed tracks (see progression.js)
 * @param problems  [{ id, solvedMs, difficulty }] solved DSA problems (planned or added by you)
 * @param sessions  [{ track, lesson_ref, started_ms }] focus sessions
 * @returns [{ ms, xp, kind: start | lesson | level | problem, track, ref }]
 */
function xpEvents({ tracks, problems, sessions }) {
  const events = [];
  for (const t of tracks) {
    for (const lv of t.levels) {
      for (const x of lv.lessons) if (x.done) events.push({ ms: x.doneMs || null, xp: XP.lesson, kind: 'lesson', track: t.key, ref: x.ref });
      if (lv.complete) events.push({ ms: lv.completedMs, xp: XP.level, kind: 'level', track: t.key, ref: `level-${lv.n}` });
    }
  }
  for (const p of problems) events.push({ ms: p.solvedMs || null, xp: XP.problem[p.difficulty] || XP.problem.M, kind: 'problem', track: 'dsa', ref: `p${p.id}` });
  // Starting earns XP once per lesson per day, so restarting the timer can't farm it.
  const started = new Set();
  for (const s of sessions) {
    const key = `${s.track}|${s.lesson_ref || ''}|${localDay(s.started_ms)}`;
    if (started.has(key)) continue;
    started.add(key);
    events.push({ ms: s.started_ms, xp: XP.start, kind: 'start', track: s.track, ref: s.lesson_ref || null });
  }
  return events;
}

/** Player level n needs 100 + 50·(n−1) XP to reach level n+1 (100, 150, 200, …). */
function playerLevel(total) {
  let level = 1;
  let need = 100;
  let rest = total;
  while (rest >= need) { rest -= need; level++; need = 100 + 50 * (level - 1); }
  return { level, total, xpInLevel: rest, xpForNext: need };
}

module.exports = { XP, xpEvents, playerLevel };
