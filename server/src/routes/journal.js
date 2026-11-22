// Daily check-in + journal: one optional entry per day (mood, a one-line note, four short reflections).
const express = require('express');
const { sql, getPool } = require('../db');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// text field -> longest allowed length
const TEXT = { note: 500, accomplished: 1000, learned: 1000, improve: 1000, grateful: 1000 };
const EMPTY = { mood: null, note: null, accomplished: null, learned: null, improve: null, grateful: null };
const validDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));

async function readEntry(pool, date) {
  const r = await pool.request().input('d', sql.Date, date).query(`
    SELECT CAST(mood AS int) AS mood, note, accomplished, learned, improve, grateful, CAST(updated_ms AS float) AS updatedMs
    FROM dbo.journal WHERE entry_date = @d`);
  return r.recordset[0] || null;
}

// GET /api/journal?days=30 -> { entries: [...] } the days that have an entry, newest first
router.get('/journal', wrap(async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 366);
  const r = await (await getPool()).request().input('n', sql.Int, days).query(`
    SELECT CONVERT(char(10), entry_date, 23) AS date, CAST(mood AS int) AS mood, note, accomplished, learned, improve, grateful
    FROM dbo.journal WHERE entry_date >= DATEADD(day, -@n, CAST(GETDATE() AS date)) ORDER BY entry_date DESC`);
  res.json({ entries: r.recordset });
}));

// GET /api/journal/:date -> { date, saved, mood, note, accomplished, learned, improve, grateful }
router.get('/journal/:date', wrap(async (req, res) => {
  const { date } = req.params;
  if (!validDate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  const entry = await readEntry(await getPool(), date);
  res.json({ date, saved: !!entry, ...EMPTY, ...entry });
}));

// PUT /api/journal/:date { mood?, note?, accomplished?, learned?, improve?, grateful? } -> the saved entry.
// Only the fields you send change; an empty string (or null) clears that field.
router.put('/journal/:date', wrap(async (req, res) => {
  const { date } = req.params;
  if (!validDate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  const body = req.body || {};
  const changes = {};
  if ('mood' in body) {
    if (body.mood !== null && ![1, 2, 3].includes(body.mood)) return res.status(400).json({ error: 'mood must be 1 (tough), 2 (okay), 3 (great) or null' });
    changes.mood = body.mood;
  }
  for (const [k, max] of Object.entries(TEXT)) {
    if (!(k in body)) continue;
    if (body[k] !== null && typeof body[k] !== 'string') return res.status(400).json({ error: `${k} must be text` });
    const text = (body[k] || '').trim();
    if (text.length > max) return res.status(400).json({ error: `${k} can be at most ${max} characters` });
    changes[k] = text || null;
  }
  if (!Object.keys(changes).length) return res.status(400).json({ error: 'Send at least one of: mood, note, accomplished, learned, improve, grateful' });

  const pool = await getPool();
  const next = { ...EMPTY, ...(await readEntry(pool, date)), ...changes };
  const q = pool.request().input('d', sql.Date, date).input('mood', sql.TinyInt, next.mood).input('now', sql.BigInt, Date.now());
  for (const k of Object.keys(TEXT)) q.input(k, sql.NVarChar, next[k]);
  await q.query(`
    MERGE dbo.journal AS t USING (SELECT @d AS entry_date) AS s ON t.entry_date = s.entry_date
    WHEN MATCHED THEN UPDATE SET mood = @mood, note = @note, accomplished = @accomplished, learned = @learned, improve = @improve, grateful = @grateful, updated_ms = @now
    WHEN NOT MATCHED THEN INSERT (entry_date, mood, note, accomplished, learned, improve, grateful, updated_ms)
      VALUES (@d, @mood, @note, @accomplished, @learned, @improve, @grateful, @now);`);
  res.json({ date, saved: true, ...EMPTY, ...(await readEntry(pool, date)) });
}));

module.exports = { router };
