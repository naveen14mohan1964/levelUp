const express = require('express');
const { getSprintPack } = require('../neurosprint');

const router = express.Router();

function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// POST /api/neurosprint -> generate or return curated 5-phase neurocognitive sprint pack
router.post('/neurosprint', wrap(async (req, res) => {
  const { track, lessonId, title, learn, check, build } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Title is required' });
  const pack = await getSprintPack({ track, lessonId, title, learn, check, build });
  res.json(pack);
}));

module.exports = { router };
