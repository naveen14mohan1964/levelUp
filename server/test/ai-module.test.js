// AI + FDE learning module: roadmap integrity, feed parsing, streaks, and the API (feeds are faked: no network).
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, api, sqlQuery } = require('./helpers');
const { ROADMAP, parseFeed } = require('../src/ai/feeds');

describe('roadmap', () => {
  test('14 levels from math to hired, incl. harness engineering, multi-agent, RAG at scale and FDE; every lesson has links, a build and a checkpoint', () => {
    assert.equal(ROADMAP.levels.length, 14);
    for (const re of [/^Math/, /PyTorch/, /RAG/, /harness engineering/, /Forward Deployed Engineer/, /hired/]) assert.ok(ROADMAP.levels.some((l) => re.test(l.title)), String(re));
    const all = JSON.stringify(ROADMAP.levels);
    for (const w of ['NumPy', 'pandas', 'scikit-learn', 'Ollama', 'Hugging Face', 'Anthropic', 'FastAPI', 'Docker', 'Cloud Run', 'LoRA', 'GraphRAG', 'orchestrator', 'open source']) assert.ok(all.includes(w), w);
    const ids = ROADMAP.levels.flatMap((l) => l.lessons.map((x) => x.id));
    assert.equal(new Set(ids).size, ids.length, 'lesson ids are unique');
    for (const l of ROADMAP.levels.flatMap((lv) => lv.lessons)) {
      assert.ok(l.links.length >= 1, l.id);
      for (const [label, url] of l.links) assert.ok(label && /^https:\/\//.test(url), `${l.id}: ${url}`);
      assert.ok(l.build.length > 20 && l.check.endsWith('?'), l.id);
      assert.ok(l.minutes >= 20 && l.minutes <= 120, l.id);
    }
    assert.ok(ROADMAP.feeds.length >= 6);
  });
});

describe('feeds', () => {
  test('parses RSS 2.0 and Atom, decodes entities and CDATA, skips items without a link', () => {
    const rss = `<?xml version="1.0"?><rss><channel><title>X</title>
      <item><title><![CDATA[Agents &amp; tools]]></title><link>https://a.com/1</link><description>&lt;p&gt;Hello <b>world</b>&lt;/p&gt;</description><pubDate>Fri, 09 Oct 2026 10:00:00 GMT</pubDate></item>
      <item><title>No link</title></item></channel></rss>`;
    const r = parseFeed(rss);
    assert.equal(r.length, 1);
    assert.deepEqual([r[0].title, r[0].url, r[0].summary], ['Agents & tools', 'https://a.com/1', 'Hello world']);
    assert.equal(new Date(r[0].published_ms).toISOString(), '2026-10-09T10:00:00.000Z');
    const atom = `<feed><entry><title>Evals 101</title><link rel="replies" href="https://b.com/c"/><link rel="alternate" href="https://b.com/post"/><published>2026-10-08T00:00:00Z</published><summary>Why evals</summary></entry></feed>`;
    assert.deepEqual(parseFeed(atom).map((x) => [x.title, x.url, x.summary]), [['Evals 101', 'https://b.com/post', 'Why evals']]);
  });

});

describe('AI module API', () => {
  before(startServer);
  after(stopServer);

  test('today = the first unfinished lesson; done / notes / undo; progress and streak', async () => {
    let a = (await api('GET', '/ai')).body;
    assert.deepEqual([a.next.id, a.next.level, a.next.levelTitle, a.progress.done, a.progress.total, a.streak], ['L1-1', 1, 'Math for AI', 0, 69, 0]);
    assert.equal(a.levels[0].lessons[0].links[0].url, 'https://www.3blue1brown.com/?topic=linear-algebra');
    assert.equal((await api('POST', '/ai/lessons/L1-1', { done: true, notes: 'Weights change, architecture does not' })).status, 200);
    a = (await api('GET', '/ai')).body;
    assert.deepEqual([a.next.id, a.progress.done, a.streak, a.thisWeek], ['L1-2', 1, 1, 1]);
    assert.equal(a.levels[0].lessons[0].notes, 'Weights change, architecture does not');
    await api('POST', '/ai/lessons/L1-1', { notes: 'edited' });
    const doneAt = (await sqlQuery("SELECT done_ms FROM dbo.ai_progress WHERE lesson_id = 'L1-1'"))[0].done_ms;
    await api('POST', '/ai/lessons/L1-1', { done: true });
    assert.equal((await sqlQuery("SELECT done_ms FROM dbo.ai_progress WHERE lesson_id = 'L1-1'"))[0].done_ms, doneAt, 'marking done again keeps the first date');
    await api('POST', '/ai/lessons/L1-1', { done: false });
    assert.equal((await api('GET', '/ai')).body.next.id, 'L1-1');
    assert.equal((await api('POST', '/ai/lessons/L9-9', { done: true })).status, 404);
  });

  test('news: refresh stores new items once, a failing feed is reported, save/hide, old items pruned', async () => {
    const { refreshNews } = require('../src/ai/feeds');
    const feeds = [{ source: 'Fake RSS', url: 'https://f/rss' }, { source: 'Fake Atom', url: 'https://f/atom' }, { source: 'Down', url: 'https://f/down' }];
    const now = new Date().toUTCString();
    const fetchImpl = async (url) => {
      if (url.endsWith('down')) return { ok: false, status: 503 };
      if (url.endsWith('rss')) return { ok: true, text: async () => `<rss><channel><item><title>MCP update</title><link>https://f/1</link><pubDate>${now}</pubDate></item><item><title>Old post</title><link>https://f/old</link><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item></channel></rss>` };
      return { ok: true, text: async () => `<feed><entry><title>RAG tips</title><link href="https://f/2"/><updated>${new Date().toISOString()}</updated></entry></feed>` };
    };
    const s = await refreshNews({ feeds, fetchImpl });
    assert.deepEqual([s.ok, s.failed.length, s.failed[0].source], [2, 1, 'Down']);
    let list = (await api('GET', '/ai/news')).body.items;
    assert.deepEqual(list.map((x) => x.title).sort(), ['MCP update', 'RAG tips'], 'the 2024 post was pruned (older than 120 days)');
    assert.equal((await refreshNews({ feeds, fetchImpl })).added, 0, 'the same items are never stored twice');
    assert.equal((await api('GET', '/ai')).body.unreadNews, 2);
    const id = list.find((x) => x.title === 'RAG tips').id;
    await api('PATCH', `/ai/news/${id}`, { status: 'saved' });
    assert.deepEqual((await api('GET', '/ai/news?status=saved')).body.items.map((x) => x.title), ['RAG tips']);
    await api('PATCH', `/ai/news/${id}`, { status: 'hidden' });
    list = (await api('GET', '/ai/news')).body.items;
    assert.deepEqual(list.map((x) => x.title), ['MCP update']);
    assert.equal((await api('PATCH', `/ai/news/${id}`, { status: 'loved' })).status, 400);
  });

  test('a feed without dates: first fetch stays undated (sorted last), later new items count as today', async () => {
    const { refreshNews } = require('../src/ai/feeds');
    let items = ['<item><title>Old undated</title><link>https://u/1</link></item>'];
    const fetchImpl = async () => ({ ok: true, text: async () => `<rss><channel>${items.join('')}</channel></rss>` });
    const feeds = [{ source: 'Dateless', url: 'https://u/feed' }];
    await refreshNews({ feeds, fetchImpl });
    items = ['<item><title>Fresh undated</title><link>https://u/2</link></item>', ...items];
    await refreshNews({ feeds, fetchImpl });
    const rows = await sqlQuery("SELECT title, published_ms FROM dbo.ai_news WHERE source = 'Dateless' ORDER BY id");
    assert.deepEqual([rows[0].title, rows[0].published_ms, rows[1].title, !!rows[1].published_ms], ['Old undated', null, 'Fresh undated', true]);
    const list = (await api('GET', '/ai/news?source=Dateless')).body.items.map((x) => x.title);
    assert.deepEqual(list, ['Fresh undated', 'Old undated']);
  });
});
