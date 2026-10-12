// Verifies every documentation/learning URL in the app.
//   node scripts/check-links.js          -> report (exit 1 if anything is broken)
//   node scripts/check-links.js --json   -> machine-readable report
// Checks: HTTP status (following redirects), final URL, and that #anchors exist on the page.
// Sites that block scripts (Cloudflare etc.) are re-checked with headless Microsoft Edge.
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const links = require('./doc-links');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));

function collect() {
  const out = new Map(); // url -> labels[]
  const add = (x, where) => {
    if (!out.has(x.url)) out.set(x.url, []);
    out.get(x.url).push(`${where}: ${x.label}`);
  };
  for (const [w, days] of Object.entries(links.DSA_DAY_LINKS)) days.forEach((d, i) => d.forEach((x) => add(x, `DSA W${w} d${i}`)));
  links.PHASE2_LINKS.forEach((x) => add(x, 'DSA phase 2'));
  links.CHANNELS.forEach((x) => add(x, 'Channel'));
  for (const [w, days] of Object.entries(links.PROJECT_LEARN_LINKS)) days.forEach((d, i) => d.forEach((x) => add(x, `Project W${w} d${i}`)));
  links.PORTFOLIO_LINKS.forEach((d, i) => d.forEach((x) => add(x, `Portfolio d${i}`)));
  const plan = path.join(__dirname, '..', 'server', 'data', 'plan.json');
  if (fs.existsSync(plan)) {
    for (const p of JSON.parse(fs.readFileSync(plan, 'utf8')).projects) p.resources.forEach((x) => add(x, `${p.name} docs`));
  }
  return out;
}

async function fetchFollow(url) {
  let current = url;
  for (let hop = 0; hop < 8; hop++) {
    const res = await fetch(current, {
      redirect: 'manual',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' },
      signal: AbortSignal.timeout(25_000),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location'), current).href;
      continue;
    }
    const body = res.status === 200 ? await res.text() : '';
    return { status: res.status, finalUrl: current, body };
  }
  return { status: 'too-many-redirects', finalUrl: current, body: '' };
}

function edgeDump(url) {
  return new Promise((resolve) => {
    if (!EDGE) return resolve(null);
    const profile = path.join(require('os').tmpdir(), 'linkcheck-edge');
    execFile(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, '--virtual-time-budget=8000', '--dump-dom', url],
      { timeout: 45_000, maxBuffer: 50 * 1024 * 1024 }, (err, stdout) => resolve(err ? null : stdout));
  });
}

const titleOf = (html) => (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
const looksMissing = (html) => /\b(404|page not found|not found|doesn['’]t exist|does not exist|this page could not be found)\b/i.test(titleOf(html));
function hasAnchor(html, frag) {
  const ids = [frag, decodeURIComponent(frag)];
  return ids.some((id) => new RegExp(`(id|name)=["']${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i').test(html));
}
// Redirects that only add/remove a trailing slash, a locale or a query (e.g. ?view=aspnetcore-10.0) are fine.
const normalise = (u) => u.replace(/[?#].*$/, '').replace(/\/$/, '').replace('/en-us/', '/').toLowerCase();

// LeetCode and npm block scripted page loads (403), so verify through their public APIs instead.
async function leetcodeGql(query, variables) {
  const res = await fetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: 'https://leetcode.com', 'User-Agent': UA },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20_000),
  });
  return (await res.json()).data;
}
async function viaApi(url) {
  let m = url.match(/^https:\/\/leetcode\.com\/explore\/learn\/card\/([^/]+)\/$/);
  if (m) {
    const d = await leetcodeGql('query($s:String!){ card(cardSlug:$s){ title } }', { s: m[1] });
    return { ok: !!d?.card, title: d?.card?.title, via: 'leetcode-api' };
  }
  m = url.match(/^https:\/\/leetcode\.com\/studyplan\/([^/]+)\/$/);
  if (m) {
    const d = await leetcodeGql('query($s:String!){ studyPlanV2Detail(planSlug:$s){ name } }', { s: m[1] });
    return { ok: !!d?.studyPlanV2Detail, title: d?.studyPlanV2Detail?.name, via: 'leetcode-api' };
  }
  m = url.match(/^https:\/\/www\.npmjs\.com\/package\/(.+)$/);
  if (m) {
    const res = await fetch(`https://registry.npmjs.org/${m[1]}`, { signal: AbortSignal.timeout(20_000) });
    return { ok: res.status === 200, title: m[1], via: 'npm-registry' };
  }
  return null;
}

async function check(url) {
  const frag = url.includes('#') ? url.split('#')[1] : null;
  const api = await viaApi(url).catch(() => null);
  if (api) return { url, status: api.ok ? 200 : 404, via: api.via, title: api.title, ...(api.ok ? {} : { problem: 'not found via API' }) };
  let r;
  try {
    r = await fetchFollow(url.split('#')[0]);
  } catch (e) {
    r = { status: `error: ${e.cause?.code || e.message}`, finalUrl: url, body: '' };
  }
  let via = 'http';
  if (r.status !== 200) {
    const html = await edgeDump(url.split('#')[0]);
    if (html && html.length > 500 && !looksMissing(html)) {
      r = { status: 200, finalUrl: url.split('#')[0], body: html };
      via = 'edge';
    }
  }
  const result = { url, status: r.status, finalUrl: r.finalUrl, via, title: titleOf(r.body) };
  if (r.status === 200 && looksMissing(r.body)) result.problem = `page says not found ("${result.title}")`;
  else if (String(r.status).startsWith('error')) result.unverified = `${r.status} (network: this machine can't reach the site)`;
  else if (r.status !== 200) result.problem = `HTTP ${r.status}`;
  else if (frag && !/github\.com/.test(url) && !hasAnchor(r.body, frag)) result.problem = `anchor #${frag} not found on page`;
  if (!result.problem && normalise(r.finalUrl) !== normalise(url.split('#')[0])) result.redirect = r.finalUrl;
  return result;
}

// Every LeetCode problem in the plan: slug exists, and number + difficulty match what the plan says.
async function checkProblems() {
  const plan = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'server', 'data', 'plan.json'), 'utf8'));
  const probs = plan.days.flatMap((d) => d.problems).filter((p) => p.source === 'LeetCode');
  const DIFF = { Easy: 'E', Medium: 'M', Hard: 'H' };
  const issues = [];
  let i = 0;
  const worker = async () => {
    while (i < probs.length) {
      const p = probs[i++];
      const slug = p.url.match(/problems\/([^/]+)\//)[1];
      let q = null;
      for (let attempt = 0; attempt < 3 && !q; attempt++) {
        q = await leetcodeGql('query($s:String!){ question(titleSlug:$s){ questionFrontendId title difficulty } }', { s: slug })
          .then((d) => d?.question || 'missing').catch(() => null);
        if (!q) await new Promise((r) => setTimeout(r, 1500));
      }
      if (!q) issues.push({ p, problem: 'LeetCode API unreachable' });
      else if (q === 'missing') issues.push({ p, problem: `slug "${slug}" does not exist` });
      else {
        if (Number(q.questionFrontendId) !== p.number) issues.push({ p, problem: `number is ${q.questionFrontendId}, plan says ${p.number}` });
        if (DIFF[q.difficulty] !== p.difficulty) issues.push({ p, problem: `difficulty is ${q.difficulty}, plan says ${p.difficulty}` });
      }
      if (!process.argv.includes('--json')) process.stdout.write('·');
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return { total: probs.length, issues };
}

async function main() {
  const all = collect();
  const urls = [...all.keys()];
  const results = [];
  let i = 0;
  const worker = async () => {
    while (i < urls.length) {
      const url = urls[i++];
      results.push(await check(url));
      if (!process.argv.includes('--json')) process.stdout.write('.');
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  const problems = process.argv.includes('--skip-problems') ? null : await checkProblems();
  const broken = results.filter((r) => r.problem);
  const redirected = results.filter((r) => !r.problem && r.redirect);
  const unverified = results.filter((r) => r.unverified);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ total: results.length, broken, redirected, unverified, problems, results }, null, 2));
  } else {
    console.log(`\n\nChecked ${results.length} unique URLs: ${results.length - broken.length} OK, ${broken.length} broken, ${redirected.length} redirected.`);
    for (const r of broken) console.log(`  ✗ ${r.url}\n      ${r.problem}  [${all.get(r.url)[0]}]`);
    for (const r of redirected) console.log(`  ↪ ${r.url}\n      → ${r.redirect}`);
    for (const r of unverified) console.log(`  ? ${r.url}
      ${r.unverified}`);
    const via = (v) => results.filter((r) => r.via === v).length;
    console.log(`  verified via: headless Edge ${via('edge')}, LeetCode API ${via('leetcode-api')}, npm registry ${via('npm-registry')}`);
    if (problems) {
      console.log(`
LeetCode problems: ${problems.total} checked, ${problems.issues.length} issue(s).`);
      for (const x of problems.issues) console.log(`  ✗ ${x.p.number}. ${x.p.title}: ${x.problem}`);
    }
  }
  process.exit(broken.length || problems?.issues.length ? 1 : 0);
}

main();
