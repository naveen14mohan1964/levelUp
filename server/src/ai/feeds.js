// "Stay updated": reads official AI blogs' public RSS/Atom feeds (published so readers can follow them) once a day.
// A tiny dependency-free parser: enough for RSS 2.0 <item> and Atom <entry>.
const fs = require('fs');
const path = require('path');
const { sql, getPool } = require('../db');

const ROADMAP = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'ai-roadmap.json'), 'utf8'));
const FEEDS = ROADMAP.feeds.map(([source, url]) => ({ source, url }));
const DAY = 86400000;
const KEEP_DAYS = 120;

const decode = (s) => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&');
const text = (html) => decode(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : '';
};

/** RSS or Atom XML -> [{ title, url, summary, published_ms }] (newest first as the feed lists them). */
function parseFeed(xml) {
  const s = String(xml || '');
  const items = [];
  for (const m of s.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    const b = m[1];
    const url = text(tag(b, 'link')) || text(tag(b, 'guid'));
    items.push({ title: text(tag(b, 'title')), url, summary: text(tag(b, 'description')).slice(0, 400), published_ms: Date.parse(text(tag(b, 'pubDate')) || text(tag(b, 'dc:date'))) || null });
  }
  for (const m of s.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)) {
    const b = m[1];
    const links = [...b.matchAll(/<link\b([^>]*)\/?>/gi)].map((l) => ({ href: (l[1].match(/href="([^"]+)"/) || [])[1], rel: (l[1].match(/rel="([^"]+)"/) || [])[1] || 'alternate' }));
    const url = decode((links.find((l) => l.rel === 'alternate' && l.href) || links.find((l) => l.href) || {}).href || '');
    items.push({ title: text(tag(b, 'title')), url, summary: text(tag(b, 'summary') || tag(b, 'content')).slice(0, 400), published_ms: Date.parse(text(tag(b, 'published')) || text(tag(b, 'updated'))) || null });
  }
  return items.filter((i) => i.title && /^https?:\/\//.test(i.url));
}

/** Fetches every feed (or the given ones), stores new items, prunes old unsaved ones. fetchImpl is injectable for tests. */
async function refreshNews({ feeds = FEEDS, fetchImpl = fetch, perFeed = 15 } = {}) {
  const pool = await getPool();
  const summary = { feeds: feeds.length, ok: 0, failed: [], added: 0 };
  for (const f of feeds) {
    let items;
    try {
      const res = await fetchImpl(f.url, { headers: { 'User-Agent': 'LevelUp-Tracker/1.0 (personal reader)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      items = parseFeed(await res.text()).slice(0, perFeed);
    } catch (e) {
      summary.failed.push({ source: f.source, error: e.message });
      continue;
    }
    const now = Date.now();
    // Some feeds give no dates. First time we see a feed, its undated items may be weeks old: leave them undated (they sort
    // last). After that we check daily, so a newly appearing undated item really is from today.
    const firstTime = (await pool.request().input('src', sql.NVarChar, f.source).query('SELECT COUNT(*) AS n FROM dbo.ai_news WHERE source = @src')).recordset[0].n === 0;
    for (const it of items) if (!it.published_ms && !firstTime) it.published_ms = now;
    // Skip items older than the window: storing them would get them pruned and re-added as "new" on every refresh.
    for (const it of items.filter((i) => !i.published_ms || i.published_ms >= now - KEEP_DAYS * DAY)) {
      const r = await pool.request().input('src', sql.NVarChar, f.source).input('t', sql.NVarChar, it.title.slice(0, 400)).input('u', sql.NVarChar, it.url.slice(0, 600))
        .input('s', sql.NVarChar, it.summary || null).input('p', sql.BigInt, it.published_ms).input('now', sql.BigInt, now)
        .query(`IF NOT EXISTS (SELECT 1 FROM dbo.ai_news WHERE url = @u)
                INSERT INTO dbo.ai_news (source, title, url, summary, published_ms, fetched_ms) VALUES (@src, @t, @u, @s, @p, @now)`);
      summary.added += r.rowsAffected[0] || 0;
    }
    summary.ok++;
  }
  await pool.request().input('old', sql.BigInt, Date.now() - KEEP_DAYS * DAY)
    .query(`DELETE FROM dbo.ai_news WHERE status <> 'saved' AND COALESCE(published_ms, fetched_ms) < @old`);
  return summary;
}

/** Daily refresh in the always-on app (first run 3 minutes after start). */
function start() {
  const run = () => refreshNews().then((s) => s.added && console.log(`AI news: ${s.added} new from ${s.ok}/${s.feeds} feeds`))
    .catch((e) => console.warn('AI news refresh failed:', e.message));
  setTimeout(run, 3 * 60 * 1000).unref();
  setInterval(run, DAY).unref();
}

module.exports = { ROADMAP, FEEDS, parseFeed, refreshNews, start };
