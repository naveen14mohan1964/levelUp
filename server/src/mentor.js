// The AI mentor: a senior-engineer coach that knows your live progress.
// Modes: chat · hint (4-level ladder) · explain · review · plan · mock
const fs = require('fs');
const path = require('path');
const { sql, getPool } = require('./db');
const { generate } = require('./gemini');
const { readSettings } = require('./routes/settings');
const { sessionFor, stepTarget, weekOf } = require('./workout');
const { templateFor } = require('./schedule');

const PLAN = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'plan.json'), 'utf8'));

// Every URL the mentor may cite: verified docs + plan problems. Anything else gets stripped.
const ALLOWED_URLS = new Set([
  ...PLAN.days.flatMap((d) => [...(d.links || []), ...d.problems].map((x) => x.url)),
  ...PLAN.projects.flatMap((p) => [...p.resources, ...p.tasks.flatMap((t) => t.learnLinks || [])].map((x) => x.url)),
  ...(PLAN.channels || []).map((x) => x.url),
]);
const norm = (u) => u.replace(/[).,;:!?'"\]]+$/, '').replace(/\/$/, '');
const ALLOWED_NORM = new Set([...ALLOWED_URLS].map(norm));

/** Replace any URL the mentor invented with a note, so every link you see is a verified one. */
function enforceLinks(text) {
  let removed = 0;
  // Only prose is policed: URLs inside code (```blocks``` or `inline`) are examples like "https://your-api.com".
  const out = text.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((part, i) => (i % 2 ? part : part.replace(/https?:\/\/[^\s)<>\]"']+/g, (url) => {
    if (ALLOWED_NORM.has(norm(url)) || /^https:\/\/leetcode\.com\/problems\/[\w-]+\/?$/.test(norm(url) + '/')) return url;
    removed++;
    if (process.env.MENTOR_DEBUG) console.warn('[mentor] removed unverified link:', url);
    return '(link removed: not in the verified list)';
  }))).join('');
  return { text: out, removed };
}

/** Models sometimes answer with LaTeX ($\mathcal{O}(n^2)$). The UI doesn't render math, so turn it into `O(n^2)`. Code blocks are left alone. */
function plainMath(text) {
  const SYMBOLS = { log: 'log', times: '×', cdot: '·', le: '≤', leq: '≤', ge: '≥', geq: '≥', approx: '≈', to: '→', infty: '∞', sqrt: '√' };
  return text.split(/(```[\s\S]*?```)/g).map((part, i) => (i % 2 ? part : part.replace(/\$\$?([^$\n]{1,120}?)\$\$?/g, (m, inner) => {
    if (!/\\|\^|_|O\(/.test(inner)) return m; // probably a real dollar sign
    const clean = inner
      .replace(/\\mathcal\{O\}|\\mathcal O/g, 'O')
      .replace(/\\(text|mathrm|mathbf)\{([^}]*)\}/g, '$2')
      .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)')
      .replace(/\\([a-z]+)/g, (x, name) => SYMBOLS[name] ?? name)
      .replace(/[{}]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return `\`${clean}\``;
  }))).join('');
}

const PERSONA = `You are "Mentor", a senior software engineer (10+ years, ex-FAANG interviewer and tech lead) who coaches one person.

About them: 23-year-old software engineer in India, full-time at an MNC, switching from 7 LPA to a 20 LPA product/FAANG role.
In a 22-week plan (Mon 5 Oct 2026 → Sun 7 Mar 2027): DSA in **Java** from zero (5 h/day, Phase 1 learn weeks 1–13, Phase 2 revision + mocks weeks 14–22),
1 h/day from-scratch projects (Node.js weeks 1–6, ASP.NET Core/.NET 10 weeks 7–14, React + TypeScript weeks 15–21), and a home fat-loss plan (115 → 80 kg, 185 cm, non-veg).

How you mentor:
- Think like an interviewer and a tech lead: patterns, invariants, trade-offs, complexity, edge cases, clean code.
- Socratic first: help them discover the idea; give the answer only when the mode asks for it.
- Be concrete and concise. Markdown with short headings, bullet points, and fenced code blocks.
- Never use LaTeX or $...$ math. Write complexity as plain text or inline code, e.g. \`O(n log n)\`.
- Code language: Java for DSA, C# for .NET, TypeScript/JavaScript for React and Node.
- Tie advice to their plan and current progress (provided below). Point out the next concrete action.
- Links: only cite URLs from the "Verified links" list in the context. Never invent or guess URLs.
- Tone: warm, direct, never shaming, no fake urgency. Missed days are normal; use the plan's catch-up rules.
- Health: you are not a doctor. For pain, dizziness or medical questions, tell them to see one.`;

const CATCH_UP_RULES = `Catch-up rules from their plan:
A) ≤1 day behind → absorb in Sunday's 3 h buffer.
B) 2–3 days → drop ★ stretch problems for this + next week; use the next two Sunday buffers.
C) 4 days–1 week → rule B + merge revision weeks 14–15.
D) >1 week → shift remaining dates; never borrow from weeks 18–21 (weak areas + mocks).
E) Only 1 hour → "minimum viable day": clear the spaced-repetition queue + 1 problem.
Hard rules: never skip a topic (shrink it), never skip the weekly self-test, no 8-hour binge days, priority = SR queue → core problems → concept → stretch. Sleep 7 h is non-negotiable.`;

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A compact, up-to-date snapshot of their progress for the model (and for the UI chip). */
async function buildContext(date = localToday()) {
  const s = await readSettings();
  const pool = await getPool();
  const planDate = date < s.start_date ? s.start_date : date;
  const r = await pool.request().input('d', sql.Date, planDate).input('today', sql.Date, date).query(`
    SELECT d.week_no, d.day_type, d.focus, d.links, w.title AS week_title, w.phase
      FROM dbo.days d JOIN dbo.weeks w ON w.week_no = d.week_no WHERE d.plan_date = @d;
    SELECT t.kind, t.title, t.done FROM dbo.tasks t JOIN dbo.days d ON d.id = t.day_id WHERE d.plan_date = @d ORDER BY t.sort_order;
    SELECT p.lc_number, p.title, p.difficulty, p.status, p.is_stretch FROM dbo.problems p JOIN dbo.days d ON d.id = p.day_id WHERE d.plan_date = @d ORDER BY p.sort_order;
    SELECT COUNT(*) AS n FROM dbo.problems WHERE next_review <= @today;
    SELECT difficulty, COUNT(*) AS n FROM dbo.problems WHERE status <> 'todo' GROUP BY difficulty;
    SELECT TOP 3 topic, CAST(AVG(CAST(confidence AS float)) AS decimal(3,1)) AS avg_conf, COUNT(*) AS n,
           SUM(CASE WHEN status = 'revision' THEN 1 ELSE 0 END) AS revision
      FROM dbo.problems WHERE confidence IS NOT NULL GROUP BY topic
      HAVING AVG(CAST(confidence AS float)) < 3.5 OR SUM(CASE WHEN status = 'revision' THEN 1 ELSE 0 END) > 0
      ORDER BY AVG(CAST(confidence AS float));
    SELECT COUNT(*) AS behind FROM dbo.tasks t JOIN dbo.days d ON d.id = t.day_id WHERE d.plan_date < @today AND t.done = 0;
    SELECT COUNT(*) AS behind FROM dbo.problems p JOIN dbo.days d ON d.id = p.day_id
      WHERE d.plan_date < @today AND p.status = 'todo' AND p.is_stretch = 0;
    SELECT TOP 3 t.kind, t.learn, t.title, t.done, t.learn_done, CONVERT(char(10), t.plan_date, 23) AS plan_date, p.name AS project, p.area
      FROM dbo.project_tasks t JOIN dbo.projects p ON p.code = t.project_code
      WHERE t.plan_date >= @d ORDER BY t.plan_date, CASE t.kind WHEN 'build' THEN 0 ELSE 1 END;
    SELECT COALESCE(SUM(calories), 0) AS kcal, COALESCE(SUM(protein_g), 0) AS protein FROM dbo.meals WHERE log_date = @today;
    SELECT water_ml, steps, weight_kg, sleep_h FROM dbo.body_log WHERE log_date = @today;`);
  const [day, tasks, probs, due, solved, weak, behindTasks, behindProbs, lessons, food, body] = r.recordsets;
  const d = day[0];
  const week = weekOf(date, s.start_date);
  const workout = sessionFor(date, s.start_date);
  const lesson = lessons.find((x) => x.plan_date === lessons[0]?.plan_date && x.kind === 'build') || lessons[0];
  const solvedBy = Object.fromEntries(solved.map((x) => [x.difficulty, x.n]));

  return {
    date,
    planStarted: date >= s.start_date,
    week: week >= 1 ? week : null,
    phase: d?.phase ?? null,
    weekTitle: d?.week_title ?? null,
    dayType: d?.day_type ?? null,
    focus: d?.focus ?? null,
    links: JSON.parse(d?.links || '[]'),
    tasks,
    problems: probs,
    reviewsDue: due[0].n,
    solved: { E: solvedBy.E || 0, M: solvedBy.M || 0, H: solvedBy.H || 0 },
    weakTopics: weak,
    behind: { tasks: behindTasks[0].behind, problems: behindProbs[0].behind },
    lesson: lesson || null,
    workout: { session: workout.session, phase: workout.phase },
    nutrition: {
      kcal: food[0].kcal, kcalTarget: s.calorie_target, protein: Number(food[0].protein), proteinTarget: s.protein_target_g,
      water: body[0]?.water_ml || 0, waterTarget: s.water_target_ml, steps: body[0]?.steps || 0, stepTarget: stepTarget(week),
      weight: body[0]?.weight_kg != null ? Number(body[0].weight_kg) : null, sleep: body[0]?.sleep_h != null ? Number(body[0].sleep_h) : null,
    },
  };
}

function contextText(c) {
  const lines = [
    `Today: ${c.date}${c.planStarted ? '' : ' (plan starts Mon 2026-10-05; showing Day 1)'}${c.week ? ` · Week ${c.week}` : ''}${c.phase ? ` · Phase ${c.phase}` : ''}`,
    c.focus ? `DSA focus: ${c.focus} (${c.weekTitle}; ${c.dayType})` : 'No DSA plan for today.',
    c.tasks.length ? `DSA blocks: ${c.tasks.map((t) => `${t.done ? '[x]' : '[ ]'} ${t.kind}: ${t.title}`).join(' | ')}` : '',
    c.problems.length ? `Today's problems: ${c.problems.map((p) => `${p.status === 'todo' ? '[ ]' : '[x]'} ${p.lc_number ? `${p.lc_number}. ` : ''}${p.title} (${p.difficulty}${p.is_stretch ? ', stretch' : ''})`).join('; ')}` : '',
    `Spaced-repetition reviews due: ${c.reviewsDue}. Solved so far: ${c.solved.E} Easy, ${c.solved.M} Medium, ${c.solved.H} Hard.`,
    c.weakTopics.length ? `Weak topics (low confidence): ${c.weakTopics.map((w) => `${w.topic} (avg ${w.avg_conf}/5, ${w.revision} need revision)`).join(', ')}` : 'Weak topics: not enough data yet.',
    `Behind schedule: ${c.behind.tasks} DSA blocks and ${c.behind.problems} core problems from earlier days are unfinished.`,
    c.lesson ? `Project hour (${c.lesson.project}, ${c.lesson.plan_date}): learn "${c.lesson.learn || '-'}" → build "${c.lesson.title}" (${c.lesson.done ? 'done' : 'not done'}).` : '',
    `Workout today: ${c.workout.session} (${c.workout.phase}).`,
    `Nutrition today: ${c.nutrition.kcal}/${c.nutrition.kcalTarget} kcal, ${c.nutrition.protein}/${c.nutrition.proteinTarget} g protein, water ${c.nutrition.water}/${c.nutrition.waterTarget} ml, steps ${c.nutrition.steps}/${c.nutrition.stepTarget}${c.nutrition.weight ? `, weight ${c.nutrition.weight} kg` : ''}${c.nutrition.sleep ? `, slept ${c.nutrition.sleep} h` : ''}.`,
    c.links.length ? `Verified links for today: ${c.links.map((l) => `${l.label} <${l.url}>`).join('; ')}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

const HINT_LEVELS = {
  1: { label: 'Nudge', ask: 'Give ONE guiding question or observation (max 3 sentences) that points toward the key insight. Do NOT name the algorithm or data structure, no code, no steps.' },
  2: { label: 'Pattern', ask: 'Name the pattern / data structure that fits and WHY (what property of the problem signals it), the key invariant to maintain, and the target time/space complexity. No code and no step-by-step algorithm.' },
  3: { label: 'Plan', ask: 'Give the algorithm as numbered plain-English steps or language-neutral pseudocode (NOT Java), the edge cases to handle, and the complexity. Still no Java code.' },
  4: { label: 'Solution', ask: 'Give a clean, interview-quality Java solution (class Solution) with brief comments, explain why it works, state time/space complexity, dry-run it on a small example, then list 2 follow-up questions an interviewer might ask.' },
};

async function loadThread(thread, limit = 200) {
  const pool = await getPool();
  const r = await pool.request().input('t', sql.NVarChar, thread).input('n', sql.Int, limit).query(`
    SELECT * FROM (SELECT TOP (@n) CAST(id AS int) AS id, role, mode, content, created_at FROM dbo.mentor_messages
      WHERE thread = @t ORDER BY id DESC) x ORDER BY id`);
  return r.recordset;
}

async function saveMessage(thread, role, mode, content) {
  const pool = await getPool();
  await pool.request().input('t', sql.NVarChar, thread).input('r', sql.NVarChar, role).input('m', sql.NVarChar, mode)
    .input('c', sql.NVarChar(sql.MAX), content)
    .query('INSERT INTO dbo.mentor_messages (thread, role, mode, content) VALUES (@t, @r, @m, @c)');
}

async function getProblem(id) {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, id).query(`
    SELECT CAST(id AS int) AS id, lc_number, title, url, difficulty, topic, notes, status, confidence, hint
    FROM dbo.problems WHERE id = @id`);
  return r.recordset[0];
}

async function getLessonTask(id) {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, id).query(`
    SELECT CAST(t.id AS int) AS id, t.kind, t.learn, t.learn_links, t.title, t.week_title, p.name AS project, p.area
    FROM dbo.project_tasks t JOIN dbo.projects p ON p.code = t.project_code WHERE t.id = @id`);
  const t = r.recordset[0];
  if (t) t.learn_links = JSON.parse(t.learn_links || '[]');
  return t;
}

const LANG = { node: 'JavaScript (Node.js)', dotnet: 'C# (.NET 10)', react: 'TypeScript (React)', dsa: 'Java' };

/**
 * Builds the prompt for one mentor turn, calls Gemini with the thread history, stores both sides.
 * Returns { reply, display, removedLinks }.
 */
async function ask(body) {
  const { thread, mode = 'chat' } = body;
  const context = await buildContext(body.date || localToday());
  let display; // what the user's bubble shows
  let prompt; // what the model actually gets for this turn
  let extraSystem = '';

  if (mode === 'hint') {
    const p = await getProblem(Number(body.problemId));
    if (!p) throw Object.assign(new Error('Problem not found'), { status: 404 });
    const level = HINT_LEVELS[Number(body.level)] ? Number(body.level) : 1;
    display = `💡 Hint ${level}/4: ${HINT_LEVELS[level].label}`;
    prompt = `Problem: ${p.lc_number ? `LeetCode ${p.lc_number}. ` : ''}${p.title} (${{ E: 'Easy', M: 'Medium', H: 'Hard' }[p.difficulty]}, topic: ${p.topic}) ${p.url || ''}
${p.hint ? `Plan note: ${p.hint}\n` : ''}${p.notes ? `Their notes so far: ${p.notes}\n` : ''}${body.message ? `What they tried / where they're stuck: ${body.message}\n` : ''}
Hint level ${level} of 4 (${HINT_LEVELS[level].label}). ${HINT_LEVELS[level].ask}
Earlier hints in this conversation may exist: build on them and don't repeat them.`;
    if (body.message) display += `\n\n${body.message}`;
  } else if (mode === 'explain') {
    let topic = body.topic;
    let area = body.area || 'dsa';
    let links = [];
    if (body.taskId) {
      const t = await getLessonTask(Number(body.taskId));
      if (!t) throw Object.assign(new Error('Lesson not found'), { status: 404 });
      topic = t.learn || t.title;
      area = t.area;
      links = t.learn_links;
      body.lessonNote = `This is from the ${t.project} roadmap, week "${t.week_title}". The build task that uses it: "${t.title}". Explain it for that lesson (it may be a future lesson; don't tie it to today's project).`;
    }
    if (!topic) throw Object.assign(new Error('topic is required'), { status: 400 });
    display = `📖 Explain: ${topic}`;
    prompt = `Explain this concept to me: "${topic}" (area: ${area}; I'll apply it in ${LANG[area] || 'Java'}).
Structure: 1) the intuition in plain words, 2) the mental model / how it works, 3) a minimal ${LANG[area] || 'Java'} example,
4) 3 common mistakes, 5) one interview-style question about it (don't answer it), 6) which of these docs to read first and why:
${links.map((l) => `- ${l.label}: ${l.url}`).join('\n') || '(use the verified links from the context if relevant)'}
${body.lessonNote || ''}
${body.message ? `My specific question: ${body.message}` : ''}`;
  } else if (mode === 'review') {
    if (!body.code || body.code.length < 10) throw Object.assign(new Error('Paste some code to review'), { status: 400 });
    let about = body.about || '';
    if (body.problemId) {
      const p = await getProblem(Number(body.problemId));
      if (p) about = `LeetCode ${p.lc_number}. ${p.title} (${p.difficulty})`;
    } else if (body.taskId) {
      const t = await getLessonTask(Number(body.taskId));
      if (t) about = `${t.project} task: ${t.title}`;
    }
    const language = body.language || 'Java';
    display = `🔍 Review my ${language} code${about ? ` for ${about}` : ''}`;
    prompt = `Review this ${language} code${about ? ` for: ${about}` : ''} like a senior engineer in a code review / an interviewer:
1) Correctness: bugs and failing edge cases (quote the line), 2) time and space complexity, 3) readability and naming,
4) idiomatic ${language}, 5) the single most valuable improvement. Show small diffs, not a full rewrite, unless it's fundamentally wrong.
End with a 1–4 score for: correctness, efficiency, code quality.
${body.message ? `Context from me: ${body.message}\n` : ''}
\`\`\`
${body.code.slice(0, 12000)}
\`\`\``;
  } else if (mode === 'plan') {
    const energy = ['low', 'normal', 'high'].includes(body.energy) ? body.energy : 'normal';
    const hours = Number(body.hours) > 0 ? Math.min(Number(body.hours), 12) : null;
    display = `🗓️ Plan my day (energy: ${energy}${hours ? `, ${hours} h available` : ''})${body.message ? `\n\n${body.message}` : ''}`;
    prompt = `Plan my day. Energy: ${energy}. ${hours ? `Hours available for study today: ${hours}.` : 'Normal hours (5 h DSA + 1 h project).'}
${body.message ? `Notes: ${body.message}` : ''}
${CATCH_UP_RULES}
My fixed timetable for this day (keep these times; adjust what goes inside the blocks):
${templateFor((new Date(context.date + 'T00:00:00Z').getUTCDay() + 6) % 7).map((b) => `${b.start}–${b.end} ${b.title}`).join('\n')}
Give: 1) a one-line assessment (am I on track?), 2) today's timetable as a Markdown table — this table is required, always include it — (Time | Block | Exactly what to do) using my real tasks/problems/lesson/workout,
3) which catch-up rule applies, if any, and what to drop, 4) one small win to start with right now. Keep 7 h sleep.${energy === 'low' ? ' Energy is low: use the 10-minute workout mode and the minimum viable day.' : ''}`;
  } else if (mode === 'mock') {
    display = body.message || 'Start the mock interview';
    prompt = body.message || "Let's start the mock interview.";
    const covered = PLAN.days.filter((d) => d.date <= context.date && d.type === 'study').map((d) => d.topic);
    extraSystem = `\n\nYOU ARE NOW THE INTERVIEWER for a 45-minute FAANG-style coding round.
- Pick ONE unseen Medium problem using only topics they've covered so far: ${[...new Set(covered)].join(', ') || 'arrays, hashing, two pointers (plan not started yet)'}. Describe it fully with examples (don't name the LeetCode problem).
- Behave like a real interviewer: ask clarifying questions back, ask for brute force first, then optimisation, ask for complexity, ask them to dry-run. Give small hints only if they're stuck for a while.
- Never paste the solution. Keep each reply short like spoken conversation.
- When they say "end interview" (or after they finish), give a scored rubric: Communication, Problem solving, Code quality, Testing (1–4 each), 3 strengths, 3 improvements, and a verdict (Strong hire / Hire / Lean no / No).`;
  } else {
    if (!body.message?.trim()) throw Object.assign(new Error('message is required'), { status: 400 });
    display = body.message;
    prompt = body.message;
  }

  const history = await loadThread(thread, 16);
  const contents = [
    ...history.map((m) => ({ role: m.role, parts: [{ text: m.content }] })),
    { role: 'user', parts: [{ text: prompt }] },
  ];
  const system = `${PERSONA}${extraSystem}\n\n## Their live progress (from the tracker)\n${contextText(context)}`;
  // Code review needs real reasoning about correctness; everything else answers fast on low thinking.
  const raw = await generate(contents, { system, temperature: mode === 'mock' ? 0.7 : mode === 'plan' ? 0.2 : 0.4, thinking: mode === 'review' ? 'medium' : undefined });
  const { text, removed } = enforceLinks(plainMath(raw));

  // Store the model-facing prompt for continuity, but show the short display text in the UI.
  await saveMessage(thread, 'user', mode, mode === 'chat' || mode === 'mock' ? prompt : `${display}\n\n<!--prompt-->\n${prompt}`);
  await saveMessage(thread, 'model', mode, text);
  return { reply: text, removedLinks: removed };
}

module.exports = { ask, buildContext, contextText, loadThread, enforceLinks, plainMath, HINT_LEVELS, ALLOWED_URLS };
