// LinkedIn module · Phase 3 contact helpers. Pure functions: parsing what you paste, deduping, templates, search links.
// Nothing here talks to LinkedIn: you search and send yourself; the app organises and tracks.

/** https://www.linkedin.com/in/Jane-Doe-12ab/?utm=… → https://www.linkedin.com/in/jane-doe-12ab/ (null if not a profile URL). */
function normalizeProfileUrl(input) {
  if (!input) return null;
  const raw = String(input).trim();
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return null;
  const m = url.pathname.match(/^\/in\/([^/?#]+)/i);
  if (!m) return null;
  let slug;
  try {
    slug = decodeURIComponent(m[1]);
  } catch {
    slug = m[1];
  }
  return `https://www.linkedin.com/in/${slug.toLowerCase()}/`;
}

const squash = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '');

/** One person = one key: the profile URL when known, otherwise name + company. */
function dedupeKey({ profile_url, name, company }) {
  const url = normalizeProfileUrl(profile_url);
  if (url) return `url:${url.split('/in/')[1].replace(/\/$/, '')}`;
  return `nc:${squash(name)}|${squash(company)}`;
}

/** "jane-doe-4b2a19" → "Jane Doe" (drops LinkedIn's trailing id when it contains digits). */
function nameFromSlug(url) {
  const slug = (normalizeProfileUrl(url) || '').split('/in/')[1]?.replace(/\/$/, '') || '';
  const parts = slug.split('-').filter(Boolean);
  if (parts.length > 1 && /\d/.test(parts.at(-1))) parts.pop();
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

/** "Engineering Manager at Razorpay | Ex-Flipkart" → { role, company } */
function splitHeadline(headline) {
  const h = String(headline || '').split('|')[0].trim();
  const m = h.match(/^(.*?)\s+(?:at|@)\s+(.+)$/i);
  return m ? { role: m[1].trim(), company: m[2].trim() } : { role: h, company: '' };
}

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

/**
 * Parses what you paste while browsing search results. Accepts, per person (separated by blank lines):
 *   https://www.linkedin.com/in/jane-doe/        (just the URL)
 *   Jane Doe \n Engineering Manager at Razorpay \n Bengaluru \n https://linkedin.com/in/jane-doe
 *   Jane Doe | Engineering Manager at Razorpay | https://linkedin.com/in/jane-doe   (one line)
 * Returns { people: [...], errors: [...] }.
 */
function parseQuickAdd(text) {
  const people = [];
  const errors = [];
  const blocks = String(text || '').replace(/\r\n/g, '\n').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  for (const block of blocks) {
    // A block of several one-liners (each with its own URL) is split into separate people.
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const groups = lines.length > 1 && lines.every((l) => /linkedin\.com\/in\//i.test(l)) ? lines.map((l) => [l]) : [lines];
    for (const g of groups) {
      let parts = g;
      if (g.length === 1 && /[|\t]/.test(g[0])) parts = g[0].split(/\s*[|\t]\s*/).filter(Boolean);
      const urlPart = parts.find((p) => /linkedin\.com\/in\//i.test(p));
      const profile_url = urlPart ? normalizeProfileUrl(urlPart.match(/\S*linkedin\.com\/in\/\S+/i)[0]) : null;
      const rest = parts.filter((p) => p !== urlPart);
      const name = (rest[0] && rest[0].length <= 80 && !/\s(at|@)\s/i.test(rest[0]) ? rest[0] : '') || (profile_url ? nameFromSlug(profile_url) : '');
      if (!name) {
        errors.push(`Couldn't find a name or profile URL in: "${g.join(' ').slice(0, 60)}"`);
        continue;
      }
      const headline = rest.find((p, i) => i > 0 || p !== name) && rest[rest[0] === name ? 1 : 0] ? (rest[0] === name ? rest[1] : rest[0]) : '';
      const location = rest[0] === name ? rest[2] || '' : '';
      const { role, company } = splitHeadline(headline);
      people.push({ name: name.slice(0, 120), headline: (headline || '').slice(0, 300), role: role.slice(0, 150), company: company.slice(0, 150), location: location.slice(0, 100), profile_url });
    }
  }
  return { people, errors };
}

/** Minimal RFC 4180 CSV parser (quotes, escaped quotes, commas/newlines in quotes). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * LinkedIn's official data export (Settings → Data privacy → Get a copy of your data → Connections).
 * The file starts with a few "Notes:" lines, then: First Name,Last Name,URL,Email Address,Company,Position,Connected On
 */
function parseConnectionsCsv(text) {
  const rows = parseCsv(String(text || '').replace(/^﻿/, ''));
  const h = rows.findIndex((r) => r.includes('First Name') && r.includes('Last Name'));
  if (h === -1) throw new Error('This doesn\'t look like LinkedIn\'s Connections.csv (no "First Name, Last Name" header).');
  const cols = Object.fromEntries(rows[h].map((name, i) => [name.trim(), i]));
  const get = (r, k) => (cols[k] === undefined ? '' : (r[cols[k]] || '').trim());
  return rows.slice(h + 1).filter((r) => r.some((x) => x.trim())).map((r) => {
    const name = `${get(r, 'First Name')} ${get(r, 'Last Name')}`.trim();
    const connectedOn = Date.parse(get(r, 'Connected On'));
    return {
      name,
      profile_url: normalizeProfileUrl(get(r, 'URL')),
      company: get(r, 'Company'),
      role: get(r, 'Position'),
      headline: [get(r, 'Position'), get(r, 'Company')].filter(Boolean).join(' at '),
      email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(get(r, 'Email Address')) ? get(r, 'Email Address').toLowerCase() : null,
      connected_ms: Number.isNaN(connectedOn) ? null : connectedOn,
    };
  }).filter((p) => p.name);
}

/** "Hi {{first_name}} at {{company}}" with variables; unknown/empty variables vanish cleanly. */
function renderTemplate(template, contact, extra = {}) {
  const vars = {
    first_name: firstName(contact.name), name: contact.name, role: contact.role, company: contact.company,
    location: contact.location, headline: contact.headline, ...extra,
  };
  return String(template || '')
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] == null ? '' : String(vars[k]).trim()))
    .replace(/\s+([,.!?])(?=\s|$)/g, '$1') // "Hi ," -> "Hi," but ", .NET" keeps its space
    .replace(/ as \./g, '.')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Variables the template uses that this contact doesn't have (so the UI can ask you to fix the note). */
function missingVars(template, contact) {
  const have = { first_name: firstName(contact.name), name: contact.name, role: contact.role, company: contact.company, location: contact.location, headline: contact.headline };
  return [...new Set([...String(template || '').matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]))].filter((k) => !String(have[k] || '').trim());
}

/** Ready-to-click searches you open yourself: LinkedIn people search + a Google search for public profiles. */
function searchLinks(list) {
  const roles = list.roles?.length ? list.roles : [''];
  const companies = list.companies?.length ? list.companies : [''];
  const where = (list.locations || []).join(' ');
  const out = [];
  for (const role of roles) {
    for (const company of companies) {
      const words = [role, company, where, list.keywords].filter(Boolean).join(' ').trim();
      if (!words) continue;
      const g = ['site:linkedin.com/in', role && `"${role}"`, company && `"${company}"`, where, list.keywords].filter(Boolean).join(' ');
      out.push({
        label: [role, company].filter(Boolean).join(' · ') || words,
        linkedin: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(words)}&origin=GLOBAL_SEARCH_HEADER`,
        google: `https://www.google.com/search?q=${encodeURIComponent(g)}`,
      });
      if (out.length >= 12) return out;
    }
  }
  return out;
}

module.exports = { normalizeProfileUrl, dedupeKey, nameFromSlug, splitHeadline, firstName, parseQuickAdd, parseCsv, parseConnectionsCsv, renderTemplate, missingVars, searchLinks };
