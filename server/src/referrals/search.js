// Plain-English contact search: "tier 1 engineering managers in bangalore", "ex-colleagues at fintech",
// "recruiters at Google not connected". Parsed into filters + chips; pure, unit-tested.
// Unlike the tool this idea comes from, a word we don't understand is reported and IGNORED (never a silent 0 results).

const CITY = {
  bengaluru: ['bengaluru', 'bangalore', 'blr'], chennai: ['chennai', 'madras'], hyderabad: ['hyderabad', 'hyd'],
  pune: ['pune'], mumbai: ['mumbai', 'bombay'], 'delhi ncr': ['delhi', 'ncr', 'gurgaon', 'gurugram', 'noida'], remote: ['remote'],
};
const ROLE = {
  recruiter: ['recruiters', 'recruiter', 'talent', 'hr'],
  manager: ['engineering managers', 'engineering manager', 'managers', 'manager', 'ems', 'em', 'leads', 'lead', 'heads', 'head'],
  engineer: ['engineers', 'engineer', 'developers', 'developer', 'sdes', 'sde', 'swe'],
};
const REL = {
  ex_colleague: ['ex colleagues', 'ex colleague', 'excolleagues', 'colleagues', 'colleague', 'coworkers', 'coworker'],
  alumni: ['alumni', 'alums', 'alum', 'batchmates', 'batchmate', 'college'],
  friend: ['friends', 'friend'],
  met: ['people i met', 'met'],
};
const STATUS = {
  not_contacted: ['not connected', 'not contacted', 'to connect'],
  requested: ['pending', 'requested'],
  connected: ['connected'],
  replied: ['replied'],
};
const STOP = new Set(['at', 'in', 'from', 'who', 'are', 'is', 'the', 'a', 'an', 'and', 'or', 'with', 'of', 'my', 'show', 'me', 'all', 'people', 'contacts', 'working', 'work', 'based', 'companies', 'company', 'on', 'for', 'to']);

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9.+& ]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * q: the text. companies: [{ id, name, aliases[], category }]. Returns
 * { filters: { tiers[], roles[], rels[], statuses[], cities[], categories[], companyIds[], year, words[] }, chips[], unknown[] }.
 */
function parseSearch(q, companies = []) {
  let text = ` ${norm(q)} `;
  const f = { tiers: [], roles: [], rels: [], statuses: [], cities: [], categories: [], companyIds: [], year: null, words: [] };
  const chips = [];
  const take = (phrase) => {
    const re = new RegExp(`(^|\\s)${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s)`);
    if (!re.test(text)) return false;
    text = text.replace(re, ' ');
    return true;
  };
  const group = (map, list, label) => {
    for (const [key, phrases] of Object.entries(map)) {
      for (const p of [...phrases].sort((a, b) => b.length - a.length)) {
        if (take(p) && !list.includes(key)) { list.push(key); chips.push({ kind: label, value: key }); }
      }
    }
  };

  // "connected in 2025" / "since 2024"
  const ym = text.match(/(?:connected|since|in)\s+(20\d\d)/);
  if (ym) { f.year = Number(ym[1]); text = text.replace(ym[0], ' '); chips.push({ kind: 'year', value: f.year }); }
  for (const m of text.matchAll(/tier\s*([123])/g)) if (!f.tiers.includes(Number(m[1]))) { f.tiers.push(Number(m[1])); chips.push({ kind: 'tier', value: Number(m[1]) }); }
  text = text.replace(/tier\s*[123]/g, ' ');

  group(STATUS, f.statuses, 'status');
  // Company names (longest first) before roles, so "Target" or "Visa" aren't eaten as words.
  const names = companies.flatMap((c) => [c.name, ...(c.aliases || [])].map((n) => ({ n: norm(n), c }))).filter((x) => x.n.length >= 2)
    .sort((a, b) => b.n.length - a.n.length);
  for (const { n, c } of names) {
    if (take(n) && !f.companyIds.includes(c.id)) { f.companyIds.push(c.id); chips.push({ kind: 'company', value: c.name }); }
  }
  const cats = [...new Set(companies.map((c) => c.category).filter(Boolean))];
  const catWords = { fintech: 'Fintech', ai: 'AI', gaming: 'Gaming', saas: 'Enterprise SaaS', quant: 'Trading & Quant', trading: 'Trading & Quant', banks: 'Banking & Finance Tech', banking: 'Banking & Finance Tech', 'big tech': 'Big Tech', ecommerce: 'E-commerce', 'e commerce': 'E-commerce', healthtech: 'HealthTech', edtech: 'EdTech', security: 'Security', semiconductors: 'Semiconductors & AI', 'consumer internet': 'Consumer Internet' };
  for (const c of cats) catWords[norm(c)] = c;
  for (const w of Object.keys(catWords).sort((a, b) => b.length - a.length)) {
    if (cats.includes(catWords[w]) && take(w) && !f.categories.includes(catWords[w])) { f.categories.push(catWords[w]); chips.push({ kind: 'category', value: catWords[w] }); }
  }
  group(REL, f.rels, 'relationship');
  group(ROLE, f.roles, 'role');
  group(CITY, f.cities, 'city');

  const unknown = [];
  for (const w of text.split(' ').filter((x) => x.length > 1 && !STOP.has(x))) unknown.push(w);
  return { filters: f, chips, unknown };
}

/** Applies parsed filters to enriched contacts ({ ...contact, company, fit: { role } }). Free words match name/headline/company. */
function applySearch(contacts, f) {
  return contacts.filter((c) => {
    if (f.tiers.length && !(c.company && f.tiers.includes(c.company.tier))) return false;
    if (f.companyIds.length && !f.companyIds.includes(c.company_id)) return false;
    if (f.categories.length && !(c.company && f.categories.includes(c.company.category))) return false;
    if (f.roles.length && !f.roles.includes(c.fit.role)) return false;
    if (f.rels.length && !f.rels.includes(c.rel_type)) return false;
    if (f.statuses.length && !f.statuses.some((s) => (s === 'connected' ? ['connected', 'messaged', 'replied', 'referral'].includes(c.status) : c.status === s))) return false;
    if (f.cities.length && !f.cities.some((city) => CITY[city].some((alias) => String(c.location || '').toLowerCase().includes(alias)))) return false;
    if (f.year && !(c.connected_ms && new Date(c.connected_ms).getFullYear() === f.year)) return false;
    return true;
  });
}

module.exports = { parseSearch, applySearch };
