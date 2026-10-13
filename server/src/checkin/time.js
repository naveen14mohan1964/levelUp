// Local time in a chosen IANA time zone (or this machine's when empty), with no dependencies: Intl does the work.
const { addDays } = require('../game/days');

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** { date: 'YYYY-MM-DD', minutes: minutes since local midnight, dow: 0 = Sunday } for an instant in a time zone. */
function localParts(ms, tz) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute), dow: DOW.indexOf(p.weekday) };
}

const localDate = (ms, tz) => localParts(ms, tz).date;

function validTimeZone(tz) {
  if (!tz) return true; // empty = this machine's time zone
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
}

/** "23:00" -> 1380, or null when it isn't a valid HH:MM. */
function hhmm(s) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(s || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Day of week (0 = Sunday) of a YYYY-MM-DD string, independent of any time zone. */
const dowOf = (day) => new Date(`${day}T00:00:00Z`).getUTCDay();

/**
 * The day whose end-of-day evaluation is due now, or null. Once the evaluation time has passed, it's today;
 * before it (e.g. 00:30, or the laptop just woke up), it's yesterday. Days already evaluated (final) are never due again.
 * A daylight-saving jump is harmless: we compare local minutes, so a skipped 02:30 simply fires at 03:00.
 */
function dueEvaluation(nowMs, { tz, evalTime = '23:00', lastFinal = null }) {
  const { date, minutes } = localParts(nowMs, tz);
  const target = minutes >= (hhmm(evalTime) ?? 1380) ? date : addDays(date, -1);
  return lastFinal && lastFinal >= target ? null : target;
}

/** Fresh-start framing: the 1st of the month beats a Monday. */
function freshStart(day) {
  if (day.slice(8) === '01') return 'month';
  if (dowOf(day) === 1) return 'week';
  return null;
}

module.exports = { localParts, localDate, validTimeZone, hhmm, dowOf, dueEvaluation, freshStart };
