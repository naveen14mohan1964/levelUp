// Checks every learn link in the full-stack course (server/data/courses/fullstack/week-XX.json).
//   node scripts/check-course-links.js            report only
//   node scripts/check-course-links.js --prune    also removes links that are definitely broken (404 / 410)
// Sites that block scripts (403, 429, timeouts) are reported as "unverified" and kept.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'server', 'data', 'courses', 'fullstack');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const prune = process.argv.includes('--prune');

async function once(url) {
  try {
    const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(20_000) });
    return res.status;
  } catch (e) {
    return /ENOTFOUND|EAI_AGAIN/.test(String(e.cause?.code || e.message)) ? 'dns' : 'error';
  }
}

// A flaky network (office proxy, Wi-Fi) fails DNS or times out now and then: retry before calling a link broken.
async function status(url) {
  let s;
  for (let attempt = 0; attempt < 3; attempt++) {
    s = await once(url);
    if (s === 200 || s === 404 || s === 410) return s;
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
  }
  return s;
}

(async () => {
  const files = fs.readdirSync(DIR).filter((f) => /^week-\d+\.json$/.test(f)).sort();
  const urls = new Map();
  for (const f of files) {
    for (const d of JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')).days) for (const l of d.learnLinks || []) urls.set(l.url, null);
  }
  const list = [...urls.keys()];
  for (let i = 0; i < list.length; i += 8) {
    const batch = list.slice(i, i + 8);
    const res = await Promise.all(batch.map(status));
    batch.forEach((u, j) => urls.set(u, res[j]));
  }
  // only a real "not found" from the site counts as broken; DNS and timeouts are this network, not the link
  const broken = list.filter((u) => [404, 410].includes(urls.get(u)));
  const unverified = list.filter((u) => urls.get(u) !== 200 && !broken.includes(u));
  console.log(`${list.length} links in ${files.length} weeks: ${list.length - broken.length - unverified.length} ok, ${broken.length} broken, ${unverified.length} unverified`);
  for (const u of broken) console.log(`  BROKEN ${urls.get(u)} ${u}`);
  for (const u of unverified) console.log(`  unverified ${urls.get(u)} ${u}`);

  if (prune && broken.length) {
    for (const f of files) {
      const p = path.join(DIR, f);
      const week = JSON.parse(fs.readFileSync(p, 'utf8'));
      let removed = 0;
      for (const d of week.days) {
        const before = (d.learnLinks || []).length;
        d.learnLinks = (d.learnLinks || []).filter((l) => !broken.includes(l.url));
        removed += before - d.learnLinks.length;
        if (d.kind === 'build' && !d.learnLinks.length) console.log(`  ${f} day ${d.dow}: no links left, add one by hand`);
      }
      if (removed) { fs.writeFileSync(p, `${JSON.stringify(week, null, 2)}\n`); console.log(`  ${f}: removed ${removed}`); }
    }
  }
})();
