const express = require('express');
const { sql, getPool } = require('../db');
const { linkProblemTasks, isLinkedTask, markLinked } = require('../progress');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const PROBLEM_COLS = `CAST(p.id AS int) AS id, p.day_id, p.sort_order, p.source, p.lc_number, p.title, p.url, p.difficulty, p.topic,
  p.is_stretch, p.is_selftest, p.hint, p.status, p.attempts, p.time_taken_min, p.notes, p.confidence,
  p.interval_days, CONVERT(char(10), p.next_review, 23) AS next_review, p.solved_at`;

router.get('/health', wrap(async (req, res) => {
  const pool = await getPool();
  await pool.request().query('SELECT 1 AS ok');
  res.json({ ok: true });
}));

router.get('/meta', wrap(async (req, res) => {
  const pool = await getPool();
  const { recordset } = await pool.request().query(`
    SELECT CONVERT(char(10), MIN(plan_date), 23) AS startDate, CONVERT(char(10), MAX(plan_date), 23) AS endDate,
           COUNT(*) AS totalDays FROM dbo.days`);
  res.json(recordset[0]);
}));

router.get('/day/:date', wrap(async (req, res) => {
  const { date } = req.params;
  if (!ISO_DATE.test(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  const pool = await getPool();
  const r = await pool.request().input('date', sql.Date, date).query(`
    SELECT CAST(d.id AS int) AS id, d.week_no, d.day_index, d.day_type, d.focus, d.topic, d.links,
           (SELECT v FROM dbo.settings WHERE k = 'channels') AS channels,
           CONVERT(char(10), d.plan_date, 23) AS plan_date, CONVERT(char(10), d.original_date, 23) AS original_date,
           w.title AS week_title, w.phase, w.resources, w.key_concepts, w.milestone
    FROM dbo.days d JOIN dbo.weeks w ON w.week_no = d.week_no
    WHERE d.plan_date = @date;
    SELECT CONVERT(char(10), MAX(plan_date), 23) AS d FROM dbo.days WHERE plan_date < @date;
    SELECT CONVERT(char(10), MIN(plan_date), 23) AS d FROM dbo.days WHERE plan_date > @date;`);
  const [days, prev, next] = r.recordsets;
  const nav = { prevDate: prev[0].d, nextDate: next[0].d };
  if (!days.length) return res.json({ day: null, ...nav });

  const day = days[0];
  day.key_concepts = JSON.parse(day.key_concepts || '[]');
  day.links = JSON.parse(day.links || '[]');
  day.channels = JSON.parse(day.channels || '[]');
  const detail = await pool.request().input('id', sql.Int, day.id).query(`
    SELECT CAST(id AS int) AS id, sort_order, kind, title, minutes, done FROM dbo.tasks WHERE day_id = @id ORDER BY sort_order;
    SELECT ${PROBLEM_COLS} FROM dbo.problems p WHERE p.day_id = @id ORDER BY p.sort_order;`);
  const [tasks, problems] = detail.recordsets;
  res.json({ day, tasks: markLinked(tasks, problems), problems, ...nav });
}));

router.get('/weeks', wrap(async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT week_no, phase, title, CONVERT(char(10), start_date, 23) AS start_date,
           CONVERT(char(10), end_date, 23) AS end_date, milestone
    FROM dbo.weeks ORDER BY week_no;
    SELECT CAST(d.id AS int) AS id, d.week_no, d.day_index, d.day_type, d.focus, CONVERT(char(10), d.plan_date, 23) AS plan_date,
      (SELECT COUNT(*) FROM dbo.tasks t WHERE t.day_id = d.id) AS tasks_total,
      (SELECT COUNT(*) FROM dbo.tasks t WHERE t.day_id = d.id AND t.done = 1) AS tasks_done,
      (SELECT COUNT(*) FROM dbo.problems p WHERE p.day_id = d.id AND p.is_stretch = 0) AS core_total,
      (SELECT COUNT(*) FROM dbo.problems p WHERE p.day_id = d.id AND p.is_stretch = 0 AND p.status <> 'todo') AS core_done
    FROM dbo.days d ORDER BY d.plan_date;`);
  const [weeks, days] = r.recordsets;
  for (const w of weeks) w.days = days.filter((d) => d.week_no === w.week_no);
  res.json(weeks);
}));

router.patch('/tasks/:id', wrap(async (req, res) => {
  const done = !!req.body.done;
  const pool = await getPool();
  if (await isLinkedTask(pool, Number(req.params.id))) {
    return res.status(409).json({ error: 'This task ticks itself when all of its problems are solved. Tick the problems instead.' });
  }
  const r = await pool.request().input('id', sql.Int, Number(req.params.id)).input('done', sql.Bit, done).query(`
    UPDATE dbo.tasks SET done = @done, done_at = CASE WHEN @done = 1 THEN SYSUTCDATETIME() END
    OUTPUT CAST(INSERTED.id AS int) AS id, INSERTED.done WHERE id = @id`);
  if (!r.recordset.length) return res.status(404).json({ error: 'Task not found' });
  res.json(r.recordset[0]);
}));

router.patch('/problems/:id/status', wrap(async (req, res) => {
  const { status } = req.body;
  if (!['todo', 'solved', 'revision'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, Number(req.params.id)).input('status', sql.NVarChar, status).query(`
    UPDATE dbo.problems SET
      status = @status,
      attempts = CASE WHEN @status = 'todo' THEN 0 WHEN attempts = 0 THEN 1 ELSE attempts END,
      solved_at = CASE WHEN @status = 'todo' THEN NULL ELSE COALESCE(solved_at, SYSUTCDATETIME()) END,
      -- un-ticking means "I haven't actually solved it": clear the spaced-repetition schedule too
      confidence = CASE WHEN @status = 'todo' THEN NULL ELSE confidence END,
      interval_days = CASE WHEN @status = 'todo' THEN NULL ELSE interval_days END,
      next_review = CASE WHEN @status = 'todo' THEN NULL ELSE next_review END,
      auto_synced = CASE WHEN @status = 'todo' THEN 0 ELSE auto_synced END,
      updated_at = SYSUTCDATETIME()
    WHERE id = @id;
    SELECT ${PROBLEM_COLS} FROM dbo.problems p WHERE p.id = @id;`);
  if (!r.recordset.length) return res.status(404).json({ error: 'Problem not found' });
  if (r.recordset[0].day_id) await linkProblemTasks(pool, r.recordset[0].day_id);
  res.json(r.recordset[0]);
}));

module.exports = router;
