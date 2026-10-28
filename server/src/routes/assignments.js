// Course assignments explained (the .NET Patterns Lab): content from server/data/private/assignments/*.json
// (company course material: gitignored, stays on this laptop), your "I understand this" ticks in the database,
// and a read-only code viewer for the assignment's own folder (local only).
//   GET  /api/assignments                      -> [{ key, title, course, due, tasks, understood }]
//   GET  /api/assignments/:key                 -> the full walkthrough + your progress
//   POST /api/assignments/:key/tasks/:id { understood }
//   GET  /api/assignments/:key/code?path=src/... -> { path, text } (files inside the assignment folder only)
const express = require('express');
const fs = require('fs');
const path = require('path');
const { sql, getPool } = require('../db');
const { isLocal } = require('../linkedin/connection');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const DIR = path.join(__dirname, '..', '..', 'data', 'private', 'assignments');
const CODE_EXT = /\.(cs|md|csproj|sln|json)$/i;

function load(key) {
  if (!/^[a-z0-9-]+$/.test(key)) return null;
  const file = path.join(DIR, `${key}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}
function all() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => load(f.replace(/\.json$/, ''))).filter(Boolean);
}
const taskIds = (a) => a.sections.flatMap((s) => s.tasks.map((t) => t.id));

async function progress(pool, key) {
  const r = await pool.request().input('k', sql.NVarChar, key)
    .query('SELECT task_id, understood, updated_ms FROM dbo.assignment_progress WHERE assignment_key = @k');
  return Object.fromEntries(r.recordset.map((x) => [x.task_id, { understood: !!x.understood, at: Number(x.updated_ms) }]));
}

router.get('/assignments', wrap(async (req, res) => {
  const pool = await getPool();
  const out = [];
  for (const a of all()) {
    const p = await progress(pool, a.key);
    const ids = taskIds(a);
    out.push({ key: a.key, title: a.title, course: a.course, modules: a.modules, due: a.due, tasks: ids.length, understood: ids.filter((id) => p[id]?.understood).length });
  }
  res.json(out);
}));

router.get('/assignments/:key', wrap(async (req, res) => {
  const a = load(req.params.key);
  if (!a) return res.status(404).json({ error: 'Assignment not found (its content file lives in server/data/private/assignments)' });
  const { root, ...rest } = a; // the folder path stays on the server
  res.json({ ...rest, hasCode: !!root && fs.existsSync(root), progress: await progress(await getPool(), a.key) });
}));

router.post('/assignments/:key/tasks/:id', wrap(async (req, res) => {
  const a = load(req.params.key);
  if (!a || !taskIds(a).includes(req.params.id)) return res.status(404).json({ error: 'Task not found' });
  await (await getPool()).request().input('k', sql.NVarChar, a.key).input('t', sql.NVarChar, req.params.id)
    .input('u', sql.Bit, req.body?.understood === true).input('now', sql.BigInt, Date.now())
    .query(`MERGE dbo.assignment_progress AS d USING (SELECT @k AS k, @t AS t) AS s ON d.assignment_key = s.k AND d.task_id = s.t
            WHEN MATCHED THEN UPDATE SET understood = @u, updated_ms = @now
            WHEN NOT MATCHED THEN INSERT (assignment_key, task_id, understood, updated_ms) VALUES (@k, @t, @u, @now);`);
  res.json({ ok: true });
}));

// Only from this laptop, only files inside the assignment folder, only source/doc files.
router.get('/assignments/:key/code', wrap(async (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Only from this laptop' });
  const a = load(req.params.key);
  if (!a?.root) return res.status(404).json({ error: 'Assignment not found' });
  const rel = String(req.query.path || '');
  const root = path.resolve(a.root);
  const file = path.resolve(root, rel);
  if (!file.startsWith(root + path.sep) || !CODE_EXT.test(file)) return res.status(400).json({ error: 'Not a file of this assignment' });
  if (!fs.existsSync(file)) return res.status(404).json({ error: `${rel} not found in the assignment folder` });
  res.json({ path: rel, text: fs.readFileSync(file, 'utf8'), vscode: `vscode://file/${file.replace(/\\/g, '/')}` });
}));

module.exports = { router, load };
