// LinkedIn Phase 2 tests: scheduler rules (unit), draft prompt rules (unit), and the job runner + post API
// against DSATracker_Test. Publishing is never real: the runner gets a fake publisher, and the real MCP process
// is pointed at an empty token file, so it can only ever answer "not connected".
const os = require('os');
const path = require('path');
process.env.LINKEDIN_TOKEN_FILE = path.join(os.tmpdir(), `no-linkedin-token-${process.pid}.json`); // never exists

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/linkedin/scheduler');
const D = require('../src/linkedin/drafts');
const { startServer, stopServer, api, sqlQuery } = require('./helpers');

const MIN = 60_000;
const HOUR = 60 * MIN;

describe('scheduler rules (linkedin/scheduler.js)', () => {
  test('slot times: Tue/Thu 08:30 local in the Monday-starting week', () => {
    const [tue, thu] = S.slotTimes('2026-10-05', [{ day: 2, time: '08:30' }, { day: 4, time: '08:30' }]);
    assert.equal(new Date(tue).toString().slice(0, 21), 'Tue Oct 06 2026 08:30');
    assert.equal(new Date(thu).toString().slice(0, 21), 'Thu Oct 08 2026 08:30');
    const [sun] = S.slotTimes('2026-10-05', [{ day: 0, time: '18:00' }]);
    assert.equal(new Date(sun).toString().slice(0, 21), 'Sun Oct 11 2026 18:00', 'Sunday is the END of the week');
    assert.equal(S.mondayOf(new Date(2026, 9, 11, 23, 0).getTime()), '2026-10-05');
    assert.equal(S.mondayOf(new Date(2026, 9, 12, 0, 1).getTime()), '2026-10-12');
  });

  test('slot validation', () => {
    assert.deepEqual(S.validateSlots([{ day: 2, time: '08:30' }, { day: 4, time: '19:00' }]), []);
    assert.ok(S.validateSlots([{ day: 2, time: '08:30' }]).length);
    assert.ok(S.validateSlots([{ day: 9, time: '08:30' }, { day: 4, time: '8:30' }]).length >= 2);
    assert.ok(S.validateSlots([{ day: 2, time: '08:30' }, { day: 2, time: '08:30' }]).length);
  });

  test('decideJob: paused beats everything; not due → wait; >12 h late → missed; retries are never "missed"', () => {
    const now = Date.now();
    assert.equal(S.decideJob({ run_ms: now - HOUR, attempts: 0 }, now, { paused: true }), 'paused');
    assert.equal(S.decideJob({ run_ms: now + MIN, attempts: 0 }, now), 'wait');
    assert.equal(S.decideJob({ run_ms: now - 11 * HOUR, attempts: 0 }, now), 'run');
    assert.equal(S.decideJob({ run_ms: now - 13 * HOUR, attempts: 0 }, now), 'missed');
    assert.equal(S.decideJob({ run_ms: now - 13 * HOUR, attempts: 2 }, now), 'run');
  });

  test('error classes: auth/invalid stop immediately, rate waits 6 h, transient backs off 5 min → 30 min → give up', () => {
    const job = (attempts) => ({ attempts, max_attempts: 3 });
    const now = 1_000_000;
    assert.deepEqual(S.afterFailure(job(1), 'Not connected to LinkedIn yet.', now), { status: 'failed', kind: 'auth' });
    assert.deepEqual(S.afterFailure(job(1), 'Cannot post yet: Post is 3100 characters; LinkedIn allows 3000.', now), { status: 'failed', kind: 'invalid' });
    assert.deepEqual(S.afterFailure(job(1), 'LinkedIn rate limit reached (150 requests/day per member).', now), { status: 'queued', run_ms: now + 6 * HOUR, kind: 'rate' });
    assert.deepEqual(S.afterFailure(job(1), 'fetch failed: ECONNRESET', now), { status: 'queued', run_ms: now + 5 * MIN, kind: 'transient' });
    assert.deepEqual(S.afterFailure(job(2), 'LinkedIn error 503', now), { status: 'queued', run_ms: now + 30 * MIN, kind: 'transient' });
    assert.deepEqual(S.afterFailure(job(3), 'LinkedIn error 503', now), { status: 'failed', kind: 'transient' });
  });
});

describe('draft rules (linkedin/drafts.js)', () => {
  const pillar = { name: 'DSA journey', hint: 'patterns' };

  test('prompt carries your voice, only real facts, the honesty rule and the employer guard', () => {
    const p = D.buildPrompt({ pillar, angle: 'sliding window clicked', voiceSamples: 'honestly, i keep it short.', facts: ['Week 3 of a 22-week plan'], avoidEmployer: true, employerName: 'Acme Corp' });
    assert.match(p, /honestly, i keep it short\./);
    assert.match(p, /Week 3 of a 22-week plan/);
    assert.match(p, /sliding window clicked/);
    assert.match(p, /Never claim something is done/);
    assert.match(p, /Never mention my employer \(Acme Corp\)/);
    for (const phrase of ["I'm thrilled", 'game-changer', 'delve']) assert.ok(p.includes(phrase), `bans "${phrase}"`);
    assert.doesNotMatch(D.buildPrompt({ pillar, facts: [], avoidEmployer: false }), /Never mention my employer/);
  });

  test('facts mark a lesson as DONE or PLANNED, so drafts never claim unfinished work', () => {
    const base = { week: 1, focus: 'x', weekTitle: 'Arrays', solved: { E: 3, M: 1, H: 0 }, weakTopics: [], tasks: [] };
    const planned = D.factsFrom({ ...base, lesson: { project: 'SnippetVault API', learn: 'ESM', title: 'Init repo', done: false } });
    assert.ok(planned.some((f) => /PLANNED, NOT DONE YET/.test(f)));
    assert.ok(planned.some((f) => /4 \(3 easy, 1 medium, 0 hard\)/.test(f)));
    const done = D.factsFrom({ ...base, lesson: { project: 'SnippetVault API', learn: 'ESM', title: 'Init repo', done: true } });
    assert.ok(done.some((f) => /Lesson DONE/.test(f)));
  });

  test('posts read like an experienced engineer: proof points, years, a format and engagement rules', () => {
    const base = { week: 1, focus: 'x', weekTitle: 'Arrays', solved: { E: 0, M: 0, H: 0 }, weakTopics: [], tasks: [] };
    const facts = D.factsFrom(base, '- Cut LLM latency from 27 s to 5.6 s\nBuilt an MCP server\n\n');
    assert.deepEqual(facts.slice(0, 2), ['DONE (built it): Cut LLM latency from 27 s to 5.6 s', 'DONE (built it): Built an MCP server']);
    const p = D.buildPrompt({ pillar: { name: 'AI engineering in practice' }, facts, format: 'numbers', years: 2, intro: 'Java and Node engineer' });
    assert.match(p, /2 years of professional experience: Java and Node engineer/);
    assert.match(p, /Format: Before → after \(numbers\)/);
    assert.match(p, /first 1–2 lines \(under 200 characters\)/);
    assert.match(p, /No links in the post body/);
    assert.match(p, /never invent metrics, results, companies, titles, news or statistics/);
    assert.doesNotMatch(p, /learning in public/, 'no beginner-diary framing');
    for (const k of Object.keys(D.FORMATS)) assert.equal(D.pickFormat(k), k);
    assert.ok(Object.keys(D.FORMATS).includes(D.pickFormat('auto', 123456789)));
  });

  test('cleanDraft strips markdown LinkedIn would show literally and caps at 3,000 characters', () => {
    assert.equal(D.cleanDraft('## Title\n**Bold** move\n\n\n\nnext'), 'Title\nBold move\n\nnext');
    assert.equal(D.cleanDraft('x'.repeat(3500)).length, 3000);
  });
});

describe('job runner + posts API (test database, fake publisher)', () => {
  let runner;
  const published = [];
  let failNext = [];
  const fakePublisher = {
    async publish(post) {
      if (failNext.length) throw new Error(failNext.shift());
      published.push(post.text);
      return { urn: `urn:li:share:${7000 + published.length}`, url: `https://www.linkedin.com/feed/update/urn:li:share:${7000 + published.length}/` };
    },
  };
  const nextWeek = () => S.mondayOf(Date.now() + 7 * 24 * HOUR);

  before(async () => {
    await startServer();
    runner = require('../src/linkedin/runner');
  });
  after(stopServer);
  beforeEach(async () => {
    published.length = 0;
    failNext = [];
    await sqlQuery("DELETE FROM dbo.li_jobs; DELETE FROM dbo.li_posts; UPDATE dbo.settings SET v = '0' WHERE k = 'li_paused'");
  });

  async function scheduledPost(text = 'Week 1 done: Big-O and Two Sum. #DSA') {
    const { body } = await api('POST', '/linkedin/posts', { week_start: nextWeek(), slot_index: 0, mode: 'manual', text });
    const approved = await api('POST', `/linkedin/posts/${body.post.id}/approve`, {});
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(approved.body.post.status, 'scheduled');
    return approved.body.post;
  }
  const job = async (postId) => (await sqlQuery(`SELECT status, attempts, run_ms, last_error FROM dbo.li_jobs WHERE ref_id = ${postId} ORDER BY id DESC`))[0];

  test('images: attach (JPG/PNG/GIF only), alt text, re-approve after a change, published with the post, removed with it', async () => {
    const fs = require('fs');
    const post = await scheduledPost('Cut my LLM latency from 27 s to 5.6 s. #AI');
    // A tiny valid PNG.
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const bad = new FormData();
    bad.append('image', new Blob(['hello'], { type: 'text/plain' }), 'x.txt');
    assert.equal((await api('POST', `/linkedin/posts/${post.id}/image`, bad)).status, 400);
    const fd = new FormData();
    fd.append('image', new Blob([png], { type: 'image/png' }), 'speed.png');
    fd.append('alt', 'A stopwatch going from 27 s to 5.6 s');
    const up = await api('POST', `/linkedin/posts/${post.id}/image`, fd);
    assert.equal(up.status, 201);
    assert.match(up.body.post.image_url, /^\/uploads\/linkedin\/post-\d+-[0-9a-f]{8}\.png$/);
    assert.equal(up.body.post.status, 'draft', 'changing the image on a scheduled post sends it back to draft');
    assert.equal((await job(post.id)).status, 'cancelled');
    const file = require('path').join(__dirname, '..', 'uploads', up.body.post.image_path);
    assert.ok(fs.existsSync(file));
    assert.equal((await api('PUT', `/linkedin/posts/${post.id}/image`, { alt: 'Stopwatch: 27 s → 5.6 s' })).body.post.image_alt, 'Stopwatch: 27 s → 5.6 s');
    // Re-approve: the real MCP preview validates the image; the publisher then gets the image with the post.
    const again = await api('POST', `/linkedin/posts/${post.id}/approve`, {});
    assert.equal(again.status, 200, JSON.stringify(again.body));
    const args = [];
    await runner.tick({ now: again.body.post.scheduled_ms + MIN, publisher: { async publish(p) { args.push(p); return { urn: 'urn:li:share:1', url: 'https://x' }; } } });
    assert.equal(args[0].image_path, up.body.post.image_path);
    assert.equal(args[0].image_alt, 'Stopwatch: 27 s → 5.6 s');
    // Posted: the image is locked; deleting a draft removes its file.
    const draft = (await api('POST', '/linkedin/posts', { week_start: nextWeek(), slot_index: 1, mode: 'manual', text: 'Another post' })).body.post;
    const fd2 = new FormData();
    fd2.append('image', new Blob([png], { type: 'image/png' }), 'a.png');
    const img2 = (await api('POST', `/linkedin/posts/${draft.id}/image`, fd2)).body.post.image_path;
    await api('DELETE', `/linkedin/posts/${draft.id}`);
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(fs.existsSync(require('path').join(__dirname, '..', 'uploads', img2)), false);
    fs.rmSync(file, { force: true });
  });

  test('the MCP gets the image as an absolute path with alt text (so preview and publish hash the same image)', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'linkedin', 'mcp-client.js'), 'utf8');
    assert.match(src, /image_path: path\.join\(require\('\.\.\/meals'\)\.UPLOADS, post\.image_path\)/);
  });

  test('planner shows 2 slots with rotating pillars and no posts', async () => {
    const { body } = await api('GET', `/linkedin/planner?week=${nextWeek()}`);
    assert.equal(body.slots.length, 2);
    assert.equal(body.slots[0].post, null);
    assert.notEqual(body.slots[0].pillar.name, body.slots[1].pillar.name);
  });

  test('approve → scheduled → runner publishes exactly once at the slot time, counted on the Goal tab', async () => {
    const post = await scheduledPost();
    assert.equal((await job(post.id)).status, 'queued');

    assert.deepEqual(await runner.tick({ now: post.scheduled_ms - MIN, publisher: fakePublisher }), { ran: 0, done: 0, retried: 0, failed: 0, missed: 0, cancelled: 0, paused: false });
    assert.equal(published.length, 0, 'not before its time');

    const r = await runner.tick({ now: post.scheduled_ms + MIN, publisher: fakePublisher });
    assert.equal(r.done, 1);
    assert.deepEqual(published, ['Week 1 done: Big-O and Two Sum. #DSA']);
    const after = (await api('GET', `/linkedin/planner?week=${nextWeek()}`)).body.slots[0].post;
    assert.equal(after.status, 'posted');
    assert.match(after.post_url, /linkedin\.com\/feed\/update\/urn:li:share:/);
    assert.equal((await api('GET', '/linkedin/goal')).body.thisWeek.actual.posts, 1, 'Goal tab: posts this week');

    await runner.tick({ now: post.scheduled_ms + 2 * MIN, publisher: fakePublisher });
    assert.equal(published.length, 1, 'never published twice');
    const audit = (await api('GET', '/linkedin/activity')).body.audit.map((a) => a.action);
    assert.ok(audit.includes('post_published') && audit.includes('post_scheduled'));
  });

  test('kill switch: paused → nothing runs and the job stays queued; resume → it runs', async () => {
    const post = await scheduledPost();
    await api('POST', '/linkedin/pause', { paused: true });
    const r = await runner.tick({ now: post.scheduled_ms + MIN, publisher: fakePublisher });
    assert.equal(r.paused, true);
    assert.equal(published.length, 0);
    assert.equal((await job(post.id)).status, 'queued');
    assert.equal((await api('POST', `/linkedin/posts/${post.id}/publish-now`)).status, 409, 'publish-now is blocked too');
    await api('POST', '/linkedin/pause', { paused: false });
    assert.equal((await runner.tick({ now: post.scheduled_ms + MIN, publisher: fakePublisher })).done, 1);
  });

  test('transient errors retry with backoff (5 min, 30 min) and then succeed', async () => {
    const post = await scheduledPost();
    failNext = ['fetch failed: ECONNRESET', 'LinkedIn error 503'];
    const t0 = post.scheduled_ms + MIN;
    assert.equal((await runner.tick({ now: t0, publisher: fakePublisher })).retried, 1);
    let j = await job(post.id);
    assert.equal(j.status, 'queued');
    assert.equal(j.attempts, 1);
    assert.ok(Number(j.run_ms) - Date.now() > 4 * MIN, 'next try ~5 min later');

    assert.equal((await runner.tick({ now: Number(j.run_ms) + 1, publisher: fakePublisher })).retried, 1);
    j = await job(post.id);
    assert.ok(Number(j.run_ms) - Date.now() > 29 * MIN, 'then ~30 min later');

    assert.equal((await runner.tick({ now: Number(j.run_ms) + 1, publisher: fakePublisher })).done, 1);
    assert.equal(published.length, 1);
  });

  test('auth errors fail immediately with a clear message (no pointless retries)', async () => {
    const post = await scheduledPost();
    failNext = ['Not connected to LinkedIn yet. Run the linkedin_login tool.'];
    assert.equal((await runner.tick({ now: post.scheduled_ms + MIN, publisher: fakePublisher })).failed, 1);
    const p = (await api('GET', `/linkedin/planner?week=${nextWeek()}`)).body.slots[0].post;
    assert.equal(p.status, 'failed');
    assert.match(p.error, /Not connected/);
    assert.equal((await job(post.id)).attempts, 1);
  });

  test('a slot missed by more than 12 hours is not posted late', async () => {
    const post = await scheduledPost();
    const r = await runner.tick({ now: post.scheduled_ms + 13 * HOUR, publisher: fakePublisher });
    assert.equal(r.missed, 1);
    assert.equal(published.length, 0);
    assert.match((await api('GET', `/linkedin/planner?week=${nextWeek()}`)).body.slots[0].post.error, /Missed its slot/);
  });

  test('a job interrupted mid-publish is marked failed (never blindly retried)', async () => {
    const post = await scheduledPost();
    await sqlQuery(`UPDATE dbo.li_jobs SET status = 'running' WHERE ref_id = ${post.id}`);
    assert.equal(await runner.recoverInterrupted(), 1);
    assert.match((await api('GET', `/linkedin/planner?week=${nextWeek()}`)).body.slots[0].post.error, /Check your LinkedIn profile/);
  });

  test('editing a scheduled post sends it back to draft and cancels its job', async () => {
    const post = await scheduledPost();
    const edited = (await api('PUT', `/linkedin/posts/${post.id}`, { text: 'Changed my mind about the hook. #DSA' })).body.post;
    assert.equal(edited.status, 'draft');
    assert.equal((await job(post.id)).status, 'cancelled');
    await runner.tick({ now: post.scheduled_ms + MIN, publisher: fakePublisher });
    assert.equal(published.length, 0, 'nothing posts without re-approval');
  });

  test('validation: too long is rejected at approval by the MCP preview; slot conflicts and bad config are rejected', async () => {
    const { body } = await api('POST', '/linkedin/posts', { week_start: nextWeek(), slot_index: 1, mode: 'manual', text: 'x'.repeat(2999) });
    await sqlQuery(`UPDATE dbo.li_posts SET text = REPLICATE(CAST('y' AS nvarchar(max)), 3100) WHERE id = ${body.post.id}`);
    const r = await api('POST', `/linkedin/posts/${body.post.id}/approve`, {});
    assert.equal(r.status, 400);
    assert.match(r.body.error, /3000/);

    await scheduledPost();
    assert.equal((await api('POST', '/linkedin/posts', { week_start: nextWeek(), slot_index: 0, mode: 'manual', text: 'again' })).status, 409);
    assert.equal((await api('PUT', '/linkedin/config', { slots: [{ day: 2, time: '25:00' }, { day: 4, time: '08:30' }] })).status, 400);
    assert.equal((await api('PUT', '/linkedin/config', { pillars: [] })).status, 400);
    const cfg = (await api('PUT', '/linkedin/config', { slots: [{ day: 1, time: '09:00' }, { day: 3, time: '19:30' }], auto_approve: false })).body;
    assert.deepEqual(cfg.slots, [{ day: 1, time: '09:00' }, { day: 3, time: '19:30' }]);
  });

  test('publish-now through the real MCP (not connected, empty token file) fails safely with the MCP message', async () => {
    const post = await scheduledPost();
    const r = await api('POST', `/linkedin/posts/${post.id}/publish-now`);
    assert.equal(r.status, 200);
    assert.equal(r.body.post.status, 'failed');
    assert.match(r.body.post.error, /Not connected to LinkedIn/);
    const status = (await api('GET', '/linkedin/mcp-status')).body;
    assert.deepEqual([status.reachable, status.connected], [true, false]);
  });
});
