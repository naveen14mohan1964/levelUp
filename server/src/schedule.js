// Daily time-block templates (from STUDY_PLAN.md §0.1 and WORKOUT_PLAN.md §4).
// ✏️ Want different timings? Edit the start/end times here and restart the API.
//
// area: dsa | project | workout | routine | sleep
// slot: which of the day's DSA tasks this block shows (see dsaSlot below)

const WEEKDAY = [
  { key: 'wake', start: '05:30', end: '05:35', area: 'routine', title: 'Wake up + a glass of water' },
  { key: 'workout', start: '05:35', end: '06:10', area: 'workout', title: 'Workout' },
  { key: 'dsa-am', start: '06:10', end: '07:55', area: 'dsa', slot: 'morning', title: 'DSA · morning block' },
  { key: 'commute', start: '08:00', end: '09:30', area: 'routine', title: 'Breakfast, get ready, commute', detail: 'Protein breakfast (~35 g)' },
  { key: 'project', start: '14:00', end: '15:00', area: 'project', title: 'Project hour (at the office)', detail: 'Personal laptop + personal GitHub' },
  { key: 'walk', start: '16:30', end: '16:40', area: 'workout', title: '10-minute walk', detail: 'Walk every ~2 h at work to reach your step target' },
  { key: 'dinner', start: '18:30', end: '19:00', area: 'routine', title: 'Home + dinner (cooked ahead)' },
  { key: 'dsa-pm', start: '19:00', end: '21:30', area: 'dsa', slot: 'evening', title: 'DSA · evening block', detail: 'Stand up for 2 minutes between problems' },
  { key: 'dsa-review', start: '21:30', end: '22:15', area: 'dsa', slot: 'night', title: 'DSA · review' },
  { key: 'winddown', start: '22:15', end: '22:30', area: 'routine', title: 'Screens off, lay out workout clothes' },
  { key: 'sleep', start: '22:30', end: '05:30', area: 'sleep', title: 'Sleep (7 hours)' },
];

const SATURDAY = [
  { key: 'wake', start: '06:30', end: '06:35', area: 'routine', title: 'Wake up (sleep in, no office)' },
  { key: 'workout', start: '06:35', end: '07:25', area: 'workout', title: 'Workout' },
  { key: 'dsa-am', start: '08:00', end: '09:45', area: 'dsa', slot: 'morning', title: 'DSA · morning block' },
  { key: 'dsa-pm', start: '10:00', end: '12:30', area: 'dsa', slot: 'evening', title: 'DSA · practice block' },
  { key: 'lunch', start: '12:30', end: '14:00', area: 'routine', title: 'Lunch + rest' },
  { key: 'dsa-review', start: '17:00', end: '17:45', area: 'dsa', slot: 'night', title: 'DSA · review' },
  { key: 'free', start: '18:00', end: '22:15', area: 'routine', title: 'Free evening: you earned it' },
  { key: 'sleep', start: '22:30', end: '06:30', area: 'sleep', title: 'Sleep (7–8 hours)' },
];

const SUNDAY = [
  { key: 'wake', start: '07:00', end: '07:15', area: 'workout', title: 'Wake up + weigh-in', detail: 'Measurements weekly, photos every 2 weeks' },
  { key: 'contest', start: '08:00', end: '09:30', area: 'dsa', slot: 'contest', title: 'LeetCode Weekly Contest' },
  { key: 'dsa-am', start: '09:45', end: '11:45', area: 'dsa', slot: 'morning', title: 'DSA · main block' },
  { key: 'mealprep', start: '12:00', end: '13:00', area: 'routine', title: 'Meal prep for the week', detail: 'Boil eggs, portion chicken, cook dal, chop vegetables' },
  { key: 'dsa-buffer', start: '14:00', end: '17:30', area: 'dsa', slot: 'afternoon', title: 'DSA · buffer + weekly check' },
  { key: 'free', start: '17:30', end: '22:15', area: 'routine', title: 'Rest: no workout today' },
  { key: 'sleep', start: '22:30', end: '05:30', area: 'sleep', title: 'Sleep (7 hours)' },
];

// Which time block a DSA task belongs in.
function dsaSlot(task, dayType, dow) {
  if (dayType === 'study') return { concept: 'morning', practice: 'evening', review: 'night' }[task.kind] || 'evening';
  if (dayType === 'selftest') return { selftest: 'morning', concept: 'morning', contest: 'contest', review: 'afternoon' }[task.kind] || 'afternoon';
  // revision days (Phase 2)
  if (dow === 6) return { mock: 'morning', contest: 'contest' }[task.kind] || 'afternoon';
  if (task.kind === 'concept' || task.sort_order === 0) return 'morning'; // spaced-repetition queue + concept repair
  if (task.kind === 'practice' || task.kind === 'mock') return 'evening';
  return 'night'; // post-mortem
}

// WORKOUT_PLAN.md §4–5: which session is on which day, and which phase applies that week.
const WORKOUT_PHASES = [
  { from: 1, to: 3, name: 'Phase 1 · Foundation' },
  { from: 4, to: 7, name: 'Phase 2 · Build' },
  { from: 8, to: 11, name: 'Phase 3 · Strength' },
  { from: 12, to: 12, name: 'Deload week (2 sets)' },
  { from: 13, to: 16, name: 'Phase 4 · Progress' },
  { from: 17, to: 17, name: 'Deload week (2 sets)' },
  { from: 18, to: 22, name: 'Phase 5 · Conditioning' },
];

function workoutFor(week, dow) {
  const phase = WORKOUT_PHASES.find((p) => week >= p.from && week <= p.to);
  const session = require('./workout').sessionNames(week)[dow]; // same names as the Workout page (incl. jog days)
  return { session, phase: phase ? phase.name : null };
}

function templateFor(dow) {
  if (dow === 5) return SATURDAY;
  if (dow === 6) return SUNDAY;
  return WEEKDAY;
}

module.exports = { templateFor, dsaSlot, workoutFor };
