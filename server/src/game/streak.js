// Minutes learned per day + the streak (any day with 5+ minutes counts), with one streak freeze per Mon–Sun week.
const { localDay, addDays, daysBetween, weekStart } = require('./days');

const MIN_MINUTES = 5;
const FLAME_AT = [1, 3, 7, 14, 30]; // flame size 1..5 grows at these streak lengths

/**
 * Minutes per local day = focus-timer minutes + the estimated minutes of whatever you finished that day.
 * A finished item's estimate is skipped when you already timed a focus session on that lesson that day (no double count).
 * @param sessions [{ track, lesson_ref, started_ms, minutes }]
 * @param credits  [{ ms, track, ref, minutes }] estimated minutes of finished items
 * @returns Map(day -> minutes)
 */
function dayMinutes(sessions, credits) {
  const out = new Map();
  const add = (day, m) => out.set(day, (out.get(day) || 0) + m);
  const timed = new Set();
  for (const s of sessions) {
    if (!s.minutes) continue;
    const day = localDay(s.started_ms);
    add(day, s.minutes);
    timed.add(`${day}|${s.track}|${s.lesson_ref || ''}`);
  }
  for (const c of credits) {
    if (!c.ms || !c.minutes) continue;
    const day = localDay(c.ms);
    if (!timed.has(`${day}|${c.track}|${c.ref}`)) add(day, c.minutes);
  }
  return out;
}

/**
 * Walks every day from your first active day to today.
 * A missed day is covered by a freeze when the streak is running and that week's freeze is unused (freezes already
 * used are passed in as `frozen`, so they never move). Today never breaks the streak: it's still in progress.
 * @param minutes Map(day -> minutes)
 * @param frozen  Set(day) freezes used earlier
 * @returns { current, best, todayMinutes, todayActive, flame, freeze: { available, usedOn }, newFreezes, welcomeBack }
 */
function computeStreak(minutes, frozen, today) {
  const active = (d) => (minutes.get(d) || 0) >= MIN_MINUTES;
  const activeDays = [...minutes.keys()].filter(active).sort();
  const usedWeeks = new Set([...frozen].map(weekStart));
  const newFreezes = [];
  let run = 0;
  let best = 0;
  let runStart = null;
  let lastBreak = null;
  let lastActive = null;

  if (activeDays.length) {
    for (let d = activeDays[0]; d <= today; d = addDays(d, 1)) {
      if (active(d)) {
        if (!run) runStart = d;
        run++;
        best = Math.max(best, run);
        lastActive = d;
      } else if (d === today) {
        // still time to learn today
      } else if (run && (frozen.has(d) || !usedWeeks.has(weekStart(d)))) {
        if (!frozen.has(d)) newFreezes.push(d);
        usedWeeks.add(weekStart(d));
      } else if (run) {
        lastBreak = { lastActive, lostRun: run };
        run = 0;
        runStart = null;
      }
    }
  }

  // Welcome back (instead of "streak lost"): you had a streak, missed days the freeze couldn't cover, and now you're back.
  let welcomeBack = null;
  if (lastBreak && run <= 1) {
    const backOn = runStart || today;
    // days missed between your last active day before the break and the day you came back (or today)
    welcomeBack = { daysAway: daysBetween(lastBreak.lastActive, backOn) - 1, previousStreak: lastBreak.lostRun, backToday: run === 1 };
  }
  const thisWeek = weekStart(today);
  const usedOn = [...frozen, ...newFreezes].filter((d) => weekStart(d) === thisWeek).sort()[0] || null;
  return {
    current: run,
    best,
    todayMinutes: minutes.get(today) || 0,
    todayActive: active(today),
    flame: FLAME_AT.filter((n) => run >= n).length,
    freeze: { available: !usedOn, usedOn },
    newFreezes,
    welcomeBack,
  };
}

module.exports = { MIN_MINUTES, FLAME_AT, dayMinutes, computeStreak };
