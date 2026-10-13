// Dev tools: reset AI / LLD / HLD lessons + game state (XP from focus sessions, streak freezes, seen celebrations) to test the
// level-up flow, with a snapshot first so it can be restored. Only on the dev server (npm run dev passes --dev-tools)
// and only from this laptop: the always-on app (:4000) answers 404. DSA, projects, LeetCode, meals etc. are never touched.
const express = require('express');
const { sql, getPool } = require('../db');
const { isLocal } = require('../linkedin/connection');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const KEEP_SNAPSHOTS = 10;

const enabled = () => process.env.LEVELUP_DEV_TOOLS === '1' || process.argv.includes('--dev-tools');
router.use('/dev', (req, res, next) => (enabled() && isLocal(req) ? next() : res.status(404).json({ error: 'Not found' })));

const num = (v) => (v == null ? null : Number(v));

async function takeSnapshot(pool, now) {
  const r = await pool.request().query(`
    SELECT lesson_id, done_ms, notes, updated_ms FROM dbo.ai_progress;
    SELECT track, lesson_id, done_ms, notes, updated_ms FROM dbo.learn_progress;
    SELECT track, lesson_ref, started_ms, planned_min, ended_ms, minutes FROM dbo.focus_sessions ORDER BY id;
    SELECT CONVERT(char(10), day, 23) AS day, used_ms FROM dbo.streak_freezes;
    SELECT track, level, seen_ms FROM dbo.game_seen;
    SELECT CONVERT(char(10), eval_date, 23) AS eval_date, results, misses, level, shield_used, reason, blocker, final, evaluated_ms FROM dbo.mentor_evaluations;
    SELECT CONVERT(char(10), for_date, 23) AS for_date, category, planned_at, place, fulfilled, created_ms FROM dbo.mentor_commitments;
    SELECT earned_ms, reason, used_ms, CONVERT(char(10), used_for_day, 23) AS used_for_day FROM dbo.streak_shields;
    SELECT v FROM dbo.settings WHERE k = 'game_started_ms';`);
  const [ai, learn, sessions, freezes, seen, evals, commits, shields, started] = r.recordsets;
  const data = {
    ai_progress: ai.map((x) => ({ ...x, done_ms: num(x.done_ms), updated_ms: num(x.updated_ms) })),
    learn_progress: learn.map((x) => ({ ...x, done_ms: num(x.done_ms), updated_ms: num(x.updated_ms) })),
    focus_sessions: sessions.map((x) => ({ ...x, started_ms: num(x.started_ms), ended_ms: num(x.ended_ms) })),
    streak_freezes: freezes.map((x) => ({ ...x, used_ms: num(x.used_ms) })),
    game_seen: seen.map((x) => ({ ...x, seen_ms: num(x.seen_ms) })),
    mentor_evaluations: evals.map((x) => ({ ...x, evaluated_ms: num(x.evaluated_ms) })),
    mentor_commitments: commits.map((x) => ({ ...x, created_ms: num(x.created_ms) })),
    streak_shields: shields.map((x) => ({ ...x, earned_ms: num(x.earned_ms), used_ms: num(x.used_ms) })),
    game_started_ms: started[0]?.v ?? null,
  };
  const ins = await pool.request().input('now', sql.BigInt, now).input('data', sql.NVarChar(sql.MAX), JSON.stringify(data)).query(`
    INSERT INTO dbo.dev_snapshots (created_ms, data) OUTPUT CAST(INSERTED.id AS int) AS id VALUES (@now, @data);
    DELETE FROM dbo.dev_snapshots WHERE id NOT IN (SELECT TOP ${KEEP_SNAPSHOTS} id FROM dbo.dev_snapshots ORDER BY id DESC);`);
  return { id: ins.recordset[0].id, counts: counts(data) };
}

const counts = (d) => ({ lessons: [...d.ai_progress, ...(d.learn_progress || [])].filter((x) => x.done_ms).length, sessions: d.focus_sessions.length, freezes: d.streak_freezes.length, celebrations: d.game_seen.length });

// GET /api/dev/status -> snapshots you can restore
router.get('/dev/status', wrap(async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().query('SELECT CAST(id AS int) AS id, created_ms, data FROM dbo.dev_snapshots ORDER BY id DESC');
  res.json({ enabled: true, snapshots: r.recordset.map((s) => ({ id: s.id, created_ms: num(s.created_ms), counts: counts(JSON.parse(s.data)) })) });
}));

// POST /api/dev/reset { confirm: "RESET" } -> snapshot, then a fresh start: AI lessons, focus sessions, freezes, celebrations
router.post('/dev/reset', wrap(async (req, res) => {
  if (req.body?.confirm !== 'RESET') return res.status(400).json({ error: 'Type RESET to confirm' });
  const pool = await getPool();
  const now = Date.now();
  const snapshot = await takeSnapshot(pool, now);
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx).input('now', sql.NVarChar, String(now)).query(`
      DELETE FROM dbo.ai_progress; DELETE FROM dbo.learn_progress; DELETE FROM dbo.focus_sessions; DELETE FROM dbo.streak_freezes; DELETE FROM dbo.game_seen;
      DELETE FROM dbo.mentor_evaluations; DELETE FROM dbo.mentor_commitments; DELETE FROM dbo.streak_shields;
      DELETE FROM dbo.settings WHERE k = 'game_started_ms';
      INSERT INTO dbo.settings (k, v) VALUES ('game_started_ms', @now); -- levels finished from now on celebrate again`);
    await tx.commit();
  } catch (e) { await tx.rollback(); throw e; }
  res.json({ ok: true, snapshot });
}));

// POST /api/dev/restore { id? } -> put a snapshot back (default: the latest)
router.post('/dev/restore', wrap(async (req, res) => {
  const pool = await getPool();
  const id = req.body?.id == null ? null : Number(req.body.id);
  const r = await pool.request().input('id', sql.Int, id)
    .query('SELECT TOP 1 CAST(id AS int) AS id, data FROM dbo.dev_snapshots WHERE @id IS NULL OR id = @id ORDER BY id DESC');
  if (!r.recordset.length) return res.status(404).json({ error: 'No snapshot to restore' });
  const data = JSON.parse(r.recordset[0].data);
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const q = () => new sql.Request(tx);
    await q().query('DELETE FROM dbo.ai_progress; DELETE FROM dbo.learn_progress; DELETE FROM dbo.focus_sessions; DELETE FROM dbo.streak_freezes; DELETE FROM dbo.game_seen; DELETE FROM dbo.mentor_evaluations; DELETE FROM dbo.mentor_commitments; DELETE FROM dbo.streak_shields;');
    for (const x of data.mentor_evaluations || []) {
      await q().input('d', sql.Date, x.eval_date).input('r', sql.NVarChar(sql.MAX), x.results).input('m', sql.NVarChar(sql.MAX), x.misses).input('l', sql.TinyInt, x.level)
        .input('s', sql.Bit, x.shield_used).input('re', sql.NVarChar, x.reason).input('b', sql.NVarChar, x.blocker).input('f', sql.Bit, x.final).input('e', sql.BigInt, x.evaluated_ms)
        .query('INSERT INTO dbo.mentor_evaluations (eval_date, results, misses, level, shield_used, reason, blocker, final, evaluated_ms) VALUES (@d, @r, @m, @l, @s, @re, @b, @f, @e)');
    }
    for (const x of data.mentor_commitments || []) {
      await q().input('d', sql.Date, x.for_date).input('c', sql.NVarChar, x.category).input('p', sql.NVarChar, x.planned_at).input('pl', sql.NVarChar, x.place)
        .input('f', sql.Bit, x.fulfilled).input('cr', sql.BigInt, x.created_ms)
        .query('INSERT INTO dbo.mentor_commitments (for_date, category, planned_at, place, fulfilled, created_ms) VALUES (@d, @c, @p, @pl, @f, @cr)');
    }
    for (const x of data.streak_shields || []) {
      await q().input('e', sql.BigInt, x.earned_ms).input('r', sql.NVarChar, x.reason).input('u', sql.BigInt, x.used_ms).input('d', sql.Date, x.used_for_day)
        .query('INSERT INTO dbo.streak_shields (earned_ms, reason, used_ms, used_for_day) VALUES (@e, @r, @u, @d)');
    }
    for (const x of data.learn_progress || []) {
      await q().input('t', sql.NVarChar, x.track).input('id', sql.NVarChar, x.lesson_id).input('d', sql.BigInt, x.done_ms).input('n', sql.NVarChar(sql.MAX), x.notes).input('u', sql.BigInt, x.updated_ms)
        .query('INSERT INTO dbo.learn_progress (track, lesson_id, done_ms, notes, updated_ms) VALUES (@t, @id, @d, @n, @u)');
    }
    for (const x of data.ai_progress) {
      await q().input('id', sql.NVarChar, x.lesson_id).input('d', sql.BigInt, x.done_ms).input('n', sql.NVarChar(sql.MAX), x.notes).input('u', sql.BigInt, x.updated_ms)
        .query('INSERT INTO dbo.ai_progress (lesson_id, done_ms, notes, updated_ms) VALUES (@id, @d, @n, @u)');
    }
    for (const x of data.focus_sessions) {
      await q().input('t', sql.NVarChar, x.track).input('r', sql.NVarChar, x.lesson_ref).input('s', sql.BigInt, x.started_ms)
        .input('p', sql.Int, x.planned_min).input('e', sql.BigInt, x.ended_ms).input('m', sql.Int, x.minutes)
        .query('INSERT INTO dbo.focus_sessions (track, lesson_ref, started_ms, planned_min, ended_ms, minutes) VALUES (@t, @r, @s, @p, @e, @m)');
    }
    for (const x of data.streak_freezes) {
      await q().input('d', sql.Date, x.day).input('u', sql.BigInt, x.used_ms).query('INSERT INTO dbo.streak_freezes (day, used_ms) VALUES (@d, @u)');
    }
    for (const x of data.game_seen) {
      await q().input('t', sql.NVarChar, x.track).input('l', sql.Int, x.level).input('s', sql.BigInt, x.seen_ms)
        .query('INSERT INTO dbo.game_seen (track, level, seen_ms) VALUES (@t, @l, @s)');
    }
    await q().input('v', sql.NVarChar, data.game_started_ms).query(`
      DELETE FROM dbo.settings WHERE k = 'game_started_ms';
      IF @v IS NOT NULL INSERT INTO dbo.settings (k, v) VALUES ('game_started_ms', @v);`);
    await tx.commit();
  } catch (e) { await tx.rollback(); throw e; }
  res.json({ ok: true, restored: r.recordset[0].id, counts: counts(data) });
}));

module.exports = { router };
