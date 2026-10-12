const express = require('express');
const { sql, getPool } = require('../db');
const { isConfigured } = require('../gemini');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Keys the UI may change. Anything else in the body is ignored.
const EDITABLE = {
  leetcode_username: (v) => String(v).trim().slice(0, 50),
  height_cm: Number, start_weight_kg: Number, goal_weight_kg: Number,
  calorie_target: Number, protein_target_g: Number, water_target_ml: Number, sleep_target_h: Number,
  progress_ai: (v) => (v === true || v === 1 || v === '1' ? '1' : '0'), // on/off switch, stored as text
};

async function readSettings() {
  const pool = await getPool();
  const { recordset } = await pool.request().query('SELECT k, v FROM dbo.settings');
  const out = {};
  for (const { k, v } of recordset) out[k] = v !== null && v !== '' && !Number.isNaN(Number(v)) && k !== 'leetcode_username' ? Number(v) : v;
  return out;
}

router.get('/settings', wrap(async (req, res) => {
  res.json({ ...(await readSettings()), gemini_configured: isConfigured() });
}));

router.put('/settings', wrap(async (req, res) => {
  const pool = await getPool();
  for (const [k, clean] of Object.entries(EDITABLE)) {
    if (!(k in req.body)) continue;
    const value = clean(req.body[k]);
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
