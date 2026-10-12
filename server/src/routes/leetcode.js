const express = require('express');
const { getPool } = require('../db');
const { fetchProfile, syncLeetCode } = require('../leetcode');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// GET /api/leetcode/profile/:username -> checks the username exists (used by Settings before saving)
router.get('/leetcode/profile/:username', wrap(async (req, res) => {
  const profile = await fetchProfile(req.params.username);
  if (!profile) return res.status(404).json({ error: `LeetCode user "${req.params.username}" not found` });
  res.json(profile);
}));

// POST /api/leetcode/sync -> run a sync now
router.post('/leetcode/sync', wrap(async (req, res) => {
  res.json(await syncLeetCode());
}));

// GET /api/leetcode/status -> last sync summary
router.get('/leetcode/status', wrap(async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().query(`SELECT k, v FROM dbo.settings WHERE k IN ('leetcode_username', 'leetcode_last_sync')`);
  const map = Object.fromEntries(r.recordset.map((x) => [x.k, x.v]));
  res.json({ username: map.leetcode_username || '', lastSync: map.leetcode_last_sync ? JSON.parse(map.leetcode_last_sync) : null });
}));

module.exports = router;
