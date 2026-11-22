// Daily check-in + journal, and the "active tracks" setting that keeps Today and the sidebar small.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, api } = require('./helpers');

const D = '2026-11-17';

describe('journal + simplification settings', () => {
  before(startServer);
  after(stopServer);

  test('a day without an entry reads as empty, never as an error', async () => {
    const r = await api('GET', `/journal/${D}`);
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.saved, r.body.mood, r.body.note], [false, null, null]);
  });

  test('saving changes only the fields sent; empty text clears a field', async () => {
    let r = await api('PUT', `/journal/${D}`, { mood: 3 });
    assert.deepEqual([r.status, r.body.mood, r.body.saved], [200, 3, true]);
    r = await api('PUT', `/journal/${D}`, { note: '  Solved two sum  ', grateful: 'A quiet morning' });
    assert.deepEqual([r.body.mood, r.body.note, r.body.grateful], [3, 'Solved two sum', 'A quiet morning']);
    r = await api('PUT', `/journal/${D}`, { note: '' });
    assert.deepEqual([r.body.note, r.body.grateful], [null, 'A quiet morning']);
    assert.equal((await api('GET', `/journal/${D}`)).body.mood, 3);
  });

  test('bad input is rejected with a clear message', async () => {
    assert.equal((await api('GET', '/journal/2026-13-45')).status, 400);
    assert.equal((await api('PUT', `/journal/${D}`, { mood: 9 })).status, 400);
    assert.equal((await api('PUT', `/journal/${D}`, { note: 'x'.repeat(501) })).status, 400);
    assert.equal((await api('PUT', `/journal/${D}`, {})).status, 400);
  });

  test('active tracks: a short, valid list is saved; unknown or too many are rejected', async () => {
    const r = await api('PUT', '/settings', { active_tracks: ['dsa', 'fullstack'], display_name: ' Naveen ' });
    assert.deepEqual([r.status, r.body.active_tracks, r.body.display_name], [200, 'dsa,fullstack', 'Naveen']);
    assert.equal((await api('PUT', '/settings', { active_tracks: 'dsa,dotnet' })).status, 400, '.NET alone is not a track any more');
    assert.equal((await api('PUT', '/settings', { active_tracks: 'dsa,cooking' })).status, 400);
    assert.equal((await api('PUT', '/settings', { active_tracks: 'dsa,ai,lld,hld' })).status, 400);
    assert.equal((await api('PUT', '/settings', { active_tracks: '' })).status, 400);
  });
});
