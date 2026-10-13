// The game layer in one call: player level + XP, streak, this week's wins, per-roadmap progress with unlocks,
// the running focus timer, and level-complete celebrations that haven't been shown yet.
const { sql } = require('../db');
const { TRACKS, loadTracks } = require('./tracks');
const { progress } = require('./progression');
const { XP, xpEvents, playerLevel } = require('./xp');
const { dayMinutes, computeStreak } = require('./streak');
const { localDay, weekStart, addDays } = require('./days');
const { comebacks: comebacksFor } = require('../checkin/rules');

const MAX_SESSION_MIN = 240;
const STALE_AFTER_MIN = 60; // a timer left running this long past its plan is closed at its planned length

/** Minutes a session counts for: its recorded minutes, or the time so far (up to its plan) if it's still running. */
const sessionMinutes = (s, now) => (s.ended_ms != null ? s.minutes || 0 : Math.min(Math.floor((now - s.started_ms) / 60000), s.planned_min, MAX_SESSION_MIN));

async function closeStaleSessions(pool, now) {
  await pool.request().input('now', sql.BigInt, now).input('stale', sql.Int, STALE_AFTER_MIN).query(`
    UPDATE dbo.focus_sessions SET ended_ms = started_ms + CAST(planned_min AS bigint) * 60000, minutes = planned_min
    WHERE ended_ms IS NULL AND @now - started_ms > CAST(planned_min + @stale AS bigint) * 60000;`);
}

/** When the game layer first ran: only levels completed after this get a celebration (older progress just counts). */
async function startedMs(pool, now) {
  const r = await pool.request().input('now', sql.NVarChar, String(now)).query(`
    IF NOT EXISTS (SELECT 1 FROM dbo.settings WHERE k = 'game_started_ms') INSERT INTO dbo.settings (k, v) VALUES ('game_started_ms', @now);
    SELECT v FROM dbo.settings WHERE k = 'game_started_ms';`);
  return Number(r.recordset[0].v);
}

async function computeGame(pool, now = Date.now()) {
  await closeStaleSessions(pool, now);
  const since = await startedMs(pool, now);
  await require('../checkin/data').ensureStarterShield(pool); // everyone starts with one streak shield
  const { tracks: raw, solved, credits } = await loadTracks(pool);
  const r = await pool.request().query(`
    SELECT CAST(id AS int) AS id, track, lesson_ref, started_ms, planned_min, ended_ms, minutes FROM dbo.focus_sessions ORDER BY started_ms;
    SELECT CONVERT(char(10), day, 23) AS day FROM dbo.streak_freezes;
    SELECT track, level FROM dbo.game_seen;
    SELECT earned_ms FROM dbo.streak_shields WHERE used_ms IS NULL ORDER BY id;
    SELECT CONVERT(char(10), e.eval_date, 23) AS date, e.results, (SELECT kind FROM dbo.rest_days r WHERE r.rest_date = e.eval_date) AS rest
      FROM dbo.mentor_evaluations e ORDER BY e.eval_date;`);
  const sessions = r.recordsets[0].map((s) => ({ ...s, started_ms: Number(s.started_ms), ended_ms: s.ended_ms == null ? null : Number(s.ended_ms) }));
  const frozen = new Set(r.recordsets[1].map((x) => x.day));
  const seen = new Set(r.recordsets[2].map((x) => `${x.track}|${x.level}`));
  const shieldDays = r.recordsets[3].map((x) => localDay(Number(x.earned_ms)));
  // Comeback bonus: a goal completed the day after it was missed (from the Mentor's evaluations)
  const evals = r.recordsets[4].map((x) => ({ ...x, results: JSON.parse(x.results) }));
  const comebacks = [];
  for (let i = 1; i < evals.length; i++) {
    if (evals[i - 1].date !== addDays(evals[i].date, -1)) continue;
    for (const category of comebacksFor(evals[i - 1], evals[i])) comebacks.push({ ms: new Date(`${evals[i].date}T12:00:00`).getTime(), date: evals[i].date, category });
  }

  const tracks = raw.map(progress);
  const events = xpEvents({ tracks, problems: solved, sessions, comebacks });
  const total = events.reduce((s, e) => s + e.xp, 0);
  const today = localDay(now);
  const minutes = dayMinutes(sessions.map((s) => ({ ...s, minutes: sessionMinutes(s, now) })), credits);
  const streak = computeStreak(minutes, frozen, today, shieldDays);
  // A shield saved the streak: record the covered day and spend the oldest shield in the bank
  for (const day of streak.newFreezes) {
    await pool.request().input('d', sql.Date, day).input('now', sql.BigInt, now).query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.streak_freezes WHERE day = @d)
      BEGIN
        INSERT INTO dbo.streak_freezes (day, used_ms) VALUES (@d, @now);
        UPDATE dbo.streak_shields SET used_ms = @now, used_for_day = @d
        WHERE id = (SELECT TOP 1 id FROM dbo.streak_shields WHERE used_ms IS NULL ORDER BY id);
      END`);
  }
  const { newFreezes, ...streakOut } = streak;

  // This week's wins (Mon–Sun)
  const wk = weekStart(today);
  const inWeek = (t) => t && localDay(t) >= wk && localDay(t) <= today;
  const weekDays = [...minutes.entries()].filter(([d]) => d >= wk && d <= today);
  const best = weekDays.sort((a, b) => b[1] - a[1])[0];
  const week = {
    from: wk,
    lessons: events.filter((e) => e.kind === 'lesson' && inWeek(e.ms)).length,
    problems: events.filter((e) => e.kind === 'problem' && inWeek(e.ms)).length,
    levels: events.filter((e) => e.kind === 'level' && inWeek(e.ms)).length,
    minutes: weekDays.reduce((s, [, m]) => s + m, 0),
    xp: events.filter((e) => inWeek(e.ms)).reduce((s, e) => s + e.xp, 0),
    activeDays: weekDays.filter(([, m]) => m >= 5).length,
    bestDay: best && best[1] > 0 ? { day: best[0], minutes: best[1] } : null,
  };

  const celebrate = [];
  for (const t of tracks) {
    for (const lv of t.levels) {
      if (lv.complete && lv.completedMs >= since && !seen.has(`${t.key}|${lv.n}`)) {
        const nextLevel = t.levels.find((x) => x.n > lv.n);
        celebrate.push({ track: t.key, trackLabel: t.label, level: lv.n, title: lv.title, xp: XP.level + XP.lesson, nextLevel: nextLevel ? { n: nextLevel.n, title: nextLevel.title } : null });
      }
    }
  }

  const running = sessions.find((s) => s.ended_ms == null);
  return {
    player: { ...playerLevel(total), today: events.filter((e) => e.ms && localDay(e.ms) === today).reduce((s, e) => s + e.xp, 0) },
    streak: streakOut,
    week,
    tracks,
    celebrate,
    focus: running ? { id: running.id, track: running.track, ref: running.lesson_ref, startedMs: running.started_ms, plannedMin: running.planned_min, elapsedMin: sessionMinutes(running, now) } : null,
  };
}

/** The summary view: everything except each track's full level/lesson list. */
function summary(game) {
  return { ...game, tracks: game.tracks.map(({ levels, ...t }) => ({ ...t, levelsTotal: levels.length })) };
}

function findLesson(game, trackKey, ref) {
  const t = game.tracks.find((x) => x.key === trackKey);
  return t?.levels.flatMap((lv) => lv.lessons.map((x) => ({ ...x, level: lv.n }))).find((x) => x.ref === ref) || null;
}

module.exports = { TRACKS, XP, MAX_SESSION_MIN, STALE_AFTER_MIN, computeGame, summary, findLesson, sessionMinutes };
