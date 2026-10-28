// Flashcards: the deck + today's queue, reviewing a card, and adding / editing / deleting your own cards.
const express = require('express');
const { sql, getPool } = require('../db');
const { GRADES, TRACK_LABEL, deck, review } = require('../cards');
const { localDay } = require('../game/days');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// GET /api/cards -> { today, due: [...], counts, byTrack, cards }
router.get('/cards', wrap(async (req, res) => res.json(await deck(await getPool()))));

// POST /api/cards/:id/review { grade: again | hard | good | easy } -> the card's next schedule
router.post('/cards/:id/review', wrap(async (req, res) => {
  const grade = GRADES[req.body?.grade];
  if (!grade) return res.status(400).json({ error: 'grade must be again, hard, good or easy' });
  const r = await review(await getPool(), Number(req.params.id), grade);
  if (!r) return res.status(404).json({ error: 'Card not found' });
  res.json(r);
}));

function cardBody(b) {
  const front = String(b?.front || '').trim();
  const back = String(b?.back || '').trim();
  const track = b?.track || 'ai';
  if (!front || !back) return { error: 'A card needs a front and a back' };
  if (front.length > 500 || back.length > 2000) return { error: 'Front: 500 characters max, back: 2000' };
  if (!TRACK_LABEL[track]) return { error: `track must be one of ${Object.keys(TRACK_LABEL).join(', ')}` };
  return { front, back, track };
}

// POST /api/cards { track, front, back } -> your own card, due today
router.post('/cards', wrap(async (req, res) => {
  const c = cardBody(req.body);
  if (c.error) return res.status(400).json(c);
  const r = await (await getPool()).request().input('t', sql.NVarChar, c.track).input('f', sql.NVarChar, c.front).input('b', sql.NVarChar, c.back)
    .input('due', sql.Date, localDay(Date.now())).input('now', sql.BigInt, Date.now())
    .query(`INSERT INTO dbo.flashcards (track, source, front, back, due, created_ms) OUTPUT CAST(INSERTED.id AS int) AS id
            VALUES (@t, 'mine', @f, @b, @due, @now)`);
  res.status(201).json({ id: r.recordset[0].id });
}));

// PUT /api/cards/:id { front, back, track } -> edit a card's text (its schedule stays; lesson cards keep their track)
router.put('/cards/:id', wrap(async (req, res) => {
  const c = cardBody(req.body);
  if (c.error) return res.status(400).json(c);
  const r = await (await getPool()).request().input('id', sql.Int, Number(req.params.id)).input('t', sql.NVarChar, c.track)
    .input('f', sql.NVarChar, c.front).input('b', sql.NVarChar, c.back)
    .query('UPDATE dbo.flashcards SET front = @f, back = @b, track = CASE WHEN lesson_ref IS NULL THEN @t ELSE track END WHERE id = @id; SELECT @@ROWCOUNT AS n');
  if (!r.recordset[0].n) return res.status(404).json({ error: 'Card not found' });
  res.json({ ok: true });
}));

// DELETE /api/cards/:id -> only your own cards (a lesson card belongs to its lesson)
router.delete('/cards/:id', wrap(async (req, res) => {
  const r = await (await getPool()).request().input('id', sql.Int, Number(req.params.id)).query(`
    DELETE FROM dbo.flashcards WHERE id = @id AND source IN ('mine', 'drill');
    IF @@ROWCOUNT > 0 BEGIN DELETE FROM dbo.flashcard_reviews WHERE card_id = @id; SELECT 1 AS n; END ELSE SELECT 0 AS n;`);
  if (!r.recordset[0].n) return res.status(404).json({ error: 'Not one of your own cards (a lesson card stays while its lesson is done)' });
  res.json({ ok: true });
}));

module.exports = { router };
