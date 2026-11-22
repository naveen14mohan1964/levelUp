// Growth layer API: tiny daily habits, the weekly challenge, and your goals (at most 3 active, each with small steps).
// Stats, consistency, milestones and the challenge's progress are part of GET /api/game (see growth.js).
const express = require('express');
const { sql, getPool } = require('../db');
const { computeGame, summary } = require('../game');
const { HABITS, STATS, setHabit, chooseChallenge } = require('../growth');
const { localDay } = require('../game/days');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const validDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
const STAT_KEYS = STATS.map((s) => s.key);
const MAX_ACTIVE_GOALS = 3;
const MAX_STEPS = 12;

// POST /api/habits/:date/:key { done } -> the game summary (so XP and the stat update at once)
router.post('/habits/:date/:key', wrap(async (req, res) => {
  const { date, key } = req.params;
  if (!validDate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  if (!HABITS[key]) return res.status(404).json({ error: `Unknown habit. Use one of: ${Object.keys(HABITS).join(', ')}` });
  if (typeof req.body?.done !== 'boolean') return res.status(400).json({ error: 'Send { done: true | false }' });
  if (date > localDay(Date.now())) return res.status(400).json({ error: 'That day has not happened yet' });
  const pool = await getPool();
  await setHabit(pool, date, key, req.body.done);
  res.json(summary(await computeGame(pool)));
}));

// POST /api/challenge { key } -> choose (or change) this week's challenge from the three suggestions
router.post('/challenge', wrap(async (req, res) => {
  const pool = await getPool();
  const { growth } = await computeGame(pool);
  const pick = growth.challenge.suggestions.find((s) => s.key === req.body?.key);
  if (!pick) return res.status(400).json({ error: `key must be one of: ${growth.challenge.suggestions.map((s) => s.key).join(', ')}` });
  if (growth.challenge.chosen?.complete) return res.status(409).json({ error: 'This week\'s challenge is already won. A new one opens on Monday.' });
  await chooseChallenge(pool, growth.challenge.week, pick.key, pick.target);
  res.json(summary(await computeGame(pool)));
}));

/* ----------------------------- goals ----------------------------- */

async function readGoals(pool) {
  const r = await pool.request().query(`
    SELECT CAST(id AS int) AS id, title, stat, CONVERT(char(10), target_date, 23) AS targetDate, status, CAST(created_ms AS float) AS createdMs, CAST(done_ms AS float) AS doneMs
      FROM dbo.life_goals ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, id;
    SELECT CAST(id AS int) AS id, CAST(goal_id AS int) AS goalId, title, CAST(done_ms AS float) AS doneMs FROM dbo.life_goal_steps ORDER BY sort_order, id;`);
  return r.recordsets[0].map((g) => {
    const steps = r.recordsets[1].filter((s) => s.goalId === g.id).map(({ goalId, ...s }) => ({ ...s, done: s.doneMs != null }));
    return { ...g, steps, done: steps.filter((s) => s.done).length, total: steps.length, nextStep: steps.find((s) => !s.done) || null };
  });
}
const activeCount = async (pool) => (await pool.request().query("SELECT COUNT(*) AS n FROM dbo.life_goals WHERE status = 'active'")).recordset[0].n;
const cleanTitle = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// GET /api/journey/goals -> { goals, maxActive }
router.get('/journey/goals', wrap(async (req, res) => {
  res.json({ goals: await readGoals(await getPool()), maxActive: MAX_ACTIVE_GOALS });
}));

// POST /api/journey/goals { title, stat, targetDate?, steps?: [title] } -> a new active goal (at most 3 active at once)
router.post('/journey/goals', wrap(async (req, res) => {
  const b = req.body || {};
  const title = cleanTitle(b.title);
  if (!title) return res.status(400).json({ error: 'Give the goal a title' });
  if (!STAT_KEYS.includes(b.stat)) return res.status(400).json({ error: `stat must be one of: ${STAT_KEYS.join(', ')}` });
  if (b.targetDate && !validDate(b.targetDate)) return res.status(400).json({ error: 'targetDate must be YYYY-MM-DD' });
  const steps = (Array.isArray(b.steps) ? b.steps : []).map((s) => cleanTitle(s)).filter(Boolean).slice(0, MAX_STEPS);
  const pool = await getPool();
  if (await activeCount(pool) >= MAX_ACTIVE_GOALS) return res.status(409).json({ error: `You already have ${MAX_ACTIVE_GOALS} active goals. Finish or pause one first: fewer goals get finished more often.` });
  const ins = await pool.request().input('t', sql.NVarChar, title).input('s', sql.NVarChar, b.stat).input('d', sql.Date, b.targetDate || null).input('now', sql.BigInt, Date.now())
    .query("INSERT INTO dbo.life_goals (title, stat, target_date, status, created_ms) OUTPUT INSERTED.id VALUES (@t, @s, @d, 'active', @now)");
  const id = ins.recordset[0].id;
  for (const [i, s] of steps.entries()) {
    await pool.request().input('g', sql.Int, id).input('t', sql.NVarChar, s).input('o', sql.Int, i).query('INSERT INTO dbo.life_goal_steps (goal_id, title, sort_order) VALUES (@g, @t, @o)');
  }
  res.status(201).json({ goals: await readGoals(pool), maxActive: MAX_ACTIVE_GOALS });
}));

// PATCH /api/journey/goals/:id { status: active | paused | done } -> finish, pause or resume a goal
router.patch('/journey/goals/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const status = req.body?.status;
  if (!['active', 'paused', 'done'].includes(status)) return res.status(400).json({ error: 'status must be active, paused or done' });
  const pool = await getPool();
  const cur = (await pool.request().input('id', sql.Int, id).query('SELECT status FROM dbo.life_goals WHERE id = @id')).recordset[0];
  if (!cur) return res.status(404).json({ error: 'Goal not found' });
  if (status === 'active' && cur.status !== 'active' && await activeCount(pool) >= MAX_ACTIVE_GOALS) return res.status(409).json({ error: `You already have ${MAX_ACTIVE_GOALS} active goals. Finish or pause one first.` });
  await pool.request().input('id', sql.Int, id).input('s', sql.NVarChar, status).input('done', sql.BigInt, status === 'done' ? Date.now() : null)
    .query('UPDATE dbo.life_goals SET status = @s, done_ms = @done WHERE id = @id');
  res.json({ goals: await readGoals(pool), maxActive: MAX_ACTIVE_GOALS });
}));

// DELETE /api/journey/goals/:id -> removes the goal and its steps
router.delete('/journey/goals/:id', wrap(async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, Number(req.params.id)).query('DELETE FROM dbo.life_goals WHERE id = @id; SELECT @@ROWCOUNT AS n');
  if (!r.recordset[0].n) return res.status(404).json({ error: 'Goal not found' });
  res.json({ goals: await readGoals(pool), maxActive: MAX_ACTIVE_GOALS });
}));

// POST /api/journey/goals/:id/steps { title } -> adds a small step
router.post('/journey/goals/:id/steps', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const title = cleanTitle(req.body?.title);
  if (!title) return res.status(400).json({ error: 'Give the step a title' });
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, id).query('SELECT (SELECT COUNT(*) FROM dbo.life_goals WHERE id = @id) AS goal, (SELECT COUNT(*) FROM dbo.life_goal_steps WHERE goal_id = @id) AS steps');
  if (!r.recordset[0].goal) return res.status(404).json({ error: 'Goal not found' });
  if (r.recordset[0].steps >= MAX_STEPS) return res.status(409).json({ error: `A goal can have at most ${MAX_STEPS} steps. Finish some first.` });
  await pool.request().input('g', sql.Int, id).input('t', sql.NVarChar, title).input('o', sql.Int, r.recordset[0].steps).query('INSERT INTO dbo.life_goal_steps (goal_id, title, sort_order) VALUES (@g, @t, @o)');
  res.status(201).json({ goals: await readGoals(pool), maxActive: MAX_ACTIVE_GOALS });
}));

// PATCH /api/journey/steps/:id { done } -> tick or un-tick a step
router.patch('/journey/steps/:id', wrap(async (req, res) => {
  if (typeof req.body?.done !== 'boolean') return res.status(400).json({ error: 'Send { done: true | false }' });
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, Number(req.params.id)).input('ms', sql.BigInt, req.body.done ? Date.now() : null)
    .query('UPDATE dbo.life_goal_steps SET done_ms = @ms WHERE id = @id; SELECT @@ROWCOUNT AS n');
  if (!r.recordset[0].n) return res.status(404).json({ error: 'Step not found' });
  res.json({ goals: await readGoals(pool), maxActive: MAX_ACTIVE_GOALS });
}));

module.exports = { router };
