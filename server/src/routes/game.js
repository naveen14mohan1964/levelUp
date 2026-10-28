// Game layer API: XP + player level, streak, weekly wins, roadmap unlocks, the focus timer, level-complete celebrations.
const express = require('express');
const { sql, getPool } = require('../db');
const { TRACKS, MAX_SESSION_MIN, STALE_AFTER_MIN, computeGame, summary, findLesson } = require('../game');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const TRACK_KEYS = TRACKS.map((t) => t.key);

// GET /api/game -> player, streak, this week's wins, per-roadmap progress + next lesson, running timer, celebrations
router.get('/game', wrap(async (req, res) => {
  res.json(summary(await computeGame(await getPool())));
}));

// GET /api/game/track/:key -> one roadmap's full level map (every level + lesson with its status)
router.get('/game/track/:key', wrap(async (req, res) => {
  if (!TRACK_KEYS.includes(req.params.key)) return res.status(404).json({ error: `Unknown roadmap. Use one of: ${TRACK_KEYS.join(', ')}` });
  const game = await computeGame(await getPool());
  res.json({
    track: game.tracks.find((t) => t.key === req.params.key),
    player: game.player,
    celebrate: game.celebrate.filter((c) => c.track === req.params.key),
  });
}));

/**
 * Ends the running session (if any) and returns it with the minutes it counted for.
 * auto = the timer ran out (counts at most its planned minutes, even if the page was closed for a while);
 * a manual Stop can count overtime, up to the plan + 60 min.
 */
async function stopRunning(pool, now, { auto = false, distractedSec = null, camera = null } = {}) {
  const r = await pool.request().query('SELECT CAST(id AS int) AS id, track, lesson_ref, started_ms, planned_min, camera, distracted_sec FROM dbo.focus_sessions WHERE ended_ms IS NULL');
  const s = r.recordset[0];
  if (!s) return null;
  const session = { ...s, started_ms: Number(s.started_ms), ended_ms: null };
  const cap = auto ? s.planned_min : s.planned_min + STALE_AFTER_MIN;
  const elapsed = Math.min(Math.round((now - session.started_ms) / 60000), cap, MAX_SESSION_MIN);
  // the camera focus guard's final count wins over the last heartbeat; only focused minutes count
  const distracted = Math.max(0, Math.round(distractedSec ?? s.distracted_sec ?? 0));
  const cam = camera ?? !!s.camera;
  const minutes = Math.max(0, elapsed - Math.floor(distracted / 60));
  await pool.request().input('id', sql.Int, s.id).input('now', sql.BigInt, now).input('m', sql.Int, minutes)
    .input('d', sql.Int, distracted).input('c', sql.Bit, cam)
    .query('UPDATE dbo.focus_sessions SET ended_ms = @now, minutes = @m, distracted_sec = @d, camera = @c WHERE id = @id');
  return { id: s.id, track: s.track, ref: s.lesson_ref, minutes, distractedSec: distracted, camera: cam };
}

// POST /api/focus/start { track, ref?, minutes? } -> starts the focus timer ("Start" = the lesson's estimate, "Just 5 minutes" = 5).
// A locked lesson can't be started. Starting a new timer ends the one that was running.
router.post('/focus/start', wrap(async (req, res) => {
  const { track, ref = null } = req.body || {};
  if (!TRACK_KEYS.includes(track)) return res.status(400).json({ error: `track must be one of: ${TRACK_KEYS.join(', ')}` });
  const pool = await getPool();
  const now = Date.now();
  let planned = req.body.minutes;
  if (ref != null) {
    const lesson = findLesson(await computeGame(pool, now), track, String(ref));
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    if (lesson.status === 'locked') return res.status(409).json({ error: 'That lesson is still locked: finish the one before it first' });
    planned ??= lesson.minutes;
  }
  planned = Number(planned ?? 25);
  if (!Number.isInteger(planned) || planned < 1 || planned > MAX_SESSION_MIN) return res.status(400).json({ error: `minutes must be a whole number from 1 to ${MAX_SESSION_MIN}` });
  const stopped = await stopRunning(pool, now);
  await pool.request().input('track', sql.NVarChar, track).input('ref', sql.NVarChar, ref == null ? null : String(ref))
    .input('now', sql.BigInt, now).input('planned', sql.Int, planned)
    .query('INSERT INTO dbo.focus_sessions (track, lesson_ref, started_ms, planned_min) VALUES (@track, @ref, @now, @planned)');
  res.status(201).json({ stopped, game: summary(await computeGame(pool, now)) });
}));

// POST /api/focus/stop { auto? } -> ends the running timer; its minutes count toward today's streak and this week's wins
router.post('/focus/stop', wrap(async (req, res) => {
  const pool = await getPool();
  const now = Date.now();
  const b = req.body || {};
  const stopped = await stopRunning(pool, now, { auto: b.auto === true, distractedSec: Number.isFinite(Number(b.distractedSec)) ? Number(b.distractedSec) : null, camera: typeof b.camera === 'boolean' ? b.camera : null });
  if (!stopped) return res.status(409).json({ error: 'No focus timer is running' });
  res.json({ stopped, game: summary(await computeGame(pool, now)) });
}));

// POST /api/focus/stats { distractedSec } -> { ok, running }: the camera focus guard's running count (every 30 s), so a closed tab still counts honestly
router.post('/focus/stats', wrap(async (req, res) => {
  const d = Number(req.body?.distractedSec);
  if (!Number.isFinite(d) || d < 0 || d > MAX_SESSION_MIN * 60) return res.status(400).json({ error: 'distractedSec must be a number of seconds' });
  const pool = await getPool();
  const r = await pool.request().input('d', sql.Int, Math.round(d))
    .query('UPDATE dbo.focus_sessions SET distracted_sec = @d, camera = 1 WHERE ended_ms IS NULL; SELECT @@ROWCOUNT AS n');
  // a last heartbeat can arrive just after the session stopped: not an error, just nothing to update
  res.json({ ok: !!r.recordset[0].n, running: !!r.recordset[0].n });
}));

// POST /api/game/seen { track, level } -> the "LEVEL COMPLETE" celebration was shown; it won't play again
router.post('/game/seen', wrap(async (req, res) => {
  const { track, level } = req.body || {};
  if (!TRACK_KEYS.includes(track) || !Number.isInteger(level) || level < 1) return res.status(400).json({ error: 'Send { track, level }' });
  const pool = await getPool();
  await pool.request().input('t', sql.NVarChar, track).input('l', sql.Int, level).input('now', sql.BigInt, Date.now())
    .query('IF NOT EXISTS (SELECT 1 FROM dbo.game_seen WHERE track = @t AND level = @l) INSERT INTO dbo.game_seen (track, level, seen_ms) VALUES (@t, @l, @now);');
  res.json({ ok: true });
}));

module.exports = { router };
