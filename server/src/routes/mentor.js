const express = require('express');
const { sql, getPool } = require('../db');
const { ask, buildContext, loadThread } = require('../mentor');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// general | mock | review | problem:<id> | lesson:<taskId> | plan:<YYYY-MM-DD>
const THREAD = /^(general|mock|review|problem:\d+|lesson:\d+|plan:\d{4}-\d{2}-\d{2})$/;
const MODES = ['chat', 'hint', 'explain', 'review', 'plan', 'mock'];

// The user's bubble shows the short label; the full prompt (after the marker) is only for the model.
const forDisplay = (m) => ({ ...m, content: m.role === 'user' ? m.content.split('\n\n<!--prompt-->')[0] : m.content });

// GET /api/mentor/context -> what the mentor currently knows about your progress
router.get('/mentor/context', wrap(async (req, res) => {
  res.json(await buildContext(/^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : undefined));
}));

router.get('/mentor/thread/:thread', wrap(async (req, res) => {
  if (!THREAD.test(req.params.thread)) return res.status(400).json({ error: 'Invalid thread' });
  res.json((await loadThread(req.params.thread)).map(forDisplay));
}));

router.delete('/mentor/thread/:thread', wrap(async (req, res) => {
  if (!THREAD.test(req.params.thread)) return res.status(400).json({ error: 'Invalid thread' });
  const pool = await getPool();
  await pool.request().input('t', sql.NVarChar, req.params.thread).query('DELETE FROM dbo.mentor_messages WHERE thread = @t');
  res.json({ ok: true });
}));

// POST /api/mentor/ask { thread, mode, message?, problemId?, level?, taskId?, topic?, area?, code?, language?, energy?, hours? }
router.post('/mentor/ask', wrap(async (req, res) => {
  const { thread, mode } = req.body;
  if (!THREAD.test(thread || '')) return res.status(400).json({ error: 'Invalid thread' });
  if (!MODES.includes(mode || 'chat')) return res.status(400).json({ error: `mode must be one of ${MODES.join(', ')}` });
  if (req.body.message && req.body.message.length > 8000) return res.status(400).json({ error: 'Message is too long (max 8,000 characters)' });
  try {
    const result = await ask(req.body);
    res.json({ ...result, messages: (await loadThread(thread)).map(forDisplay) });
  } catch (err) {
    if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
    throw err;
  }
}));

module.exports = router;
