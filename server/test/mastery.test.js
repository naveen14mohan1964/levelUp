// Pattern mastery (score, the daily pick), company readiness and system design drills.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, api, sqlQuery } = require('./helpers');
const { patternScore, levelFor, choosePick, profileReadiness, PROFILES, profileFor } = require('../src/mastery');
const { scoreDrill, cardsFor, DRILLS, STEPS, TOTAL_MIN } = require('../src/drills');

const prob = (id, o = {}) => ({ id, title: `P${id}`, difficulty: 'E', solved: false, confidence: null, is_stretch: false, plan_date: '2026-10-26', ...o });
const pat = (topic, score, problems, o = {}) => ({ topic, score, solved: problems.filter((p) => p.solved).length, firstPlanDate: '2026-10-26', problems, ...o });

describe('pattern mastery (pure)', () => {
  test('score: nothing solved = 0; coverage, confidence, success and freshness all count', () => {
    assert.equal(patternScore({ solved: 0, total: 10 }), 0);
    const base = { solved: 6, total: 10, avgConf: 5, reviews: 6, successRate: 1, daysSince: 1 };
    assert.equal(patternScore(base), 100);
    assert.equal(patternScore({ ...base, solved: 3 }), 80, 'half coverage');
    assert.equal(patternScore({ ...base, avgConf: 3 }), 83);
    assert.equal(patternScore({ ...base, reviews: 0, successRate: null }), 88, 'no attempts yet: neutral success');
    assert.equal(patternScore({ ...base, daysSince: 60 }), 70, 'fades to 70% after 2 months');
    assert.equal(patternScore({ ...base, total: 3, solved: 3 }), 100, 'a 3-problem pattern is covered by 3');
    assert.deepEqual([levelFor(0, 0), levelFor(30, 1), levelFor(60, 2), levelFor(80, 3), levelFor(90, 6)], ['new', 'learning', 'building', 'solid', 'mastered']);
  });

  test('pick: the weakest started pattern; an easy new one when weak, a shaky re-solve wins while < 70', () => {
    const arrays = pat('Arrays', 30, [prob(1, { solved: true, confidence: 4 }), prob(2, { difficulty: 'M' }), prob(3)]);
    const trees = pat('Binary Tree', 75, [prob(4, { solved: true, confidence: 5 }), prob(5, { difficulty: 'H' })]);
    const later = pat('Graphs', 0, [prob(6)], { firstPlanDate: '2026-12-01' });
    const p = choosePick([arrays, trees, later], '2026-11-02');
    assert.deepEqual([p.topic, p.problem_id, p.kind], ['Arrays', 3, 'new'], 'easy one for a weak pattern; Graphs not reached yet');
    assert.match(p.reason, /weakest pattern so far \(mastery 30%\)\. An easy one/);
    const shaky = pat('Arrays', 30, [prob(1, { solved: true, confidence: 2 }), prob(3)]);
    assert.deepEqual([choosePick([shaky, trees], '2026-11-02').kind, choosePick([shaky, trees], '2026-11-02').problem_id], ['resolve', 1]);
  });

  test('pick: skips the plan\'s own problems that day and recent picks; avoids repeating yesterday\'s pattern when close', () => {
    const a = pat('Arrays', 30, [prob(1, { plan_date: '2026-11-02' }), prob(2), prob(3)]);
    const b = pat('Hashing', 33, [prob(4)]);
    assert.equal(choosePick([a, b], '2026-11-02', [{ problem_id: 9, topic: 'Graphs' }]).problem_id, 2, 'problem 1 is already on the plan that day');
    assert.equal(choosePick([a, b], '2026-11-02', [{ problem_id: 2, topic: 'Arrays' }]).topic, 'Hashing', 'yesterday was Arrays and Hashing is within 5 points');
    assert.equal(choosePick([a, pat('Hashing', 60, [prob(4)])], '2026-11-02', [{ problem_id: 2, topic: 'Arrays' }]).problem_id, 3, 'a much weaker pattern stays');
  });

  test('pick before the plan starts: a warm-up from the first pattern', () => {
    const p = choosePick([pat('Basics & Math', 0, [prob(1, { difficulty: 'M' }), prob(2)]), pat('Arrays', 0, [prob(3)])], '2026-10-16');
    assert.deepEqual([p.topic, p.problem_id], ['Basics & Math', 2]);
    assert.match(p.reason, /^Warm-up: Basics & Math is first in your plan\./);
  });
});

describe('company readiness (pure)', () => {
  const lv = (n, done, total) => ({ n, title: `L${n}`, lessons: Array.from({ length: total }, (_, i) => ({ done: i < done })) });
  const tracks = { hld: { levels: [lv(2, 4, 4), lv(3, 0, 5)] }, lld: { levels: [lv(2, 2, 4)] }, ai: { levels: [] } };
  const profile = { key: 't', weights: { dsa: 0.5, hld: 0.3, lld: 0.2 }, patterns: { Graphs: 3 }, hld: [2, 3], lld: [2] };
  const patterns = [{ topic: 'Graphs', score: 20 }, { topic: 'Arrays', score: 80 }];

  test('score = weighted areas; gaps ranked by how many points they could add', () => {
    const r = profileReadiness(profile, { patterns, tracks, drillAvg: 0.5 });
    // dsa (3×20 + 1×80)/4 = 35% · hld 0.6×(4/9) + 0.4×0.5 = 46.7% · lld 50%
    assert.deepEqual(r.areas, { dsa: 35, hld: 47, lld: 50 });
    assert.equal(r.score, Math.round(100 * (0.5 * 0.35 + 0.3 * (0.6 * 4 / 9 + 0.2) + 0.2 * 0.5)));
    assert.equal(r.gaps.length, 3);
    // impacts: Graphs 0.5×3/4×0.8 = 0.30 · LLD 2: 0.2×0.5 = 0.10 · HLD 3: 0.3×0.6/2 = 0.09 · drills 0.3×0.4×0.5 = 0.06
    assert.deepEqual(r.gaps.map((g) => [g.key, g.points]), [['Graphs', 30], ['lld2', 10], ['hld3', 9]]);
    assert.equal(r.gaps[0].action, 'Solve 3 easy Graphs problems');
  });

  test('every company category maps to a profile; unknown categories fall back', () => {
    const cats = new Set(require('../data/target-companies.json').companies.map((c) => c[2]));
    for (const c of cats) assert.ok(PROFILES.profiles.some((p) => p.categories.includes(c)), `no profile for ${c}`);
    assert.equal(profileFor('Something new').key, PROFILES.fallback);
    for (const p of PROFILES.profiles) assert.equal(Math.round(Object.values(p.weights).reduce((a, b) => a + b, 0) * 100), 100, `${p.key} weights add to 1`);
  });
});

describe('system design drills (pure)', () => {
  const prompt = DRILLS.prompts[0];
  test('35 minutes, six steps, every prompt has key points for every step', () => {
    assert.equal(TOTAL_MIN, 35);
    assert.deepEqual(STEPS.map((s) => s.key), ['requirements', 'estimates', 'api', 'data', 'scaling', 'tradeoffs']);
    for (const p of DRILLS.prompts) for (const s of STEPS) assert.ok(p.points[s.key]?.length >= 1, `${p.key}.${s.key}`);
    assert.equal(new Set(DRILLS.prompts.map((p) => p.key)).size, DRILLS.prompts.length);
  });
  test('score = share of key points ticked per step; flashcards only from real answers', () => {
    assert.equal(scoreDrill(prompt, {}), 0);
    const all = Object.fromEntries(STEPS.map((s) => [s.key, prompt.points[s.key].map((_, i) => i)]));
    assert.equal(scoreDrill(prompt, all), 100);
    assert.equal(scoreDrill(prompt, { requirements: [0, 99, -1] }), Math.round((1 / prompt.points.requirements.length / 6) * 100), 'bad indexes ignored');
    const cards = cardsFor(prompt, { requirements: 'Create, redirect, custom alias; fast redirects matter most.', api: 'short' }, { requirements: [0] });
    assert.equal(cards.length, 1);
    assert.match(cards[0].front, /URL shortener: Requirements/);
    assert.match(cards[0].back, /✓ Create short link/);
    assert.match(cards[0].back, /✗ Redirect latency/);
  });
});

describe('patterns, readiness and drills API', () => {
  before(startServer);
  after(stopServer);

  test('patterns: tiles in plan order, today\'s pick is stored and stable, tomorrow\'s is live', async () => {
    const a = (await api('GET', '/patterns')).body;
    assert.ok(a.patterns.length >= 20);
    assert.equal(a.patterns[0].topic, 'Basics & Math');
    assert.ok(a.picks.today?.problem, 'a warm-up pick exists even before solving anything');
    const stored = await sqlQuery('SELECT topic, problem_id FROM dbo.pattern_picks');
    assert.equal(stored.length, 1);
    // solving the picked problem marks it done, and the stored pick doesn't move
    const id = a.picks.today.problem_id;
    assert.equal((await api('POST', `/problems/${id}/solve`, { confidence: 2 })).status, 200);
    const b = (await api('GET', '/patterns')).body;
    assert.deepEqual([b.picks.today.problem_id, b.picks.today.done], [id, true]);
    assert.notEqual(b.picks.tomorrow?.problem_id, id, 'tomorrow avoids today\'s problem');
    const t = b.patterns.find((p) => p.topic === a.picks.today.topic);
    assert.ok(t.solved >= 1 && t.score > 0 && t.avgConf === 2);
  });

  test('readiness: every target company scored against its tier bar, with 3 gaps per profile', async () => {
    const r = (await api('GET', '/readiness')).body;
    assert.ok(r.companies.length >= 200);
    const c = r.companies[0];
    assert.ok(Number.isInteger(c.score) && c.score >= 0 && c.score <= 100 && [75, 65, 55].includes(c.readyAt));
    assert.ok(r.profiles.every((p) => p.gaps.length === 3 && p.gaps.every((g) => g.action && g.to)));
    assert.match(r.about, /ESTIMATE/);
    assert.equal(r.drillAvg, null);
  });

  test('drills: start, autosave, finish → score + HLD flashcards; readiness sees the drill', async () => {
    assert.equal((await api('POST', '/drills', { prompt: 'nope' })).status, 400);
    const s = await api('POST', '/drills', { prompt: 'rate-limiter' });
    assert.equal(s.status, 201);
    const id = s.body.drill.id;
    assert.equal((await api('GET', '/drills')).body.running.id, id);
    const answers = { requirements: 'Per-user limits, configurable, return 429 with retry-after.', estimates: 'tiny', api: 'Middleware check, headers for limit and remaining.' };
    assert.equal((await api('PUT', `/drills/${id}`, { answers })).status, 200);
    assert.equal((await api('GET', `/drills/${id}`)).body.drill.answers.requirements, answers.requirements);
    const fb = await api('POST', `/drills/${id}/feedback`);
    assert.ok([400, 409].includes(fb.status), 'no AI call before the drill is finished');
    const f = (await api('POST', `/drills/${id}/finish`, { answers, checked: { requirements: [0, 2], api: [0] } })).body;
    assert.equal(f.cardsMade, 2, 'two answers long enough');
    assert.ok(f.drill.score > 0 && f.drill.finishedMs);
    assert.equal((await api('PUT', `/drills/${id}`, { answers })).status, 409, 'finished drills are read-only');
    const again = (await api('POST', `/drills/${id}/finish`, { answers, checked: {} })).body;
    assert.equal(again.cardsMade, 0, 're-grading never duplicates cards');
    const cards = (await api('GET', '/cards')).body.cards.filter((x) => x.source === 'drill');
    assert.equal(cards.length, 2);
    assert.equal((await api('DELETE', `/cards/${cards[0].id}`)).status, 200, 'drill cards can be deleted');
    const o = (await api('GET', '/drills')).body;
    assert.deepEqual([o.running, o.history[0].id, o.prompts.find((p) => p.key === 'rate-limiter').times], [null, id, 1]);
    assert.notEqual(o.suggested, 'rate-limiter');
    assert.equal((await api('GET', '/readiness')).body.drillAvg, again.drill.score);
  });
});
