// AI + FDE learning module: roadmap with progress, today's lesson, streak, and the "stay updated" news feed.
const express = require('express');
const { sql, getPool } = require('../db');
const { ROADMAP, FEEDS, refreshAndRecord, lastRun, nextSlot, RUN_HOUR } = require('../ai/feeds');
const { computeGame, findLesson } = require('../game');
const { fetchArticleText } = require('../ai/article');
const { generateDraft } = require('../linkedin/drafts');
const { liSettings } = require('../linkedin/store');

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
  const unread = (await pool.request().query("SELECT COUNT(*) AS n FROM dbo.ai_news WHERE read_ms IS NULL AND status <> 'hidden'")).recordset[0].n;
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

const NEWS_STATUS = ['new', 'saved', 'hidden']; // 'read' is a separate tick (read_ms); accepted below for old clients
// Each view of the feed, as a WHERE clause (all exclude hidden except Hidden itself)
const NEWS_VIEWS = {
  unread: "read_ms IS NULL AND status <> 'hidden'",
  all: "status <> 'hidden'",
  saved: "status = 'saved'",
  read: "read_ms IS NOT NULL AND status <> 'hidden'",
  hidden: "status = 'hidden'",
};

// GET /api/ai/news?view=unread|all|saved|read|hidden&source=&limit=30&offset=0 -> one page of the items the daily job
// stored, the view counts and the job's schedule. Pages keep the first load small (the whole table is hundreds of posts).
router.get('/ai/news', wrap(async (req, res) => {
  const pool = await getPool();
  const view = NEWS_VIEWS[req.query.view] ? req.query.view : req.query.status === 'saved' || req.query.status === 'hidden' ? req.query.status : 'unread';
  const src = req.query.source || null;
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const r = await pool.request().input('src', sql.NVarChar, src).input('lim', sql.Int, limit).input('off', sql.Int, offset).query(`
    SELECT CAST(n.id AS int) AS id, n.source, n.title, n.url, n.summary, n.published_ms, n.fetched_ms, n.read_ms, n.status,
           (SELECT COUNT(*) FROM dbo.ai_news_posts p WHERE p.news_id = n.id) AS posts
    FROM dbo.ai_news n
    WHERE ${NEWS_VIEWS[view]} AND (@src IS NULL OR source = @src)
    ORDER BY COALESCE(published_ms, 0) DESC, id DESC -- undated items (first fetch of a dateless feed) sort last
    OFFSET @off ROWS FETCH NEXT @lim ROWS ONLY;
    SELECT ${Object.entries(NEWS_VIEWS).map(([k, w]) => `SUM(CASE WHEN ${w} THEN 1 ELSE 0 END) AS [${k}]`).join(', ')}
    FROM dbo.ai_news WHERE (@src IS NULL OR source = @src);
    SELECT MAX(fetched_ms) AS newest FROM dbo.ai_news;`);
  const run = await lastRun(pool);
  res.json({
    view, sources: FEEDS.map((f) => f.source), offset, limit,
    counts: Object.fromEntries(Object.keys(NEWS_VIEWS).map((k) => [k, r.recordsets[1][0][k] || 0])),
    schedule: { hour: RUN_HOUR, lastRun: run, nextRun: nextSlot() },
    newestFetched: num(r.recordsets[2][0].newest),
    items: r.recordsets[0].map((x) => ({ ...x, published_ms: num(x.published_ms), fetched_ms: num(x.fetched_ms), read_ms: num(x.read_ms) })),
  });
}));

// PATCH /api/ai/news/:id { read?: boolean, status?: 'new' | 'saved' | 'hidden' }
router.patch('/ai/news/:id', wrap(async (req, res) => {
  let { read, status } = req.body || {};
  if (status === 'read') { read = true; status = undefined; } // old clients
  if (status !== undefined && !NEWS_STATUS.includes(status)) return res.status(400).json({ error: `status must be one of ${NEWS_STATUS.join(', ')}` });
  if (read !== undefined && typeof read !== 'boolean') return res.status(400).json({ error: 'read must be true or false' });
  if (read === undefined && status === undefined) return res.status(400).json({ error: 'Send read and/or status' });
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, Number(req.params.id)).input('s', sql.NVarChar, status ?? null)
    .input('setRead', sql.Bit, read === undefined ? 0 : 1).input('readMs', sql.BigInt, read ? Date.now() : null).query(`
      UPDATE dbo.ai_news SET status = COALESCE(@s, status),
        read_ms = CASE WHEN @setRead = 1 THEN (CASE WHEN @readMs IS NULL THEN NULL ELSE COALESCE(read_ms, @readMs) END) ELSE read_ms END
      WHERE id = @id`);
  if (!r.rowsAffected[0]) return res.status(404).json({ error: 'News item not found' });
  res.json({ ok: true });
}));

// POST /api/ai/news/read-all { source? } -> tick every unread (visible) item as read
router.post('/ai/news/read-all', wrap(async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().input('src', sql.NVarChar, req.body?.source || null).input('now', sql.BigInt, Date.now())
    .query(`UPDATE dbo.ai_news SET read_ms = @now WHERE ${NEWS_VIEWS.unread} AND (@src IS NULL OR source = @src)`);
  res.json({ ok: true, marked: r.rowsAffected[0] || 0 });
}));

// POST /api/ai/news/refresh -> run the daily job now (it is recorded like a scheduled run)
router.post('/ai/news/refresh', wrap(async (req, res) => res.json(await refreshAndRecord())));

// ---- LinkedIn post ideas from a news item: the post (in your voice), a first comment with the link, and an image prompt
const postOut = (p) => ({ ...p, id: Number(p.id), created_ms: num(p.created_ms) });
const POST_COLS = 'CAST(id AS int) AS id, text, first_comment, image_prompt, image_alt, format, grounded, created_ms';

// GET /api/ai/news/:id/posts -> every post idea written for this item, newest first
router.get('/ai/news/:id/posts', wrap(async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, Number(req.params.id))
    .query(`SELECT ${POST_COLS} FROM dbo.ai_news_posts WHERE news_id = @id ORDER BY created_ms DESC`);
  res.json({ posts: r.recordset.map(postOut) });
}));

// POST /api/ai/news/:id/post { angle? } -> reads the article (falls back to the feed summary), writes a post with Gemini, stores it
router.post('/ai/news/:id/post', wrap(async (req, res) => {
  const pool = await getPool();
  const item = (await pool.request().input('id', sql.Int, Number(req.params.id))
    .query('SELECT CAST(id AS int) AS id, source, title, url, summary, published_ms FROM dbo.ai_news WHERE id = @id')).recordset[0];
  if (!item) return res.status(404).json({ error: 'News item not found' });
  const article = await fetchArticleText(item.url);
  const source = {
    title: item.title, source: item.source, url: item.url,
    published: item.published_ms ? new Date(Number(item.published_ms)).toISOString().slice(0, 10) : null,
    text: article || item.summary || '', grounded: article ? 'article' : 'summary',
  };
  const settings = await liSettings();
  const pillar = settings.li_pillars.find((p) => /ai/i.test(p.name)) || settings.li_pillars[0] || { name: 'AI engineering in practice' };
  let d;
  try {
    d = await generateDraft({ pillar, angle: String(req.body?.angle || '').slice(0, 300), settings, source });
  } catch (err) {
    if (err.status === 429) return res.status(429).json({ error: err.message });
    throw err;
  }
  const r = await pool.request().input('id', sql.Int, item.id).input('text', sql.NVarChar(sql.MAX), d.text)
    .input('fc', sql.NVarChar, (d.first_comment || `Source: ${item.url}`).slice(0, 1000))
    .input('ip', sql.NVarChar, (d.image_prompt || '').slice(0, 2000) || null).input('ia', sql.NVarChar, (d.image_alt || '').slice(0, 400) || null)
    .input('fmt', sql.NVarChar, d.format || null).input('g', sql.NVarChar, source.grounded).input('now', sql.BigInt, Date.now())
    .query(`INSERT INTO dbo.ai_news_posts (news_id, text, first_comment, image_prompt, image_alt, format, grounded, created_ms)
            OUTPUT CAST(INSERTED.id AS int) AS id, INSERTED.text, INSERTED.first_comment, INSERTED.image_prompt, INSERTED.image_alt,
                   INSERTED.format, INSERTED.grounded, INSERTED.created_ms
            VALUES (@id, @text, @fc, @ip, @ia, @fmt, @g, @now)`);
  res.json({ post: postOut(r.recordset[0]) });
}));

module.exports = { router, LESSONS };
