// What you can do with the Mentor, shared by the web app and Telegram:
// commitments, rest / sick days, telling it why (reason or blocker → it answers), and the confirmed plan shift.
const { sql } = require('../db');
const { addDays, daysBetween } = require('../game/days');
const { CATEGORIES } = require('./rules');
const { localParts, hhmm } = require('./time');
const { mentorSettings, evaluateDay, history } = require('./data');

const BLOCKERS = ['time', 'energy', 'difficulty', 'motivation'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function fail(message, status = 400) { const e = new Error(message); e.status = status; return e; }

/** Commitment: "for_date at HH:MM (place): category". */
async function addCommitment(pool, { date, category, plannedAt, place }) {
  if (!DAY.test(date || '')) throw fail('date must be YYYY-MM-DD');
  if (!CATEGORIES.includes(category)) throw fail(`category must be one of ${CATEGORIES.join(', ')}`);
  if (hhmm(plannedAt) == null) throw fail('time must be HH:MM (24-hour)');
  const r = await pool.request().input('d', sql.Date, date).input('c', sql.NVarChar, category).input('t', sql.NVarChar, plannedAt)
    .input('p', sql.NVarChar, place ? String(place).slice(0, 100) : null).input('ms', sql.BigInt, Date.now())
    .query(`DELETE FROM dbo.mentor_commitments WHERE for_date = @d AND category = @c AND fulfilled IS NULL; -- one per goal per day: the newest wins
            INSERT INTO dbo.mentor_commitments (for_date, category, planned_at, place, created_ms)
            OUTPUT CAST(INSERTED.id AS int) AS id VALUES (@d, @c, @t, @p, @ms)`);
  return { id: r.recordset[0].id, date, category, planned_at: plannedAt, place: place || null, fulfilled: null };
}

async function removeCommitment(pool, id) {
  const r = await pool.request().input('id', sql.Int, Number(id)).query('DELETE FROM dbo.mentor_commitments WHERE id = @id AND fulfilled IS NULL; SELECT @@ROWCOUNT AS n');
  if (!r.recordset[0].n) throw fail('Commitment not found (or already checked)', 404);
}

/**
 * Rest / sick day. Rest days are planned in advance (tomorrow or later); a sick day can be today.
 * Each has a monthly limit (settings), so planned rest stays planned.
 */
async function setRest(pool, { date, kind, note }, today) {
  const s = await mentorSettings();
  if (!['rest', 'sick'].includes(kind)) throw fail('kind must be rest or sick');
  if (!DAY.test(date || '')) throw fail('date must be YYYY-MM-DD');
  if (kind === 'rest' && date <= today) throw fail('Plan rest days in advance: tomorrow or later (a sick day can be today)');
  if (kind === 'sick' && date < today) throw fail("Sick days can't be added for past days");
  if (date > addDays(today, 60)) throw fail('Plan rest days at most 60 days ahead');
  const month = date.slice(0, 7);
  const r = await pool.request().input('a', sql.Date, `${month}-01`).input('d', sql.Date, date).input('k', sql.NVarChar, kind).query(`
    SELECT COUNT(*) AS n FROM dbo.rest_days WHERE kind = @k AND rest_date >= @a AND rest_date < DATEADD(month, 1, @a) AND rest_date <> @d;
    SELECT kind FROM dbo.rest_days WHERE rest_date = @d;`);
  const limit = kind === 'rest' ? s.restPerMonth : s.sickPerMonth;
  if (r.recordsets[0][0].n >= limit) throw fail(`You've used all ${limit} ${kind} days for ${month}`, 409);
  await pool.request().input('d', sql.Date, date).input('k', sql.NVarChar, kind).input('n', sql.NVarChar, note ? String(note).slice(0, 200) : null).input('ms', sql.BigInt, Date.now())
    .query(`MERGE dbo.rest_days AS t USING (SELECT @d AS rest_date) AS s ON t.rest_date = s.rest_date
            WHEN MATCHED THEN UPDATE SET kind = @k, note = @n
            WHEN NOT MATCHED THEN INSERT (rest_date, kind, note, created_ms) VALUES (@d, @k, @n, @ms);`);
  return { date, kind, note: note || null, left: limit - r.recordsets[0][0].n - 1 };
}

async function removeRest(pool, date, today) {
  if (!DAY.test(date || '')) throw fail('date must be YYYY-MM-DD');
  if (date < today) throw fail("Past rest days can't be removed");
  const r = await pool.request().input('d', sql.Date, date).query('DELETE FROM dbo.rest_days WHERE rest_date = @d; SELECT @@ROWCOUNT AS n');
  if (!r.recordset[0].n) throw fail('No rest day on that date', 404);
}

/**
 * The plan shift the Mentor can offer at level 3: each dated roadmap moves its unfinished days forward so the first
 * unfinished one lands today. Nothing is lost: finished days keep their ticks, everything after moves together.
 */
async function proposeShift(pool, today) {
  const r = await pool.request().input('t', sql.Date, today).query(`
    SELECT CONVERT(char(10), MIN(d.plan_date), 23) AS first FROM dbo.days d
    WHERE d.plan_date < @t AND (EXISTS (SELECT 1 FROM dbo.problems p WHERE p.day_id = d.id AND p.is_stretch = 0 AND p.status = 'todo')
                                OR EXISTS (SELECT 1 FROM dbo.tasks k WHERE k.day_id = d.id AND k.done = 0));
    SELECT CONVERT(char(10), MIN(plan_date), 23) AS first FROM dbo.project_tasks
    WHERE plan_date < @t AND (done = 0 OR (learn IS NOT NULL AND learn_done = 0));`);
  const one = (first) => (first ? { from: first, days: daysBetween(first, today) } : null);
  const dsa = one(r.recordsets[0][0].first);
  const project = one(r.recordsets[1][0].first);
  return { dsa, project, any: !!((dsa && dsa.days) || (project && project.days)) };
}

async function applyShift(pool, today) {
  const p = await proposeShift(pool, today);
  if (!p.any) throw fail('Nothing to shift: no unfinished days behind you', 409);
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    if (p.dsa?.days) {
      await new sql.Request(tx).input('n', sql.Int, p.dsa.days).input('f', sql.Date, p.dsa.from).query(`
        UPDATE dbo.days SET plan_date = DATEADD(day, @n, plan_date) WHERE plan_date >= @f;
        UPDATE dbo.weeks SET start_date = CASE WHEN start_date >= @f THEN DATEADD(day, @n, start_date) ELSE start_date END,
                             end_date = DATEADD(day, @n, end_date) WHERE end_date >= @f;`);
    }
    if (p.project?.days) {
      await new sql.Request(tx).input('n', sql.Int, p.project.days).input('f', sql.Date, p.project.from)
        .query('UPDATE dbo.project_tasks SET plan_date = DATEADD(day, @n, plan_date) WHERE plan_date >= @f;');
    }
    // A fair start: misses before today stop counting toward escalation (the history stays visible)
    await new sql.Request(tx).input('t', sql.NVarChar, today).query(`
      MERGE dbo.settings AS t USING (SELECT 'mentor_reset_from' AS k) AS s ON t.k = s.k
      WHEN MATCHED THEN UPDATE SET v = @t WHEN NOT MATCHED THEN INSERT (k, v) VALUES ('mentor_reset_from', @t);`);
    await tx.commit();
  } catch (e) { await tx.rollback(); throw e; }
  await evaluateDay(pool, today, {}); // re-judge today from the fresh start
  return p;
}

/** Save what you told the mentor about a day (a reason and/or a blocker). */
async function setReason(pool, { date, reason, blocker }) {
  if (!DAY.test(date || '')) throw fail('date must be YYYY-MM-DD');
  if (blocker && !BLOCKERS.includes(blocker)) throw fail(`blocker must be one of ${BLOCKERS.join(', ')}`);
  if (!reason && !blocker) throw fail('Send a reason or a blocker');
  await evaluateDay(pool, date, {}); // make sure the day exists (keeps a final evaluation final)
  await pool.request().input('d', sql.Date, date).input('r', sql.NVarChar, reason ? String(reason).slice(0, 500) : null).input('b', sql.NVarChar, blocker || null)
    .query('UPDATE dbo.mentor_evaluations SET reason = COALESCE(@r, reason), blocker = COALESCE(@b, blocker) WHERE eval_date = @d');
}

/** The day a message is about right now: today after the evening evaluation, otherwise yesterday (or today before the plan's first evening). */
async function currentDay(pool, now = Date.now()) {
  const s = await mentorSettings();
  const { date, minutes } = localParts(now, s.tz);
  return minutes >= (hhmm(s.evalTime) ?? 1380) - 120 ? date : addDays(date, -1); // within 2 h of the check-in it's about today
}

/**
 * The mentor answers your reason / blocker: acknowledges it, adjusts the advice, ends with one timed action.
 * @returns { content, source, shift } (shift = the plan-shift offer when you're behind and blocked)
 */
async function mentorReply(pool, { date, reason, blocker }, now = Date.now(), deps = {}) {
  const s = await mentorSettings();
  await setReason(pool, { date, reason, blocker });
  const evaluation = await evaluateDay(pool, date, { s });
  const { status } = require('./data');
  const st = await status(pool, now);
  const prev = (await history(pool, date, 1)).at(-1) || null;
  const game = await require('../game').computeGame(pool, now);
  const { buildContext, writeMessage } = require('./messages');
  const shift = blocker ? await proposeShift(pool, st.today.date) : null;
  const ctx = buildContext({ kind: 'reply', evaluation: { ...evaluation, reason: reason || null }, yesterdayEval: prev, pace: st.pace, streak: game.streak, shields: st.shields, commitments: st.commitments, settings: s, reason, blocker, shift });
  const msg = await writeMessage(ctx, deps);
  return { ...msg, shift, level: evaluation.level };
}

module.exports = { BLOCKERS, addCommitment, removeCommitment, setRest, removeRest, proposeShift, applyShift, setReason, mentorReply, currentDay };
