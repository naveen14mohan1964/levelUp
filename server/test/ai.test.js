// Live AI quality tests (real Gemini calls, ~2 minutes). Opt-in so normal test runs stay fast and free:
//   RUN_AI_TESTS=1 npm test        (PowerShell: $env:RUN_AI_TESTS=1; npm test)
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startServer, stopServer, api } = require('./helpers');

const RUN = process.env.RUN_AI_TESTS === '1' || process.env.npm_lifecycle_event === 'test:ai';
const opts = { skip: RUN ? false : 'set RUN_AI_TESTS=1 to run live Gemini tests', timeout: 120_000 };

describe('AI: meal calorie estimates', opts, () => {
  before(startServer);
  after(stopServer);

  test('text description → plausible calories and protein', async () => {
    const fd = new FormData();
    fd.append('date', '2026-10-05');
    fd.append('note', '3-egg omelette with onion and tomato, 2 slices of brown bread, black coffee');
    const { status, body } = await api('POST', '/meals/analyze', fd);
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.source, 'ai-text');
    const t = body.estimate.total;
    assert.ok(t.calories >= 300 && t.calories <= 750, `calories ${t.calories}`);
    assert.ok(t.protein_g >= 18 && t.protein_g <= 40, `protein ${t.protein_g}`);
    const sum = body.estimate.items.reduce((s, i) => s + i.calories, 0);
    assert.ok(Math.abs(sum - t.calories) <= 30, 'items add up to the total');
  });

  test('photo → estimate, and the photo is saved locally', async () => {
    const fd = new FormData();
    fd.append('date', '2026-10-05');
    fd.append('photo', new Blob([fs.readFileSync(path.join(__dirname, 'fixtures', 'meal.jpg'))], { type: 'image/jpeg' }), 'meal.jpg');
    const { status, body } = await api('POST', '/meals/analyze', fd);
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.source, 'ai-photo');
    assert.match(body.estimate.title, /biryani|rice|chicken/i);
    assert.ok(body.estimate.total.calories >= 500 && body.estimate.total.calories <= 1600, `calories ${body.estimate.total.calories}`);
    const file = path.join(__dirname, '..', 'uploads', body.photo_path);
    assert.ok(fs.existsSync(file));
    fs.rmSync(file);
  });
});

describe('AI: mentor behaves like a mentor', opts, () => {
  let twoSum;
  let lesson;
  before(async () => {
    await startServer();
    twoSum = (await api('GET', '/problems')).body.find((p) => p.lc_number === 1);
    lesson = (await api('GET', '/projects/dotnet')).body[0].weeks[2].tasks[1]; // week 9, Tue: JWT bearer auth
  });
  after(stopServer);

  test('hint level 1 is a short nudge: no code, no solution', async () => {
    const { status, body } = await api('POST', '/mentor/ask', { thread: `problem:${twoSum.id}`, mode: 'hint', problemId: twoSum.id, level: 1 });
    assert.equal(status, 200, JSON.stringify(body));
    assert.doesNotMatch(body.reply, /```/);
    assert.doesNotMatch(body.reply, /class Solution/);
    assert.ok(body.reply.length < 900, `nudge length ${body.reply.length}`);
    assert.equal(body.messages.at(-2).content, '💡 Hint 1/4: Nudge', 'user bubble shows the short label, not the prompt');
  });

  test('hint level 4 gives a full Java solution', async () => {
    const { body } = await api('POST', '/mentor/ask', { thread: `problem:${twoSum.id}`, mode: 'hint', problemId: twoSum.id, level: 4 });
    assert.match(body.reply, /class Solution/);
    assert.match(body.reply, /HashMap|Map</);
  });

  test('code review catches the "same element twice" bug', async () => {
    const code = 'class Solution { public int[] twoSum(int[] nums, int target) { for (int i = 0; i < nums.length; i++) for (int j = i; j < nums.length; j++) if (nums[i] + nums[j] == target) return new int[]{i, j}; return null; } }';
    const { body } = await api('POST', '/mentor/ask', { thread: 'review', mode: 'review', problemId: twoSum.id, language: 'Java', code });
    assert.match(body.reply, /same element|itself|j\s*=\s*i\s*\+\s*1|\[0,\s*0\]/i);
    assert.doesNotMatch(body.reply, /\$\\mathcal/, 'no raw LaTeX');
  });

  test('explain a lesson stays on that lesson and cites only verified links', async () => {
    const { body } = await api('POST', '/mentor/ask', { thread: `lesson:${lesson.id}`, mode: 'explain', taskId: lesson.id });
    assert.match(body.reply, /JWT|bearer|claim/i);
    assert.equal(body.removedLinks, 0, 'no invented links');
    const urls = body.reply.match(/https?:\/\/[^\s)]+/g) || [];
    assert.ok(urls.every((u) => !/link removed/.test(u)));
  });

  test('plan my day uses the real timetable', async () => {
    const { body } = await api('POST', '/mentor/ask', { thread: 'plan:2026-10-05', mode: 'plan', energy: 'normal', date: '2026-10-05' });
    assert.match(body.reply, /\|.*\|/, 'has a table');
    assert.match(body.reply, /05:35|06:10|19:00/);
  });
});
