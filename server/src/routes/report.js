// GET /api/report/week?start=YYYY-MM-DD -> the weekly report for the Mon–Sun week containing `start` (default: this week)
const express = require('express');
const { getPool } = require('../db');
const { weekReport } = require('../report');
const { localDay, weekStart } = require('../game/days');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.get('/report/week', wrap(async (req, res) => {
  const q = req.query.start;
  if (q != null && (!/^\d{4}-\d{2}-\d{2}$/.test(q) || Number.isNaN(Date.parse(`${q}T00:00:00Z`)))) return res.status(400).json({ error: 'start must be a date: YYYY-MM-DD' });
  res.json(await weekReport(await getPool(), weekStart(q || localDay(Date.now()))));
}));

module.exports = { router };
