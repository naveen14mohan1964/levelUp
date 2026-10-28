// The focus guard's loud alarm, from this laptop only (never over the network):
//   POST   /api/guard/loud { on }        Windows volume to 100% (unmuted) while you look away / back to yours
//   GET    /api/guard/sounds             your own alarm sounds (server/uploads/sounds, never committed: uploads/ is gitignored)
//   POST   /api/guard/sounds  (file)     add one (MP3 / WAV / OGG / M4A, ≤ 8 MB)
//   DELETE /api/guard/sounds/:name       remove one
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const volume = require('../system-volume');
const { isLocal } = require('../linkedin/connection');
const { UPLOADS } = require('../meals');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const SOUNDS = path.join(UPLOADS, 'sounds');
const AUDIO = /^audio\/(mpeg|mp3|wav|x-wav|wave|ogg|mp4|x-m4a|aac|webm)$/;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 }, fileFilter: (req, file, cb) => cb(null, AUDIO.test(file.mimetype)) });
const local = (req, res, next) => (isLocal(req) ? next() : res.status(403).json({ error: 'Only from this laptop' }));
/** A safe file name: letters, digits, spaces, dashes; keeps the extension. */
const safeName = (name) => {
  const ext = (path.extname(name || '').toLowerCase().match(/^\.(mp3|wav|ogg|m4a|aac|webm)$/) || [])[0] || '.mp3';
  const base = path.basename(name || 'sound', path.extname(name || '')).replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'sound';
  return base + ext;
};

router.post('/guard/loud', local, wrap(async (req, res) => {
  try {
    res.json(req.body?.on ? await volume.boost() : await volume.restore());
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
}));

router.get('/guard/sounds', wrap(async (req, res) => {
  const files = fs.existsSync(SOUNDS) ? fs.readdirSync(SOUNDS).filter((f) => /\.(mp3|wav|ogg|m4a|aac|webm)$/i.test(f)) : [];
  res.json({ sounds: files.map((f) => ({ name: f, url: `/uploads/sounds/${encodeURIComponent(f)}`, size: fs.statSync(path.join(SOUNDS, f)).size })) });
}));

router.post('/guard/sounds', local, upload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose an audio file (MP3, WAV, OGG or M4A, up to 8 MB)' });
  fs.mkdirSync(SOUNDS, { recursive: true });
  const name = safeName(req.file.originalname);
  fs.writeFileSync(path.join(SOUNDS, name), req.file.buffer);
  res.status(201).json({ name, url: `/uploads/sounds/${encodeURIComponent(name)}` });
}));

router.delete('/guard/sounds/:name', local, wrap(async (req, res) => {
  const name = safeName(req.params.name);
  if (name !== req.params.name) return res.status(400).json({ error: 'Bad file name' });
  const file = path.join(SOUNDS, name);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
  fs.rmSync(file);
  res.json({ ok: true });
}));

module.exports = { router, safeName };
