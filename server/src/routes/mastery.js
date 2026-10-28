// Pattern mastery, company readiness and system design drills.
//   GET  /api/patterns                -> { today, patterns, picks: { today, tomorrow } }
//   GET  /api/readiness               -> { about, readyAt, profiles, companies }
//   GET  /api/drills                  -> prompts, steps, suggested, running, history, avg
//   POST /api/drills { prompt }       -> start (abandons an unfinished one)
//   GET  /api/drills/:id              -> one drill (+ its prompt with key points)
//   PUT  /api/drills/:id { answers }  -> autosave while it runs
//   POST /api/drills/:id/finish { answers, checked } -> score + flashcards
//   POST /api/drills/:id/feedback     -> one Gemini call (optional)
const express = require('express');
const { getPool } = require('../db');
const { loadPatterns, picks, readiness } = require('../mastery');
const drills = require('../drills');
const { computeGame } = require('../game');
const { localDay } = require('../game/days');
const gemini = require('../gemini');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.get('/patterns', wrap(async (req, res) => {
  const pool = await getPool();
  const today = localDay(Date.now());
  const patterns = await loadPatterns(pool, today);
  res.json({ today, patterns, picks: await picks(pool, patterns, today) });
}));

router.get('/readiness', wrap(async (req, res) => {
  const pool = await getPool();
  const today = localDay(Date.now());
  const [patterns, game, avg] = await Promise.all([loadPatterns(pool, today), computeGame(pool), drills.drillAvg(pool)]);
  const tracks = Object.fromEntries(game.tracks.map((t) => [t.key, t]));
  res.json({ ...(await readiness(pool, { patterns, tracks, drillAvg: avg })), drillAvg: avg == null ? null : Math.round(avg * 100) });
}));

router.get('/drills', wrap(async (req, res) => res.json(await drills.overview(await getPool()))));

router.post('/drills', wrap(async (req, res) => {
  const p = drills.promptByKey(req.body?.prompt);
  if (!p) return res.status(400).json({ error: `Unknown prompt. Use one of: ${drills.DRILLS.prompts.map((x) => x.key).join(', ')}` });
  const d = await drills.start(await getPool(), p.key);
  res.status(201).json({ drill: d, prompt: p, steps: drills.STEPS });
}));

router.get('/drills/:id', wrap(async (req, res) => {
  const d = await drills.getDrill(await getPool(), Number(req.params.id));
  if (!d) return res.status(404).json({ error: 'Drill not found' });
  res.json({ drill: d, prompt: drills.promptByKey(d.prompt), steps: drills.STEPS });
}));

router.put('/drills/:id', wrap(async (req, res) => {
  if (!(await drills.save(await getPool(), Number(req.params.id), req.body?.answers))) return res.status(409).json({ error: 'That drill is finished or gone' });
  res.json({ ok: true });
}));

router.post('/drills/:id/finish', wrap(async (req, res) => {
  const out = await drills.finish(await getPool(), Number(req.params.id), req.body || {});
  if (!out) return res.status(404).json({ error: 'Drill not found' });
  res.json(out);
}));

router.post('/drills/:id/feedback', wrap(async (req, res) => {
  if (!gemini.isConfigured()) return res.status(400).json({ error: 'AI feedback needs GEMINI_API_KEY in server/.env' });
  try {
    const d = await drills.aiFeedback(await getPool(), Number(req.params.id), gemini.generate);
    if (!d) return res.status(409).json({ error: 'Finish the drill first' });
    res.json({ drill: d });
  } catch (e) {
    res.status(e.status === 429 ? 429 : 502).json({ error: e.message });
  }
}));

module.exports = { router };
