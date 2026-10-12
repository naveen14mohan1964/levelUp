// LinkedIn module · Phase 3 outreach limits. Pure functions so every rule is unit-tested.
// These are hard limits on YOU marking requests as sent: conservative pacing that keeps your account healthy.

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const WEEK = 7 * DAY;

const minutesOf = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

function startOfLocalDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Is `ms` inside your outreach hours on an allowed weekday (local time)? */
function inWorkingHours(ms, { start, end, days }) {
  const d = new Date(ms);
  const m = d.getHours() * 60 + d.getMinutes();
  return days.includes(d.getDay()) && m >= minutesOf(start) && m < minutesOf(end);
}

/** The next moment the outreach window opens at or after `ms`. */
function nextWindowStart(ms, { start, end, days }) {
  if (inWorkingHours(ms, { start, end, days })) return ms;
  const [h, m] = start.split(':').map(Number);
  for (let i = 0; i < 8; i++) {
    const d = new Date(ms);
    d.setDate(d.getDate() + i);
    d.setHours(h, m, 0, 0);
    if (d.getTime() >= ms && days.includes(d.getDay())) return d.getTime();
  }
  return null; // no allowed days configured
}

/** Random pause before the next send, so you work at a calm, human pace. */
function randomDelayMs(minS, maxS, rand = Math.random) {
  const lo = Math.max(0, Math.min(minS, maxS));
  const hi = Math.max(minS, maxS);
  return Math.round((lo + rand() * (hi - lo)) * 1000);
}

/**
 * Can you mark another connection request as sent right now?
 * state: { now, paused, cooldownUntil, hours, dailyCap, weeklyCap, sentToday, sentLast7Days (array of ms, newest last), nextSendMs }
 * Returns { ok: true } or { ok: false, reason, message, retryAt }.
 */
function checkSend(state) {
  const { now, paused, cooldownUntil, hours, dailyCap, weeklyCap, sentToday, sentLast7Days, nextSendMs } = state;
  const fmt = (ms) => new Date(ms).toLocaleString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit' });

  if (paused) return { ok: false, reason: 'paused', message: 'LinkedIn automation is paused (kill switch). Resume it first.' };
  if (cooldownUntil && now < cooldownUntil) {
    return { ok: false, reason: 'cooldown', retryAt: cooldownUntil, message: `Outreach is cooling down after a LinkedIn warning, until ${fmt(cooldownUntil)}.` };
  }
  if (!inWorkingHours(now, hours)) {
    const at = nextWindowStart(now, hours);
    return { ok: false, reason: 'hours', retryAt: at, message: at ? `Outside your outreach hours. Next window: ${fmt(at)}.` : 'No outreach days are configured.' };
  }
  if (sentToday >= dailyCap) {
    const at = nextWindowStart(startOfLocalDay(now) + DAY, hours);
    return { ok: false, reason: 'daily_cap', retryAt: at, message: `Daily cap reached (${dailyCap}). Nice work; next window ${fmt(at)}.` };
  }
  const recent = sentLast7Days.filter((t) => t > now - WEEK).sort((a, b) => a - b);
  if (recent.length >= weeklyCap) {
    const at = recent[recent.length - weeklyCap] + WEEK; // when enough old requests leave the rolling window
    return { ok: false, reason: 'weekly_cap', retryAt: at, message: `Weekly cap reached (${weeklyCap} in 7 days). Frees up ${fmt(at)}.` };
  }
  if (nextSendMs && now < nextSendMs) {
    const s = Math.ceil((nextSendMs - now) / 1000);
    return { ok: false, reason: 'pacing', retryAt: nextSendMs, message: `Take a breath: next one in ${s}s. Use it to read their profile.` };
  }
  return { ok: true };
}

/** Personalised notes left this month (free accounts get 5, Premium unlimited). */
function notesLeft({ premium, budget, usedThisMonth }) {
  return premium ? Infinity : Math.max(0, budget - usedThisMonth);
}

const noteMaxChars = (premium) => (premium ? 300 : 200);

function startOfLocalMonth(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

module.exports = { inWorkingHours, nextWindowStart, randomDelayMs, checkSend, notesLeft, noteMaxChars, startOfLocalDay, startOfLocalMonth, WEEK, DAY };
