// Progress photos from the Progress page or the Telegram bot, plus the optional AI comparison
// (setting progress_ai = 1; off by default because the photos are then sent to Google Gemini).
const fs = require('fs');
const path = require('path');
const { sql } = require('./db');
const meals = require('./meals');
const gemini = require('./gemini');

const POSES = ['front', 'side', 'back'];
const MIME = { '.png': 'image/png', '.webp': 'image/webp', '.heic': 'image/heic', '.heif': 'image/heif' };
const MAX_ATTEMPTS = 6;
const RETRY_MS = 30 * 60 * 1000;
const QUOTA_RETRY_MS = 2 * 60 * 60 * 1000;

let analyzeFn = (...a) => gemini.analyzeProgressPhoto(...a);
let notify = async () => {}; // set by the Telegram bot so it can reply when a photo it received is analysed

const COLS = `CAST(id AS int) AS id, CONVERT(char(10), log_date, 23) AS log_date, pose, photo_path, source,
  ai_status, ai_json, ai_error, ai_attempts`;
const out = (p) => ({ ...p, ai: p.ai_json ? JSON.parse(p.ai_json) : null, ai_json: undefined, photo_url: `/uploads/${p.photo_path}` });

async function aiEnabled(pool) {
  const r = await pool.request().query(`SELECT v FROM dbo.settings WHERE k = 'progress_ai'`);
  return r.recordset[0]?.v === '1' && gemini.isConfigured();
}

/** Saves a photo and queues the AI comparison if it's on. Returns the new row (or the existing one for a repeated Telegram message). */
async function addPhoto(pool, { buffer, mimeType, date, pose, source = 'upload', tgUpdateId = null }) {
  if (tgUpdateId != null) {
    const dup = await pool.request().input('u', sql.BigInt, tgUpdateId).query(`SELECT ${COLS} FROM dbo.progress_photos WHERE tg_update_id = @u`);
    if (dup.recordset[0]) return out(dup.recordset[0]);
  }
  const rel = meals.savePhoto(buffer, mimeType, 'progress', date);
  const status = (await aiEnabled(pool)) ? 'pending' : null;
  const r = await pool.request()
    .input('d', sql.Date, date).input('pose', sql.NVarChar, pose).input('p', sql.NVarChar, rel)
    .input('src', sql.NVarChar, source).input('u', sql.BigInt, tgUpdateId).input('st', sql.NVarChar, status)
    .query(`INSERT INTO dbo.progress_photos (log_date, pose, photo_path, source, tg_update_id, ai_status)
            OUTPUT CAST(INSERTED.id AS int) AS id VALUES (@d, @pose, @p, @src, @u, @st)`);
  return getPhoto(pool, r.recordset[0].id);
}

async function getPhoto(pool, id) {
  const r = await pool.request().input('id', sql.Int, id).query(`SELECT ${COLS} FROM dbo.progress_photos WHERE id = @id`);
  return r.recordset[0] ? out(r.recordset[0]) : null;
}

async function listPhotos(pool) {
  const r = await pool.request().query(`SELECT ${COLS} FROM dbo.progress_photos
    ORDER BY log_date DESC, CASE pose WHEN 'front' THEN 0 WHEN 'side' THEN 1 ELSE 2 END, id DESC`);
  return r.recordset.map(out);
}

const readImage = (rel) => ({
  base64: fs.readFileSync(path.join(meals.UPLOADS, rel)).toString('base64'),
  mimeType: MIME[path.extname(rel).toLowerCase()] || 'image/jpeg',
});

/** Runs the comparison for one photo now. Records success/failure; throws on failure so callers can report it. */
async function analyze(pool, id) {
  const p = await getPhoto(pool, id);
  if (!p) throw Object.assign(new Error('Photo not found'), { status: 404 });
  // The latest earlier photo in the same pose (an earlier day; same-day retakes compare with that too).
  const prev = (await pool.request().input('pose', sql.NVarChar, p.pose).input('d', sql.Date, p.log_date).query(`
    SELECT TOP 1 CONVERT(char(10), log_date, 23) AS log_date, photo_path FROM dbo.progress_photos
    WHERE pose = @pose AND log_date < @d ORDER BY log_date DESC, id DESC`)).recordset[0];
  const ctx = (await pool.request().input('d', sql.Date, p.log_date).query(`
    SELECT (SELECT v FROM dbo.settings WHERE k = 'height_cm') AS height,
           (SELECT TOP 1 weight_kg FROM dbo.body_log WHERE weight_kg IS NOT NULL AND log_date <= @d ORDER BY log_date DESC) AS weight,
           (SELECT TOP 1 waist_cm FROM dbo.body_log WHERE waist_cm IS NOT NULL AND log_date <= @d ORDER BY log_date DESC) AS waist`)).recordset[0];
  const context = [`Adult on a fat-loss plan, height ${ctx.height} cm`, ctx.weight && `latest weight ${Number(ctx.weight)} kg`,
    ctx.waist && `latest waist ${Number(ctx.waist)} cm (tape)`].filter(Boolean).join(', ');

  try {
    const result = await analyzeFn({
      current: { ...readImage(p.photo_path), date: p.log_date },
      previous: prev ? { ...readImage(prev.photo_path), date: prev.log_date } : null,
      pose: p.pose,
      context,
    });
    if (!result.is_body_photo) throw Object.assign(new Error(result.changes?.[0] || "That doesn't look like a progress photo"), { final: true });
    const lo = Math.max(3, Math.min(result.body_fat.low, result.body_fat.high));
    const hi = Math.min(60, Math.max(result.body_fat.low, result.body_fat.high, lo + 5)); // never narrower than 5 points
    const ai = {
      compared_with: prev ? prev.log_date : null,
      changes: (result.changes || []).slice(0, 4),
      body_fat: { low: lo, high: hi, confidence: result.body_fat.confidence === 'medium' ? 'medium' : 'low' },
      consistency_tip: result.consistency_tip, encouragement: result.encouragement,
    };
    await pool.request().input('id', sql.Int, id).input('j', sql.NVarChar(sql.MAX), JSON.stringify(ai))
      .query(`UPDATE dbo.progress_photos SET ai_status = 'done', ai_json = @j, ai_error = NULL, ai_attempts = ai_attempts + 1 WHERE id = @id`);
    return getPhoto(pool, id);
  } catch (e) {
    const attempts = p.ai_attempts + 1;
    const retry = !e.final && attempts < MAX_ATTEMPTS && (e.status === 429 || e.status >= 500 || !e.status);
    await pool.request().input('id', sql.Int, id).input('st', sql.NVarChar, retry ? 'pending' : 'failed')
      .input('err', sql.NVarChar, String(e.message).slice(0, 500)).input('a', sql.Int, attempts)
      .input('next', sql.BigInt, Date.now() + (e.status === 429 ? QUOTA_RETRY_MS : RETRY_MS))
      .query('UPDATE dbo.progress_photos SET ai_status = @st, ai_error = @err, ai_attempts = @a, ai_next_ms = @next WHERE id = @id');
    e.willRetry = retry;
    throw e;
  }
}

/** Analyses every pending photo that's due; the notifier (Telegram) hears about each result. */
let busy = false;
async function processPending(pool) {
  const onResult = (photo, err) => notify(photo, err).catch(() => {});
  if (busy) return 0;
  busy = true;
  let n = 0;
  try {
    const due = await pool.request().input('now', sql.BigInt, Date.now())
      .query(`SELECT CAST(id AS int) AS id FROM dbo.progress_photos WHERE ai_status = 'pending' AND ai_next_ms <= @now ORDER BY id`);
    for (const { id } of due.recordset) {
      try {
        await onResult(await analyze(pool, id), null);
        n++;
      } catch (e) {
        await onResult(await getPhoto(pool, id), e);
      }
    }
  } finally {
    busy = false;
  }
  return n;
}

async function deletePhoto(pool, id) {
  const r = await pool.request().input('id', sql.Int, id).query(`DELETE FROM dbo.progress_photos OUTPUT DELETED.photo_path WHERE id = @id`);
  if (!r.recordset.length) return false;
  fs.rm(path.join(meals.UPLOADS, r.recordset[0].photo_path), { force: true }, () => {});
  return true;
}

module.exports = {
  POSES, addPhoto, getPhoto, listPhotos, analyze, processPending, deletePhoto, aiEnabled,
  setNotifier: (fn) => { notify = fn; },
  _setAnalyzer: (fn) => { analyzeFn = fn; }, // tests only
};
