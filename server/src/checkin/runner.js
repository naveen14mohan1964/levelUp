// The Mentor's schedule (always-on app only): every minute, finalise the day at the evaluation time and send the
// evening check-in; in the morning window, send today's goals. At most 2 unsolicited messages a day; quiet on rest days
// and in vacation mode. Messages go to the web app, and to Telegram when it's linked and switched on.
const { sql, getPool } = require('../db');
const tg = require('../telegram/api');
const { esc } = require('../telegram/bot');
const { addDays } = require('../game/days');
const { localParts, dueEvaluation, hhmm } = require('./time');
const { mentorSettings, planRange, evaluateDay, catchUp, ensureStarterShield, history, status } = require('./data');
const { buildContext, writeMessage } = require('./messages');

const UNSOLICITED = ['morning', 'evening'];
const MAX_UNSOLICITED_PER_DAY = 2;
const MORNING_WINDOW_MIN = 180; // a morning message more than 3 h late is skipped
const state = { started: false, lastTick: null, lastError: null };

const paused = (s, day) => !!(s.pauseUntil && day <= s.pauseUntil);

async function ownerChat(pool) {
  const r = await pool.request().query("SELECT v FROM dbo.settings WHERE k = 'tg_chat_id'");
  return r.recordset[0]?.v || null;
}

/**
 * Store a message and deliver it. Morning/evening: one of each per day, never more than 2 unsolicited.
 * @param send injected for tests: (chatId, html) => Telegram message
 * @returns the stored row, or { skipped }
 */
async function deliver(pool, { date, kind, level, content, source }, s, { send = tg.sendMessage, telegramOn = tg.isConfigured(), replyMarkup = null } = {}) {
  if (UNSOLICITED.includes(kind)) {
    const r = await pool.request().input('d', sql.Date, date).query(`SELECT kind FROM dbo.mentor_outbox WHERE msg_date = @d AND kind IN ('morning', 'evening')`);
    if (r.recordset.some((x) => x.kind === kind)) return { skipped: `the ${kind} message was already sent` };
    if (r.recordset.length >= MAX_UNSOLICITED_PER_DAY) return { skipped: 'daily limit of 2 mentor messages reached' };
  }
  let channel = 'web';
  let tgId = null;
  if (s.telegram && telegramOn) {
    const chat = await ownerChat(pool);
    if (chat) {
      try {
        const m = await send(Number(chat), esc(content), replyMarkup ? { reply_markup: replyMarkup } : {});
        tgId = m?.message_id ?? null;
        channel = 'telegram';
      } catch (e) {
        state.lastError = `Telegram: ${e.message}`; // still saved for the web app
      }
    }
  }
  const ins = await pool.request().input('d', sql.Date, date).input('k', sql.NVarChar, kind).input('c', sql.NVarChar, channel)
    .input('l', sql.TinyInt, level).input('t', sql.NVarChar(sql.MAX), content).input('s', sql.NVarChar, source)
    .input('tg', sql.BigInt, tgId).input('ms', sql.BigInt, Date.now())
    .query(`INSERT INTO dbo.mentor_outbox (msg_date, kind, channel, level, content, source, tg_message_id, created_ms)
            OUTPUT CAST(INSERTED.id AS int) AS id VALUES (@d, @k, @c, @l, @t, @s, @tg, @ms)`);
  return { id: ins.recordset[0].id, date, kind, channel, level, content, source, tgMessageId: tgId };
}

/** Context + message for a day that was just evaluated (evening) or for today's morning (evaluation = yesterday). */
async function compose(pool, kind, evaluation, s, now, deps = {}) {
  const st = await status(pool, now);
  const prev = (await history(pool, evaluation.date, 1)).at(-1) || null;
  const game = await require('../game').computeGame(pool, now);
  const ctx = buildContext({ kind, evaluation, yesterdayEval: prev, pace: st.pace, streak: game.streak, shields: st.shields, commitments: st.commitments, settings: s });
  const msg = await writeMessage(ctx, deps);
  return { ctx, ...msg };
}

/** One scheduler step (exported for tests: pass `now`). */
async function tick(now = Date.now(), deps = {}) {
  const pool = await getPool();
  const s = await mentorSettings();
  if (!s.enabled) return { idle: 'mentor off' };
  await ensureStarterShield(pool);
  const range = await planRange(pool);
  const { date: today, minutes } = localParts(now, s.tz);
  const out = {};

  // Evening: finalise the due day (catching up silently on anything the laptop slept through)
  const last = (await pool.request().query('SELECT CONVERT(char(10), MAX(eval_date), 23) AS d FROM dbo.mentor_evaluations WHERE final = 1')).recordset[0].d;
  const due = dueEvaluation(now, { tz: s.tz, evalTime: s.evalTime, lastFinal: last });
  if (due) {
    await catchUp(pool, addDays(due, -1), s, range);
    const evaluation = await evaluateDay(pool, due, { final: true, s, range });
    out.evaluated = due;
    // Only tonight's check-in is sent; a day caught up later is folded into the morning message instead
    const scheduled = Object.values(evaluation.results).some((r) => r.status !== 'off'); // e.g. before the plan starts
    if (due === today && scheduled && !evaluation.rest && !paused(s, today)) {
      const m = await compose(pool, 'evening', evaluation, s, now, deps);
      // Level 3 (serious talk): Telegram buttons ask what's blocking you
      const replyMarkup = evaluation.level === 3 ? require('./telegram').blockerKeyboard(today) : null;
      out.evening = await deliver(pool, { date: today, kind: 'evening', level: evaluation.level, content: m.content, source: m.source }, s, { ...deps, replyMarkup });
    }
  }

  // Morning: today's goals + yesterday's commitment, inside the window
  const start = hhmm(s.morningTime) ?? 390;
  const planStarted = !range.start || today >= range.start;
  if (s.morning && planStarted && minutes >= start && minutes < start + MORNING_WINDOW_MIN && !paused(s, today)) {
    const sent = (await pool.request().input('d', sql.Date, today).query("SELECT 1 AS x FROM dbo.mentor_outbox WHERE msg_date = @d AND kind = 'morning'")).recordset.length;
    const rest = (await pool.request().input('d', sql.Date, today).query('SELECT 1 AS x FROM dbo.rest_days WHERE rest_date = @d')).recordset.length;
    if (!sent && !rest) {
      const yesterday = addDays(today, -1);
      await catchUp(pool, addDays(yesterday, -1), s, range);
      const evaluation = await evaluateDay(pool, yesterday, { final: true, s, range }); // credits anything finished after 23:00
      const m = await compose(pool, 'morning', evaluation, s, now, deps);
      out.morning = await deliver(pool, { date: today, kind: 'morning', level: evaluation.level, content: m.content, source: m.source }, s, deps);
    }
  }
  state.lastTick = now;
  return out;
}

function start() {
  if (state.started) return;
  state.started = true;
  const run = () => tick().catch((e) => { state.lastError = e.message; console.warn('Mentor:', e.message); });
  setTimeout(run, 20_000).unref(); // give the app a moment after startup
  setInterval(run, 60_000).unref();
  console.log('Mentor: daily check-ins on (end-of-day evaluation + optional morning message).');
}

module.exports = { start, tick, deliver, compose, state, MAX_UNSOLICITED_PER_DAY };
