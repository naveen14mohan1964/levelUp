// Target companies: the seeded 200+ list (server/data/target-companies.json) plus any you add.
// matchKey() normalises a company name so "Microsoft India Pvt. Ltd." on LinkedIn matches "Microsoft".
const fs = require('fs');
const path = require('path');
const { sql } = require('../db');

const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'target-companies.json'), 'utf8'));
const TIERS = DATA.tiers;

// Legal suffixes and filler words LinkedIn users add after a company name.
const WORD_SUFFIX = new Set(['private', 'pvt', 'limited', 'ltd', 'llp', 'llc', 'inc', 'incorporated', 'corp', 'corporation', 'co',
  'company', 'plc', 'gmbh', 'technologies', 'technology', 'tech', 'labs', 'india', 'global', 'solutions', 'services', 'software',
  'systems', 'group', 'the', 'and']);

/** Words of a company name without legal suffixes: "Microsoft India (R&D) Pvt. Ltd." -> ["microsoft"]. */
const wordsOf = (name) => {
  const base = String(name || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)/g, ' ').replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, '');
  const all = base.split(/\s+/).filter(Boolean);
  const kept = all.filter((w) => !WORD_SUFFIX.has(w));
  return kept.length ? kept : all;
};

/** The unique company key: its words joined ("JPMorgan Chase & Co." -> "jpmorganchaseand"). */
const matchKey = (name) => wordsOf(name).join('');

/**
 * Builds a matcher over company rows ({ id, name, aliases[] }). Exact name first, then the longest known
 * company that the name STARTS WITH, on whole words: "Amazon Web Services" -> Amazon, but
 * "Intelligent Systems" never matches Intel.
 */
function buildMatcher(companies) {
  const exact = new Map();
  for (const c of companies) {
    for (const n of [c.name, ...(c.aliases || [])]) {
      const k = matchKey(n);
      if (k && !exact.has(k)) exact.set(k, c);
    }
  }
  return (companyName) => {
    const w = wordsOf(companyName);
    if (!w.length) return null;
    for (let n = w.length; n >= 1; n--) {
      const k = w.slice(0, n).join('');
      if (exact.has(k) && (n === w.length || k.length >= 3)) return exact.get(k);
    }
    return null;
  };
}

const parseAliases = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };

async function loadCompanies(pool) {
  const r = await pool.request().query(`SELECT CAST(id AS int) AS id, name, aliases, tier, category, is_target, notes, source FROM dbo.ref_companies`);
  return r.recordset.map((c) => ({ ...c, aliases: parseAliases(c.aliases), tier: Number(c.tier), is_target: !!c.is_target }));
}

/** Adds any seeded company you don't have yet (your tier/target edits and own companies are kept). */
async function seedCompanies(pool) {
  const have = new Set((await pool.request().query('SELECT match_key FROM dbo.ref_companies')).recordset.map((r) => r.match_key));
  let added = 0;
  for (const [name, tier, category, aliases] of DATA.companies) {
    const key = matchKey(name);
    if (have.has(key)) continue;
    await pool.request().input('n', sql.NVarChar, name).input('k', sql.NVarChar, key).input('a', sql.NVarChar(sql.MAX), JSON.stringify(aliases || []))
      .input('t', sql.TinyInt, tier).input('c', sql.NVarChar, category).input('now', sql.BigInt, Date.now())
      .query(`INSERT INTO dbo.ref_companies (name, match_key, aliases, tier, category, created_ms) VALUES (@n, @k, @a, @t, @c, @now)`);
    have.add(key);
    added++;
  }
  if (added) console.log(`Referral targets: added ${added} companies.`);
  return added;
}

/** Re-links every contact to its target company (after an import or after you add/edit companies). */
async function relinkContacts(pool) {
  const match = buildMatcher((await loadCompanies(pool)));
  const contacts = (await pool.request().query('SELECT CAST(id AS int) AS id, company, CAST(company_id AS int) AS company_id FROM dbo.li_contacts')).recordset;
  let changed = 0;
  for (const c of contacts) {
    const id = match(c.company)?.id ?? null;
    if (id === c.company_id) continue;
    await pool.request().input('id', sql.Int, c.id).input('cid', sql.Int, id).query('UPDATE dbo.li_contacts SET company_id = @cid WHERE id = @id');
    changed++;
  }
  return changed;
}

module.exports = { TIERS, matchKey, buildMatcher, loadCompanies, seedCompanies, relinkContacts, parseAliases, SEED_COUNT: DATA.companies.length };
