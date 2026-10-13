// The Mentor's rules, as pure functions (no I/O): unit-tested in test/checkin.test.js.
//   judge()      one goal category for one day → met | partial | missed | off
//   escalate()   consecutive misses per category → escalation level 0–4
//   comebacks()  categories completed the day after a miss (comeback bonus XP)
//   perfectWeek() whether a Mon–Sun week earns a streak shield
const CATEGORIES = ['dsa', 'learning', 'project', 'workout', 'nutrition'];
const LABEL = { dsa: 'DSA', learning: 'Learning', project: 'Project', workout: 'Workout', nutrition: 'Nutrition' };
// The tiny version of each goal, used after 2+ misses in a row ("never miss twice")
const MVD = { dsa: '1 easy problem', learning: '5 focused minutes', project: 'just the 📖 learn step', workout: 'the 10-minute mode', nutrition: 'log what you eat' };
const SHIELD_BANK = 2;
const PERFECT_WEEK_MIN_ACTIVE_DAYS = 5;
const COMEBACK_XP = 20;

const done = (status) => status === 'met';
const counts = (status) => status === 'partial' || status === 'missed'; // a partial day is still a missed goal

/**
 * Judge one category. `mvd` lowers the bar to the tiny version (after 2+ consecutive misses).
 * Inputs come from data.js:
 *   dsa       { planned, required, done, solvedToday }   learning { minutes }   project { planned, rows, done, learnDone }
 *   workout   { rest, complete, moves }                   nutrition { meals, protein, target }
 */
function judge(cat, input, { mvd = false, learningMinutes = 30 } = {}) {
  if (!input || input.off) return { status: 'off', detail: input?.why || 'not scheduled' };
  switch (cat) {
    case 'dsa': {
      if (!input.planned) return { status: 'off', detail: 'no DSA planned' };
      if (mvd) return input.solvedToday >= 1 || input.done >= 1 ? { status: 'met', detail: 'minimum day: a problem solved', mvd } : { status: 'missed', detail: 'no problem solved', mvd };
      if (input.required && input.done >= input.required) return { status: 'met', detail: `${input.done}/${input.required} core problems` };
      return { status: input.done || input.solvedToday ? 'partial' : 'missed', detail: `${input.done}/${input.required} core problems`, left: input.required - input.done };
    }
    case 'learning': {
      const goal = mvd ? 5 : learningMinutes;
      if (input.minutes >= goal) return { status: 'met', detail: `${input.minutes} min`, ...(mvd && { mvd }) };
      return { status: input.minutes > 0 ? 'partial' : 'missed', detail: `${input.minutes}/${goal} min`, ...(mvd && { mvd }) };
    }
    case 'project': {
      if (!input.planned) return { status: 'off', detail: 'no project hour today' };
      if (mvd) return input.learnDone >= 1 || input.done >= 1 ? { status: 'met', detail: 'minimum day: the learn step', mvd } : { status: 'missed', detail: 'nothing ticked', mvd };
      if (input.done >= input.rows) return { status: 'met', detail: `${input.done}/${input.rows} steps` };
      return { status: input.done || input.learnDone ? 'partial' : 'missed', detail: `${input.done}/${input.rows} steps${!input.done && input.learnDone ? ' (learn step done)' : ''}` };
    }
    case 'workout': {
      if (input.rest) return { status: 'off', detail: 'rest day' };
      if (input.complete) return { status: 'met', detail: 'session done' }; // the 10-minute mode counts, even on a minimum day
      return { status: input.moves ? 'partial' : 'missed', detail: `${input.moves} moves ticked`, ...(mvd && { mvd }) };
    }
    case 'nutrition': {
      if (mvd) return input.meals >= 1 ? { status: 'met', detail: 'minimum day: meals logged', mvd } : { status: 'missed', detail: 'nothing logged', mvd };
      if (input.target && input.protein >= input.target * 0.8) return { status: 'met', detail: `protein ${input.protein}/${input.target} g` };
      return { status: input.meals ? 'partial' : 'missed', detail: input.meals ? `protein ${input.protein}/${input.target} g` : 'nothing logged' };
    }
    default: return { status: 'off', detail: 'unknown category' };
  }
}

/** 1 day → 1 · 2 → 2 · 3–4 → 3 · 5+ → 4 */
function levelFor(n) {
  if (n <= 0) return 0;
  if (n === 1) return 1;
  if (n === 2) return 2;
  if (n <= 4) return 3;
  return 4;
}

/**
 * Consecutive misses per category, walking back from the last day of `history`
 * ([{ date, results: { cat: { status } }, rest, covered }], oldest first).
 * Rest/sick days, shield-covered days and "off" days are neutral: they neither count nor reset.
 * @returns { misses: { cat: n }, levels: { cat: 0–4 }, level: max, mvdNext: [cats with 2+ misses → minimum day tomorrow] }
 */
function escalate(history, cats = CATEGORIES) {
  const misses = {};
  for (const cat of cats) {
    let n = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      const d = history[i];
      const st = d.results?.[cat]?.status;
      if (d.rest || d.covered || !st || st === 'off') continue;
      if (done(st)) break;
      if (counts(st)) n++;
    }
    misses[cat] = n;
  }
  const levels = Object.fromEntries(cats.map((c) => [c, levelFor(misses[c])]));
  return { misses, levels, level: Math.max(0, ...Object.values(levels)), mvdNext: cats.filter((c) => misses[c] >= 2) };
}

/** Categories completed today after being missed on the previous day that counted (comeback bonus). */
function comebacks(prev, day, cats = CATEGORIES) {
  if (!prev || !day || day.rest) return [];
  return cats.filter((c) => done(day.results?.[c]?.status) && counts(prev.results?.[c]?.status));
}

/**
 * A perfect week earns a shield: all seven days evaluated, at least 5 active (non-rest) days,
 * and every scheduled goal met on every active day.
 */
function perfectWeek(days, cats = CATEGORIES) {
  if (days.length !== 7) return false;
  const active = days.filter((d) => !d.rest);
  if (active.length < PERFECT_WEEK_MIN_ACTIVE_DAYS) return false;
  return active.every((d) => cats.every((c) => { const st = d.results?.[c]?.status; return !st || st === 'off' || done(st); }));
}

module.exports = { CATEGORIES, LABEL, MVD, SHIELD_BANK, COMEBACK_XP, PERFECT_WEEK_MIN_ACTIVE_DAYS, judge, levelFor, escalate, comebacks, perfectWeek };
