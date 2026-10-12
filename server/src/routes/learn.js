// Learning modules API (LLD, HLD): the roadmap with your progress, and saving a lesson (done / notes).
// Unlocks, XP and streak come from the game layer (GET /api/game/track/:key), like AI + FDE.
const express = require('express');
const { sql, getPool } = require('../db');
const { MODULES } = require('../learn/modules');
const { computeGame, findLesson } = require('../game');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const num = (v) => (v == null ? null : Number(v));

function moduleOr404(req, res) {
  const m = MODULES[req.params.track];
  if (!m) res.status(404).json({ error: `Unknown module. Use one of: ${Object.keys(MODULES).join(', ')}` });
  return m;
}

// GET /api/learn/:track -> levels with lesson content + your progress, the next lesson, totals
router.get('/learn/:track', wrap(async (req, res) => {
  const m = moduleOr404(req, res);
  if (!m) return;
  const pool = await getPool();
  const rows = (await pool.request().input('t', sql.NVarChar, m.key).query('SELECT lesson_id, done_ms, notes FROM dbo.learn_progress WHERE track = @t')).recordset;
  const prog = new Map(rows.map((r) => [r.lesson_id, { done_ms: num(r.done_ms), notes: r.notes || '' }]));
  const levels = m.roadmap.levels.map((lv) => {
    const lessons = lv.lessons.map((x) => ({ ...x, links: x.links.map(([label, url]) => ({ label, url })), done_ms: prog.get(x.id)?.done_ms || null, notes: prog.get(x.id)?.notes || '' }));
    return { n: lv.n, title: lv.title, goal: lv.goal, lessons, done: lessons.filter((x) => x.done_ms).length, total: lessons.length };
  });
  const all = levels.flatMap((lv) => lv.lessons.map((x) => ({ ...x, level: lv.n, levelTitle: lv.title })));
  const done = all.filter((x) => x.done_ms);
  const weekAgo = Date.now() - 7 * 86400000;
  const game = await computeGame(pool);
  res.json({
    key: m.key, label: m.label, title: m.title, about: m.roadmap.about, levels,
    next: all.find((x) => !x.done_ms) || null,
    progress: { done: done.length, total: all.length },
    thisWeek: done.filter((x) => x.done_ms >= weekAgo).length,
    streak: game.streak.current,
  });
}));

// POST /api/learn/:track/lessons/:id { done?, notes? } -> lessons unlock one by one (notes can always be saved)
router.post('/learn/:track/lessons/:id', wrap(async (req, res) => {
  const m = moduleOr404(req, res);
  if (!m) return;
  const lesson = m.roadmap.levels.flatMap((lv) => lv.lessons).find((x) => x.id === req.params.id);
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
  const b = req.body || {};
  if ('notes' in b && String(b.notes).length > 10000) return res.status(400).json({ error: 'Notes: max 10,000 characters' });
  const pool = await getPool();
  if (b.done && findLesson(await computeGame(pool), m.key, lesson.id).status === 'locked') {
    return res.status(409).json({ error: 'This lesson is still locked: finish the one before it first' });
  }
  const now = Date.now();
  await pool.request().input('t', sql.NVarChar, m.key).input('id', sql.NVarChar, lesson.id).input('now', sql.BigInt, now)
    .input('hasDone', sql.Bit, 'done' in b).input('done', sql.BigInt, b.done ? now : null)
    .input('hasNotes', sql.Bit, 'notes' in b).input('notes', sql.NVarChar(sql.MAX), 'notes' in b ? String(b.notes) : null)
    .query(`MERGE dbo.learn_progress AS t USING (SELECT @t AS track, @id AS lesson_id) AS s ON t.track = s.track AND t.lesson_id = s.lesson_id
            WHEN MATCHED THEN UPDATE SET
              done_ms = CASE WHEN @hasDone = 1 THEN (CASE WHEN @done IS NULL THEN NULL ELSE COALESCE(t.done_ms, @done) END) ELSE t.done_ms END,
              notes = CASE WHEN @hasNotes = 1 THEN @notes ELSE t.notes END, updated_ms = @now
            WHEN NOT MATCHED THEN INSERT (track, lesson_id, done_ms, notes, updated_ms)
              VALUES (@t, @id, CASE WHEN @hasDone = 1 THEN @done END, CASE WHEN @hasNotes = 1 THEN @notes END, @now);`);
  res.json({ ok: true });
}));

module.exports = { router };
