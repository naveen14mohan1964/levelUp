// Reads the readable text of a news article so a LinkedIn post can be grounded in what it actually says.
// Best effort: on any failure (timeout, paywall, blocked, not HTML) it returns null and the caller uses the feed summary.
const MAX_BYTES = 1_500_000;
const MAX_CHARS = 6000;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
const decode = (s) => s.replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
  return ENTITIES[e.toLowerCase()] ?? m;
});

/** HTML → readable text: prefers <article>/<main>, drops scripts, styles, nav, header, footer, forms. Pure, testable. */
function htmlToText(html) {
  let h = String(html || '');
  const pick = h.match(/<article\b[\s\S]*?<\/article>/i) || h.match(/<main\b[\s\S]*?<\/main>/i);
  if (pick) h = pick[0];
  h = h.replace(/<(script|style|noscript|svg|nav|header|footer|form|aside|iframe)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/h[1-6]|\/li|\/div|\/section)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decode(h).replace(/[ \t\f\v]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

/** Fetches an article and returns up to ~6000 characters of its text, or null. fetchImpl is injectable for tests. */
async function fetchArticleText(url, { fetchImpl = fetch, timeoutMs = 12000 } = {}) {
  try {
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': 'LevelUp-Tracker/1.0 (personal reader)', Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(timeoutMs), redirect: 'follow',
    });
    if (!res.ok || !/html/i.test(res.headers?.get?.('content-type') || 'text/html')) return null;
    const html = (await res.text()).slice(0, MAX_BYTES);
    const text = htmlToText(html);
    return text.length >= 400 ? text.slice(0, MAX_CHARS) : null; // too little text = probably a paywall or a script-only page
  } catch {
    return null;
  }
}

module.exports = { htmlToText, fetchArticleText };
