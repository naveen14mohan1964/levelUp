const express = require('express');
const { getPool } = require('../db');
const runner = require('../telegram/runner');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// GET /api/telegram -> is the bot set up, linked, healthy; recent meals it received
router.get('/telegram', wrap(async (req, res) => {
  res.json(await runner.info(await getPool()));
}));

// POST /api/telegram/pair -> a one-time code + a link that sends "/start <code>" to your bot
router.post('/telegram/pair', wrap(async (req, res) => {
  const pool = await getPool();
  const info = await runner.info(pool);
  if (!info.configured) return res.status(400).json({ error: 'Add TELEGRAM_BOT_TOKEN to server/.env first, then run npm run app:update.' });
  const code = await runner.newPairCode(pool);
  res.json({ code, link: info.botUsername ? `https://t.me/${info.botUsername}?start=${code}` : null });
}));

// POST /api/telegram/unlink -> the bot stops accepting meals until you pair again
router.post('/telegram/unlink', wrap(async (req, res) => {
  const pool = await getPool();
  await runner.setSetting(pool, 'tg_chat_id', '');
  await runner.setSetting(pool, 'tg_pair_code', '');
  res.json(await runner.info(pool));
}));

// POST /api/telegram/retry -> estimate pending meals now (e.g. after the AI quota resets)
router.post('/telegram/retry', wrap(async (req, res) => {
  const pool = await getPool();
  await pool.request().query(`UPDATE dbo.tg_inbox SET next_try_ms = 0 WHERE status = 'pending'`);
  const logged = await runner.processInbox(pool);
  res.json({ logged, ...(await runner.info(pool)) });
}));

module.exports = router;
