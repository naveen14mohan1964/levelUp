// AI + FDE learning module: roadmap with progress, today's lesson, streak, and the "stay updated" news feed.
const express = require('express');
const { sql, getPool } = require('../db');
const { ROADMAP, FEEDS, refreshNews } = require('../ai/feeds');
const { computeGame, findLesson } = require('../game');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const num = (v) => (v == null ? null : Number(v));
const LESSONS = ROADMAP.levels.flatMap((l) => l.lessons.map((x) => ({ ...x, level: l.n })));
const BY_ID = new Map(LESSONS.map((l) => [l.id, l]));

// GET /api/ai -> the roadmap with your progress, the next lesson, streak and this week's count
router.get('/ai', wrap(async (req, res) => {
  const pool = await getPool();
  const rows = (await pool.request().query('SELECT lesson_id, done_ms, notes FROM dbo.ai_progress')).recordset;
  const prog = new Map(rows.map((r) => [r.lesson_id, { done_ms: num(r.done_ms), notes: r.notes || '' }]));
  const levels = ROADMAP.levels.map((l) => {
    const lessons = l.lessons.map((x) => ({ ...x, links: x.links.map(([label, url]) => ({ label, url })), done_ms: prog.get(x.id)?.done_ms || null, notes: prog.get(x.id)?.notes || '' }));
    return { n: l.n, title: l.title, goal: l.goal, lessons, done: lessons.filter((x) => x.done_ms).length, total: lessons.length };
  });
  const all = levels.flatMap((l) => l.lessons.map((x) => ({ ...x, level: l.n, levelTitle: l.title })));
  const doneMs = all.map((x) => x.done_ms).filter(Boolean);
  const weekAgo = Date.now() - 7 * 86400000;
  const unread = (await pool.request().query("SELECT COUNT(*) AS n FROM dbo.ai_news WHERE status = 'new'")).recordset[0].n;
  res.json({
    about: ROADMAP.about, levels,
    next: all.find((x) => !x.done_ms) || null,
    progress: { done: doneMs.length, total: all.length, pct: Math.round((doneMs.length / all.length) * 100) },
    streak: (await computeGame(pool)).streak.current, // the app-wide learning streak (any day with 5+ minutes)
    thisWeek: doneMs.filter((t) => t >= weekAgo).length, unreadNews: unread,
  });
}));

// POST /api/ai/lessons/:id { done?, notes? }
router.post('/ai/lessons/:id', wrap(async (req, res) => {
  const lesson = BY_ID.get(req.params.id);
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
  const b = req.body;
  if ('notes' in b && String(b.notes).length > 10000) return res.status(400).json({ error: 'Notes: max 10,000 characters' });
  const pool = await getPool();
  // Lessons unlock one by one: finish the one before first (notes can always be saved)
  if (b.done && findLesson(await computeGame(pool), 'ai', lesson.id).status === 'locked') {
    return res.status(409).json({ error: 'This lesson is still locked: finish the one before it first' });
  }
  const now = Date.now();
  await pool.request().input('id', sql.NVarChar, lesson.id).input('now', sql.BigInt, now)
    .input('hasDone', sql.Bit, 'done' in b).input('done', sql.BigInt, b.done ? now : null)
    .input('hasNotes', sql.Bit, 'notes' in b).input('notes', sql.NVarChar(sql.MAX), 'notes' in b ? String(b.notes) : null)
    .query(`MERGE dbo.ai_progress AS t USING (SELECT @id AS lesson_id) AS s ON t.lesson_id = s.lesson_id
            WHEN MATCHED THEN UPDATE SET
              done_ms = CASE WHEN @hasDone = 1 THEN (CASE WHEN @done IS NULL THEN NULL ELSE COALESCE(t.done_ms, @done) END) ELSE t.done_ms END,
              notes = CASE WHEN @hasNotes = 1 THEN @notes ELSE t.notes END, updated_ms = @now
            WHEN NOT MATCHED THEN INSERT (lesson_id, done_ms, notes, updated_ms)
              VALUES (@id, CASE WHEN @hasDone = 1 THEN @done END, CASE WHEN @hasNotes = 1 THEN @notes END, @now);`);
  res.json({ ok: true });
}));

const NEWS_STATUS = ['new', 'read', 'saved', 'hidden'];

// GET /api/ai/news?status=&source= -> latest items from the official AI blogs
router.get('/ai/news', wrap(async (req, res) => {
  const pool = await getPool();
  const status = NEWS_STATUS.includes(req.query.status) ? req.query.status : null;
  const r = await pool.request().input('st', sql.NVarChar, status).input('src', sql.NVarChar, req.query.source || null).query(`
    SELECT TOP 150 CAST(id AS int) AS id, source, title, url, summary, published_ms, fetched_ms, status FROM dbo.ai_news
    WHERE ((@st IS NULL AND status <> 'hidden') OR status = @st) AND (@src IS NULL OR source = @src)
    ORDER BY COALESCE(published_ms, 0) DESC, id DESC; -- undated items (first fetch of a dateless feed) sort last
    SELECT MAX(fetched_ms) AS last FROM dbo.ai_news;`);
  res.json({
    sources: FEEDS.map((f) => f.source), lastFetched: num(r.recordsets[1][0].last),
    items: r.recordsets[0].map((x) => ({ ...x, published_ms: num(x.published_ms), fetched_ms: num(x.fetched_ms) })),
  });
}));

// PATCH /api/ai/news/:id { status }
router.patch('/ai/news/:id', wrap(async (req, res) => {
  if (!NEWS_STATUS.includes(req.body.status)) return res.status(400).json({ error: `status must be one of ${NEWS_STATUS.join(', ')}` });
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, Number(req.params.id)).input('s', sql.NVarChar, req.body.status).query('UPDATE dbo.ai_news SET status = @s WHERE id = @id');
  if (!r.rowsAffected[0]) return res.status(404).json({ error: 'News item not found' });
  res.json({ ok: true });
}));

// POST /api/ai/news/refresh -> fetch every feed now
router.post('/ai/news/refresh', wrap(async (req, res) => res.json(await refreshNews())));

module.exports = { router, LESSONS };
