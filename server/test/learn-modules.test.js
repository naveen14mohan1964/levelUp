// LLD + HLD learning modules: roadmap integrity, API (progress, notes, locks) and their place in the game layer.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, api } = require('./helpers');
const { MODULES } = require('../src/learn/modules');

describe('roadmaps', () => {
  for (const key of ['lld', 'hld']) {
    test(`${key}: 10 levels from scratch to advanced; every lesson has links, a build and a checkpoint`, () => {
      const r = MODULES[key].roadmap;
      assert.equal(r.levels.length, 10);
      const lessons = r.levels.flatMap((lv) => lv.lessons);
      assert.ok(lessons.length >= 40, `${lessons.length} lessons`);
      assert.equal(new Set(lessons.map((x) => x.id)).size, lessons.length, 'ids are unique');
      assert.ok(lessons.every((x) => x.id.startsWith(key.toUpperCase())));
      for (const x of lessons) {
        assert.ok(x.links.length >= 1 && x.links.every(([l, u]) => l && /^https:\/\//.test(u)), x.id);
        assert.ok(x.build.length > 20 && x.check.endsWith('?') && x.minutes >= 20 && x.minutes <= 120, x.id);
      }
    });
  }
  test('judge: engineering judgement + domain expertise, 11 levels; every lesson has links, a build and a checkpoint', () => {
    const r = MODULES.judge.roadmap;
    assert.equal(r.levels.length, 11);
    const lessons = r.levels.flatMap((lv) => lv.lessons);
    assert.ok(lessons.length >= 40, `${lessons.length} lessons`);
    assert.equal(new Set(lessons.map((x) => x.id)).size, lessons.length, 'ids are unique');
    assert.ok(lessons.every((x) => /^EJ\d+-\d+$/.test(x.id)));
    for (const x of lessons) {
      assert.ok(x.links.length >= 1 && x.links.every(([l, u]) => l && /^https:\/\//.test(u)), x.id);
      assert.ok(x.build.length > 20 && x.check.endsWith('?') && x.minutes >= 20 && x.minutes <= 120, x.id);
    }
    const all = JSON.stringify(r).toLowerCase();
    for (const w of ['two-way door', 'trade-off', 'decision record', 'estimat', 'technical debt', 'postmortem', 'eval', 'ubiquitous language', 'bounded context', 'double-entry', 'idempoten', 'STAR']) assert.ok(all.includes(w.toLowerCase()), w);
  });
  test('they cover the core topics', () => {
    const lld = JSON.stringify(MODULES.lld.roadmap);
    for (const w of ['SOLID', 'Singleton', 'Strategy', 'Observer', 'deadlock', 'LRU', 'parking lot', 'Splitwise', 'BookMyShow', 'Elevator']) assert.ok(lld.toLowerCase().includes(w.toLowerCase()), w);
    const hld = JSON.stringify(MODULES.hld.roadmap);
    for (const w of ['DNS', 'load balanc', 'cach', 'sharding', 'consistent hashing', 'CAP', 'Kafka', 'idempoten', 'circuit breaker', 'Raft', 'saga', 'URL shortener', 'news feed', 'chat', 'Dynamo']) assert.ok(hld.toLowerCase().includes(w.toLowerCase()), w);
  });
});

describe('learning modules API', () => {
  before(startServer);
  after(stopServer);

  test('progress, notes, one-by-one unlocks, XP and the level map', async () => {
    let r = (await api('GET', '/learn/lld')).body;
    assert.deepEqual([r.label, r.next.id, r.next.level, r.progress.done, r.progress.total], ['LLD', 'LLD1-1', 1, 0, 43]);
    assert.equal(r.levels[0].lessons[0].links[0].url, 'https://docs.oracle.com/javase/tutorial/java/concepts/index.html');
    assert.equal((await api('POST', '/learn/lld/lessons/LLD1-2', { done: true })).status, 409, 'locked until LLD1-1 is done');
    assert.equal((await api('POST', '/learn/lld/lessons/LLD1-2', { notes: 'reading ahead' })).status, 200, 'notes always save');
    assert.equal((await api('POST', '/learn/lld/lessons/LLD1-1', { done: true, notes: 'encapsulation protects invariants' })).status, 200);
    r = (await api('GET', '/learn/lld')).body;
    assert.deepEqual([r.next.id, r.progress.done, r.levels[0].lessons[0].notes], ['LLD1-2', 1, 'encapsulation protects invariants']);
    const g = (await api('GET', '/game')).body;
    assert.deepEqual(g.tracks.filter((t) => ['lld', 'hld'].includes(t.key)).map((t) => [t.key, t.done, t.next.ref]), [['lld', 1, 'LLD1-2'], ['hld', 0, 'HLD1-1']]);
    assert.ok(g.player.total >= 25, 'a finished lesson earns XP');
    const map = (await api('GET', '/game/track/hld')).body.track;
    assert.deepEqual(map.levels.slice(0, 2).map((lv) => lv.status), ['current', 'locked']);
    assert.equal((await api('POST', '/focus/start', { track: 'hld', ref: 'HLD1-1', minutes: 5 })).status, 201, 'the focus timer works for the new tracks');
    await api('POST', '/focus/stop');
  });

  test('unknown module or lesson → 404', async () => {
    assert.equal((await api('GET', '/learn/chess')).status, 404);
    assert.equal((await api('POST', '/learn/hld/lessons/HLD99-9', { done: true })).status, 404);
  });
});
