// Dev-only reset: off unless the server runs with --dev-tools; snapshot first; only AI + game state; restore puts it back.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, api, sqlQuery } = require('./helpers');

describe('dev tools', () => {
  before(startServer);
  after(() => { delete process.env.LEVELUP_DEV_TOOLS; return stopServer(); });

  test('the always-on app answers 404 (no --dev-tools)', async () => {
    delete process.env.LEVELUP_DEV_TOOLS;
    assert.equal((await api('GET', '/dev/status')).status, 404);
    assert.equal((await api('POST', '/dev/reset', { confirm: 'RESET' })).status, 404);
  });

  test('reset needs RESET, snapshots first, clears only AI + game state; restore brings it all back', async () => {
    process.env.LEVELUP_DEV_TOOLS = '1';
    for (const id of ['L1-1', 'L1-2']) await api('POST', `/ai/lessons/${id}`, { done: true, notes: `n-${id}` });
    await api('POST', '/focus/start', { track: 'ai', ref: 'L1-3', minutes: 5 });
    await api('POST', '/focus/stop');
    const dsaSolved = async () => (await sqlQuery("SELECT COUNT(*) AS n FROM dbo.problems WHERE status <> 'todo'"))[0].n;
    const p = (await sqlQuery("SELECT TOP 1 id FROM dbo.problems WHERE day_id IS NOT NULL ORDER BY id"))[0];
    await api('PATCH', `/problems/${p.id}/status`, { status: 'solved' });
    const solvedBefore = await dsaSolved();
    const xpBefore = (await api('GET', '/game')).body.player.total;

    assert.equal((await api('POST', '/dev/reset', { confirm: 'yes' })).status, 400);
    const r = await api('POST', '/dev/reset', { confirm: 'RESET' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.snapshot.counts, { lessons: 2, sessions: 1, freezes: 0, celebrations: 0 });
    const g = (await api('GET', '/game/track/ai')).body;
    assert.deepEqual([g.track.done, g.track.next.ref], [0, 'L1-1'], 'AI starts from lesson 1 again');
    assert.equal(await dsaSolved(), solvedBefore, 'DSA progress untouched');
    assert.equal((await api('GET', '/dev/status')).body.snapshots.length, 1);

    const back = await api('POST', '/dev/restore', {});
    assert.deepEqual([back.status, back.body.counts.lessons], [200, 2]);
    const after = (await api('GET', '/game')).body;
    assert.deepEqual([after.player.total, after.tracks[0].next.ref], [xpBefore, 'L1-3']);
    assert.equal((await sqlQuery("SELECT notes FROM dbo.ai_progress WHERE lesson_id = 'L1-2'"))[0].notes, 'n-L1-2');
    assert.equal((await api('POST', '/dev/restore', { id: 9999 })).status, 404);
  });
});
