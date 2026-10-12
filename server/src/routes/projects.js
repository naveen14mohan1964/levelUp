const express = require('express');
const { sql, getPool } = require('../db');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const AREAS = ['node', 'dotnet', 'react'];

const TASK_COLS = `CAST(id AS int) AS id, project_code, week_no, week_title, day_index,
  CONVERT(char(10), plan_date, 23) AS plan_date, kind, learn, learn_links, learn_done, title, done, built_from_scratch, notes, done_at`;
// learn_links is stored as JSON text
const withLinks = (t) => ({ ...t, learn_links: JSON.parse(t.learn_links || '[]') });

// GET /api/projects/:area -> the area's projects, each with its tasks grouped by week
router.get('/projects/:area', wrap(async (req, res) => {
  const { area } = req.params;
  if (!AREAS.includes(area)) return res.status(400).json({ error: `area must be one of ${AREAS.join(', ')}` });
  const pool = await getPool();
  const r = await pool.request().input('area', sql.NVarChar, area).query(`
    SELECT code, area, name, description, stack, resources, repo_url
    FROM dbo.projects WHERE area = @area ORDER BY sort_order;
    SELECT ${TASK_COLS} FROM dbo.project_tasks
    WHERE project_code IN (SELECT code FROM dbo.projects WHERE area = @area)
    ORDER BY plan_date, CASE kind WHEN 'build' THEN 0 ELSE 1 END, id;`);
  const [projects, rawTasks] = r.recordsets;
  const tasks = rawTasks.map(withLinks);

  res.json(projects.map((p) => {
    const own = tasks.filter((t) => t.project_code === p.code);
    const weeks = [];
    for (const t of own) {
      let w = weeks.find((x) => x.week_no === t.week_no);
      if (!w) weeks.push((w = { week_no: t.week_no, title: t.week_title, tasks: [] }));
      w.tasks.push(t);
    }
    return { ...p, stack: JSON.parse(p.stack || '[]'), resources: JSON.parse(p.resources || '[]'), weeks };
  }));
}));

const BOOL_FIELDS = { done: 'done', learn_done: 'learn', built_from_scratch: 'scratch' };

// PATCH /api/project-tasks/:id { done?, learn_done?, built_from_scratch?, notes? } -> the updated row
// Only the fields that were sent change; notes: null clears the notes. done_at is set the first time done goes on
// and cleared when it goes off.
router.patch('/project-tasks/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const sent = Object.keys(BOOL_FIELDS).filter((k) => k in b);
  if (!sent.length && !('notes' in b)) return res.status(400).json({ error: 'Send at least one of done, learn_done, built_from_scratch, notes' });
  for (const k of sent) if (typeof b[k] !== 'boolean') return res.status(400).json({ error: `${k} must be true or false` });
  if ('notes' in b && b.notes !== null && (typeof b.notes !== 'string' || b.notes.length > 10000)) {
    return res.status(400).json({ error: 'notes must be text (max 10,000 characters) or null' });
  }
  const pool = await getPool();
  const r = await pool.request()
    .input('id', sql.Int, id)
    .input('done', sql.Bit, 'done' in b ? b.done : null)
    .input('learn', sql.Bit, 'learn_done' in b ? b.learn_done : null)
    .input('scratch', sql.Bit, 'built_from_scratch' in b ? b.built_from_scratch : null)
    .input('hasNotes', sql.Bit, 'notes' in b)
    .input('notes', sql.NVarChar(sql.MAX), 'notes' in b ? b.notes : null)
    .query(`
      UPDATE dbo.project_tasks SET
        done = COALESCE(@done, done),
        done_at = CASE WHEN @done = 1 THEN COALESCE(done_at, SYSUTCDATETIME()) WHEN @done = 0 THEN NULL ELSE done_at END,
        learn_done = COALESCE(@learn, learn_done),
        built_from_scratch = COALESCE(@scratch, built_from_scratch),
        notes = CASE WHEN @hasNotes = 1 THEN @notes ELSE notes END
      WHERE id = @id;
      SELECT ${TASK_COLS} FROM dbo.project_tasks WHERE id = @id;`);
  const row = r.recordset[0];
  if (!row) return res.status(404).json({ error: 'Project task not found' });
  res.json(withLinks(row));
}));

module.exports = router;
