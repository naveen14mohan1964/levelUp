// LinkedIn module · Phase 1: one salary goal (7 → 20 LPA, a direct switch) split into campaign stages.
// The current stage decides this week's LinkedIn targets. Pure functions: no DB, easy to test.

const DAY = 86_400_000;
const toDate = (iso) => new Date(`${iso}T00:00:00Z`);
const iso = (d) => d.toISOString().slice(0, 10);

/** Monday–Sunday week containing `date` (YYYY-MM-DD). */
function weekBounds(date) {
  const d = toDate(date);
  const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY);
  return { start: iso(monday), end: iso(new Date(monday.getTime() + 6 * DAY)) };
}

/**
 * The stage you're in on `today`:
 * 1. the first not-completed stage whose dates contain today;
 * 2. otherwise the first not-completed stage that hasn't ended yet (you're early, or between stages);
 * 3. otherwise the last not-completed stage (you're running late; stay on it until you mark it done);
 * 4. null when every stage is completed.
 */
function currentStage(stages, today) {
  const open = stages.filter((s) => !s.completed);
  return (
    open.find((s) => s.start_date <= today && today <= s.end_date) ||
    open.find((s) => s.end_date >= today) ||
    open.at(-1) ||
    null
  );
}

/** done · active · ended (past its end date, not marked done, not current; never shown as a failure) · upcoming */
function stageStatus(stage, current, today) {
  if (stage.completed) return 'done';
  if (current && stage.id === current.id) return 'active';
  if (stage.end_date < today) return 'ended';
  return 'upcoming';
}

/** Days left to the target date and how much of the stage timeline has elapsed (0–1). */
function goalProgress(stages, targetDate, today) {
  const first = stages[0]?.start_date || today;
  const total = Math.max(1, (toDate(targetDate) - toDate(first)) / DAY);
  const elapsed = Math.min(total, Math.max(0, (toDate(today) - toDate(first)) / DAY));
  return {
    daysLeft: Math.ceil((toDate(targetDate) - toDate(today)) / DAY),
    timeElapsed: elapsed / total,
    stagesDone: stages.filter((s) => s.completed).length,
    stagesTotal: stages.length,
  };
}

const LIMITS = { posts_per_week: [0, 14], connections_per_week: [0, 100], messages_per_week: [0, 100] };

/** Validates a stage from the UI. Returns { errors, value }. */
function validateStage(input) {
  const errors = [];
  const name = String(input.name || '').trim();
  if (!name) errors.push('Name is required');
  if (name.length > 100) errors.push('Name must be at most 100 characters');
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(input.start_date || '') || Number.isNaN(toDate(input.start_date).getTime())) errors.push('start_date must be YYYY-MM-DD');
  if (!re.test(input.end_date || '') || Number.isNaN(toDate(input.end_date).getTime())) errors.push('end_date must be YYYY-MM-DD');
  if (!errors.length && input.end_date < input.start_date) errors.push('end_date must be on or after start_date');
  const value = { name, focus: String(input.focus || '').trim().slice(0, 500), start_date: input.start_date, end_date: input.end_date };
  for (const [k, [min, max]] of Object.entries(LIMITS)) {
    const n = Number(input[k]);
    if (!Number.isInteger(n) || n < min || n > max) errors.push(`${k} must be a whole number from ${min} to ${max}`);
    value[k] = n;
  }
  return { errors, value };
}

/** Everything the Goals view needs, from the stored goal + stages. */
function buildGoalView(goal, stages, today) {
  const sorted = [...stages].sort((a, b) => a.sort_order - b.sort_order || a.start_date.localeCompare(b.start_date));
  const current = goal.achieved ? null : currentStage(sorted, today);
  const week = weekBounds(today);
  return {
    goal: { ...goal, increasePct: Math.round(((goal.target_ctc_lpa - goal.current_ctc_lpa) / goal.current_ctc_lpa) * 100) },
    progress: goalProgress(sorted, goal.target_date, today),
    stages: sorted.map((s) => ({ ...s, status: stageStatus(s, current, today) })),
    current,
    thisWeek: current
      ? { ...week, stage: current.name, targets: { posts: current.posts_per_week, connections: current.connections_per_week, messages: current.messages_per_week } }
      : { ...week, stage: null, targets: { posts: 0, connections: 0, messages: 0 } },
  };
}

module.exports = { weekBounds, currentStage, stageStatus, goalProgress, validateStage, buildGoalView };
