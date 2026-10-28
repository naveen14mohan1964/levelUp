// Parses ../../STUDY_PLAN.md (Phase 1) + the Phase 2 definition below into server/data/plan.json.
// Run: node scripts/build-plan.js
const fs = require('fs');
const path = require('path');

const START_DATE = '2026-10-05'; // Monday of Week 1
const PLAN_MD = path.join(__dirname, '..', '..', 'STUDY_PLAN.md');
const OUT = path.join(__dirname, '..', 'server', 'data', 'plan.json');

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Topic per study day (Mon..Sat) for Phase 1, and the self-test topic for Sunday.
const TOPICS = {
  1: ['Basics & Math', 'Basics & Math', 'Arrays', 'Arrays', 'Bit Manipulation', 'Arrays', 'Arrays'],
  2: ['Two Pointers', 'Two Pointers', 'Prefix Sum', 'Arrays', 'Arrays', 'Intervals', 'Arrays'],
  3: ['Hashing', 'Strings', 'Strings', 'Sliding Window', 'Sliding Window', 'Sliding Window', 'Sliding Window'],
  4: ['Sorting', 'Sorting', 'Binary Search', 'Binary Search', 'Binary Search', 'Binary Search', 'Binary Search'],
  5: ['Recursion', 'Backtracking', 'Backtracking', 'Backtracking', 'Backtracking', 'Backtracking', 'Backtracking'],
  6: Array(7).fill('Linked List'),
  7: ['Stack & Queue', 'Stack & Queue', 'Monotonic Stack', 'Monotonic Stack', 'Stack & Queue', 'Stack & Queue', 'Monotonic Stack'],
  8: Array(7).fill('Binary Tree'),
  9: ['BST', 'BST', 'Heap', 'Heap', 'Heap', 'Trie', 'Heap'],
  10: Array(7).fill('Graphs'),
  11: ['Shortest Path', 'Shortest Path', 'Union-Find', 'Graphs', 'Greedy', 'Greedy', 'Union-Find'],
  12: Array(7).fill('Dynamic Programming'),
  13: ['Dynamic Programming', 'Dynamic Programming', 'Dynamic Programming', 'Dynamic Programming', 'Dynamic Programming', 'Advanced', 'Dynamic Programming'],
};

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-');
}

// Parentheticals in the plan that are study hints, not part of the LeetCode title.
const HINT_RE = /\s*\(((?:implement|divide|solve with|segment tree|Prim)[^)]*)\)\s*$/;

function parseProblems(cell, topic, { selftest = false } = {}) {
  const out = [];
  const text = cell.split(' — ')[0];
  const re = /\[([EMH])(★?)\] (\d+)\. ([^·|]+?)\s*(?=·|$)|GfG: ([^·|]+?)\s*(?=·|$)/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[5]) {
      const title = m[5].trim();
      out.push({
        source: 'GfG', number: null, title, difficulty: 'M', stretch: false, selftest, topic, hint: null,
        url: 'https://www.google.com/search?q=' + encodeURIComponent('GeeksforGeeks practice ' + title),
      });
      continue;
    }
    let title = m[4].trim();
    let hint = null;
    const h = title.match(HINT_RE);
    if (h) {
      hint = h[1];
      title = title.replace(HINT_RE, '');
    }
    const slug = slugify(title);
    out.push({
      source: 'LeetCode', number: Number(m[3]), title, difficulty: m[1], stretch: m[2] === '★', selftest, topic, hint,
      url: `https://leetcode.com/problems/${slug}/`,
    });
  }
  return out;
}

function stripMd(s) {
  return s.replace(/\*\*/g, '').replace(/\*/g, '').trim();
}

function parsePhase1(md) {
  const phase1 = md.split(/^## 2\./m)[0];
  const sections = phase1.split(/^### Week /m).slice(1);
  const weeks = [];
  const days = [];

  for (const sec of sections) {
    const lines = sec.split('\n');
    const header = lines[0];
    const weekNo = Number(header.split(' ')[0]);
    const title = header.split('·').slice(2).join('·').trim();
    const weekStart = addDays(START_DATE, (weekNo - 1) * 7);

    let resources = '';
    let keyConcepts = [];
    let milestone = '';
    for (let i = 1; i < lines.length; i++) {
      const l = lines[i];
      if (l.startsWith('**Resources:**')) resources = stripMd(l.replace('**Resources:**', ''));
      if (l.startsWith('**Key concepts:**')) {
        const inline = l.replace('**Key concepts:**', '').trim();
        if (inline) keyConcepts = inline.split(' · ').map(stripMd);
        else {
          for (let j = i + 1; j < lines.length && lines[j].startsWith('- '); j++) keyConcepts.push(stripMd(lines[j].slice(2)));
        }
      }
      if (l.startsWith('**Milestone')) milestone = stripMd(l.replace(/^\*\*Milestone[^:]*:\*\*/, ''));
    }

    weeks.push({
      week: weekNo, phase: 1, title, startDate: weekStart, endDate: addDays(weekStart, 6),
      resources, keyConcepts, milestone,
    });

    const conceptMin = weekNo <= 2 ? 135 : 105;
    const practiceMin = weekNo <= 2 ? 120 : 150;

    for (const l of lines) {
      const study = l.match(/^\| (Mon|Tue|Wed|Thu|Fri|Sat) [^|]*\| ([^|]*)\| (.*)\|\s*$/);
      if (study) {
        const dow = DOW.indexOf(study[1]);
        const focus = stripMd(study[2]);
        const topic = TOPICS[weekNo][dow];
        days.push({
          date: addDays(weekStart, dow), week: weekNo, dow, type: 'study', focus, topic,
          tasks: [
            { kind: 'concept', title: `Learn: ${focus}`, minutes: conceptMin },
            { kind: 'practice', title: `LeetCode block: solve today's problems (time-box, then log each one)`, minutes: practiceMin },
            { kind: 'review', title: 'Review: clear the spaced-repetition queue + write a 3-line note per problem', minutes: 45 },
          ],
          problems: parseProblems(study[3], topic),
        });
        continue;
      }
      const sun = l.match(/^\| \*\*Sun [^|]*\*\* \| (.*)\|\s*$/);
      if (sun) {
        const topic = TOPICS[weekNo][6];
        const tasks = [
          { kind: 'selftest', title: 'Self-test: solve the 3 unseen problems in one 90-minute sitting, no hints', minutes: 90 },
          { kind: 'concept', title: "Concept quiz: write this week's templates + complexities from memory", minutes: 30 },
          { kind: 'review', title: 'Buffer: catch up missed core problems → spaced-repetition queue → stretch problems', minutes: 180 },
        ];
        if (weekNo >= 7) tasks.push({ kind: 'contest', title: 'Optional: LeetCode Weekly Contest (Sun 8:00 AM IST)', minutes: 0 });
        if (weekNo === 13) tasks.push({ kind: 'review', title: 'Phase 1 retrospective: list 3 weakest topics, skipped stretch problems, average solve times', minutes: 30 });
        days.push({
          date: addDays(weekStart, 6), week: weekNo, dow: 6, type: 'selftest',
          focus: `Week ${weekNo} self-test + buffer`, topic, tasks,
          problems: parseProblems(sun[1], topic, { selftest: true }),
        });
      }
    }
  }
  return { weeks, days };
}

// ---------- Phase 2 (Weeks 14–22) ----------
const SWEEP = (topic) => `Re-solve your 5 lowest-confidence ${topic} problems, then 2 unseen Mediums`;
const PHASE2 = [
  { week: 14, title: 'Topic sweep 1: linear structures', mocks: ['Sun'],
    days: ['Arrays + two pointers', 'Prefix sum / Kadane / intervals', 'Hashing + strings', 'Sliding window', 'Binary search', 'Sorting + mixed timed set'], sweep: true },
  { week: 15, title: 'Topic sweep 2: recursive structures', mocks: ['Sun'],
    days: ['Recursion', 'Backtracking', 'Linked lists', 'Stacks/queues + monotonic stack', 'Trees (traversal/height)', 'Trees (LCA/construction)'], sweep: true },
  { week: 16, title: 'Topic sweep 3: BST, heaps, graphs', mocks: ['Wed', 'Sun'],
    days: ['BST + TreeMap', 'Heaps + tries', 'Graph BFS/DFS + grids', 'Topological sort + cycles', 'Dijkstra / Bellman-Ford', 'DSU + MST'], sweep: true },
  { week: 17, title: 'Topic sweep 4: DP, greedy, advanced', mocks: ['Wed', 'Sun'],
    days: ['Greedy', '1D + grid DP', 'Knapsack', 'String DP + LIS', 'Stocks + interval DP', 'Segment tree / KMP + every ★ stretch problem you skipped'], sweep: true },
  { week: 18, title: 'Weak-area week 1', mocks: ['Tue', 'Thu', 'Sun'],
    days: Array(4).fill('Weak topics (60%) + mixed random Mediums (40%)').concat(['Hard day: 3 Hard problems', 'Weak topics (60%) + mixed random Mediums (40%)']) },
  { week: 19, title: 'Weak-area week 2', mocks: ['Tue', 'Thu', 'Sun'],
    days: Array(5).fill('Re-check weak topics on the dashboard; weak topics (60%) + mixed Mediums (40%)').concat(['Onsite simulation: 3 mocks back to back, 15-minute breaks']) },
  { week: 20, title: 'Interview simulation 1', mocks: ['Tue', 'Thu', 'Sat', 'Sun'],
    days: Array(6).fill('Blind 75, first half, in timed mode (~6 problems)') },
  { week: 21, title: 'Interview simulation 2', mocks: ['Tue', 'Thu', 'Sat', 'Sun'],
    days: ['Blind 75, second half, timed (~6)', 'Blind 75, second half, timed (~6)', 'Blind 75, second half, timed (~6)', 'Hard day: 3 Hard problems', 'Blind 75, second half, timed (~6)', 'Onsite simulation: 3 mocks back to back'] },
  { week: 22, title: 'Taper & consolidate', mocks: ['Tue', 'Sat'], taper: true,
    days: Array(6).fill('Re-solve your 50 starred must-remember problems + read your pattern template file') },
];

function buildPhase2() {
  const weeks = [];
  const days = [];
  for (const w of PHASE2) {
    const weekStart = addDays(START_DATE, (w.week - 1) * 7);
    weeks.push({
      week: w.week, phase: 2, title: w.title, startDate: weekStart, endDate: addDays(weekStart, 6),
      resources: 'LeetCode Top Interview 150, NeetCode 150, Striver SDE Sheet, LeetCode topic tags, contest archives',
      keyConcepts: w.days.filter((d, i, a) => a.indexOf(d) === i),
      milestone: w.sweep ? 'Every problem in these topics re-solved or re-rated; weak spots logged.' : '',
    });
    for (let dow = 0; dow < 7; dow++) {
      const date = addDays(weekStart, dow);
      const isMock = w.mocks.includes(DOW[dow]);
      if (dow === 6) {
        const tasks = [];
        if (w.week === 22) {
          tasks.push({ kind: 'review', title: 'Final review: read through your notes and pattern templates; rest', minutes: 180 });
        } else {
          if (isMock) tasks.push({ kind: 'mock', title: 'Mock interview: 45 min, 2 unseen problems, talk aloud, then score it', minutes: 75 });
          tasks.push({ kind: 'contest', title: 'LeetCode Weekly Contest (Sun 8:00 AM IST)', minutes: 90 });
          tasks.push({ kind: 'review', title: 'Weekly check: review the weak-topics panel and adjust next week', minutes: 30 });
          tasks.push({ kind: 'review', title: 'Buffer: catch-up + spaced-repetition queue', minutes: 120 });
        }
        days.push({ date, week: w.week, dow, type: 'revision', focus: `Week ${w.week} review + mocks`, topic: null, tasks, problems: [] });
        continue;
      }
      const focus = w.days[dow];
      const scale = w.taper ? 0.8 : 1;
      const tasks = [
        { kind: 'review', title: 'Spaced-repetition queue: re-solve every due problem from a blank editor', minutes: Math.round(60 * scale) },
        { kind: 'practice', title: `Timed practice: ${w.sweep ? SWEEP(focus) : focus}`, minutes: Math.round(120 * scale) },
        { kind: 'review', title: 'Post-mortem: log the root cause + fix for every miss', minutes: Math.round(75 * scale) },
        { kind: 'concept', title: "Concept repair: revisit the concepts behind today's misses; update your template file", minutes: Math.round(45 * scale) },
      ];
      if (isMock) tasks.splice(2, 0, { kind: 'mock', title: 'Mock interview: 45 min, 2 unseen problems, talk aloud, then score it', minutes: 75 });
      days.push({ date, week: w.week, dow, type: 'revision', focus, topic: null, tasks, problems: [] });
    }
  }
  return { weeks, days };
}

// ---------- Project track (§7 of STUDY_PLAN.md) ----------
const PROJECTS = [
  {
    code: 'jobhunt-api', area: 'dotnet', heading: 'Project 1', stack: ['.NET 10', 'ASP.NET Core', 'EF Core', 'SQL Server', 'Identity/JWT', 'xUnit', 'Serilog'],
    resources: [
      { label: 'ASP.NET Core Web API', url: 'https://learn.microsoft.com/en-us/aspnet/core/web-api/' },
      { label: 'EF Core', url: 'https://learn.microsoft.com/en-us/ef/core/' },
      { label: 'ASP.NET Core Identity', url: 'https://learn.microsoft.com/en-us/aspnet/core/security/authentication/identity' },
      { label: 'Integration tests', url: 'https://learn.microsoft.com/en-us/aspnet/core/test/integration-tests' },
      { label: 'FluentValidation', url: 'https://docs.fluentvalidation.net/en/latest/' },
      { label: 'roadmap.sh/aspnet-core', url: 'https://roadmap.sh/aspnet-core' },
    ],
  },
  {
    code: 'jobhunt-web', area: 'react', heading: 'Project 2', description: 'React + TypeScript front end for the JobHunt API: auth, Kanban board, dashboard, tests.', stack: ['React', 'TypeScript', 'Vite', 'TanStack Query', 'React Hook Form + Zod', 'dnd-kit', 'Vitest', 'Playwright'],
    resources: [
      { label: 'react.dev', url: 'https://react.dev/learn' },
      { label: 'React TypeScript cheatsheet', url: 'https://react-typescript-cheatsheet.netlify.app/' },
      { label: 'TanStack Query', url: 'https://tanstack.com/query/latest/docs/framework/react/overview' },
      { label: 'React Hook Form', url: 'https://react-hook-form.com/get-started' },
      { label: 'dnd-kit', url: 'https://dndkit.com/' },
      { label: 'Vitest', url: 'https://vitest.dev/guide/' },
      { label: 'Testing Library', url: 'https://testing-library.com/docs/react-testing-library/intro/' },
    ],
  },
  {
    code: 'snippetvault', area: 'node', heading: 'Project 3', stack: ['Node.js', 'Express', 'MongoDB', 'JWT', 'Jest', 'Socket.IO', 'Docker'],
    resources: [
      { label: 'Node.js docs', url: 'https://nodejs.org/docs/latest/api/' },
      { label: 'Express guide', url: 'https://expressjs.com/en/guide/routing/' },
      { label: 'Mongoose docs', url: 'https://mongoosejs.com/docs/guide.html' },
      { label: 'Zod', url: 'https://zod.dev/' },
      { label: 'Jest', url: 'https://jestjs.io/docs/getting-started' },
      { label: 'Socket.IO', url: 'https://socket.io/docs/v4/' },
      { label: 'roadmap.sh/nodejs', url: 'https://roadmap.sh/nodejs' },
    ],
  },
];

function parseProjects(md) {
  const track = md.split(/^## 7\./m)[1];
  if (!track) return [];
  const sections = track.split(/^### /m).slice(1);
  const projects = [];

  for (const def of PROJECTS) {
    const sec = sections.find((s) => s.startsWith(def.heading + ':'));
    const lines = sec.split('\n');
    // "Project 1: SnippetVault API (Node.js + Express + MongoDB), Weeks 1–6"
    const name = lines[0].replace(/^Project \d+: /, '').replace(/\s*\(.*$/, '').trim();
    const description = lines.slice(1).find((l) => /^\*[^*]/.test(l));
    // "#### Week 1 · Setup" → "| Mon | learn | build |" rows → "**✅ Checkpoint (Fri, no docs):** text"
    const tasks = [];
    const weeks = []; // assignment details per week (when the plan has them)
    let week = null;
    let weekTitle = '';
    for (const l of lines) {
      const wh = l.match(/^#### Week (\d+) · (.+)$/);
      if (wh) {
        week = Number(wh[1]);
        weekTitle = stripMd(wh[2]);
        continue;
      }
      // assignment weeks: "**🎯 Objective:** …", "**🪜 Level:** …", "**📦 Deliverable:** …"
      const meta = l.match(/^\*\*(🎯 Objective|🪜 Level|📦 Deliverable):\*\* (.+)$/u);
      if (meta && week) {
        const key = { '🎯 Objective': 'objective', '🪜 Level': 'level', '📦 Deliverable': 'deliverable' }[meta[1]];
        let w = weeks.find((x) => x.week === week);
        if (!w) weeks.push((w = { week, title: weekTitle }));
        w[key] = stripMd(meta[2]);
        continue;
      }
      // "| Mon | learn | build |" or, for assignment weeks, "| Mon | learn | build | done when |"
      const row = l.match(/^\| (Mon|Tue|Wed|Thu|Fri) \| ([^|]*) \| ([^|]*) \|(?: ([^|]*) \|)?\s*$/);
      if (row && week) {
        const dow = DOW.indexOf(row[1]);
        tasks.push({
          week, dow, date: addDays(START_DATE, (week - 1) * 7 + dow), weekTitle,
          kind: 'build', learn: row[2].trim(), title: row[3].trim(), doneWhen: row[4]?.trim() || null,
        });
        continue;
      }
      const cp = l.match(/^\*\*✅ Checkpoint[^*]*\*\* (.+)$/);
      if (cp && week) {
        tasks.push({ week, dow: 4, date: addDays(START_DATE, (week - 1) * 7 + 4), weekTitle, kind: 'checkpoint', learn: null, title: cp[1].trim() });
      }
    }
    projects.push({ ...def, name, description: description ? stripMd(description) : def.description || '', tasks, weeks });
  }

  // Week 22 wrap-up: "Mon: ... · Tue: ... · Fri: rest"
  const wrap = sections.find((s) => s.startsWith('Week 22'));
  if (wrap) {
    const line = wrap.split('\n').find((l) => l.startsWith('Mon:'));
    const tasks = line.split(' · ').map((part, dow) => ({
      week: 22, dow, date: addDays(START_DATE, 21 * 7 + dow), weekTitle: 'Portfolio wrap-up',
      kind: 'build', learn: null, title: part.replace(/^\w{3}: /, ''),
    }));
    projects.push({
      code: 'portfolio', area: 'react', name: 'Portfolio wrap-up', stack: ['GitHub', 'Resume'], resources: [],
      description: 'Package all three projects for recruiters and interviews.', tasks,
    });
  }
  return projects;
}

// ---------- Workout program (WORKOUT_PLAN.md §4–5) ----------
const WORKOUT_MD = path.join(__dirname, '..', '..', 'WORKOUT_PLAN.md');

function parseWorkouts(wmd) {
  const checklist = (heading) => {
    const sec = wmd.split(heading)[1].split('\n### ')[0];
    return sec.split('\n').filter((l) => l.startsWith('- [ ] ')).map((l) => {
      const m = l.slice(6).match(/^(.*?)(?:\s*\(\*(.*)\*\))?$/);
      return { name: m[1].trim(), tip: m[2] || null };
    });
  };

  const phases = [];
  for (const sec of wmd.split(/^### Phase /m).slice(1)) {
    const head = sec.split('\n')[0]; // "1: Foundation (Weeks 1–3 · Oct 5–25)"
    const m = head.match(/^(\d+): (\w+) \(Weeks (\d+)–(\d+)/);
    const body = sec.split(/^### /m)[0];
    const strength = {};
    for (const key of ['A', 'B']) {
      const part = body.split(`**Strength ${key}**`)[1]?.split('\n\n**')[0] || '';
      strength[key] = part.split('\n').filter((l) => l.startsWith('| [ ] |')).map((l) => {
        const c = l.split('|').slice(2, -1).map((x) => x.trim());
        // Phases 1–4: Exercise | Sets × reps | Rest | Tip. Phase 5 supersets: Pair | Exercise | Reps | Tip.
        return c.length === 4 && /^[ABC]\d$/.test(c[0])
          ? { name: `${c[0]} · ${c[1]}`, prescription: `3 rounds × ${c[2]}`, rest: c[0].endsWith('2') ? '60–75 s after the pair' : 'straight into the pair', tip: c[3] }
          : { name: c[0], prescription: c[1], rest: c[2], tip: c[3] };
      });
    }
    const cardioLine = body.split('\n').find((l) => l.startsWith('**Cardio')) || '';
    const cardio = stripMd(cardioLine.replace(/^\*\*Cardio[^*]*\*\*\s*/, '').split('**Sat walk')[0]).trim();
    const sat = body.match(/\*\*Sat walk:\*\* ([^.\n]+)/);
    phases.push({ n: Number(m[1]), name: m[2], from: Number(m[3]), to: Number(m[4]), strength, cardio, satWalk: sat ? sat[1].trim() : '45 min' });
  }

  const p1 = wmd.split(/^### Phase 1/m)[1];
  const bullet = (label) => stripMd((p1.match(new RegExp(`- \\*\\*${label}[^*]*:\\*\\* (.+)`)) || [])[1] || '');
  return {
    warmup: checklist('### Standard warm-up'),
    cooldown: checklist('### Standard cool-down'),
    coreFinisher: bullet('Tue core finisher'),
    mobility: bullet('Thu mobility'),
    deloadWeeks: [12, 17],
    phases,
  };
}

const md = fs.readFileSync(PLAN_MD, 'utf8').replace(/\r\n/g, '\n');
const workout = parseWorkouts(fs.readFileSync(WORKOUT_MD, 'utf8').replace(/\r\n/g, '\n'));
const p1 = parsePhase1(md);
const p2 = buildPhase2();
const plan = {
  startDate: START_DATE,
  generatedAt: new Date().toISOString(),
  weeks: [...p1.weeks, ...p2.weeks],
  days: [...p1.days, ...p2.days],
  projects: parseProjects(md),
  workout,
};

// Attach the verified documentation links (scripts/doc-links.js, checked by `npm run check:links`).
const LINKS = require('./doc-links');
const dedupe = (list) => list.filter((x, i, a) => a.findIndex((y) => y.url === x.url) === i);
for (const d of plan.days) {
  if (d.type === 'study') d.links = LINKS.DSA_DAY_LINKS[d.week]?.[d.dow] || [];
  else if (d.type === 'selftest') d.links = dedupe((LINKS.DSA_DAY_LINKS[d.week] || []).flat());
  else d.links = LINKS.PHASE2_LINKS;
}
for (const p of plan.projects) {
  for (const t of p.tasks) {
    if (t.kind !== 'build') continue;
    t.learnLinks = p.code === 'portfolio' ? LINKS.PORTFOLIO_LINKS[t.dow] || [] : LINKS.PROJECT_LEARN_LINKS[p.code]?.[t.week]?.[t.dow] || [];
  }
}
plan.channels = LINKS.CHANNELS;
const noLinks = [
  ...plan.days.filter((d) => d.type === 'study' && !d.links.length).map((d) => `DSA ${d.date}`),
  ...plan.projects.flatMap((p) => p.tasks.filter((t) => t.learn && !t.learnLinks.length).map((t) => `${p.code} W${t.week} d${t.dow}`)),
];
if (noLinks.length) console.warn('Missing documentation links:', noLinks);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(plan, null, 2));

const probs = plan.days.flatMap((d) => d.problems);
const count = (f) => probs.filter(f).length;
console.log(`weeks=${plan.weeks.length} days=${plan.days.length} problems=${probs.length}`);
console.log(`core E/M/H = ${count((p) => !p.stretch && !p.selftest && p.source === 'LeetCode' && p.difficulty === 'E')}/` +
  `${count((p) => !p.stretch && !p.selftest && p.source === 'LeetCode' && p.difficulty === 'M')}/` +
  `${count((p) => !p.stretch && !p.selftest && p.source === 'LeetCode' && p.difficulty === 'H')} ` +
  `stretch=${count((p) => p.stretch)} gfg=${count((p) => p.source === 'GfG')} selftest=${count((p) => p.selftest)}`);
const missing = plan.days.filter((d) => d.type === 'study' && d.problems.length === 0);
if (missing.length) console.warn('Study days with no problems parsed:', missing.map((d) => d.date));
console.log(`projects: ${plan.projects.map((p) => `${p.area}/${p.code}=${p.tasks.length}`).join(' ')}`);
console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
