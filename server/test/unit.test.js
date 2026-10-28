// Pure-logic tests: plan data, doc links, spaced repetition, workout rules, schedule, mentor filters, timeline.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const plan = require('../data/plan.json');
const links = require('../../scripts/doc-links');
const srs = require('../src/srs');
const workout = require('../src/workout');
const { templateFor, dsaSlot, workoutFor } = require('../src/schedule');

describe('plan data (generated from STUDY_PLAN.md)', () => {
  const problems = plan.days.flatMap((d) => d.problems);
  const core = problems.filter((p) => !p.stretch && !p.selftest && p.source === 'LeetCode');

  test('22 weeks and 154 days from Mon 2026-10-05 to Sun 2027-03-07', () => {
    assert.equal(plan.weeks.length, 22);
    assert.equal(plan.days.length, 154);
    assert.equal(plan.days[0].date, '2026-10-05');
    assert.equal(plan.days.at(-1).date, '2027-03-07');
  });

  test('problem counts match the plan: 80 E / 210 M / 27 H core, 36 stretch, 7 GfG, 39 self-test', () => {
    assert.deepEqual(['E', 'M', 'H'].map((d) => core.filter((p) => p.difficulty === d).length), [80, 210, 27]);
    assert.equal(problems.filter((p) => p.stretch).length, 36);
    assert.equal(problems.filter((p) => p.source === 'GfG').length, 7);
    assert.equal(problems.filter((p) => p.selftest).length, 39);
  });

  test('no LeetCode problem appears twice', () => {
    const nums = problems.filter((p) => p.number).map((p) => p.number);
    assert.equal(new Set(nums).size, nums.length);
  });

  test('project roadmaps: learn + build per day and a checkpoint every week', () => {
    const by = Object.fromEntries(plan.projects.map((p) => [p.code, p.tasks]));
    assert.equal(by.snippetvault.length, 36);
    assert.equal(by['jobhunt-api'].length, 84); // 14 assignment-weeks: 5 days + a checkpoint each
    assert.equal(by['jobhunt-web'].length, 42);
    assert.equal(by.portfolio.length, 5);
    for (const code of ['snippetvault', 'jobhunt-api', 'jobhunt-web']) {
      const builds = by[code].filter((t) => t.kind === 'build');
      assert.ok(builds.every((t) => t.learn), `${code}: every build has a learn topic`);
      assert.equal(by[code].filter((t) => t.kind === 'checkpoint').length, builds.length / 5);
    }
  });

  test('every DSA study day and every learn topic has at least one https documentation link', () => {
    for (const d of plan.days.filter((x) => x.type === 'study')) {
      assert.ok(d.links.length > 0, `DSA ${d.date} has links`);
      for (const l of d.links) assert.match(l.url, /^https:\/\//);
    }
    for (const p of plan.projects) {
      for (const t of p.tasks.filter((x) => x.learn)) {
        assert.ok(t.learnLinks.length > 0, `${p.code} W${t.week} d${t.dow} has links`);
        for (const l of t.learnLinks) assert.match(l.url, /^https:\/\//);
      }
    }
  });

  test('doc-links.js covers every DSA week (6 days) and every project week (5 days, per project)', () => {
    for (let w = 1; w <= 13; w++) assert.equal(links.DSA_DAY_LINKS[w].length, 6, `DSA week ${w}`);
    // per project: .NET weeks 1–14, React 15–21, Node 23–28
    const weeks = { 'jobhunt-api': [1, 14], 'jobhunt-web': [15, 21], snippetvault: [23, 28] };
    for (const [code, [from, to]] of Object.entries(weeks)) {
      for (let w = from; w <= to; w++) assert.equal(links.PROJECT_LEARN_LINKS[code][w]?.length, 5, `${code} week ${w}`);
    }
    const all = [...Object.values(links.DSA_DAY_LINKS).flat(2), ...Object.values(links.PROJECT_LEARN_LINKS).flatMap((p) => Object.values(p)).flat(2)];
    for (const l of all) assert.doesNotThrow(() => new URL(l.url), l.url);
  });

  test('workout program parsed: 5 phases, each with Strength A and B (6 exercises)', () => {
    assert.equal(plan.workout.phases.length, 5);
    for (const ph of plan.workout.phases) {
      assert.equal(ph.strength.A.length, 6);
      assert.equal(ph.strength.B.length, 6);
      assert.ok(ph.cardio.length > 10);
    }
    assert.equal(plan.workout.warmup.length, 6);
    assert.equal(plan.workout.cooldown.length, 5);
  });
});

describe('spaced repetition (srs.js)', () => {
  test('first solve uses the base interval for each confidence', () => {
    assert.deepEqual([1, 2, 3, 4, 5].map((c) => srs.nextInterval(c, null, false)), [1, 3, 7, 14, 30]);
  });

  test('schedule(): confidence ≤ 2 → needs revision; ≥ 60 days → mastered', () => {
    const s = srs.schedule({ confidence: 2, previousInterval: null, isReview: false, date: '2026-10-05' });
    assert.equal(s.status, 'revision');
    assert.equal(s.nextReview, '2026-10-08');
    assert.equal(srs.schedule({ confidence: 4, previousInterval: null, isReview: false, date: '2026-10-05' }).status, 'solved');
  });

  test('YOUR TODO: review rules (double on ≥4, reset on ≤2, 7 days on 3)', (t) => {
    const cases = [[[4, 14, true], 28], [[5, 28, true], 56], [[4, 3, true], 14], [[2, 56, true], 1], [[3, 28, true], 7]];
    const ok = cases.every(([args, want]) => srs.nextInterval(...args) === want);
    if (!ok && srs.nextInterval(4, 14, true) === 14) return t.todo('nextInterval() still uses the fallback: implement it in server/src/srs.js');
    for (const [args, want] of cases) assert.equal(srs.nextInterval(...args), want, `nextInterval(${args})`);
  });
});

describe('workout rules (workout.js)', () => {
  const START = '2026-10-05';

  test('jogging: walk-jog on Tuesdays from week 1, Thursdays from week 4; intervals grow; deload weeks step back', () => {
    const main = (d) => { const x = workout.sessionFor(d, START); return [x.session, x.items.find((i) => i.group === 'main').prescription]; };
    assert.deepEqual(main('2026-10-06'), ['Jog + core', '5 min brisk walk, then 6 × (30 s easy jog + 2 min walk), 5 min walk']);
    assert.equal(main('2026-10-08')[0], 'Cardio + mobility', 'week 1 Thursday stays low-impact');
    assert.deepEqual(main('2026-10-29'), ['Jog + mobility', '5 min brisk walk, then 6 × (1 min jog + 2 min walk), 5 min walk']);
    assert.deepEqual([workout.jogFor(8), workout.jogFor(12, true), workout.jogFor(17, true), workout.jogFor(22)].map((p) => p.match(/(\d+ (s|min)) (easy )?jog/)[1]), ['2 min', '1 min', '2 min', '8 min']);
  });

  test('step target: 5,000 in weeks 1–2, +1,000 every 2 weeks, 10,000 from week 11', () => {
    assert.deepEqual([1, 2, 3, 5, 9, 11, 22].map(workout.stepTarget), [5000, 5000, 6000, 7000, 9000, 10000, 10000]);
  });

  test('Mon W1 = Strength A (Phase 1, 2 sets); Sun = rest; Sat = long walk', () => {
    const mon = workout.sessionFor('2026-10-05', START);
    assert.equal(mon.session, 'Strength A');
    assert.equal(mon.phase, 'Phase 1 · Foundation');
    assert.equal(mon.items.filter((i) => i.group === 'main').length, 6);
    assert.match(mon.items.find((i) => i.group === 'main').prescription, /^2 ×/);
    assert.equal(workout.sessionFor('2026-10-11', START).rest, true);
    assert.equal(workout.sessionFor('2026-10-10', START).session, 'Long brisk walk');
  });

  test('Fri alternates A/B by week; week 12 is a deload with 2 sets; week 18 uses supersets', () => {
    assert.equal(workout.sessionFor('2026-10-09', START).session, 'Strength A'); // week 1
    assert.equal(workout.sessionFor('2026-10-16', START).session, 'Strength B'); // week 2
    const deload = workout.sessionFor('2026-12-21', START);
    assert.equal(deload.deload, true);
    assert.ok(deload.items.filter((i) => i.group === 'main').every((i) => /^2 ×/.test(i.prescription)));
    assert.match(workout.sessionFor('2027-02-01', START).items.find((i) => i.group === 'main').name, /^A1 · /);
  });

  test('a day is done when all main items, or the whole 10-minute mode, are ticked', () => {
    const s = workout.sessionFor('2026-10-05', START);
    const main = s.items.filter((i) => i.group === 'main').map((i) => i.key);
    assert.equal(workout.isDayDone(s, new Set(main.slice(1))), false);
    assert.equal(workout.isDayDone(s, new Set(main)), true);
    assert.equal(workout.isDayDone(s, new Set(s.mini.map((i) => i.key))), true);
  });

  test('streak skips Sundays and stops at the first missed workout day', () => {
    const done = new Map();
    const full = (d) => new Set(workout.sessionFor(d, START).items.filter((i) => i.group === 'main').map((i) => i.key));
    for (const d of ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-12']) done.set(d, full(d)); // Thu–Sat, (Sun rest), Mon
    assert.equal(workout.streak('2026-10-12', START, done), 4);
    assert.equal(workout.streak('2026-10-13', START, done), 4); // today not done yet → counts up to yesterday
  });

  test('badges unlock on the 7-day average, not a single light morning', () => {
    const entries = [115, 113, 112, 111, 111, 110.5, 109.4].map((w, i) => ({ log_date: `2026-10-${String(5 + i).padStart(2, '0')}`, weight_kg: w }));
    const s = workout.weightSummary(entries, 115, 80);
    assert.equal(s.latest.weight, 109.4);
    assert.ok(s.latest.avg7 > 110);
    assert.equal(s.badges.find((b) => b.kg === 110).unlocked, false);
    assert.equal(s.next.kg, 110);
    const later = [...entries, ...[109, 109, 109, 109, 109, 109, 109].map((w, i) => ({ log_date: `2026-10-${12 + i}`, weight_kg: w }))];
    assert.equal(workout.weightSummary(later, 115, 80).badges.find((b) => b.kg === 110).unlocked, true);
  });
});

describe('daily schedule (schedule.js)', () => {
  test('weekday, Saturday and Sunday templates; sleep blocks wrap past midnight', () => {
    assert.equal(templateFor(0)[0].start, '05:30');
    assert.equal(templateFor(5)[0].start, '06:30');
    assert.ok(templateFor(6).some((b) => b.key === 'mealprep'));
    for (const dow of [0, 5, 6]) assert.ok(templateFor(dow).at(-1).end < templateFor(dow).at(-1).start);
  });

  test('DSA tasks land in the right blocks', () => {
    assert.equal(dsaSlot({ kind: 'concept' }, 'study', 0), 'morning');
    assert.equal(dsaSlot({ kind: 'practice' }, 'study', 0), 'evening');
    assert.equal(dsaSlot({ kind: 'review' }, 'study', 0), 'night');
    assert.equal(dsaSlot({ kind: 'selftest' }, 'selftest', 6), 'morning');
    assert.equal(dsaSlot({ kind: 'review', sort_order: 0 }, 'revision', 1), 'morning');
    assert.equal(dsaSlot({ kind: 'mock', sort_order: 2 }, 'revision', 1), 'evening');
    assert.deepEqual(workoutFor(1, 0), { session: 'Strength A', phase: 'Phase 1 · Foundation' });
  });
});

describe('mentor safety filters (mentor.js)', () => {
  const { plainMath, enforceLinks } = require('../src/mentor');

  test('LaTeX complexity becomes plain inline code; real dollar amounts and code blocks are untouched', () => {
    const out = plainMath(String.raw`Time $\mathcal{O}(N^2)$, $O(n \log n)$, costs $5 and $10.` + '\n```cs\nvar s = $"{a}"; var t = $"{b}";\n```');
    assert.match(out, /`O\(N\^2\)`/);
    assert.match(out, /`O\(n log n\)`/);
    assert.match(out, /costs \$5 and \$10/);
    assert.match(out, /var s = \$"\{a\}"; var t = \$"\{b\}";/);
  });

  test('only verified links survive; invented URLs are removed', () => {
    const { text, removed } = enforceLinks('Read https://cp-algorithms.com/graph/dijkstra.html, https://fake.example.com/x and https://leetcode.com/problems/two-sum/');
    assert.equal(removed, 1);
    assert.match(text, /cp-algorithms\.com\/graph\/dijkstra\.html/);
    assert.match(text, /leetcode\.com\/problems\/two-sum/);
    assert.doesNotMatch(text, /fake\.example\.com/);
  });

  test('placeholder URLs inside code examples are left alone', () => {
    const reply = 'Configure it:\n```csharp\nValidIssuer = "https://your-auth-server.com",\n```\nor set `Authority = "https://your-api.com"`.';
    const { text, removed } = enforceLinks(reply);
    assert.equal(removed, 0);
    assert.equal(text, reply);
  });
});

describe('Gemini quota handling (gemini.js, simulated responses; no real API calls)', () => {
  const gemini = require('../src/gemini');
  const realFetch = global.fetch;
  const reply = (status, body) => ({ ok: status === 200, status, statusText: String(status), json: async () => body });
  const quota = { error: { message: 'You exceeded your current quota... Please retry in 5h19m2.36s.' } };
  const okBody = { candidates: [{ content: { parts: [{ text: 'hello' }] } }] };

  test('a model out of quota falls straight through to the next model (no wasted retries)', async () => {
    const calls = [];
    global.fetch = async (url) => {
      calls.push(url.split('/models/')[1].split(':')[0]);
      return calls.length === 1 ? reply(429, quota) : reply(200, okBody);
    };
    try {
      assert.equal(await gemini.generate([{ text: 'hi' }]), 'hello');
      assert.equal(calls.length, 2);
      assert.notEqual(calls[0], calls[1]);
    } finally {
      global.fetch = realFetch;
    }
  });

  test('when every model is out of quota you get a friendly 429 with the reset time', async () => {
    global.fetch = async () => reply(429, quota);
    try {
      await assert.rejects(gemini.generate([{ text: 'hi' }]), (err) => {
        assert.equal(err.status, 429);
        assert.match(err.message, /free Gemini quota is used up/);
        assert.match(err.message, /resets around \d{1,2}:\d{2}/);
        return true;
      });
    } finally {
      global.fetch = realFetch;
    }
  });
});

describe('Home timeline (client/src/lib/timeline.js)', () => {
  const load = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'client', 'src', 'lib', 'timeline.js')).href);

  test('toMinutes and isBlockDone', async () => {
    const { toMinutes, isBlockDone } = await load();
    assert.equal(toMinutes('05:35'), 335);
    assert.equal(isBlockDone({ items: [] }), false);
    assert.equal(isBlockDone({ items: [{ kind: 'task', done: true }, { kind: 'problems', solved: 4, total: 4 }] }), true);
    assert.equal(isBlockDone({ items: [{ kind: 'problems', solved: 3, total: 4 }] }), false);
  });

  test('YOUR TODO: blockStatus() now / past / upcoming, including the midnight-wrapping sleep block', async (t) => {
    const { blockStatus } = await load();
    const b = { start: '06:10', end: '07:55', items: [] };
    const sleep = { start: '22:30', end: '05:30', items: [] };
    if (blockStatus(b, 390) === 'upcoming') return t.todo('blockStatus() is still the stub: implement it in client/src/lib/timeline.js');
    assert.equal(blockStatus(b, 390), 'now');
    assert.equal(blockStatus(b, 480), 'past');
    assert.equal(blockStatus(b, 300), 'upcoming');
    assert.equal(blockStatus(b, null), 'upcoming');
    assert.equal(blockStatus(sleep, 1400), 'now');
    assert.equal(blockStatus(sleep, 120), 'now');
    assert.equal(blockStatus(sleep, 600), 'upcoming');
  });
});
