const express = require('express');
const { sql, getPool } = require('../db');
const { schedule, addDays } = require('../srs');
const { linkProblemTasks } = require('../progress');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const COLS = `CAST(p.id AS int) AS id, p.day_id, p.source, p.lc_number, p.title, p.url, p.slug, p.difficulty, p.topic,
  p.is_stretch, p.is_selftest, p.hint, p.status, p.attempts, p.time_taken_min, p.notes, p.confidence, p.interval_days,
  CONVERT(char(10), p.next_review, 23) AS next_review, p.solved_at, p.auto_synced,
  CONVERT(char(10), d.plan_date, 23) AS plan_date, d.week_no`;
const FROM = 'FROM dbo.problems p LEFT JOIN dbo.days d ON d.id = p.day_id';

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function getProblem(pool, id) {
  const r = await pool.request().input('id', sql.Int, id).query(`SELECT ${COLS} ${FROM} WHERE p.id = @id`);
  return r.recordset[0];
}

// GET /api/problems -> every problem (plan + your own), with its planned date. Filtering happens in the UI.
router.get('/problems', wrap(async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().query(`SELECT ${COLS} ${FROM} ORDER BY COALESCE(d.plan_date, '9999-12-31'), p.sort_order, p.id`);
  res.json(r.recordset);
}));

// GET /api/problems/:id/history -> every logged attempt
router.get('/problems/:id/history', wrap(async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, Number(req.params.id)).query(`
    SELECT CAST(id AS int) AS id, reviewed_at, confidence, success, time_taken_min
    FROM dbo.review_log WHERE problem_id = @id ORDER BY reviewed_at DESC`);
  res.json(r.recordset);
}));

// POST /api/problems/:id/solve  { confidence: 1..5, time_taken_min?, notes?, date? }
// Logs one attempt and schedules the next review (spaced repetition).
router.post('/problems/:id/solve', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const confidence = Number(req.body.confidence);
  const time = req.body.time_taken_min === '' || req.body.time_taken_min == null ? null : Number(req.body.time_taken_min);
  const date = ISO_DATE.test(req.body.date || '') ? req.body.date : localToday();
  if (!(confidence >= 1 && confidence <= 5)) return res.status(400).json({ error: 'confidence must be 1–5' });
  if (time !== null && !(time >= 0 && time < 1000)) return res.status(400).json({ error: 'time_taken_min must be 0–999' });

  const pool = await getPool();
  const prev = await getProblem(pool, id);
  if (!prev) return res.status(404).json({ error: 'Problem not found' });

  // It's a review if it has been rated before. A LeetCode-synced solve that was never rated is a first solve.
  const isReview = prev.interval_days != null;
  const s = schedule({ confidence, previousInterval: prev.interval_days, isReview, date });
  const countAttempt = !(prev.auto_synced && prev.confidence == null); // sync already counted that attempt

  await pool.request()
    .input('id', sql.Int, id).input('status', sql.NVarChar, s.status).input('conf', sql.TinyInt, confidence)
    .input('time', sql.Int, time).input('interval', sql.Int, s.interval).input('next', sql.Date, s.nextReview)
    .input('notes', sql.NVarChar(sql.MAX), req.body.notes ?? null).input('hasNotes', sql.Bit, req.body.notes !== undefined)
    .input('count', sql.Bit, countAttempt).input('success', sql.Bit, confidence >= 3)
    .query(`
      UPDATE dbo.problems SET
        status = @status, confidence = @conf, interval_days = @interval, next_review = @next,
        attempts = attempts + CASE WHEN @count = 1 THEN 1 ELSE 0 END,
        time_taken_min = COALESCE(@time, time_taken_min),
        notes = CASE WHEN @hasNotes = 1 THEN @notes ELSE notes END,
        solved_at = COALESCE(solved_at, SYSUTCDATETIME()), auto_synced = 0, updated_at = SYSUTCDATETIME()
      WHERE id = @id;
      INSERT INTO dbo.review_log (problem_id, confidence, success, time_taken_min) VALUES (@id, @conf, @success, @time);`);
  if (prev.day_id) await linkProblemTasks(pool, prev.day_id);

  res.json({ problem: await getProblem(pool, id), schedule: s, isReview });
}));

// PATCH /api/problems/:id  { notes?, topic? } -> small edits that don't count as an attempt
router.patch('/problems/:id', wrap(async (req, res) => {
  const pool = await getPool();
  const { notes, topic } = req.body;
  await pool.request().input('id', sql.Int, Number(req.params.id))
    .input('notes', sql.NVarChar(sql.MAX), notes ?? null).input('hasNotes', sql.Bit, notes !== undefined)
    .input('topic', sql.NVarChar, topic ?? null)
    .query(`UPDATE dbo.problems SET
              notes = CASE WHEN @hasNotes = 1 THEN @notes ELSE notes END,
              topic = COALESCE(@topic, topic), updated_at = SYSUTCDATETIME()
            WHERE id = @id`);
  const p = await getProblem(pool, Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Problem not found' });
  res.json(p);
}));

// POST /api/problems  { title, url?, difficulty: E|M|H, topic, lc_number? } -> a problem outside the plan
router.post('/problems', wrap(async (req, res) => {
  const { title, url, difficulty, topic, lc_number } = req.body;
  if (!title || !['E', 'M', 'H'].includes(difficulty)) return res.status(400).json({ error: 'title and difficulty (E/M/H) are required' });
  const slug = /leetcode\.com\/problems\/([^/]+)/.exec(url || '')?.[1] || null;
  const pool = await getPool();
  const r = await pool.request()
    .input('title', sql.NVarChar, title.trim()).input('url', sql.NVarChar, url || null).input('slug', sql.NVarChar, slug)
    .input('diff', sql.Char(1), difficulty).input('topic', sql.NVarChar, topic || 'Other')
    .input('num', sql.Int, lc_number ? Number(lc_number) : null)
    .input('source', sql.NVarChar, slug ? 'LeetCode' : 'Other')
    .query(`INSERT INTO dbo.problems (source, lc_number, title, url, slug, difficulty, topic)
            OUTPUT CAST(INSERTED.id AS int) AS id VALUES (@source, @num, @title, @url, @slug, @diff, @topic)`);
  res.status(201).json(await getProblem(pool, r.recordset[0].id));
}));

// GET /api/review/queue?date=YYYY-MM-DD -> what's due, plus a small forecast
router.get('/review/queue', wrap(async (req, res) => {
  const date = ISO_DATE.test(req.query.date || '') ? req.query.date : localToday();
  const pool = await getPool();
  const r = await pool.request().input('date', sql.Date, date).input('week', sql.Date, addDays(date, 7)).query(`
    SELECT ${COLS} ${FROM} WHERE p.next_review <= @date ORDER BY p.next_review, p.confidence, p.id;
    SELECT CONVERT(char(10), next_review, 23) AS d, COUNT(*) AS n FROM dbo.problems
      WHERE next_review > @date AND next_review <= @week GROUP BY next_review ORDER BY next_review;
    SELECT
      SUM(CASE WHEN interval_days >= 60 THEN 1 ELSE 0 END) AS mastered,
      SUM(CASE WHEN status <> 'todo' AND confidence IS NULL THEN 1 ELSE 0 END) AS unrated,
      SUM(CASE WHEN status <> 'todo' THEN 1 ELSE 0 END) AS solved
    FROM dbo.problems;`);
  const [due, upcoming, stats] = r.recordsets;
  res.json({ date, due, upcoming, ...stats[0] });
}));

module.exports = router;
