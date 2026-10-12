// Loads every roadmap into one shape for the game layer: track → levels → lessons { ref, title, minutes, done, touched, doneMs }.
//   ai              levels = the 14 roadmap levels, lessons = lessons            (done = ai_progress.done_ms)
//   lld / hld       levels = roadmap levels,     lessons = lessons            (done = learn_progress.done_ms)
//   dsa             levels = plan weeks,         lessons = plan days             (done = every task + core problem done)
//   react/dotnet/node levels = roadmap weeks,    lessons = roadmap rows          (done = 📖 learn (if any) + 🛠 build / ✅ checkpoint)
// Also returns the inputs for XP (solved problems) and minutes learned (estimated minutes of finished items).
const { ROADMAP } = require('../ai/feeds');
const { MODULES } = require('../learn/modules');

const TRACKS = [
  { key: 'ai', label: 'AI + FDE' },
  { key: 'dsa', label: 'DSA' },
  { key: 'lld', label: 'LLD' },
  { key: 'hld', label: 'HLD' },
  { key: 'react', label: 'React' },
  { key: 'dotnet', label: '.NET' },
  { key: 'node', label: 'Node.js' },
];
const PROJECT_AREAS = ['react', 'dotnet', 'node'];
const LINKED_KINDS = ['practice', 'selftest']; // ticked automatically from their problems (progress.js): count the problems instead
const PROBLEM_MINUTES = 20; // when you didn't log the time a problem took
const ms = (d) => (d ? new Date(d).getTime() : null);
const maxMs = (list) => Math.max(0, ...list.map((x) => x || 0)) || null;

async function loadTracks(pool) {
  const r = await pool.request().query(`
    SELECT lesson_id, done_ms FROM dbo.ai_progress WHERE done_ms IS NOT NULL;
    SELECT track, lesson_id, done_ms FROM dbo.learn_progress WHERE done_ms IS NOT NULL;
    SELECT week_no, title FROM dbo.weeks ORDER BY week_no;
    SELECT CAST(id AS int) AS id, week_no, focus, CONVERT(char(10), plan_date, 23) AS plan_date FROM dbo.days ORDER BY plan_date, id;
    SELECT CAST(day_id AS int) AS day_id, kind, minutes, done, done_at FROM dbo.tasks;
    SELECT CAST(id AS int) AS id, CAST(day_id AS int) AS day_id, difficulty, is_stretch, status, time_taken_min,
           COALESCE(solved_at, updated_at) AS solved_at FROM dbo.problems;
    SELECT CAST(t.id AS int) AS id, p.area, t.week_no, t.week_title, t.title, t.kind, t.learn, t.done, t.learn_done, t.done_at,
           CONVERT(char(10), t.plan_date, 23) AS plan_date
    FROM dbo.project_tasks t JOIN dbo.projects p ON p.code = t.project_code
    ORDER BY t.plan_date, CASE t.kind WHEN 'build' THEN 0 ELSE 1 END, t.id;`);
  const [aiRows, learnRows, weeks, days, tasks, problems, projectRows] = r.recordsets;
  const credits = [];

  // ---- AI + FDE
  const aiDone = new Map(aiRows.map((x) => [x.lesson_id, Number(x.done_ms)]));
  const ai = {
    ...TRACKS[0],
    levels: ROADMAP.levels.map((lv) => ({
      n: lv.n, title: lv.title, goal: lv.goal,
      lessons: lv.lessons.map((x) => {
        const doneMs = aiDone.get(x.id) || null;
        if (doneMs) credits.push({ ms: doneMs, track: 'ai', ref: x.id, minutes: x.minutes });
        return { ref: x.id, title: x.title, minutes: x.minutes, done: !!doneMs, touched: !!doneMs, doneMs };
      }),
    })),
  };

  // ---- LLD / HLD (same shape as AI + FDE)
  const learn = Object.values(MODULES).map((m) => {
    const doneAt = new Map(learnRows.filter((x) => x.track === m.key).map((x) => [x.lesson_id, Number(x.done_ms)]));
    return {
      ...TRACKS.find((t) => t.key === m.key),
      levels: m.roadmap.levels.map((lv) => ({
        n: lv.n, title: lv.title, goal: lv.goal,
        lessons: lv.lessons.map((x) => {
          const doneMs = doneAt.get(x.id) || null;
          if (doneMs) credits.push({ ms: doneMs, track: m.key, ref: x.id, minutes: x.minutes });
          return { ref: x.id, title: x.title, minutes: x.minutes, done: !!doneMs, touched: !!doneMs, doneMs };
        }),
      })),
    };
  });

  // ---- DSA: a day is a lesson
  const byDay = new Map(days.map((d) => [d.id, { tasks: [], problems: [] }]));
  for (const t of tasks) byDay.get(t.day_id)?.tasks.push(t);
  const solved = [];
  for (const p of problems) {
    if (p.day_id != null) byDay.get(p.day_id)?.problems.push(p);
    if (p.status === 'todo') continue;
    solved.push({ id: p.id, solvedMs: ms(p.solved_at), difficulty: p.difficulty });
    credits.push({ ms: ms(p.solved_at), track: 'dsa', ref: p.day_id != null ? `d${p.day_id}` : `p${p.id}`, minutes: p.time_taken_min || PROBLEM_MINUTES });
  }
  for (const t of tasks) {
    if (t.done && !LINKED_KINDS.includes(t.kind)) credits.push({ ms: ms(t.done_at), track: 'dsa', ref: `d${t.day_id}`, minutes: t.minutes });
  }
  const dsa = {
    ...TRACKS.find((t) => t.key === 'dsa'),
    levels: weeks.map((w) => ({
      n: w.week_no, title: w.title,
      lessons: days.filter((d) => d.week_no === w.week_no).map((d) => {
        const { tasks: ts, problems: ps } = byDay.get(d.id);
        const core = ps.filter((p) => !p.is_stretch);
        const done = ts.length + core.length > 0 && ts.every((t) => t.done) && core.every((p) => p.status !== 'todo');
        const touched = ts.some((t) => t.done) || ps.some((p) => p.status !== 'todo');
        const doneMs = done ? maxMs([...ts.map((t) => ms(t.done_at)), ...core.map((p) => ms(p.solved_at))]) : null;
        return { ref: `d${d.id}`, title: d.focus, minutes: ts.reduce((s, t) => s + (t.minutes || 0), 0), done, touched, doneMs, planDate: d.plan_date };
      }),
    })),
  };

  // ---- React / .NET / Node: a roadmap row (learn + build, or a weekly checkpoint) is a lesson, a week is a level
  const projects = PROJECT_AREAS.map((area) => {
    const rows = projectRows.filter((t) => t.area === area);
    const levels = [];
    for (const t of rows) {
      let lv = levels.find((x) => x.weekNo === t.week_no);
      if (!lv) levels.push((lv = { n: levels.length + 1, weekNo: t.week_no, title: t.week_title, lessons: [] }));
      const done = !!t.done && (!t.learn || !!t.learn_done);
      const minutes = t.learn ? 60 : 30;
      const doneMs = done ? ms(t.done_at) : null;
      if (doneMs) credits.push({ ms: doneMs, track: area, ref: `t${t.id}`, minutes });
      lv.lessons.push({ ref: `t${t.id}`, title: t.title, minutes, kind: t.kind, done, touched: !!t.done || !!t.learn_done, doneMs, planDate: t.plan_date });
    }
    return { ...TRACKS.find((x) => x.key === area), levels };
  });

  return { tracks: [ai, dsa, ...learn, ...projects], solved, credits };
}

module.exports = { TRACKS, loadTracks };
