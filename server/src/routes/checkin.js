// The Mentor's daily check-ins: status + message history, and a test message for trying the voice.
const express = require('express');
const { sql, getPool } = require('../db');
const { status, evaluateDay, mentorSettings } = require('../checkin/data');
const { compose, deliver } = require('../checkin/runner');
const { isLocal } = require('../linkedin/connection');
const actions = require('../checkin/actions');
const { localDate } = require('../checkin/time');

// Validation errors from the actions carry a status (400 / 404 / 409)
const act = (fn) => wrap(async (req, res) => {
  try { res.json(await fn(req, res)); } catch (e) { if (e.status) return res.status(e.status).json({ error: e.message }); throw e; }
});
const todayLocal = async () => localDate(Date.now(), (await mentorSettings()).tz);

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

async function messages(pool, limit = 30) {
  const r = await pool.request().input('n', sql.Int, limit).query(`
    SELECT TOP (@n) CAST(id AS int) AS id, CONVERT(char(10), msg_date, 23) AS date, kind, channel, level, content, source, created_ms
    FROM dbo.mentor_outbox ORDER BY id DESC`);
  return r.recordset.map((m) => ({ ...m, created_ms: Number(m.created_ms) }));
}

// GET /api/checkin -> today so far (per goal category), recent days, escalation level, shields, rest days,
// commitments, plan vs actual and the mentor's latest messages. Past days without a final evaluation are evaluated first.
router.get('/checkin', wrap(async (req, res) => {
  const pool = await getPool();
  res.json({ ...(await status(pool)), messages: await messages(pool) });
}));

// POST /api/checkin/test-message -> what the mentor would say about today so far (from this laptop only).
// Stored as a "test" message: it doesn't count toward the 2-a-day limit. Sent to Telegram too when it's on.
router.post('/checkin/test-message', wrap(async (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Test messages can only be sent from this laptop' });
  const pool = await getPool();
  const s = await mentorSettings();
  const now = Date.now();
  const today = (await status(pool, now)).today.date;
  const evaluation = await evaluateDay(pool, today, { final: false, s });
  const m = await compose(pool, 'evening', evaluation, s, now);
  const sent = await deliver(pool, { date: today, kind: 'test', level: evaluation.level, content: m.content, source: m.source }, s);
  res.json({ ...sent, note: m.reason || null });
}));

// POST /api/checkin/commitments { date, category, planned_at, place? } · DELETE /api/checkin/commitments/:id
router.post('/checkin/commitments', act(async (req) => actions.addCommitment(await getPool(), { date: req.body.date, category: req.body.category, plannedAt: req.body.planned_at, place: req.body.place })));
router.delete('/checkin/commitments/:id', act(async (req) => { await actions.removeCommitment(await getPool(), req.params.id); return { ok: true }; }));

// POST /api/checkin/rest { date, kind: rest|sick, note? } · DELETE /api/checkin/rest/:date (limited per month; rest days in advance)
router.post('/checkin/rest', act(async (req) => actions.setRest(await getPool(), { date: req.body.date, kind: req.body.kind, note: req.body.note }, await todayLocal())));
router.delete('/checkin/rest/:date', act(async (req) => { await actions.removeRest(await getPool(), req.params.date, await todayLocal()); return { ok: true }; }));

// POST /api/checkin/reason { date?, reason?, blocker? } -> the mentor's answer (saved to the message history, shown in the app)
router.post('/checkin/reason', act(async (req) => {
  const pool = await getPool();
  const date = req.body.date || await actions.currentDay(pool);
  const r = await actions.mentorReply(pool, { date, reason: req.body.reason, blocker: req.body.blocker });
  const s = await mentorSettings();
  const saved = await deliver(pool, { date: await todayLocal(), kind: 'reply', level: r.level, content: r.content, source: r.source }, { ...s, telegram: false });
  return { ...saved, shift: r.shift };
}));

// GET /api/checkin/shift -> what a plan shift would move · POST /api/checkin/shift { confirm: true } -> do it
router.get('/checkin/shift', act(async () => actions.proposeShift(await getPool(), await todayLocal())));
router.post('/checkin/shift', act(async (req) => {
  if (req.body.confirm !== true) { const e = new Error('Send { confirm: true } to shift the plan'); e.status = 400; throw e; }
  return actions.applyShift(await getPool(), await todayLocal());
}));

module.exports = { router };
