const express = require('express');
const { sql, getPool } = require('../db');
const { isConfigured } = require('../gemini');
const { validTimeZone } = require('../checkin/time');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Keys the UI may change. Anything else in the body is ignored.
const EDITABLE = {
  leetcode_username: (v) => String(v).trim().slice(0, 50),
  height_cm: Number, start_weight_kg: Number, goal_weight_kg: Number,
  calorie_target: Number, protein_target_g: Number, water_target_ml: Number, sleep_target_h: Number,
  progress_ai: (v) => (v === true || v === 1 || v === '1' ? '1' : '0'), // on/off switch, stored as text
  // The Mentor (stored as text; a bad value is rejected with 400)
  mentor_enabled: onOff,
  mentor_morning: onOff,
  mentor_telegram: onOff,
  mentor_strictness: (v) => oneOf(v, ['gentle', 'standard', 'drill'], 'mentor_strictness'),
  mentor_eval_time: (v) => time(v, 'mentor_eval_time'),
  mentor_morning_time: (v) => time(v, 'mentor_morning_time'),
  mentor_tz: (v) => { const tz = String(v || '').trim(); if (!validTimeZone(tz)) throw bad('mentor_tz must be a time zone like Asia/Kolkata (or empty for this machine)'); return tz; },
  mentor_pause_until: (v) => { const d = String(v || '').trim(); if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw bad('mentor_pause_until must be YYYY-MM-DD or empty'); return d; },
  mentor_rest_per_month: (v) => whole(v, 0, 10, 'mentor_rest_per_month'),
  mentor_sick_per_month: (v) => whole(v, 0, 10, 'mentor_sick_per_month'),
  mentor_learning_minutes: (v) => whole(v, 5, 240, 'mentor_learning_minutes'),
  mentor_categories: (v) => {
    const all = ['dsa', 'learning', 'project', 'workout', 'nutrition'];
    const list = (Array.isArray(v) ? v : String(v).split(',')).map((x) => String(x).trim()).filter(Boolean);
    if (!list.length || list.some((x) => !all.includes(x))) throw bad(`mentor_categories: choose from ${all.join(', ')}`);
    return [...new Set(list)].join(',');
  },
};

function bad(message) { const e = new Error(message); e.status = 400; return e; }
function onOff(v) { return v === true || v === 1 || v === '1' ? '1' : '0'; }
function oneOf(v, options, k) { if (!options.includes(v)) throw bad(`${k} must be one of: ${options.join(', ')}`); return v; }
function time(v, k) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v))) throw bad(`${k} must be HH:MM (24-hour)`); return String(v); }
function whole(v, min, max, k) { const n = Number(v); if (!Number.isInteger(n) || n < min || n > max) throw bad(`${k} must be a whole number from ${min} to ${max}`); return String(n); }

async function readSettings() {
  const pool = await getPool();
  const { recordset } = await pool.request().query('SELECT k, v FROM dbo.settings');
  const out = {};
  // numbers come back as numbers, except free-text keys and HH:MM / date settings that only look numeric
  for (const { k, v } of recordset) out[k] = v !== null && v !== '' && !Number.isNaN(Number(v)) && k !== 'leetcode_username' && !k.startsWith('mentor_') ? Number(v) : v;
  return out;
}

router.get('/settings', wrap(async (req, res) => {
  res.json({ ...(await readSettings()), gemini_configured: isConfigured() });
}));

router.put('/settings', wrap(async (req, res) => {
  const pool = await getPool();
  for (const [k, clean] of Object.entries(EDITABLE)) {
    if (!(k in req.body)) continue;
    let value;
    try { value = clean(req.body[k]); } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
    if (typeof value === 'number' && (!Number.isFinite(value) || value <= 0)) {
      return res.status(400).json({ error: `${k} must be a positive number` });
    }
    await pool.request().input('k', sql.NVarChar, k).input('v', sql.NVarChar, String(value)).query(`
      MERGE dbo.settings AS t USING (SELECT @k AS k) AS s ON t.k = s.k
      WHEN MATCHED THEN UPDATE SET v = @v WHEN NOT MATCHED THEN INSERT (k, v) VALUES (@k, @v);`);
  }
  res.json({ ...(await readSettings()), gemini_configured: isConfigured() });
}));

module.exports = { router, readSettings };
