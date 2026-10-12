// Jobs feed: reads target companies' PUBLIC job-board APIs (the ones Greenhouse, Lever, Ashby and SmartRecruiters
// publish so other sites can list a company's openings), keeps roles you could get with ~1–4 years' experience in
// India or remote, and scores how well each fits you. No HTML scraping and no logins: big companies with their own
// careers sites (Google, Microsoft, Amazon…) keep a "Careers ↗" link instead.

const UA = 'LevelUp-Tracker/1.0 (personal job search)';
const DAY = 86400000;

async function getJson(url, fetchImpl = fetch) {
  const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
  return res.json();
}

const strip = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();

/** Each provider -> [{ ext_id, title, location, url, remote, department, posted_ms, text }] */
const PROVIDERS = {
  async greenhouse(token, f) {
    const j = await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`, f);
    return (j.jobs || []).map((x) => ({
      ext_id: String(x.id), title: x.title, location: x.location?.name || '', url: x.absolute_url,
      remote: /remote/i.test(x.location?.name || ''), department: (x.departments || []).map((d) => d.name).join(', '),
      posted_ms: Date.parse(x.updated_at) || null, text: strip(x.content ? x.content.replace(/&lt;/g, '<').replace(/&gt;/g, '>') : ''),
    }));
  },
  async lever(token, f) {
    const j = await getJson(`https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`, f);
    return (Array.isArray(j) ? j : []).map((x) => {
      const locs = [x.categories?.location, ...(x.categories?.allLocations || [])].filter(Boolean);
      return {
        ext_id: String(x.id), title: x.text, location: [...new Set(locs)].join(' / '), url: x.hostedUrl,
        remote: /remote/i.test(`${x.workplaceType || ''} ${locs.join(' ')}`), department: [x.categories?.team, x.categories?.department].filter(Boolean).join(', '),
        posted_ms: x.createdAt || null, text: `${x.descriptionPlain || ''} ${(x.lists || []).map((l) => strip(l.content)).join(' ')}`,
      };
    });
  },
  async ashby(token, f) {
    const j = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}`, f);
    return (j.jobs || []).filter((x) => x.isListed !== false).map((x) => {
      const locs = [x.location, ...(x.secondaryLocations || []).map((s) => s.location)].filter(Boolean);
      return {
        ext_id: String(x.id), title: x.title, location: locs.join(' / '), url: x.jobUrl,
        remote: !!x.isRemote || /remote/i.test(locs.join(' ')), department: [x.department, x.team].filter(Boolean).join(', '),
        posted_ms: Date.parse(x.publishedAt) || null, text: x.descriptionPlain || strip(x.descriptionHtml),
      };
    });
  },
  async smartrecruiters(token, f) {
    // Up to 300 postings (the API returns 100 per page).
    const content = [];
    for (let offset = 0; offset < 300; offset += 100) {
      const j = await getJson(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(token)}/postings?limit=100&offset=${offset}`, f);
      content.push(...(j.content || []));
      if (!j.content || j.content.length < 100) break;
    }
    return content.map((x) => ({
      ext_id: String(x.id), title: x.name, location: [x.location?.city, x.location?.region, x.location?.country].filter(Boolean).join(', '),
      url: `https://jobs.smartrecruiters.com/${encodeURIComponent(token)}/${x.id}`, remote: !!x.location?.remote,
      department: x.department?.label || '', posted_ms: Date.parse(x.releasedDate) || null, text: '',
    }));
  },
};

/* ------------------------------- matching ------------------------------- */

const INDIA = /\bindia\b|bengaluru|bangalore|hyderabad|chennai|pune|mumbai|gurgaon|gurugram|noida|new delhi|\bdelhi\b|kolkata|ahmedabad|kochi|coimbatore|\bblr\b|\bhyd\b/i;
const GLOBAL_REMOTE = /anywhere|worldwide|global|apac|asia/i;
const ENGINEERING = /engineer|developer|\bsde\b|\bswe\b|programmer|full.?stack|back.?end|front.?end|software/i;
const NOT_FOR_YOU = /\b(staff|principal|distinguished|director|head|vp|vice president|manager|architect|intern|internship|apprentice|chief|lead|tl|stl)\b|sales engineer|solutions? engineer|support engineer|field engineer|customer engineer|technical account|pre.?sales/i;
// Remote roles tied to another country/region are not open to someone in India.
const OTHER_PLACE = /\b(us|usa|u\.s\.|united states|america|americas|canada|mexico|latam|brazil|europe|emea|uk|united kingdom|ireland|germany|france|spain|portugal|netherlands|poland|australia|japan|singapore|israel|namer|na)\b|toronto|vancouver|london|berlin|new york|san francisco|seattle|amsterdam|dublin/i;
const CORE_SOFTWARE = /software|developer|\bsde\b|\bswe\b|back.?end|front.?end|full.?stack|platform|application|\bweb\b|mobile|android|\bios\b/i;
const TESTING = /\btest|\bqa\b|sdet|quality/i;
const SENIOR = /\b(senior|sr\.?|lead|iii|3)\b/i;
const JUNIOR = /\b(junior|jr\.?|associate|graduate|new grad|entry|i|1|ii|2)\b|sde.?(1|2|i|ii)\b|engineer (1|2|i|ii)\b/i;

/** Years asked for, e.g. "3+ years", "2-5 years of experience" -> 3 / 2 (null if not stated). */
function minYears(text) {
  const m = String(text || '').match(/(\d{1,2})\s*(?:\+|plus)?\s*(?:-|–|to)?\s*(?:\d{1,2})?\s*\+?\s*years?(?:'|’)?\s*(?:of)?\s*(?:professional|relevant|industry|hands.on|work)?\s*experience/i);
  return m ? Number(m[1]) : null;
}

/**
 * Scores one job 0–100 for you, or returns null if it isn't for you (wrong role/level/location).
 * profile: { skills[], years }, company: { tier }, knowsSomeone: bool
 */
function scoreJob(job, company, profile, knowsSomeone = false) {
  const title = job.title || '';
  if (!ENGINEERING.test(title) || NOT_FOR_YOU.test(title)) return null;
  const loc = `${job.location || ''}`;
  const inIndia = INDIA.test(loc);
  const globalRemote = job.remote && GLOBAL_REMOTE.test(loc) && !OTHER_PLACE.test(loc);
  const bareRemote = job.remote && !OTHER_PLACE.test(loc) && !GLOBAL_REMOTE.test(loc);
  if (!inIndia && !globalRemote && !bareRemote) return null;
  const years = minYears(job.text);
  const my = profile.years ?? 2;
  if (years != null && years > my + 2) return null; // asks for far more experience than you have
  const reasons = [];
  let score = 0;
  const add = (points, text) => { score += points; reasons.push({ points, text }); };
  if (inIndia) add(25, `In India (${loc.slice(0, 60)})`);
  else if (globalRemote) add(20, 'Remote, open worldwide/APAC');
  else add(10, "Remote, country not stated: check it's open to India");
  if (TESTING.test(title)) add(0, 'Testing role');
  else if (CORE_SOFTWARE.test(title)) add(10, 'Core software engineering role');
  if (SENIOR.test(title)) add(8, 'Senior title: a stretch, apply if the bar fits');
  else if (JUNIOR.test(title)) add(30, 'Level fits ~1–4 years');
  else add(22, 'Level not stated');
  if (years != null) add(years <= my + 1 ? 10 : 2, `Asks for ${years}+ years`);
  const hay = `${title} ${job.department || ''} ${job.text || ''}`.toLowerCase();
  const hits = (profile.skills || []).filter((s) => {
    const k = s.toLowerCase();
    return /^[a-z0-9]+$/.test(k) ? new RegExp(`\\b${k}\\b`).test(hay) : hay.includes(k);
  });
  if (hits.length) add(Math.min(20, hits.length * 5), `Your stack: ${hits.slice(0, 5).join(', ')}`);
  add({ 1: 15, 2: 10, 3: 5 }[company.tier] || 0, `Tier ${company.tier} pay`);
  if (knowsSomeone) add(10, 'You know someone there: ask for a referral');
  return { score: Math.min(100, score), reasons, years };
}

/** Fetches one company's board. Returns raw jobs; throws on network/HTTP errors. */
async function fetchBoard(provider, token, fetchImpl) {
  const fn = PROVIDERS[provider];
  if (!fn) throw new Error(`Unknown job-board provider: ${provider}`);
  return fn(token, fetchImpl);
}

module.exports = { PROVIDERS: Object.keys(PROVIDERS), fetchBoard, scoreJob, minYears, DAY };
