// LinkedIn module API. Phase 1: the 7 → 20 LPA goal and its campaign stages (weekly targets).
const express = require('express');
const { sql, getPool } = require('../db');
const { readSettings } = require('./settings');
const { buildGoalView, validateStage } = require('../linkedin/ladder');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const STAGE_COLS = `CAST(id AS int) AS id, sort_order, name, focus,
  CONVERT(char(10), start_date, 23) AS start_date, CONVERT(char(10), end_date, 23) AS end_date,
  posts_per_week, connections_per_week, messages_per_week, completed`;

async function loadView(date) {
  const s = await readSettings();
  const pool = await getPool();
  const { recordset } = await pool.request().query(`SELECT ${STAGE_COLS} FROM dbo.li_stages`);
  const goal = {
    current_ctc_lpa: Number(s.li_current_ctc_lpa),
    target_ctc_lpa: Number(s.li_target_ctc_lpa),
    target_date: String(s.li_target_date),
    achieved: Number(s.li_goal_achieved) === 1,
  };
  const view = buildGoalView(goal, recordset, date);
  // Actuals for this week (posts from Phase 2; requests and messages arrive in Phases 3–4).
  const [y, m, d] = view.thisWeek.start.split('-').map(Number);
  const from = new Date(y, m - 1, d).getTime();
  const posted = await pool.request().input('from', sql.BigInt, from).input('to', sql.BigInt, from + 7 * 86_400_000)
    .query("SELECT COUNT(*) AS n FROM dbo.li_posts WHERE status = 'posted' AND posted_ms >= @from AND posted_ms < @to");
  const sent = await pool.request().input('from', sql.BigInt, from).input('to', sql.BigInt, from + 7 * 86_400_000)
    .query("SELECT type, COUNT(*) AS n FROM dbo.li_actions WHERE at_ms >= @from AND at_ms < @to AND type IN ('request_sent', 'message_sent') GROUP BY type");
  const by = Object.fromEntries(sent.recordset.map((x) => [x.type, x.n]));
  view.thisWeek.actual = { posts: posted.recordset[0].n, connections: by.request_sent || 0, messages: by.message_sent || 0 };
  return view;
}

async function setSetting(pool, k, v) {
  await pool.request().input('k', sql.NVarChar, k).input('v', sql.NVarChar, String(v)).query(`
    MERGE dbo.settings AS t USING (SELECT @k AS k) AS s ON t.k = s.k
    WHEN MATCHED THEN UPDATE SET v = @v WHEN NOT MATCHED THEN INSERT (k, v) VALUES (@k, @v);`);
}

// GET /api/linkedin/goal?date=YYYY-MM-DD -> goal, stages with status, current stage, this week's targets
router.get('/linkedin/goal', wrap(async (req, res) => {
  const date = ISO_DATE.test(req.query.date || '') ? req.query.date : localToday();
  res.json(await loadView(date));
}));

// PUT /api/linkedin/goal { current_ctc_lpa?, target_ctc_lpa?, target_date?, achieved? }
router.put('/linkedin/goal', wrap(async (req, res) => {
  const s = await readSettings();
  const next = {
    current: req.body.current_ctc_lpa ?? Number(s.li_current_ctc_lpa),
    target: req.body.target_ctc_lpa ?? Number(s.li_target_ctc_lpa),
    date: req.body.target_date ?? String(s.li_target_date),
  };
  const errors = [];
  for (const [k, v] of [['current_ctc_lpa', next.current], ['target_ctc_lpa', next.target]]) {
    if (!(Number(v) > 0 && Number(v) <= 500)) errors.push(`${k} must be a number from 0.1 to 500 (LPA)`);
  }
  if (!errors.length && Number(next.target) <= Number(next.current)) errors.push('target_ctc_lpa must be higher than current_ctc_lpa');
  if (!ISO_DATE.test(next.date)) errors.push('target_date must be YYYY-MM-DD');
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });

  const pool = await getPool();
  await setSetting(pool, 'li_current_ctc_lpa', Number(next.current));
  await setSetting(pool, 'li_target_ctc_lpa', Number(next.target));
  await setSetting(pool, 'li_target_date', next.date);
  if ('achieved' in req.body) await setSetting(pool, 'li_goal_achieved', req.body.achieved ? 1 : 0);
  res.json(await loadView(localToday()));
}));

// POST /api/linkedin/stages -> add a stage at the end
router.post('/linkedin/stages', wrap(async (req, res) => {
  const { errors, value: v } = validateStage(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });
  const pool = await getPool();
  await pool.request()
    .input('name', sql.NVarChar, v.name).input('focus', sql.NVarChar, v.focus)
    .input('start', sql.Date, v.start_date).input('end', sql.Date, v.end_date)
    .input('p', sql.Int, v.posts_per_week).input('c', sql.Int, v.connections_per_week).input('m', sql.Int, v.messages_per_week)
    .query(`INSERT INTO dbo.li_stages (sort_order, name, focus, start_date, end_date, posts_per_week, connections_per_week, messages_per_week)
            VALUES ((SELECT COALESCE(MAX(sort_order), -1) + 1 FROM dbo.li_stages), @name, @focus, @start, @end, @p, @c, @m)`);
  res.status(201).json(await loadView(localToday()));
}));

// PUT /api/linkedin/stages/:id -> edit name, focus, dates and weekly targets
router.put('/linkedin/stages/:id', wrap(async (req, res) => {
  const { errors, value: v } = validateStage(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, Number(req.params.id))
    .input('name', sql.NVarChar, v.name).input('focus', sql.NVarChar, v.focus)
    .input('start', sql.Date, v.start_date).input('end', sql.Date, v.end_date)
    .input('p', sql.Int, v.posts_per_week).input('c', sql.Int, v.connections_per_week).input('m', sql.Int, v.messages_per_week)
    .query(`UPDATE dbo.li_stages SET name = @name, focus = @focus, start_date = @start, end_date = @end,
              posts_per_week = @p, connections_per_week = @c, messages_per_week = @m
            WHERE id = @id`);
  if (!r.rowsAffected[0]) return res.status(404).json({ error: 'Stage not found' });
  res.json(await loadView(localToday()));
}));

// PATCH /api/linkedin/stages/:id/complete { completed }
router.patch('/linkedin/stages/:id/complete', wrap(async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, Number(req.params.id)).input('c', sql.Bit, !!req.body.completed)
    .query('UPDATE dbo.li_stages SET completed = @c WHERE id = @id');
  if (!r.rowsAffected[0]) return res.status(404).json({ error: 'Stage not found' });
  res.json(await loadView(localToday()));
}));

// DELETE /api/linkedin/stages/:id (at least one stage must remain)
router.delete('/linkedin/stages/:id', wrap(async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, Number(req.params.id)).query(`
    IF (SELECT COUNT(*) FROM dbo.li_stages) <= 1 SELECT 'last' AS blocked
    ELSE BEGIN DELETE FROM dbo.li_stages WHERE id = @id; SELECT @@ROWCOUNT AS deleted END`);
  const row = r.recordset[0];
  if (row.blocked) return res.status(400).json({ error: 'Keep at least one stage' });
  if (!row.deleted) return res.status(404).json({ error: 'Stage not found' });
  res.json(await loadView(localToday()));
}));

/* ======================================================================
   Phase 2: weekly post planner, drafts, approval, scheduled publishing
   ====================================================================== */
const { slotTimes, mondayOf, validateSlots, describeSlot } = require('../linkedin/scheduler');
const store = require('../linkedin/store');
const runner = require('../linkedin/runner');
const mcp = require('../linkedin/mcp-client');
const { generateDraft } = require('../linkedin/drafts');

const EDITABLE_STATUSES = ['draft', 'approved', 'failed'];

function pillarFor(pillars, weekStart, slotIndex) {
  if (!pillars.length) return { name: 'General', hint: '' };
  const week = Math.floor(Date.parse(`${weekStart}T00:00:00Z`) / (7 * 86_400_000));
  return pillars[(week * 2 + slotIndex) % pillars.length];
}

function mondayFromQuery(q) {
  if (!ISO_DATE.test(q || '')) return mondayOf(Date.now());
  const [y, m, d] = q.split('-').map(Number);
  return mondayOf(new Date(y, m - 1, d).getTime());
}

async function postInSlot(weekStart, slotIndex) {
  const pool = await getPool();
  const r = await pool.request().input('w', sql.Date, weekStart).input('i', sql.TinyInt, slotIndex)
    .query(`SELECT ${store.POST_COLS} FROM dbo.li_posts WHERE week_start = @w AND slot_index = @i`);
  return store.postOut(r.recordset[0]) || null;
}

// GET /api/linkedin/planner?week=YYYY-MM-DD -> the week's 2 slots with their posts
router.get('/linkedin/planner', wrap(async (req, res) => {
  const s = await store.liSettings();
  const weekStart = mondayFromQuery(req.query.week);
  const times = slotTimes(weekStart, s.li_post_slots);
  const slots = [];
  for (const [index, slot] of s.li_post_slots.entries()) {
    slots.push({ index, label: describeSlot(slot), at_ms: times[index], pillar: pillarFor(s.li_pillars, weekStart, index), post: await postInSlot(weekStart, index) });
  }
  res.json({ week_start: weekStart, slots, paused: s.li_paused, auto_approve: s.li_auto_approve, pillars: s.li_pillars });
}));

/** Approves a post: validates it through the MCP preview, then schedules it (or leaves it 'approved' if no future time). */
async function approve(post, scheduledMs, actor = 'you') {
  const pv = await mcp.preview(post);
  if (!pv.ok) return { error: pv.errors.join('; ') || 'LinkedIn would reject this post', status: 400 };
  const s = await store.liSettings();
  const [slotMs] = slotTimes(post.week_start, [s.li_post_slots[post.slot_index]]);
  const at = Number(scheduledMs) || slotMs;
  await store.cancelJobs('publish_post', post.id);
  if (at <= Date.now() + 30_000) {
    const updated = await store.updatePost(post.id, { status: 'approved', scheduled_ms: null, error: null });
    await store.audit(actor, 'post_approved', 'post', post.id, 'slot time has passed: pick a time or publish now');
    return { post: updated, warnings: pv.warnings };
  }
  const updated = await store.updatePost(post.id, { status: 'scheduled', scheduled_ms: at, error: null });
  await store.enqueue('publish_post', post.id, at);
  await store.audit(actor, 'post_scheduled', 'post', post.id, new Date(at).toLocaleString('en-IN'));
  return { post: updated, warnings: pv.warnings };
}

// POST /api/linkedin/posts { week_start, slot_index, mode: 'ai' | 'manual', pillar?, angle?, text? }
router.post('/linkedin/posts', wrap(async (req, res) => {
  const { mode = 'ai', angle = '' } = req.body;
  const weekStart = mondayFromQuery(req.body.week_start);
  const slotIndex = Number(req.body.slot_index);
  if (![0, 1].includes(slotIndex)) return res.status(400).json({ error: 'slot_index must be 0 or 1' });
  const existing = await postInSlot(weekStart, slotIndex);
  if (existing && !EDITABLE_STATUSES.includes(existing.status)) {
    return res.status(409).json({ error: `This slot already has a ${existing.status} post. Unschedule it first.` });
  }
  const s = await store.liSettings();
  const pillar = s.li_pillars.find((p) => p.name === req.body.pillar) || pillarFor(s.li_pillars, weekStart, slotIndex);

  let text;
  let draftMeta = null; // AI only: the format used and a suggested first comment
  if (mode === 'manual') {
    text = String(req.body.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Write some text first' });
  } else {
    try {
      const d = await generateDraft({ pillar, angle: String(angle).slice(0, 500), settings: s, format: req.body.format });
      text = d.text;
      draftMeta = { format: d.format, firstComment: d.first_comment, imagePrompt: d.image_prompt, imageAlt: d.image_alt };
    } catch (err) {
      if (err.status === 429) return res.status(429).json({ error: err.message });
      throw err;
    }
  }

  const pool = await getPool();
  const now = Date.now();
  if (existing) await store.cancelJobs('publish_post', existing.id);
  await pool.request()
    .input('w', sql.Date, weekStart).input('i', sql.TinyInt, slotIndex).input('pillar', sql.NVarChar, pillar.name)
    .input('angle', sql.NVarChar, String(angle).slice(0, 500) || null).input('text', sql.NVarChar(sql.MAX), text.slice(0, 3000))
    .input('ai', sql.Bit, mode !== 'manual').input('now', sql.BigInt, now)
    .query(`MERGE dbo.li_posts AS t USING (SELECT @w AS week_start, @i AS slot_index) AS s
            ON t.week_start = s.week_start AND t.slot_index = s.slot_index
            WHEN MATCHED THEN UPDATE SET pillar = @pillar, angle = @angle, text = @text, ai_generated = @ai, status = 'draft',
              scheduled_ms = NULL, error = NULL, updated_ms = @now
            WHEN NOT MATCHED THEN INSERT (week_start, slot_index, pillar, angle, text, ai_generated, status, created_ms, updated_ms)
              VALUES (@w, @i, @pillar, @angle, @text, @ai, 'draft', @now, @now);`);
  let post = await postInSlot(weekStart, slotIndex);
  // AI drafts come with an image prompt + alt text (same AI call). An image you already attached stays.
  if (draftMeta?.imagePrompt) {
    post = await store.updatePost(post.id, { image_prompt: draftMeta.imagePrompt, ...(post.image_path ? {} : { image_alt: draftMeta.imageAlt || null }) });
  }
  await store.audit(mode === 'manual' ? 'you' : 'ai', mode === 'manual' ? 'draft_written' : 'draft_generated', 'post', post.id, pillar.name);

  // Auto-approve is off by default; when you turn it on, AI drafts are scheduled straight away.
  if (s.li_auto_approve && mode !== 'manual') {
    const r = await approve(post, null, 'auto');
    if (!r.error) return res.status(201).json({ post: r.post, warnings: r.warnings, autoApproved: true, draft: draftMeta });
  }
  res.status(201).json({ post, draft: draftMeta });
}));

// PUT /api/linkedin/posts/:id { text?, pillar?, angle? } -> editing a scheduled post sends it back to draft (re-approve)
router.put('/linkedin/posts/:id', wrap(async (req, res) => {
  const post = await store.getPost(Number(req.params.id));
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.status === 'posted') return res.status(409).json({ error: 'Already posted: edit it on LinkedIn instead' });
  const text = req.body.text !== undefined ? String(req.body.text).trim() : post.text;
  if (!text) return res.status(400).json({ error: 'Text cannot be empty' });
  if (text.length > 3000) return res.status(400).json({ error: `Post is ${text.length} characters; LinkedIn allows 3000` });
  await store.cancelJobs('publish_post', post.id);
  const changed = text !== post.text;
  const updated = await store.updatePost(post.id, {
    text, pillar: req.body.pillar ?? post.pillar, angle: req.body.angle ?? post.angle,
    ...(changed || post.status === 'scheduled' ? { status: 'draft', scheduled_ms: null } : {}),
  });
  if (changed) await store.audit('you', 'draft_edited', 'post', post.id);
  res.json({ post: updated });
}));

/* --------------------------- post images (you attach) --------------------------- */
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { UPLOADS } = require('../meals');
const IMG_DIR = path.join(UPLOADS, 'linkedin');
fs.mkdirSync(IMG_DIR, { recursive: true });
const IMG_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif' }; // what LinkedIn's Images API accepts
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, !!IMG_EXT[file.mimetype]),
});

/** Image or alt text changed: an approved/scheduled post goes back to draft, so you re-approve exactly what's published. */
async function imageChanged(post, fields) {
  await store.cancelJobs('publish_post', post.id);
  return store.updatePost(post.id, { ...fields, ...(['approved', 'scheduled', 'failed'].includes(post.status) ? { status: 'draft', scheduled_ms: null } : {}) });
}
const removeFile = (rel) => rel && fs.rm(path.join(UPLOADS, rel), { force: true }, () => {});

// POST /api/linkedin/posts/:id/image (multipart: image, alt?) -> attach the image you generated
router.post('/linkedin/posts/:id/image', imageUpload.single('image'), wrap(async (req, res) => {
  const post = await store.getPost(Number(req.params.id));
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.status === 'posted') return res.status(409).json({ error: 'Already posted: images can only be added before publishing' });
  if (!req.file) return res.status(400).json({ error: 'Attach a JPG, PNG or GIF up to 8 MB (LinkedIn accepts these formats)' });
  const rel = `linkedin/post-${post.id}-${crypto.randomBytes(4).toString('hex')}${IMG_EXT[req.file.mimetype]}`;
  fs.writeFileSync(path.join(UPLOADS, rel), req.file.buffer);
  removeFile(post.image_path);
  const alt = String(req.body.alt || post.image_alt || '').trim().slice(0, 300) || null;
  const updated = await imageChanged(post, { image_path: rel, image_alt: alt });
  await store.audit('you', 'image_attached', 'post', post.id);
  res.status(201).json({ post: updated });
}));

// PUT /api/linkedin/posts/:id/image { alt } -> edit the alt text
router.put('/linkedin/posts/:id/image', wrap(async (req, res) => {
  const post = await store.getPost(Number(req.params.id));
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.status === 'posted') return res.status(409).json({ error: 'Already posted' });
  const alt = String(req.body.alt || '').trim().slice(0, 300) || null;
  if (alt === (post.image_alt || null)) return res.json({ post });
  res.json({ post: post.image_path ? await imageChanged(post, { image_alt: alt }) : await store.updatePost(post.id, { image_alt: alt }) });
}));

// DELETE /api/linkedin/posts/:id/image
router.delete('/linkedin/posts/:id/image', wrap(async (req, res) => {
  const post = await store.getPost(Number(req.params.id));
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.status === 'posted') return res.status(409).json({ error: 'Already posted' });
  if (!post.image_path) return res.json({ post });
  removeFile(post.image_path);
  res.json({ post: await imageChanged(post, { image_path: null }) });
}));

// POST /api/linkedin/posts/:id/image-prompt -> a fresh image prompt from the post's current text
router.post('/linkedin/posts/:id/image-prompt', wrap(async (req, res) => {
  const post = await store.getPost(Number(req.params.id));
  if (!post) return res.status(404).json({ error: 'Post not found' });
  let out;
  try {
    out = await require('../linkedin/drafts').generateImagePrompt(post.text);
  } catch (err) {
    if (err.status === 429) return res.status(429).json({ error: err.message });
    throw err;
  }
  res.json({ post: await store.updatePost(post.id, { image_prompt: out.image_prompt, ...(post.image_alt ? {} : { image_alt: out.image_alt }) }) });
}));

// POST /api/linkedin/posts/:id/approve { scheduled_ms? }
router.post('/linkedin/posts/:id/approve', wrap(async (req, res) => {
  const post = await store.getPost(Number(req.params.id));
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (!['draft', 'approved', 'failed', 'scheduled'].includes(post.status)) return res.status(409).json({ error: `Can't approve a ${post.status} post` });
  if (req.body.scheduled_ms && Number(req.body.scheduled_ms) < Date.now()) return res.status(400).json({ error: 'Pick a time in the future (or use Publish now)' });
  const r = await approve(post, req.body.scheduled_ms);
  if (r.error) return res.status(r.status).json({ error: r.error });
  res.json(r);
}));

// POST /api/linkedin/posts/:id/unschedule -> back to draft
router.post('/linkedin/posts/:id/unschedule', wrap(async (req, res) => {
  const post = await store.getPost(Number(req.params.id));
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (!['scheduled', 'approved', 'failed'].includes(post.status)) return res.status(409).json({ error: `Can't unschedule a ${post.status} post` });
  await store.cancelJobs('publish_post', post.id);
  const updated = await store.updatePost(post.id, { status: 'draft', scheduled_ms: null, error: null });
  await store.audit('you', 'post_unscheduled', 'post', post.id);
  res.json({ post: updated });
}));

// POST /api/linkedin/posts/:id/publish-now -> queue it for right now and run the scheduler immediately
router.post('/linkedin/posts/:id/publish-now', wrap(async (req, res) => {
  const s = await store.liSettings();
  if (s.li_paused) return res.status(409).json({ error: 'LinkedIn automation is paused (kill switch). Resume it first.' });
  const post = await store.getPost(Number(req.params.id));
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.status === 'posted') return res.status(409).json({ error: 'Already posted' });
  if (post.status === 'draft') return res.status(409).json({ error: 'Approve the draft first' });
  const pv = await mcp.preview(post);
  if (!pv.ok) return res.status(400).json({ error: pv.errors.join('; ') });
  await store.cancelJobs('publish_post', post.id);
  const now = Date.now();
  await store.updatePost(post.id, { status: 'scheduled', scheduled_ms: now, error: null });
  await store.enqueue('publish_post', post.id, now);
  await store.audit('you', 'post_publish_now', 'post', post.id);
  await runner.tick();
  res.json({ post: await store.getPost(post.id) });
}));

// DELETE /api/linkedin/posts/:id (not for posted ones)
router.delete('/linkedin/posts/:id', wrap(async (req, res) => {
  const post = await store.getPost(Number(req.params.id));
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.status === 'posted') return res.status(409).json({ error: 'Already posted: delete it on LinkedIn' });
  await store.cancelJobs('publish_post', post.id);
  const pool = await getPool();
  await pool.request().input('id', sql.Int, post.id).query('DELETE FROM dbo.li_posts WHERE id = @id');
  removeFile(post.image_path);
  await store.audit('you', 'post_deleted', 'post', post.id);
  res.json({ ok: true });
}));

// GET/PUT /api/linkedin/config -> slots, pillars, voice samples, auto-approve, employer guard
router.get('/linkedin/config', wrap(async (req, res) => {
  const s = await store.liSettings();
  res.json({
    slots: s.li_post_slots, pillars: s.li_pillars, voice_samples: s.li_voice_samples || '', auto_approve: s.li_auto_approve,
    paused: s.li_paused, avoid_employer: s.li_avoid_employer, employer_name: s.li_employer_name || '', mcp_path: mcp.MCP_PATH,
    // Phase 3 outreach
    daily_cap: s.li_daily_cap, weekly_cap: s.li_weekly_cap, work_start: s.li_work_start, work_end: s.li_work_end, work_days: s.li_work_days,
    delay_min_s: s.li_delay_min_s, delay_max_s: s.li_delay_max_s, premium: s.li_premium, note_budget_month: s.li_note_budget_month,
    my_intro: s.li_my_intro || '', note_template: s.li_note_template || '',
    build_log: s.li_build_log || '', years_experience: Number(s.li_years_experience) || 2,
    formats: Object.entries(require('../linkedin/drafts').FORMATS).map(([key, v]) => ({ key, label: v.label })),
  });
}));

router.put('/linkedin/config', wrap(async (req, res) => {
  const b = req.body;
  const errors = [];
  if ('slots' in b) errors.push(...validateSlots(b.slots));
  if ('pillars' in b) {
    if (!Array.isArray(b.pillars) || b.pillars.length < 1 || b.pillars.length > 8) errors.push('Keep 1 to 8 pillars');
    else if (b.pillars.some((p) => !String(p.name || '').trim() || String(p.name).length > 100)) errors.push('Every pillar needs a name (max 100 characters)');
  }
  if ('voice_samples' in b && String(b.voice_samples).length > 20000) errors.push('Voice samples: max 20,000 characters');
  // Outreach safety settings
  const int = (v, lo, hi) => Number.isInteger(Number(v)) && Number(v) >= lo && Number(v) <= hi;
  if ('daily_cap' in b && !int(b.daily_cap, 1, 30)) errors.push('Daily cap must be 1–30');
  if ('weekly_cap' in b && !int(b.weekly_cap, 1, 100)) errors.push("Weekly cap must be 1–100 (LinkedIn's own limit is about 100 per week)");
  if ('daily_cap' in b && 'weekly_cap' in b && Number(b.daily_cap) > Number(b.weekly_cap)) errors.push('Daily cap cannot exceed the weekly cap');
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
  if ('work_start' in b && !hhmm.test(b.work_start)) errors.push('Outreach start must be HH:MM');
  if ('work_end' in b && !hhmm.test(b.work_end)) errors.push('Outreach end must be HH:MM');
  if ('work_start' in b && 'work_end' in b && b.work_start >= b.work_end) errors.push('Outreach hours: start must be before end');
  if ('work_days' in b && (!Array.isArray(b.work_days) || !b.work_days.length || b.work_days.some((d) => !int(d, 0, 6)))) errors.push('Pick at least one outreach day');
  if ('delay_min_s' in b && !int(b.delay_min_s, 10, 600)) errors.push('Minimum pause must be 10–600 seconds');
  if ('delay_max_s' in b && !int(b.delay_max_s, 10, 900)) errors.push('Maximum pause must be 10–900 seconds');
  if ('delay_min_s' in b && 'delay_max_s' in b && Number(b.delay_min_s) > Number(b.delay_max_s)) errors.push('Minimum pause cannot exceed the maximum');
  if ('note_budget_month' in b && !int(b.note_budget_month, 0, 100)) errors.push('Monthly note budget must be 0–100');
  if ('my_intro' in b && String(b.my_intro).length > 300) errors.push('Your intro: max 300 characters');
  if ('build_log' in b && String(b.build_log).length > 6000) errors.push('What you have built: max 6,000 characters');
  if ('years_experience' in b && !(Number(b.years_experience) >= 0 && Number(b.years_experience) <= 40)) errors.push('Years of experience: 0–40');
  if ('note_template' in b && String(b.note_template).length > 400) errors.push('Note template: max 400 characters');
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });

  if ('slots' in b) await store.setSetting('li_post_slots', b.slots.map((x) => ({ day: x.day, time: x.time })));
  if ('pillars' in b) await store.setSetting('li_pillars', b.pillars.map((p) => ({ name: String(p.name).trim(), hint: String(p.hint || '').trim().slice(0, 300) })));
  if ('voice_samples' in b) await store.setSetting('li_voice_samples', String(b.voice_samples));
  if ('build_log' in b) await store.setSetting('li_build_log', String(b.build_log).trim());
  if ('years_experience' in b) await store.setSetting('li_years_experience', String(Number(b.years_experience)));
  if ('auto_approve' in b) await store.setSetting('li_auto_approve', !!b.auto_approve);
  if ('avoid_employer' in b) await store.setSetting('li_avoid_employer', !!b.avoid_employer);
  if ('employer_name' in b) await store.setSetting('li_employer_name', String(b.employer_name).slice(0, 100));
  const OUTREACH = { daily_cap: 'li_daily_cap', weekly_cap: 'li_weekly_cap', work_start: 'li_work_start', work_end: 'li_work_end', delay_min_s: 'li_delay_min_s', delay_max_s: 'li_delay_max_s', note_budget_month: 'li_note_budget_month', my_intro: 'li_my_intro', note_template: 'li_note_template' };
  for (const [k, key] of Object.entries(OUTREACH)) if (k in b) await store.setSetting(key, String(b[k]).trim());
  if ('work_days' in b) await store.setSetting('li_work_days', [...new Set(b.work_days.map(Number))].sort());
  if ('premium' in b) await store.setSetting('li_premium', !!b.premium);
  await store.audit('you', 'config_updated', 'config', null, Object.keys(b).join(', '));
  res.redirect(303, '/api/linkedin/config');
}));

// POST /api/linkedin/pause { paused } -> the global kill switch for all LinkedIn automation
router.post('/linkedin/pause', wrap(async (req, res) => {
  await store.setSetting('li_paused', !!req.body.paused);
  await store.audit('you', req.body.paused ? 'automation_paused' : 'automation_resumed', 'config', null);
  res.json({ paused: !!req.body.paused });
}));

// GET /api/linkedin/activity -> audit log + queue
router.get('/linkedin/activity', wrap(async (req, res) => {
  const pool = await getPool();
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const r = await pool.request().input('n', sql.Int, limit).query(`
    SELECT TOP (@n) CAST(id AS int) AS id, at_ms, actor, action, ref_type, CAST(ref_id AS int) AS ref_id, detail FROM dbo.li_audit ORDER BY id DESC;
    SELECT TOP 50 CAST(id AS int) AS id, type, CAST(ref_id AS int) AS ref_id, run_ms, status, attempts, max_attempts, last_error
      FROM dbo.li_jobs ORDER BY id DESC;`);
  const n = (x) => ({ ...x, at_ms: x.at_ms != null ? Number(x.at_ms) : undefined, run_ms: x.run_ms != null ? Number(x.run_ms) : undefined });
  res.json({ audit: r.recordsets[0].map(n), jobs: r.recordsets[1].map(n) });
}));

// GET /api/linkedin/mcp-status -> is the LinkedIn MCP reachable and logged in?
/* ------------------------- in-app LinkedIn connector ------------------------- */
const conn = require('../linkedin/connection');
const localOnly = (req, res) => {
  if (conn.isLocal(req)) return true;
  res.status(403).json({ error: 'For safety, LinkedIn keys and logins can only be changed on the laptop itself (http://localhost:4000).' });
  return false;
};

// GET /api/linkedin/connection -> keys set?, connected?, name, days left, login in progress
router.get('/linkedin/connection', wrap(async (req, res) => {
  res.json({ ...(await conn.status()), local: conn.isLocal(req) });
}));

const EXPORT_STALE_DAYS = 30;

// GET /api/linkedin/connector -> everything on the Connector tab: your account, your imported network, sync history
router.get('/linkedin/connector', wrap(async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN status <> 'not_contacted' AND status <> 'requested' THEN 1 ELSE 0 END) AS connected,
           SUM(CASE WHEN company_id IS NOT NULL THEN 1 ELSE 0 END) AS atTargets,
           SUM(CASE WHEN source = 'csv' THEN 1 ELSE 0 END) AS fromExport
    FROM dbo.li_contacts WHERE do_not_contact = 0;
    SELECT TOP 12 CAST(id AS int) AS id, at_ms, file_name, rows_read, added, merged, unchanged, moved, accepted, skipped
    FROM dbo.ref_imports ORDER BY at_ms DESC;
    SELECT COUNT(DISTINCT company_id) AS n FROM dbo.li_contacts WHERE company_id IS NOT NULL AND do_not_contact = 0;`);
  const history = r.recordsets[1].map((h) => ({ ...h, at_ms: Number(h.at_ms) }));
  const last = history[0] || null;
  const daysSince = last ? Math.floor((Date.now() - last.at_ms) / 86_400_000) : null;
  const n = r.recordsets[0][0];
  res.json({
    connection: { ...(await conn.status()), local: conn.isLocal(req) },
    network: {
      contacts: n.total, connected: n.connected || 0, atTargets: n.atTargets || 0, fromExport: n.fromExport || 0,
      companiesCovered: r.recordsets[2][0].n,
      lastImport: last, daysSinceImport: daysSince,
      stale: daysSince == null || daysSince > EXPORT_STALE_DAYS, staleAfterDays: EXPORT_STALE_DAYS,
    },
    history,
  });
}));

// PUT /api/linkedin/connection/keys { client_id, client_secret } -> saved to linkedin-mcp/.env on this computer
router.put('/linkedin/connection/keys', wrap(async (req, res) => {
  if (!localOnly(req, res)) return;
  try {
    conn.saveKeys(String(req.body.client_id || '').trim(), String(req.body.client_secret || '').trim());
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
  await store.audit('you', 'linkedin_keys_saved', 'config', null, 'Developer app keys saved locally');
  res.json(await conn.status());
}));

// POST /api/linkedin/connection/connect -> { url } of LinkedIn's approval page; the page polls /connection until done
router.post('/linkedin/connection/connect', wrap(async (req, res) => {
  if (!localOnly(req, res)) return;
  try {
    res.json({ url: await conn.startLogin() });
  } catch (e) {
    res.status(e.status || 502).json({ error: e.message });
  }
}));

// POST /api/linkedin/connection/disconnect -> deletes the saved login (keys stay)
router.post('/linkedin/connection/disconnect', wrap(async (req, res) => {
  if (!localOnly(req, res)) return;
  await conn.disconnect();
  await store.audit('you', 'linkedin_disconnected', 'config', null, null);
  res.json(await conn.status());
}));

router.get('/linkedin/mcp-status', wrap(async (req, res) => {
  try {
    res.json({ reachable: true, ...(await mcp.status()) });
  } catch (err) {
    res.json({ reachable: false, connected: false, text: `Couldn't start the LinkedIn MCP at ${mcp.MCP_PATH}: ${err.message}` });
  }
}));

module.exports = router;
