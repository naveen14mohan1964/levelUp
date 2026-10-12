// LinkedIn module · job scheduling rules. Pure functions (no DB, no network), so they're easy to test.
// Times are epoch milliseconds; slot days use JS numbering (0 = Sunday … 6 = Saturday) in local time.

const MIN = 60_000;
const HOUR = 60 * MIN;
const MISSED_WINDOW_MS = 12 * HOUR; // an approved post can still go out up to 12 h late (e.g. laptop was off)
const BACKOFF_MS = [5 * MIN, 30 * MIN, 2 * HOUR]; // retry 1, 2, 3+
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The epoch ms for each slot in the Monday-starting week `weekStart` (YYYY-MM-DD), in local time. */
function slotTimes(weekStart, slots) {
  const [y, m, d] = weekStart.split('-').map(Number);
  return slots.map(({ day, time }) => {
    const [hh, mm] = time.split(':').map(Number);
    const offset = (day + 6) % 7; // days after Monday
    return new Date(y, m - 1, d + offset, hh, mm, 0, 0).getTime();
  });
}

/** Monday (YYYY-MM-DD, local) of the week containing `ms`. */
function mondayOf(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function validateSlots(slots) {
  const errors = [];
  if (!Array.isArray(slots) || slots.length !== 2) errors.push('Exactly 2 post slots are needed (2 posts/week)');
  else {
    for (const s of slots) {
      if (!Number.isInteger(s.day) || s.day < 0 || s.day > 6) errors.push('Slot day must be 0 (Sun) to 6 (Sat)');
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time || '')) errors.push('Slot time must be HH:MM (24h)');
    }
    if (!errors.length && slots[0].day === slots[1].day && slots[0].time === slots[1].time) errors.push('The two slots must differ');
  }
  return errors;
}

/**
 * What to do with a queued job right now:
 *  paused  → kill switch is on: leave it queued
 *  wait    → not due yet
 *  missed  → due more than MISSED_WINDOW_MS ago (app wasn't running): don't post stale content
 *  run     → go
 */
function decideJob(job, now, { paused = false, missedWindowMs = MISSED_WINDOW_MS } = {}) {
  if (paused) return 'paused';
  if (job.run_ms > now) return 'wait';
  // Retries reschedule run_ms themselves, so only first attempts can be "missed".
  if (job.attempts === 0 && now - job.run_ms > missedWindowMs) return 'missed';
  return 'run';
}

/**
 * Classifies an error message from the LinkedIn MCP so we know whether retrying can help.
 *  auth      → you need to (re)connect; retrying won't help
 *  invalid   → the post itself is rejected (too long, bad image…); fix it first
 *  rate      → LinkedIn rate limit; retry much later
 *  transient → network / 5xx / timeout; retry with backoff
 */
function classifyError(message = '') {
  const m = message.toLowerCase();
  if (/not connected|expired|login|401|invalid access token|refused \(403\)/.test(m)) return { kind: 'auth', retryable: false };
  if (/rate limit|429|too many requests/.test(m)) return { kind: 'rate', retryable: true };
  if (/cannot post yet|too long|characters|must be|invalid|not found: |draft_id mismatch|400/.test(m)) return { kind: 'invalid', retryable: false };
  return { kind: 'transient', retryable: true };
}

/** After a failed attempt: requeue with backoff, or give up. `job.attempts` already includes this attempt. */
function afterFailure(job, message, now) {
  const { kind, retryable } = classifyError(message);
  if (!retryable || job.attempts >= job.max_attempts) return { status: 'failed', kind };
  const wait = kind === 'rate' ? 6 * HOUR : BACKOFF_MS[Math.min(job.attempts, BACKOFF_MS.length) - 1];
  return { status: 'queued', run_ms: now + wait, kind };
}

const describeSlot = (s) => `${DAY_NAMES[s.day]} ${s.time}`;

module.exports = { slotTimes, mondayOf, validateSlots, decideJob, classifyError, afterFailure, describeSlot, MISSED_WINDOW_MS, BACKOFF_MS, DAY_NAMES };
