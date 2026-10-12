// Meal storage shared by the Meals page and the Telegram meal bot.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { sql } = require('./db');

// Photos are stored on this machine only: server/uploads/{meals,progress}/...
const UPLOADS = path.join(__dirname, '..', 'uploads');
for (const dir of ['meals', 'progress']) fs.mkdirSync(path.join(UPLOADS, dir), { recursive: true });

const MEAL_TYPES = ['breakfast', 'lunch', 'snack', 'dinner'];
const EXT = { 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic', 'image/heif': '.heif' };

/** Writes an image buffer under uploads/<folder> and returns its relative path. */
function savePhoto(buffer, mimeType, folder, date) {
  const rel = `${folder}/${date}-${crypto.randomBytes(4).toString('hex')}${EXT[mimeType] || '.jpg'}`;
  fs.writeFileSync(path.join(UPLOADS, rel), buffer);
  return rel;
}

/** Inserts one meal and returns its id. Callers validate first. */
async function insertMeal(pool, m) {
  const r = await pool.request()
    .input('d', sql.Date, m.date).input('type', sql.NVarChar, m.meal_type).input('title', sql.NVarChar, String(m.title).slice(0, 200))
    .input('cal', sql.Int, Math.round(Number(m.calories)))
    .input('p', sql.Decimal(6, 1), Number(m.protein_g) || 0).input('c', sql.Decimal(6, 1), Number(m.carbs_g) || 0).input('f', sql.Decimal(6, 1), Number(m.fat_g) || 0)
    .input('items', sql.NVarChar(sql.MAX), m.items ? JSON.stringify(m.items) : null)
    .input('source', sql.NVarChar, ['ai-photo', 'ai-text', 'manual'].includes(m.source) ? m.source : 'manual')
    .input('conf', sql.NVarChar, m.confidence || null).input('notes', sql.NVarChar(sql.MAX), m.notes || null)
    .input('photo', sql.NVarChar, m.photo_path || null)
    .query(`INSERT INTO dbo.meals (log_date, meal_type, title, calories, protein_g, carbs_g, fat_g, items, source, confidence, notes, photo_path)
            OUTPUT CAST(INSERTED.id AS int) AS id
            VALUES (@d, @type, @title, @cal, @p, @c, @f, @items, @source, @conf, @notes, @photo)`);
  return r.recordset[0].id;
}

/** What has been eaten on a date. */
async function dayTotals(pool, date) {
  const r = await pool.request().input('d', sql.Date, date).query(`
    SELECT COALESCE(SUM(calories), 0) AS calories, COALESCE(SUM(protein_g), 0) AS protein_g,
           COALESCE(SUM(carbs_g), 0) AS carbs_g, COALESCE(SUM(fat_g), 0) AS fat_g, COUNT(*) AS meals
    FROM dbo.meals WHERE log_date = @d`);
  return Object.fromEntries(Object.entries(r.recordset[0]).map(([k, v]) => [k, Number(v)]));
}

module.exports = { UPLOADS, MEAL_TYPES, savePhoto, insertMeal, dayTotals };
