const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { sql, getPool } = require('../db');
const meals = require('../meals');
const { UPLOADS } = meals;
const { readSettings } = require('./settings');
const { estimateMeal } = require('../gemini');
const { guideFor } = require('../exercise-guide');
const progressPhotos = require('../progress-photos');
const { sessionFor, isDayDone, streak, weightSummary, stepTarget, weekOf, addDays } = require('../workout');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp|heic|heif)$/.test(file.mimetype)),
});
const savePhoto = (file, folder, date) => meals.savePhoto(file.buffer, file.mimetype, folder, date);

function checkDate(req, res) {
  const date = req.params.date;
  if (!ISO_DATE.test(date)) {
    res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    return null;
  }
  return date;
}

async function workoutDone(pool, from, to) {
  const r = await pool.request().input('from', sql.Date, from).input('to', sql.Date, to).query(`
    SELECT CONVERT(char(10), log_date, 23) AS d, item_key FROM dbo.workout_log WHERE log_date BETWEEN @from AND @to`);
  const map = new Map();
  for (const { d, item_key } of r.recordset) {
    if (!map.has(d)) map.set(d, new Set());
    map.get(d).add(item_key);
  }
  return map;
}

/* ----------------------------- workout session ----------------------------- */

// GET /api/workout/day/:date -> the planned session with ticks
router.get('/workout/day/:date', wrap(async (req, res) => {
  const date = checkDate(req, res);
  if (!date) return;
  const { start_date } = await readSettings();
  const pool = await getPool();
  const session = sessionFor(date, start_date);
  const done = (await workoutDone(pool, date, date)).get(date) || new Set();
  const mark = (list) => list.map((i) => ({ ...i, done: done.has(i.key), guide: guideFor(i.name) }));
  res.json({ date, ...session, items: mark(session.items), mini: mark(session.mini), complete: isDayDone(session, done) });
}));

// POST /api/workout/day/:date/toggle { key, done }
router.post('/workout/day/:date/toggle', wrap(async (req, res) => {
  const date = checkDate(req, res);
  if (!date) return;
  const { key, done } = req.body;
  if (!/^(warmup|main|cooldown|mini)-\d+$/.test(key || '')) return res.status(400).json({ error: 'Invalid item key' });
  const pool = await getPool();
  await pool.request().input('d', sql.Date, date).input('k', sql.NVarChar, key).query(done
    ? `IF NOT EXISTS (SELECT 1 FROM dbo.workout_log WHERE log_date = @d AND item_key = @k) INSERT INTO dbo.workout_log (log_date, item_key) VALUES (@d, @k)`
    : `DELETE FROM dbo.workout_log WHERE log_date = @d AND item_key = @k`);
  res.json({ ok: true });
}));

/* ------------------------- daily goals + body log -------------------------- */

const BODY_FIELDS = {
  weight_kg: [30, 300], waist_cm: [40, 250], chest_cm: [40, 250], hips_cm: [40, 250], arm_cm: [15, 80], thigh_cm: [20, 120],
  steps: [0, 100000], water_ml: [0, 10000], sleep_h: [0, 16],
};

async function bodyRow(pool, date) {
  const r = await pool.request().input('d', sql.Date, date).query(`
    SELECT weight_kg, waist_cm, chest_cm, hips_cm, arm_cm, thigh_cm, steps, water_ml, sleep_h, notes
    FROM dbo.body_log WHERE log_date = @d;
    SELECT COALESCE(SUM(calories), 0) AS calories, COALESCE(SUM(protein_g), 0) AS protein_g,
           COALESCE(SUM(carbs_g), 0) AS carbs_g, COALESCE(SUM(fat_g), 0) AS fat_g, COUNT(*) AS meals
    FROM dbo.meals WHERE log_date = @d;`);
  const body = r.recordsets[0][0] || { water_ml: 0 };
  for (const k of Object.keys(body)) if (body[k] != null && k !== 'notes') body[k] = Number(body[k]);
  const eaten = r.recordsets[1][0];
  for (const k of Object.keys(eaten)) eaten[k] = Number(eaten[k]);
  return { body, eaten };
}

// GET /api/goals/:date -> targets for the day + what you've logged so far
router.get('/goals/:date', wrap(async (req, res) => {
  const date = checkDate(req, res);
  if (!date) return;
  const s = await readSettings();
  const pool = await getPool();
  const { body, eaten } = await bodyRow(pool, date);
  const week = weekOf(date, s.start_date);
  res.json({
    date, week, body, eaten,
    targets: {
      calories: s.calorie_target, protein_g: s.protein_target_g, water_ml: s.water_target_ml,
      steps: stepTarget(week), sleep_h: s.sleep_target_h,
    },
  });
}));

// PUT /api/body/:date { weight_kg?, steps?, sleep_h?, waist_cm?, ... } -> partial upsert
router.put('/body/:date', wrap(async (req, res) => {
  const date = checkDate(req, res);
  if (!date) return;
  const updates = {};
  for (const [k, [min, max]] of Object.entries(BODY_FIELDS)) {
    if (!(k in req.body)) continue;
    const v = req.body[k] === '' || req.body[k] === null ? null : Number(req.body[k]);
    if (v !== null && !(v >= min && v <= max)) return res.status(400).json({ error: `${k} must be between ${min} and ${max}` });
    updates[k] = v;
  }
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nothing to update' });
  const pool = await getPool();
  const req2 = pool.request().input('d', sql.Date, date);
  const sets = Object.keys(updates).map((k) => {
    req2.input(k, k === 'steps' || k === 'water_ml' ? sql.Int : sql.Decimal(6, 2), updates[k]);
    return `${k} = @${k}`;
  });
  // Column names come from the BODY_FIELDS whitelist above, never from user input.
  await req2.query(`
    IF NOT EXISTS (SELECT 1 FROM dbo.body_log WHERE log_date = @d) INSERT INTO dbo.body_log (log_date) VALUES (@d);
    UPDATE dbo.body_log SET ${sets.join(', ')} WHERE log_date = @d;`);
  res.json(await bodyRow(pool, date));
}));

// POST /api/body/:date/water { delta_ml } -> +250 / -250 buttons
router.post('/body/:date/water', wrap(async (req, res) => {
  const date = checkDate(req, res);
  if (!date) return;
  const delta = Number(req.body.delta_ml);
  if (!Number.isFinite(delta) || Math.abs(delta) > 2000) return res.status(400).json({ error: 'delta_ml must be within ±2000' });
  const pool = await getPool();
  await pool.request().input('d', sql.Date, date).input('delta', sql.Int, delta).query(`
    IF NOT EXISTS (SELECT 1 FROM dbo.body_log WHERE log_date = @d) INSERT INTO dbo.body_log (log_date) VALUES (@d);
    UPDATE dbo.body_log SET water_ml = CASE WHEN water_ml + @delta < 0 THEN 0 ELSE water_ml + @delta END WHERE log_date = @d;`);
  res.json(await bodyRow(pool, date));
}));

// GET /api/body-history?days=180 -> weights + measurements for charts
router.get('/body-history', wrap(async (req, res) => {
  const days = Math.min(Number(req.query.days) || 180, 800);
  const pool = await getPool();
  const r = await pool.request().input('days', sql.Int, days).query(`
    SELECT CONVERT(char(10), log_date, 23) AS log_date, weight_kg, waist_cm, chest_cm, hips_cm, arm_cm, thigh_cm, steps, water_ml, sleep_h
    FROM dbo.body_log WHERE log_date >= DATEADD(day, -@days, CAST(GETDATE() AS date)) ORDER BY log_date`);
  res.json(r.recordset.map((x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, v == null || k === 'log_date' ? v : Number(v)]))));
}));

// GET /api/workout/summary?date= -> streak, weight stats, badges
router.get('/workout/summary', wrap(async (req, res) => {
  const date = ISO_DATE.test(req.query.date || '') ? req.query.date : new Date().toISOString().slice(0, 10);
  const s = await readSettings();
  const pool = await getPool();
  const done = await workoutDone(pool, addDays(date, -400), date);
  const w = await pool.request().query(`SELECT CONVERT(char(10), log_date, 23) AS log_date, weight_kg FROM dbo.body_log WHERE weight_kg IS NOT NULL`);
  res.json({
    streak: date < s.start_date ? 0 : streak(date, s.start_date, done),
    weight: weightSummary(w.recordset, s.start_weight_kg, s.goal_weight_kg),
  });
}));

/* --------------------------------- meals ---------------------------------- */

const MEAL_COLS = `CAST(id AS int) AS id, CONVERT(char(10), log_date, 23) AS log_date, meal_type, title, calories,
  protein_g, carbs_g, fat_g, items, source, confidence, notes, photo_path, created_at`;
const mealOut = (m) => ({
  ...m, protein_g: Number(m.protein_g), carbs_g: Number(m.carbs_g), fat_g: Number(m.fat_g),
  items: m.items ? JSON.parse(m.items) : [], photo_url: m.photo_path ? `/uploads/${m.photo_path}` : null,
});

router.get('/meals/:date', wrap(async (req, res) => {
  const date = checkDate(req, res);
  if (!date) return;
  const pool = await getPool();
  const r = await pool.request().input('d', sql.Date, date).query(`
    SELECT ${MEAL_COLS} FROM dbo.meals WHERE log_date = @d
    ORDER BY CASE meal_type WHEN 'breakfast' THEN 0 WHEN 'lunch' THEN 1 WHEN 'snack' THEN 2 ELSE 3 END, created_at`);
  res.json(r.recordset.map(mealOut));
}));

// POST /api/meals/analyze (multipart: photo?, note?, date) -> AI estimate to review before saving
router.post('/meals/analyze', upload.single('photo'), wrap(async (req, res) => {
  const date = ISO_DATE.test(req.body.date || '') ? req.body.date : new Date().toISOString().slice(0, 10);
  const note = (req.body.note || '').slice(0, 500);
  if (!req.file && !note.trim()) return res.status(400).json({ error: 'Add a photo or describe what you ate' });

  const s = await readSettings();
  const pool = await getPool();
  const { eaten } = await bodyRow(pool, date);
  const context = `Daily targets ${s.calorie_target} kcal and ${s.protein_target_g} g protein (fat-loss plan, non-vegetarian Indian diet). ` +
    `Already eaten today: ${eaten.calories} kcal, ${eaten.protein_g} g protein.`;

  let estimate;
  try {
    estimate = await estimateMeal({
      imageBase64: req.file ? req.file.buffer.toString('base64') : null,
      mimeType: req.file?.mimetype,
      note,
      context,
    });
  } catch (err) {
    if (err.status === 429) return res.status(429).json({ error: err.message }); // daily free quota used up
    throw err;
  }
  const photo_path = req.file ? savePhoto(req.file, 'meals', date) : null;
  res.json({ estimate, photo_path, photo_url: photo_path ? `/uploads/${photo_path}` : null, source: req.file ? 'ai-photo' : 'ai-text' });
}));

// POST /api/meals { date, meal_type, title, calories, protein_g, carbs_g, fat_g, items?, source?, confidence?, notes?, photo_path? }
router.post('/meals', wrap(async (req, res) => {
  const b = req.body;
  const date = ISO_DATE.test(b.date || '') ? b.date : null;
  if (!date) return res.status(400).json({ error: 'date is required' });
  if (!meals.MEAL_TYPES.includes(b.meal_type)) return res.status(400).json({ error: 'meal_type must be breakfast, lunch, snack or dinner' });
  const cal = Number(b.calories);
  if (!b.title || !(cal >= 0 && cal <= 5000)) return res.status(400).json({ error: 'title and calories (0–5000) are required' });
  if (b.photo_path && !/^meals\/[\w.-]+$/.test(b.photo_path)) return res.status(400).json({ error: 'Invalid photo_path' });
  const pool = await getPool();
  const id = await meals.insertMeal(pool, { ...b, date });
  const row = await pool.request().input('id', sql.Int, id).query(`SELECT ${MEAL_COLS} FROM dbo.meals WHERE id = @id`);
  res.status(201).json(mealOut(row.recordset[0]));
}));

router.delete('/meals/:id', wrap(async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, Number(req.params.id))
    .query(`DELETE FROM dbo.meals OUTPUT DELETED.photo_path WHERE id = @id`);
  if (!r.recordset.length) return res.status(404).json({ error: 'Meal not found' });
  const photo = r.recordset[0].photo_path;
  if (photo) fs.rm(path.join(UPLOADS, photo), { force: true }, () => {});
  res.json({ ok: true });
}));

/* ----------------------------- progress photos ----------------------------- */

router.get('/progress-photos', wrap(async (req, res) => {
  res.json(await progressPhotos.listPhotos(await getPool()));
}));

// POST /api/progress-photos (multipart: photo, date, pose) -> saved; compared by the AI in the background if that's on
router.post('/progress-photos', upload.single('photo'), wrap(async (req, res) => {
  const date = ISO_DATE.test(req.body.date || '') ? req.body.date : null;
  const pose = progressPhotos.POSES.includes(req.body.pose) ? req.body.pose : null;
  if (!req.file || !date || !pose) return res.status(400).json({ error: 'photo (image), date and pose (front/side/back) are required' });
  const pool = await getPool();
  const photo = await progressPhotos.addPhoto(pool, { buffer: req.file.buffer, mimeType: req.file.mimetype, date, pose });
  if (photo.ai_status === 'pending') progressPhotos.processPending(pool).catch(() => {}); // the page polls for the result
  res.status(201).json(photo);
}));

// POST /api/progress-photos/:id/analyze -> run (or re-run) the AI comparison now
router.post('/progress-photos/:id/analyze', wrap(async (req, res) => {
  const pool = await getPool();
  if (!(await progressPhotos.aiEnabled(pool))) return res.status(400).json({ error: 'Turn on AI comparison first (and set GEMINI_API_KEY).' });
  try {
    res.json(await progressPhotos.analyze(pool, Number(req.params.id)));
  } catch (e) {
    res.status(e.status === 404 ? 404 : e.status === 429 ? 429 : 502).json({ error: e.message });
  }
}));

router.delete('/progress-photos/:id', wrap(async (req, res) => {
  if (!(await progressPhotos.deletePhoto(await getPool(), Number(req.params.id)))) return res.status(404).json({ error: 'Photo not found' });
  res.json({ ok: true });
}));

module.exports = { router, UPLOADS };
