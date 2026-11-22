// Today's missions: exactly three things that matter today, built from data the app already has
// (the day's schedule, today's workout and protein goal, flashcards due, two tiny habits).
// Why three: a short, specific list is finishable, and finishing is what builds the habit (a long list gets skipped).
import { toMinutes } from './timeline.js';

export const MISSION_COUNT = 3;

const frac = (done, total) => (total ? Math.min(done / total, 1) : 0);
const blockMinutes = (b) => (b ? (toMinutes(b.end) - toMinutes(b.start) + 1440) % 1440 : null);

/** Effort from the planned time: an honest size label, so a mission never looks smaller than it is. */
export function effort(minutes) {
  if (!minutes || minutes <= 30) return 'Light';
  return minutes <= 90 ? 'Medium' : 'Big';
}

/**
 * Everything that could be a mission today, in plan order.
 * @param schedule  GET /api/schedule/:date
 * @param today     { workout, protein } from the game context (null while loading)
 * @param game      GET /api/game (flashcards due, growth.habits)
 * @returns [{ key, kind: 'career' | 'fitness' | 'other', area | stat, to | habit, title, sub, minutes, done, total, complete }]
 */
export function missionCandidates(schedule, today, game) {
  const out = [];
  const blocks = schedule?.blocks || [];

  // DSA: every task in today's DSA blocks, plus the day's problems
  const dsaItems = blocks.filter((b) => b.area === 'dsa').flatMap((b) => b.items);
  const tasks = dsaItems.filter((i) => i.kind === 'task');
  const problems = dsaItems.find((i) => i.kind === 'problems');
  if (tasks.length || problems) {
    const done = tasks.filter((t) => t.done).length;
    out.push({
      key: 'dsa', kind: 'career', area: 'dsa', to: `/dsa/day/${schedule.date}`,
      title: schedule.focus ? `DSA: ${schedule.focus}` : 'DSA practice',
      sub: [tasks.length ? `${done} of ${tasks.length} steps` : null, problems ? `${problems.solved} of ${problems.total} problems` : null].filter(Boolean).join(' · '),
      minutes: tasks.reduce((sum, t) => sum + (t.minutes || 0), 0) || null,
      done: tasks.length ? done : problems.solved, total: tasks.length || problems.total,
    });
  }

  // The course hour the plan has scheduled today
  const project = blocks.find((b) => b.area === 'project' && b.items.length);
  if (project) {
    const done = project.items.filter((i) => i.done).length;
    const { area, project: name } = project.items[0];
    out.push({
      key: 'project', kind: 'career', area, to: `/${area}`,
      // the full-stack course has a .NET and a React lesson every day
      title: project.items.some((i) => i.lane) ? `${name}: today's .NET + React lessons` : `${name}: today's lesson`,
      sub: `${done} of ${project.items.length} steps`, minutes: blockMinutes(project), done, total: project.items.length,
    });
  }

  // Workout (nothing on a rest day)
  const w = today?.workout;
  if (w && !w.rest && w.total) {
    const done = w.complete ? w.total : w.done;
    out.push({
      key: 'workout', kind: 'fitness', area: 'workout', to: '/workout', title: 'Workout',
      sub: `${done} of ${w.total} moves`, minutes: blockMinutes(blocks.find((b) => b.key === 'workout')), done, total: w.total,
    });
  }

  // Protein goal (meals are logged from Telegram photos, so this fills itself)
  const p = today?.protein;
  if (p?.target) {
    const eaten = Math.min(p.value, p.target);
    out.push({ key: 'protein', kind: 'fitness', area: 'meals', to: '/meals', title: `Eat ${p.target} g protein`, sub: `${eaten} of ${p.target} g so far`, minutes: null, done: eaten, total: p.target });
  }

  // Reviews, only when something is actually due
  const c = game?.cards;
  if (c?.due) {
    out.push({ key: 'cards', kind: 'other', area: 'cards', to: '/cards', title: `Review ${c.due} flashcard${c.due === 1 ? '' : 's'}`, sub: 'About a minute each', minutes: c.due, done: c.reviewedToday || 0, total: (c.reviewedToday || 0) + c.due });
  }

  // Two tiny habits: ticked right here on Today (no page to open), each feeds its own stat
  for (const h of game?.growth?.habits || []) {
    out.push({ key: `habit-${h.key}`, kind: 'other', stat: h.stat, habit: h.key, title: h.title, sub: `+${h.xp} ${h.stat} XP`, minutes: h.minutes, done: h.done ? 1 : 0, total: 1 });
  }

  return out.map((x) => ({ ...x, complete: x.total > 0 && x.done >= x.total }));
}

/**
 * Three missions: one for your career, one for your body, and one you choose from what is left.
 * @returns { missions, swapTo }  swapTo = what the third slot becomes on the next swap (null when there is no choice)
 */
export function pickMissions(candidates, choiceKey) {
  const career = candidates.find((c) => c.kind === 'career');
  const fitness = candidates.find((c) => c.kind === 'fitness');
  const rest = candidates.filter((c) => c !== career && c !== fitness);
  const third = rest.find((c) => c.key === choiceKey) || rest[0];
  return {
    missions: [career, fitness, third].filter(Boolean).slice(0, MISSION_COUNT),
    swapTo: rest.length > 1 ? rest[(rest.indexOf(third) + 1) % rest.length] : null,
  };
}

/** One number for the day: the average progress across today's missions, 0–100. */
export function dayProgress(missions) {
  if (!missions.length) return 0;
  return Math.round((missions.reduce((sum, m) => sum + frac(m.done, m.total), 0) / missions.length) * 100);
}
