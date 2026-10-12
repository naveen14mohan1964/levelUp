const express = require('express');
const { sql, getPool } = require('../db');
const { templateFor, dsaSlot, workoutFor } = require('../schedule');
const { markLinked } = require('../progress');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// GET /api/schedule/:date -> the day's time blocks, each filled with that day's real tasks.
router.get('/schedule/:date', wrap(async (req, res) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });

  const pool = await getPool();
  const r = await pool.request().input('date', sql.Date, date).query(`
    SELECT CAST(id AS int) AS id, week_no, day_index, day_type, focus FROM dbo.days WHERE plan_date = @date;
    SELECT CONVERT(char(10), v, 23) AS start FROM (SELECT TRY_CONVERT(date, v) AS v FROM dbo.settings WHERE k = 'start_date') s;
    SELECT CAST(t.id AS int) AS id, t.kind, t.title, t.minutes, t.done, t.sort_order
      FROM dbo.tasks t JOIN dbo.days d ON d.id = t.day_id WHERE d.plan_date = @date ORDER BY t.sort_order;
    SELECT p.is_selftest, p.is_stretch, p.status
      FROM dbo.problems p JOIN dbo.days d ON d.id = p.day_id WHERE d.plan_date = @date;
    SELECT CAST(t.id AS int) AS id, t.kind, t.learn, t.learn_done, t.title, t.done, p.area, p.name AS project
      FROM dbo.project_tasks t JOIN dbo.projects p ON p.code = t.project_code WHERE t.plan_date = @date
      ORDER BY CASE t.kind WHEN 'build' THEN 0 ELSE 1 END, t.id;`);
  const [days, settings, rawTasks, problems, projectTasks] = r.recordsets;
  const tasks = markLinked(rawTasks, problems);
  const day = days[0] || null;

  // Day of week: 0 = Mon ... 6 = Sun
  const dow = (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7;
  const start = settings[0]?.start || date;
  const week = Math.floor((Date.parse(date) - Date.parse(start)) / (7 * 86400000)) + 1;
  const inPlan = week >= 1 && week <= 22;

  const required = problems.filter((p) => !p.is_stretch);
  const problemSummary = {
    kind: 'problems',
    solved: required.filter((p) => p.status !== 'todo').length,
    total: required.length,
    selftest: required.some((p) => p.is_selftest),
  };

  const blocks = [];
  for (const tpl of templateFor(dow)) {
    const block = { ...tpl, items: [] };

    if (tpl.area === 'dsa') {
      block.items = tasks
        .filter((t) => day && dsaSlot(t, day.day_type, dow) === tpl.slot)
        .map((t) => ({ kind: 'task', id: t.id, title: t.title, minutes: t.minutes, done: t.done, linked: t.linked }));
      // Problems are solved in the LeetCode block (study days) or the self-test block (Sundays).
      const problemSlot = day?.day_type === 'selftest' ? 'morning' : 'evening';
      if (tpl.slot === problemSlot && problemSummary.total) block.items.push(problemSummary);
      if (!block.items.length) continue; // e.g. no contest before Week 7
    }

    if (tpl.area === 'project') {
      block.title = projectTasks[0] ? `${projectTasks[0].project} (1h at the office)` : tpl.title;
      // Each roadmap day = 📖 learn → 🛠 build (→ ✅ checkpoint on Fridays), each its own tick.
      block.items = projectTasks.flatMap((t) => {
        const base = { kind: 'project', id: t.id, area: t.area, project: t.project };
        if (t.kind === 'checkpoint') return [{ ...base, step: 'checkpoint', title: `✅ Checkpoint: ${t.title}`, done: t.done }];
        return [
          ...(t.learn ? [{ ...base, step: 'learn', title: `📖 ${t.learn}`, done: t.learn_done }] : []),
          { ...base, step: 'build', title: `🛠 ${t.title}`, done: t.done },
        ];
      });
      if (!block.items.length) block.detail = 'No project task today: use it for reading docs, or rest';
    }

    if (tpl.key === 'workout' && inPlan) {
      const w = workoutFor(week, dow);
      block.detail = [w.session, w.phase].filter(Boolean).join(' · ');
    }
    blocks.push(block);
  }

  res.json({ date, dow, week: inPlan ? week : null, focus: day?.focus || null, dayType: day?.day_type || null, blocks });
}));

module.exports = router;
