// The JobHunt Full Stack course as a plan project: .NET and React IN PARALLEL every day.
// Each day has two lessons on the same weekly feature: lane 'api' (.NET, ~30 min) and lane 'web' (React, ~30 min),
// plus a weekly checkpoint on day 5.
//
// Sources:
//   server/data/courses/fullstack-outline.json   week titles, objectives, levels, deliverables, checkpoint texts
//   server/data/courses/fullstack-days.json      the daily syllabus: learn topic + practice title per lane
//   server/data/courses/fullstack/week-XX.json   the written lessons (done-when, links, brief) with a `lane` per entry
// A week whose file is missing (or still in the old one-lesson-a-day format) falls back to the syllabus, so the course is
// always complete; only that week's briefs and links are missing.
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'server', 'data', 'courses');
const CODE = 'jobhunt-fullstack';
const REPLACES = ['jobhunt-api', 'jobhunt-web']; // the separate .NET and React courses this one replaces
const LANES = ['api', 'web'];

const RESOURCES = [
  { label: 'ASP.NET Core Web API', url: 'https://learn.microsoft.com/en-us/aspnet/core/web-api/' },
  { label: 'EF Core', url: 'https://learn.microsoft.com/en-us/ef/core/' },
  { label: 'react.dev', url: 'https://react.dev/learn' },
  { label: 'TanStack Query', url: 'https://tanstack.com/query/latest/docs/framework/react/overview' },
  { label: 'React Hook Form', url: 'https://react-hook-form.com/get-started' },
  { label: 'TypeScript handbook', url: 'https://www.typescriptlang.org/docs/handbook/intro.html' },
];

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

/** The written week, only if it is in the parallel (lane) format. */
function readWeek(n) {
  const file = path.join(DATA, 'fullstack', `week-${String(n).padStart(2, '0')}.json`);
  if (!fs.existsSync(file)) return null;
  const week = readJson(file);
  return week.days.some((d) => d.lane) ? week : null;
}

/** Brief key in server/data/briefs/jobhunt-fullstack.json: "<week>-<dow>-<api|web|checkpoint>". */
const briefKey = (t) => `${t.week}-${t.dow}-${t.kind === 'checkpoint' ? 'checkpoint' : t.lane}`;

/**
 * @param startDate  Week 1 Monday (plan.json dates are unshifted; the database shifts them)
 * @param addDays    (iso, n) => iso
 * @returns { project, briefs, written: [week numbers with lessons] }
 */
function loadCourse(startDate, addDays) {
  const outline = readJson(path.join(DATA, 'fullstack-outline.json'));
  const syllabus = readJson(path.join(DATA, 'fullstack-days.json')).weeks;
  const tasks = [];
  const briefs = {};
  const written = [];
  for (const w of outline.weeks) {
    const days = syllabus[w.week];
    if (!days || days.length !== 5) throw new Error(`fullstack-days.json: week ${w.week} needs 5 days`);
    const file = readWeek(w.week);
    if (file) written.push(w.week);
    const entry = (dow, kind, lane) => file?.days.find((d) => d.dow === dow && d.kind === kind && (d.lane || null) === lane) || null;
    const date = (dow) => addDays(startDate, (w.week - 1) * 7 + dow);
    days.forEach((day, dow) => {
      for (const lane of LANES) {
        const plan = day[lane];
        const x = entry(dow, 'build', lane);
        const t = {
          week: w.week, dow, date: date(dow), weekTitle: w.title, kind: 'build', lane,
          learn: plan.learn, title: plan.title, doneWhen: x?.doneWhen || null, learnLinks: x?.learnLinks || [],
        };
        tasks.push(t);
        if (x?.brief) briefs[briefKey(t)] = x.brief;
      }
    });
    const cp = entry(4, 'checkpoint', null);
    const t = { week: w.week, dow: 4, date: date(4), weekTitle: w.title, kind: 'checkpoint', lane: null, learn: null, title: w.checkpoint, doneWhen: null, learnLinks: [] };
    tasks.push(t);
    if (cp?.brief) briefs[briefKey(t)] = cp.brief;
  }
  const project = {
    code: CODE, area: outline.area, heading: 'Project 1', name: outline.name, description: outline.description,
    stack: outline.stack, resources: RESOURCES, tasks,
    weeks: outline.weeks.map((w) => ({ week: w.week, title: w.title, objective: w.objective, level: w.level, deliverable: w.deliverable })),
  };
  return { project, briefs, written };
}

module.exports = { CODE, REPLACES, LANES, briefKey, loadCourse };
