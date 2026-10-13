// Workout domain logic: which session runs on a date, daily targets, streaks, weight badges.
const fs = require('fs');
const path = require('path');

const PROGRAM = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'plan.json'), 'utf8')).workout;

const BADGES = [
  { kg: 110, name: 'First Five', icon: '🥉' },
  { kg: 105, name: 'Double Digits', icon: '🥈' },
  { kg: 100, name: 'Two-Digit Club', icon: '🥇' },
  { kg: 95, name: 'Halfway Hero', icon: '🦸' },
  { kg: 90, name: 'Quarter Century', icon: '💎' },
  { kg: 85, name: 'Almost There', icon: '🚀' },
  { kg: 80, name: 'Goal Crusher', icon: '🏆' },
];

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const dowOf = (iso) => (new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7; // 0 = Mon
const weekOf = (iso, start) => Math.floor((Date.parse(iso) - Date.parse(start)) / (7 * 86400000)) + 1;

// Weeks 1–2: 5,000 steps, +1,000 every 2 weeks, capped at 10,000 (reached in Week 11).
function stepTarget(week) {
  if (!week || week < 1) return 5000;
  return Math.min(10000, 5000 + 1000 * Math.floor((week - 1) / 2));
}

// The "10-minute mode" for low-energy days (WORKOUT_PLAN.md §6). Still counts for the streak.
const MINI = [
  { name: 'Sit-to-stand from a chair', prescription: '2 rounds × 10', tip: 'Slow and controlled' },
  { name: 'Wall or incline push-up', prescription: '2 rounds × 10', tip: 'Straight line from head to heels' },
  { name: 'Glute bridge', prescription: '2 rounds × 10', tip: 'Squeeze at the top for 1 s' },
  { name: 'March in place', prescription: '2 rounds × 30 s', tip: 'Or swap the whole thing for a 10-minute walk' },
];

// Walk-jog progression: easy jogging in short intervals that grow each phase, so knees, shins and tendons can adapt
// at 110+ kg. Tuesdays from week 1, Thursdays too from week 4. Deload weeks step back one stage.
const JOG = [
  { from: 1, to: 3, plan: '5 min brisk walk, then 6 × (30 s easy jog + 2 min walk), 5 min walk' },
  { from: 4, to: 7, plan: '5 min brisk walk, then 6 × (1 min jog + 2 min walk), 5 min walk' },
  { from: 8, to: 11, plan: '5 min brisk walk, then 5 × (2 min jog + 2 min walk), 5 min walk' },
  { from: 13, to: 16, plan: '5 min brisk walk, then 4 × (4 min jog + 2 min walk), 5 min walk' },
  { from: 18, to: 22, plan: '5 min brisk walk, then 3 × (8 min jog + 2 min walk), 5 min walk' },
];
const JOG_TIP = 'Jog slowly enough to talk in full sentences; short, quick steps. Stop on sharp knee, shin or chest pain. Good shoes, flat or soft ground.';
const THURSDAY_JOG_FROM_WEEK = 4;

/** The walk-jog intervals for a week (deload weeks step back one stage). */
function jogFor(week, deload) {
  const w = Math.min(Math.max(week, 1), 22);
  let i = JOG.findIndex((s) => w >= s.from && w <= s.to);
  if (i < 0) i = JOG.findIndex((s) => s.from > w) - 1; // deload weeks fall between stages
  if (deload) i -= 1;
  return JOG[Math.max(0, Math.min(i, JOG.length - 1))].plan;
}

/** Session names for a week, Monday first (shared with the daily timeline in schedule.js). */
function sessionNames(week) {
  return ['Strength A', 'Jog + core', 'Strength B', week >= THURSDAY_JOG_FROM_WEEK ? 'Jog + mobility' : 'Cardio + mobility',
    week % 2 ? 'Strength A' : 'Strength B', 'Long brisk walk', 'Rest'];
}

/** The planned session for a date: { week, phase, session, deload, rest, items[], mini[] } */
function sessionFor(date, start) {
  const week = weekOf(date, start);
  const dow = dowOf(date);
  const deload = PROGRAM.deloadWeeks.includes(week);
  const effectiveWeek = deload ? week - 1 : Math.min(Math.max(week, 1), 22);
  const phase = PROGRAM.phases.find((p) => effectiveWeek >= p.from && effectiveWeek <= p.to) || PROGRAM.phases[0];
  const session = sessionNames(week)[dow];

  const items = [];
  const add = (group, list) => list.forEach((x, i) => items.push({ key: `${group}-${i}`, group, ...x }));
  const mini = MINI.map((x, i) => ({ key: `mini-${i}`, group: 'mini', ...x }));

  if (session === 'Rest') {
    return { week, phase: `Phase ${phase.n} · ${phase.name}`, session, deload, rest: true, items, mini: [] };
  }
  add('warmup', PROGRAM.warmup);
  if (session.startsWith('Strength')) {
    const list = phase.strength[session.slice(-1)].map((e) => ({
      ...e, prescription: deload ? e.prescription.replace(/^\d+ (×|rounds ×)/, (m) => m.replace(/^\d+/, '2')) : e.prescription,
    }));
    add('main', list);
  } else if (session === 'Long brisk walk') {
    add('main', [{ name: `Brisk walk, ${phase.satWalk}`, prescription: 'Talk-test pace', tip: 'Outdoors if you can; stairs count as a bonus' }]);
  } else {
    add('main', [session.startsWith('Jog')
      ? { name: 'Walk-jog intervals', prescription: jogFor(week, deload), tip: JOG_TIP }
      : { name: 'Low-impact cardio', prescription: phase.cardio, tip: 'Talk test: full sentences, but you could not sing' }]);
    add('main', session.endsWith('core')
      ? [{ name: 'Core finisher', prescription: PROGRAM.coreFinisher, tip: 'Lower back pressed down on dead bugs' }]
      : [{ name: 'Mobility flow (10 min)', prescription: PROGRAM.mobility, tip: 'Slow breathing, no bouncing' }]);
  }
  if (session !== 'Long brisk walk') add('cooldown', PROGRAM.cooldown);
  return { week, phase: deload ? `Deload week · ${phase.name} moves, 2 sets` : `Phase ${phase.n} · ${phase.name}`, session, deload, rest: false, items, mini };
}

/** A day counts as done when every main item is ticked, or the whole 10-minute mode is. */
function isDayDone(session, doneKeys) {
  if (session.rest) return null;
  const main = session.items.filter((i) => i.group === 'main');
  const all = (list) => list.length > 0 && list.every((i) => doneKeys.has(i.key));
  return all(main) || all(session.mini);
}

/** Consecutive completed workout days ending today (or yesterday if today isn't done yet). Sundays are skipped. */
function streak(today, start, doneByDate) {
  let count = 0;
  let d = today;
  const todaySession = sessionFor(today, start);
  if (!isDayDone(todaySession, doneByDate.get(today) || new Set())) d = addDays(d, -1);
  for (let i = 0; i < 400 && d >= start; i++, d = addDays(d, -1)) {
    const s = sessionFor(d, start);
    if (s.rest) continue;
    if (!isDayDone(s, doneByDate.get(d) || new Set())) break;
    count++;
  }
  return count;
}

/** Weight stats + badges. Badges use the 7-day average so one light morning doesn't unlock anything early. */
function weightSummary(entries, startWeight, goalWeight) {
  const sorted = entries.filter((e) => e.weight_kg != null).sort((a, b) => (a.log_date < b.log_date ? -1 : 1));
  const withAvg = sorted.map((e) => {
    const from = addDays(e.log_date, -6);
    const win = sorted.filter((x) => x.log_date >= from && x.log_date <= e.log_date);
    return { date: e.log_date, weight: Number(e.weight_kg), avg7: Math.round((win.reduce((s, x) => s + Number(x.weight_kg), 0) / win.length) * 10) / 10 };
  });
  const latest = withAvg.at(-1) || null;
  const bestAvg = withAvg.length ? Math.min(...withAvg.map((x) => x.avg7)) : null;
  const badges = BADGES.filter((b) => b.kg < startWeight).map((b) => ({ ...b, unlocked: bestAvg != null && bestAvg <= b.kg }));
  const next = badges.find((b) => !b.unlocked) || null;
  const current = latest ? latest.avg7 : startWeight;
  const prevMilestone = badges.filter((b) => b.unlocked).at(-1)?.kg ?? startWeight;
  return {
    series: withAvg,
    latest,
    startWeight,
    goalWeight,
    lost: latest ? Math.round((startWeight - latest.avg7) * 10) / 10 : 0,
    toGoal: Math.round((current - goalWeight) * 10) / 10,
    badges,
    next: next && {
      ...next,
      remainingKg: Math.max(0, Math.round((current - next.kg) * 10) / 10),
      progress: Math.min(1, Math.max(0, (prevMilestone - current) / (prevMilestone - next.kg))),
    },
  };
}

module.exports = { sessionFor, isDayDone, streak, weightSummary, stepTarget, addDays, weekOf, jogFor, sessionNames };
