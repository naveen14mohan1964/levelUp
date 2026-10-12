// Referrals hub: target companies, ranked people to ask, referral pipeline, alerts, import v2, search, insights.
// Like the rest of the LinkedIn module, nothing here contacts LinkedIn: you send messages yourself; the app plans and tracks.
const express = require('express');
const { sql, getPool } = require('../db');
const C = require('../linkedin/contacts');
const store = require('../linkedin/store');
const E = require('../referrals/engine');
const Co = require('../referrals/companies');
const { parseSearch, applySearch } = require('../referrals/search');
const { planImport, applyImport } = require('../referrals/importer');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const now = () => Date.now();
const num = (v) => (v == null ? null : Number(v));

/* ------------------------------- loading ------------------------------- */

const CONTACT_COLS = `CAST(id AS int) AS id, name, headline, role, company, location, profile_url, email, status, do_not_contact, notes,
  source, requested_ms, connected_ms, created_ms, updated_ms, CAST(company_id AS int) AS company_id, rel_type, last_interaction_ms, prev_company, moved_ms`;
const contactRow = (c) => ({
  ...c, do_not_contact: !!c.do_not_contact, requested_ms: num(c.requested_ms), connected_ms: num(c.connected_ms), created_ms: num(c.created_ms),
  updated_ms: num(c.updated_ms), last_interaction_ms: num(c.last_interaction_ms), moved_ms: num(c.moved_ms),
});
const PURSUIT_COLS = `CAST(id AS int) AS id, CAST(company_id AS int) AS company_id, CAST(contact_id AS int) AS contact_id, role_title, job_url, stage,
  next_action, due_ms, outcome, reason, revisit_ms, follow_ups, stage_ms, created_ms, updated_ms`;
const pursuitRow = (p) => ({ ...p, due_ms: num(p.due_ms), revisit_ms: num(p.revisit_ms), stage_ms: num(p.stage_ms), created_ms: num(p.created_ms), updated_ms: num(p.updated_ms) });

async function refSettings() {
  const s = await store.liSettings();
  const parse = (v, d) => { try { return JSON.parse(v); } catch { return d; } };
  const pool = await getPool();
  const rows = (await pool.request().query(`SELECT k, v FROM dbo.settings WHERE k LIKE 'ref[_]%'`)).recordset;
  const r = Object.fromEntries(rows.map((x) => [x.k, x.v]));
  return {
    locations: parse(r.ref_locations, []),
    templates: { ask: r.ref_tpl_ask || '', follow_up: r.ref_tpl_follow_up || '', thanks: r.ref_tpl_thanks || '' },
    jobSkills: parse(r.ref_job_skills, []),
    jobYears: Number(r.ref_job_years) || 2,
    myIntro: s.li_my_intro,
  };
}

/** Everything the hub needs, in memory (a few thousand rows at most). */
async function loadAll() {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT ${CONTACT_COLS} FROM dbo.li_contacts;
    SELECT ${PURSUIT_COLS} FROM dbo.ref_pursuits;
    SELECT CAST(pursuit_id AS int) AS pursuit_id, at_ms, from_stage, to_stage, note FROM dbo.ref_history ORDER BY at_ms;`);
  const companies = await Co.loadCompanies(pool);
  const settings = await refSettings();
  const byId = new Map(companies.map((c) => [c.id, c]));
  const pursuits = r.recordsets[1].map(pursuitRow);
  const openByCompany = new Map(pursuits.filter((p) => !p.outcome).map((p) => [p.company_id, p]));
  const contacts = r.recordsets[0].map(contactRow).map((c) => {
    const company = byId.get(c.company_id) || null;
    const fit = E.fitFor(c, company, { locations: settings.locations });
    return { ...c, company, fit, next: E.nextStep(c, openByCompany.get(c.company_id)) };
  });
  const history = r.recordsets[2].map((h) => ({ ...h, at_ms: Number(h.at_ms) }));
  return { companies, byId, contacts, pursuits, history, openByCompany, settings };
}

const STAGE_ASKED = E.STAGES.indexOf('asked');

/** The daily queue: best person per company, people you can act on now, highest fit first. */
function buildQueue(data, limit = 8) {
  const seen = new Set();
  const out = [];
  const ranked = data.contacts.filter((c) => c.company?.is_target && c.next && !c.do_not_contact)
    .filter((c) => { const p = data.openByCompany.get(c.company_id); return !p || E.STAGES.indexOf(p.stage) < STAGE_ASKED; })
    .sort((a, b) => b.fit.score - a.fit.score || a.name.localeCompare(b.name));
  for (const c of ranked) {
    if (seen.has(c.company_id)) continue;
    seen.add(c.company_id);
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

function searchLinksFor(company, locations) {
  const where = locations.filter((l) => l.toLowerCase() !== 'remote').slice(0, 1).join(' ');
  const people = (role) => `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${role} ${company.name} ${where}`.trim())}&origin=GLOBAL_SEARCH_HEADER`;
  return {
    engineers: people('software engineer'),
    managers: people('engineering manager'),
    recruiters: people('technical recruiter'),
    careers: `https://www.google.com/search?q=${encodeURIComponent(`${company.name} careers software engineer India`)}`,
  };
}

const contactSummary = (c) => c && ({
  id: c.id, name: c.name, role: c.role, headline: c.headline, company: c.company?.name || c.company, company_id: c.company_id,
  tier: c.company?.tier || null, status: c.status, rel_type: c.rel_type, profile_url: c.profile_url, fit: c.fit, next: c.next,
  moved_ms: c.moved_ms, prev_company: c.prev_company, do_not_contact: c.do_not_contact,
});

/** Messages for a pursuit/contact, rendered from your editable templates. You copy and send them yourself. */
function messagesFor(contact, pursuit, company, settings) {
  const extra = {
    company: company?.name || contact.company || '',
    role_title: pursuit?.role_title || 'a software engineer role',
    job_line: pursuit?.job_url ? ` (${pursuit.job_url})` : '',
    my_intro: settings.myIntro || '',
  };
  return Object.fromEntries(Object.entries(settings.templates).map(([k, tpl]) => [k, C.renderTemplate(tpl, contact, extra)]));
}

/* ---------------------------------- hub ---------------------------------- */

// GET /api/referrals/hub -> KPIs, today's people to ask, alerts, pipeline counts
router.get('/referrals/hub', wrap(async (req, res) => {
  const data = await loadAll();
  const targets = data.companies.filter((c) => c.is_target);
  const covered = new Set(data.contacts.filter((c) => c.company?.is_target && !c.do_not_contact).map((c) => c.company_id));
  const open = data.pursuits.filter((p) => !p.outcome);
  const referred = E.funnel(data.pursuits, data.history).find((f) => f.stage === 'referred').count;
  const alerts = E.alerts({ contacts: data.contacts, companies: data.companies, pursuits: data.pursuits }).slice(0, 10)
    .map((a) => ({ ...a, contact: a.contact_id ? contactSummary(data.contacts.find((c) => c.id === a.contact_id)) : null, links: a.company_id ? searchLinksFor(data.byId.get(a.company_id), data.settings.locations) : null }));
  res.json({
    kpis: {
      targets: targets.length, covered: [...covered].filter((id) => data.byId.get(id)?.is_target).length,
      contactsAtTargets: data.contacts.filter((c) => c.company?.is_target && !c.do_not_contact).length,
      openPursuits: open.length, referrals: referred, overdue: open.filter((p) => p.due_ms && p.due_ms < now()).length,
    },
    queue: buildQueue(data).map(contactSummary),
    alerts,
    pipeline: E.STAGES.map((s) => ({ stage: s, label: E.STAGE_LABEL[s], count: open.filter((p) => p.stage === s).length })),
    tiers: Co.TIERS,
  });
}));

/* ------------------------------- companies ------------------------------- */

// GET /api/referrals/companies -> all companies with your coverage there
router.get('/referrals/companies', wrap(async (req, res) => {
  const data = await loadAll();
  const people = new Map();
  for (const c of data.contacts) if (c.company_id && !c.do_not_contact) (people.get(c.company_id) || people.set(c.company_id, []).get(c.company_id)).push(c);
  res.json({
    tiers: Co.TIERS,
    companies: data.companies.map((co) => {
      const list = (people.get(co.id) || []).sort((a, b) => b.fit.score - a.fit.score);
      const p = data.openByCompany.get(co.id);
      return {
        ...co, contacts: list.length, best: contactSummary(list[0]) || null,
        pursuit: p ? { id: p.id, stage: p.stage, label: E.STAGE_LABEL[p.stage] } : null,
        links: searchLinksFor(co, data.settings.locations),
      };
    }).sort((a, b) => a.tier - b.tier || b.contacts - a.contacts || a.name.localeCompare(b.name)),
  });
}));

// POST /api/referrals/companies { name, tier, category } -> add your own target
router.post('/referrals/companies', wrap(async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 150);
  const tier = Number(req.body.tier);
  if (!name || ![1, 2, 3].includes(tier)) return res.status(400).json({ error: 'name and tier (1, 2 or 3) are required' });
  const pool = await getPool();
  const key = Co.matchKey(name);
  if ((await pool.request().input('k', sql.NVarChar, key).query('SELECT 1 AS x FROM dbo.ref_companies WHERE match_key = @k')).recordset.length) {
    return res.status(409).json({ error: `${name} is already in your list` });
  }
  const r = await pool.request().input('n', sql.NVarChar, name).input('k', sql.NVarChar, key).input('t', sql.TinyInt, tier)
    .input('c', sql.NVarChar, String(req.body.category || 'Other').slice(0, 60)).input('now', sql.BigInt, now())
    .query(`INSERT INTO dbo.ref_companies (name, match_key, aliases, tier, category, source, created_ms) OUTPUT CAST(INSERTED.id AS int) AS id
            VALUES (@n, @k, '[]', @t, @c, 'you', @now)`);
  await Co.relinkContacts(pool);
  res.status(201).json({ id: r.recordset[0].id });
}));

// PATCH /api/referrals/companies/:id { tier?, is_target?, category?, notes?, aliases? }
router.patch('/referrals/companies/:id', wrap(async (req, res) => {
  const b = req.body;
  if ('tier' in b && ![1, 2, 3].includes(Number(b.tier))) return res.status(400).json({ error: 'tier must be 1, 2 or 3' });
  const pool = await getPool();
  const q = pool.request().input('id', sql.Int, Number(req.params.id));
  const sets = [];
  if ('tier' in b) { q.input('tier', sql.TinyInt, Number(b.tier)); sets.push('tier = @tier'); }
  if ('is_target' in b) { q.input('t', sql.Bit, !!b.is_target); sets.push('is_target = @t'); }
  if ('category' in b) { q.input('c', sql.NVarChar, String(b.category).slice(0, 60)); sets.push('category = @c'); }
  if ('notes' in b) { q.input('n', sql.NVarChar, b.notes ? String(b.notes).slice(0, 500) : null); sets.push('notes = @n'); }
  if ('aliases' in b) { q.input('a', sql.NVarChar(sql.MAX), JSON.stringify((b.aliases || []).map(String).slice(0, 20))); sets.push('aliases = @a'); }
  if ('ats_provider' in b) {
    const { PROVIDERS } = require('../referrals/jobs');
    if (b.ats_provider && !PROVIDERS.includes(b.ats_provider)) return res.status(400).json({ error: `ats_provider must be one of ${PROVIDERS.join(', ')}` });
    q.input('ap', sql.NVarChar, b.ats_provider || null).input('at', sql.NVarChar, b.ats_provider && b.ats_token ? String(b.ats_token).trim().slice(0, 100) : null);
    sets.push('ats_provider = @ap', 'ats_token = @at');
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  const r = await q.query(`UPDATE dbo.ref_companies SET ${sets.join(', ')} WHERE id = @id`);
  if (!r.rowsAffected[0]) return res.status(404).json({ error: 'Company not found' });
  if ('aliases' in b) await Co.relinkContacts(pool);
  res.json({ ok: true });
}));

/* -------------------------------- contacts -------------------------------- */

// GET /api/referrals/contacts?q=tier 1 engineering managers in bangalore -> parsed chips + ranked people
router.get('/referrals/contacts', wrap(async (req, res) => {
  const data = await loadAll();
  const { filters, chips, unknown } = parseSearch(req.query.q || '', data.companies);
  const items = applySearch(data.contacts.filter((c) => !c.do_not_contact), filters)
    .sort((a, b) => b.fit.score - a.fit.score || a.name.localeCompare(b.name)).slice(0, 200);
  res.json({ chips, unknown, total: items.length, items: items.map(contactSummary) });
}));

// GET /api/referrals/contacts/:id -> profile: fit reasons, timeline, notes, ready-to-copy messages
router.get('/referrals/contacts/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const data = await loadAll();
  const c = data.contacts.find((x) => x.id === id);
  if (!c) return res.status(404).json({ error: 'Contact not found' });
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, id).query(`
    SELECT CAST(id AS int) AS id, at_ms, text FROM dbo.ref_notes WHERE contact_id = @id ORDER BY at_ms DESC;
    SELECT type, at_ms, detail FROM dbo.li_actions WHERE contact_id = @id;`);
  const notes = r.recordsets[0].map((n) => ({ ...n, at_ms: Number(n.at_ms) }));
  const pursuit = data.pursuits.find((p) => p.contact_id === id && !p.outcome) || data.openByCompany.get(c.company_id) || null;
  const ACTION = { request_sent: 'You sent a connection request', accepted: 'They accepted', message_sent: 'You messaged them', reply: 'They replied', referral: 'They referred you' };
  const timeline = [
    ...r.recordsets[1].map((a) => ({ at_ms: Number(a.at_ms), text: [ACTION[a.type] || a.type, a.detail].filter(Boolean).join(' · ') })),
    ...notes.map((n) => ({ at_ms: n.at_ms, text: `Note: ${n.text}` })),
    ...data.history.filter((h) => data.pursuits.some((p) => p.id === h.pursuit_id && p.contact_id === id)).map((h) => ({ at_ms: h.at_ms, text: h.note || `Pipeline: ${E.STAGE_LABEL[h.to_stage] || h.to_stage}` })),
    ...(c.moved_ms ? [{ at_ms: c.moved_ms, text: `Moved from ${c.prev_company} to ${c.company?.name || c.company}` }] : []),
    ...(c.connected_ms ? [{ at_ms: c.connected_ms, text: 'Connected on LinkedIn' }] : []),
  ].sort((a, b) => b.at_ms - a.at_ms);
  res.json({
    contact: { ...contactSummary(c), location: c.location, email: c.email, last_interaction_ms: c.last_interaction_ms, connected_ms: c.connected_ms, source: c.source },
    company: c.company ? { ...c.company, links: searchLinksFor(c.company, data.settings.locations) } : null,
    pursuit: pursuit ? { ...pursuit, label: E.STAGE_LABEL[pursuit.stage] } : null,
    messages: messagesFor(c, pursuit, c.company, data.settings),
    notes, timeline,
  });
}));

const REL_TYPES = ['connection', 'met', 'alumni', 'ex_colleague', 'friend'];

// PATCH /api/referrals/contacts/:id { rel_type?, talked_now?: true, last_interaction_ms?, email?, location? }
router.patch('/referrals/contacts/:id', wrap(async (req, res) => {
  const b = req.body;
  if ('rel_type' in b && !REL_TYPES.includes(b.rel_type)) return res.status(400).json({ error: `rel_type must be one of ${REL_TYPES.join(', ')}` });
  const pool = await getPool();
  const q = pool.request().input('id', sql.Int, Number(req.params.id)).input('t', sql.BigInt, now());
  const sets = [];
  if ('rel_type' in b) { q.input('rel', sql.NVarChar, b.rel_type); sets.push('rel_type = @rel'); }
  if (b.talked_now) sets.push('last_interaction_ms = @t');
  else if ('last_interaction_ms' in b) { q.input('li', sql.BigInt, b.last_interaction_ms ? Number(b.last_interaction_ms) : null); sets.push('last_interaction_ms = @li'); }
  if ('email' in b) { q.input('e', sql.NVarChar, b.email ? String(b.email).slice(0, 200) : null); sets.push('email = @e'); }
  if ('location' in b) { q.input('loc', sql.NVarChar, b.location ? String(b.location).slice(0, 100) : null); sets.push('location = @loc'); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  const r = await q.query(`UPDATE dbo.li_contacts SET ${sets.join(', ')}, updated_ms = @t WHERE id = @id`);
  if (!r.rowsAffected[0]) return res.status(404).json({ error: 'Contact not found' });
  res.json({ ok: true });
}));

// POST /api/referrals/contacts/:id/messaged { what? } -> you sent them a LinkedIn message (counts toward this week's target)
router.post('/referrals/contacts/:id/messaged', wrap(async (req, res) => {
  const pool = await getPool();
  const c = (await pool.request().input('id', sql.Int, Number(req.params.id)).query('SELECT CAST(id AS int) AS id, name, status, do_not_contact FROM dbo.li_contacts WHERE id = @id')).recordset[0];
  if (!c) return res.status(404).json({ error: 'Contact not found' });
  if (c.do_not_contact) return res.status(409).json({ error: `${c.name} is on your do-not-contact list` });
  if (!E.CONNECTED.has(c.status)) return res.status(409).json({ error: `You can only message people you're connected with (${c.name} is "${c.status.replace('_', ' ')}")` });
  await require('./linkedin-outreach').logAction(c.id, 'message_sent', { detail: req.body.what ? String(req.body.what).slice(0, 200) : 'Message' });
  await pool.request().input('id', sql.Int, c.id).input('t', sql.BigInt, now())
    .query(`UPDATE dbo.li_contacts SET last_interaction_ms = @t, status = CASE WHEN status = 'connected' THEN 'messaged' ELSE status END, updated_ms = @t WHERE id = @id`);
  res.json({ ok: true });
}));

// POST /api/referrals/contacts/:id/notes { text }
router.post('/referrals/contacts/:id/notes', wrap(async (req, res) => {
  const text = String(req.body.text || '').trim();
  if (!text || text.length > 2000) return res.status(400).json({ error: 'Note text is required (max 2000 characters)' });
  const pool = await getPool();
  const ok = (await pool.request().input('id', sql.Int, Number(req.params.id)).query('SELECT 1 AS x FROM dbo.li_contacts WHERE id = @id')).recordset.length;
  if (!ok) return res.status(404).json({ error: 'Contact not found' });
  const r = await pool.request().input('c', sql.Int, Number(req.params.id)).input('t', sql.BigInt, now()).input('x', sql.NVarChar, text)
    .query('INSERT INTO dbo.ref_notes (contact_id, at_ms, text) OUTPUT CAST(INSERTED.id AS int) AS id VALUES (@c, @t, @x)');
  res.status(201).json({ id: r.recordset[0].id });
}));

/* --------------------------------- import --------------------------------- */

async function runImport(csv, { dryRun, fileName }) {
  const rows = C.parseConnectionsCsv(csv); // throws a friendly error for the wrong file
  const pool = await getPool();
  const existing = (await pool.request().query(`SELECT ${CONTACT_COLS}, dedupe_key FROM dbo.li_contacts`)).recordset.map(contactRow);
  const plan = planImport(rows, existing);
  if (!dryRun) {
    const { logAction } = require('./linkedin-outreach');
    await applyImport(pool, plan, { logAction });
    await Co.relinkContacts(pool);
    const k = plan.counts;
    await pool.request().input('t', sql.BigInt, now()).input('f', sql.NVarChar, fileName ? String(fileName).slice(0, 200) : null)
      .input('r', sql.Int, k.rows).input('a', sql.Int, k.added).input('m', sql.Int, k.merged).input('u', sql.Int, k.unchanged)
      .input('mv', sql.Int, k.moved).input('ac', sql.Int, k.accepted).input('s', sql.Int, k.skipped)
      .input('d', sql.NVarChar(sql.MAX), JSON.stringify({ moved: plan.moved.slice(0, 200), skipped: plan.skipped.slice(0, 200) }))
      .query(`INSERT INTO dbo.ref_imports (at_ms, file_name, rows_read, added, merged, unchanged, moved, accepted, skipped, detail)
              VALUES (@t, @f, @r, @a, @m, @u, @mv, @ac, @s, @d)`);
    await store.audit('you', 'connections_imported', 'config', null, `${k.rows} rows: ${k.added} new, ${k.accepted} accepted, ${k.moved} moved, ${k.merged} updated`);
  }
  return plan;
}

// POST /api/referrals/import { csv, file_name?, dry_run? } -> preview (dry run) or import
router.post('/referrals/import', wrap(async (req, res) => {
  let plan;
  try {
    plan = await runImport(req.body.csv, { dryRun: !!req.body.dry_run, fileName: req.body.file_name });
  } catch (e) {
    if (/Connections\.csv/.test(e.message)) return res.status(400).json({ error: e.message });
    throw e;
  }
  const match = Co.buildMatcher(await Co.loadCompanies(await getPool()));
  const atTargets = plan.ops.filter((o) => o.type === 'add' && match(o.row.company)).length;
  res.json({
    dryRun: !!req.body.dry_run, ...plan.counts, newAtTargets: atTargets,
    moved: plan.moved.map((m) => ({ ...m, target: match(m.to)?.name || null, tier: match(m.to)?.tier || null })),
    skipped: plan.skipped.slice(0, 50),
  });
}));

// GET /api/referrals/imports -> import history
router.get('/referrals/imports', wrap(async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().query(`SELECT TOP 20 CAST(id AS int) AS id, at_ms, file_name, rows_read, added, merged, unchanged, moved, accepted, skipped
    FROM dbo.ref_imports ORDER BY at_ms DESC`);
  res.json(r.recordset.map((x) => ({ ...x, at_ms: Number(x.at_ms) })));
}));

/* -------------------------------- pipeline -------------------------------- */

async function getPursuit(id) {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, id).query(`SELECT ${PURSUIT_COLS} FROM dbo.ref_pursuits WHERE id = @id`);
  return r.recordset[0] ? pursuitRow(r.recordset[0]) : null;
}
async function addHistory(pursuitId, from, to, note) {
  const pool = await getPool();
  await pool.request().input('p', sql.Int, pursuitId).input('t', sql.BigInt, now()).input('f', sql.NVarChar, from).input('to', sql.NVarChar, to)
    .input('n', sql.NVarChar, note ? String(note).slice(0, 500) : null)
    .query('INSERT INTO dbo.ref_history (pursuit_id, at_ms, from_stage, to_stage, note) VALUES (@p, @t, @f, @to, @n)');
}
async function contactAt(contactId, companyId) {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, contactId).query(`SELECT ${CONTACT_COLS} FROM dbo.li_contacts WHERE id = @id`);
  const c = r.recordset[0] ? contactRow(r.recordset[0]) : null;
  if (!c) return { error: 'Contact not found', status: 404 };
  if (c.do_not_contact) return { error: `${c.name} is on your do-not-contact list`, status: 409 };
  if (companyId && c.company_id !== companyId) return { error: `${c.name} doesn't work at this company`, status: 400 };
  return { contact: c };
}

// GET /api/referrals/pipeline -> open pursuits by stage + closed ones
router.get('/referrals/pipeline', wrap(async (req, res) => {
  const data = await loadAll();
  const view = (p) => {
    const c = data.contacts.find((x) => x.id === p.contact_id);
    const co = data.byId.get(p.company_id);
    return {
      ...p, label: E.STAGE_LABEL[p.stage], company: co ? { id: co.id, name: co.name, tier: co.tier, category: co.category } : null,
      contact: contactSummary(c), overdue: !p.outcome && !!p.due_ms && p.due_ms < now(),
      candidates: data.contacts.filter((x) => x.company_id === p.company_id && !x.do_not_contact).sort((a, b) => b.fit.score - a.fit.score).slice(0, 10).map((x) => ({ id: x.id, name: x.name, role: x.role, fit: x.fit.score })),
    };
  };
  res.json({
    stages: E.STAGES.map((s) => ({ stage: s, label: E.STAGE_LABEL[s] })),
    open: data.pursuits.filter((p) => !p.outcome).map(view).sort((a, b) => (a.due_ms || Infinity) - (b.due_ms || Infinity)),
    closed: data.pursuits.filter((p) => p.outcome).map(view).sort((a, b) => b.updated_ms - a.updated_ms),
  });
}));

// POST /api/referrals/pipeline { company_id, contact_id?, role_title?, job_url? } -> add a company to your pipeline
router.post('/referrals/pipeline', wrap(async (req, res) => {
  const companyId = Number(req.body.company_id);
  const pool = await getPool();
  const co = (await pool.request().input('id', sql.Int, companyId).query('SELECT CAST(id AS int) AS id, name FROM dbo.ref_companies WHERE id = @id')).recordset[0];
  if (!co) return res.status(404).json({ error: 'Company not found' });
  if ((await pool.request().input('id', sql.Int, companyId).query('SELECT 1 AS x FROM dbo.ref_pursuits WHERE company_id = @id AND outcome IS NULL')).recordset.length) {
    return res.status(409).json({ error: `${co.name} is already in your pipeline` });
  }
  let contactId = req.body.contact_id ? Number(req.body.contact_id) : null;
  if (contactId) {
    const r = await contactAt(contactId, companyId);
    if (r.error) return res.status(r.status).json({ error: r.error });
  }
  const stage = contactId ? 'connected' : 'target';
  const d = E.stageDefaults(stage);
  const t = now();
  const r = await pool.request().input('co', sql.Int, companyId).input('c', sql.Int, contactId)
    .input('rt', sql.NVarChar, req.body.role_title ? String(req.body.role_title).slice(0, 150) : null)
    .input('ju', sql.NVarChar, req.body.job_url ? String(req.body.job_url).slice(0, 400) : null)
    .input('st', sql.NVarChar, stage).input('na', sql.NVarChar, d.next_action).input('due', sql.BigInt, d.due_ms).input('t', sql.BigInt, t)
    .query(`INSERT INTO dbo.ref_pursuits (company_id, contact_id, role_title, job_url, stage, next_action, due_ms, stage_ms, created_ms, updated_ms)
            OUTPUT CAST(INSERTED.id AS int) AS id VALUES (@co, @c, @rt, @ju, @st, @na, @due, @t, @t, @t)`);
  const id = r.recordset[0].id;
  await addHistory(id, null, stage, `Added ${co.name} to your pipeline`);
  res.status(201).json(await getPursuit(id));
}));

// PATCH /api/referrals/pipeline/:id { contact_id?, role_title?, job_url?, next_action?, due_ms? }
router.patch('/referrals/pipeline/:id', wrap(async (req, res) => {
  const p = await getPursuit(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Pursuit not found' });
  const b = req.body;
  const pool = await getPool();
  const q = pool.request().input('id', sql.Int, p.id).input('t', sql.BigInt, now());
  const sets = [];
  const notes = [];
  if ('contact_id' in b) {
    if (b.contact_id) {
      const r = await contactAt(Number(b.contact_id), p.company_id);
      if (r.error) return res.status(r.status).json({ error: r.error });
      notes.push(`Referrer: ${r.contact.name}`);
    } else if (E.STAGES.indexOf(p.stage) >= E.STAGES.indexOf('connected') && E.STAGES.indexOf(p.stage) <= E.STAGES.indexOf('referred')) {
      return res.status(422).json({ error: 'This stage needs a referrer' });
    }
    q.input('c', sql.Int, b.contact_id ? Number(b.contact_id) : null); sets.push('contact_id = @c');
  }
  if ('role_title' in b) { q.input('rt', sql.NVarChar, b.role_title ? String(b.role_title).slice(0, 150) : null); sets.push('role_title = @rt'); notes.push('Role updated'); }
  if ('job_url' in b) { q.input('ju', sql.NVarChar, b.job_url ? String(b.job_url).slice(0, 400) : null); sets.push('job_url = @ju'); }
  if ('next_action' in b) { q.input('na', sql.NVarChar, b.next_action ? String(b.next_action).slice(0, 300) : null); sets.push('next_action = @na'); }
  if ('due_ms' in b) { q.input('due', sql.BigInt, b.due_ms ? Number(b.due_ms) : null); sets.push('due_ms = @due'); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  await q.query(`UPDATE dbo.ref_pursuits SET ${sets.join(', ')}, updated_ms = @t WHERE id = @id`);
  if (notes.length) await addHistory(p.id, p.stage, p.stage, notes.join(' · '));
  // Choosing a referrer on a "Target" card means you now have a contact there.
  if (b.contact_id && p.stage === 'target') {
    const d = E.stageDefaults('connected');
    await pool.request().input('id', sql.Int, p.id).input('na', sql.NVarChar, d.next_action).input('due', sql.BigInt, d.due_ms).input('t', sql.BigInt, now())
      .query(`UPDATE dbo.ref_pursuits SET stage = 'connected', next_action = @na, due_ms = @due, stage_ms = @t, updated_ms = @t WHERE id = @id`);
    await addHistory(p.id, 'target', 'connected', 'Found a contact');
  }
  res.json(await getPursuit(p.id));
}));

// POST /api/referrals/pipeline/:id/move { stage, note? }
router.post('/referrals/pipeline/:id/move', wrap(async (req, res) => {
  const p = await getPursuit(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Pursuit not found' });
  const to = req.body.stage;
  const err = E.moveError(p, to);
  if (err) return res.status(err.startsWith('Unknown') ? 400 : err.startsWith('This pursuit') ? 409 : 422).json({ error: err });
  if (to === p.stage) return res.json(p);
  const d = E.stageDefaults(to);
  const pool = await getPool();
  await pool.request().input('id', sql.Int, p.id).input('s', sql.NVarChar, to).input('na', sql.NVarChar, d.next_action).input('due', sql.BigInt, d.due_ms)
    .input('fu', sql.Int, to === 'asked' && E.STAGES.indexOf(p.stage) < STAGE_ASKED ? 0 : p.follow_ups).input('t', sql.BigInt, now())
    .query('UPDATE dbo.ref_pursuits SET stage = @s, next_action = @na, due_ms = @due, follow_ups = @fu, stage_ms = @t, updated_ms = @t WHERE id = @id');
  await addHistory(p.id, p.stage, to, req.body.note || `Moved to ${E.STAGE_LABEL[to]}`);
  // Keep the contact's outreach status and the action log (dashboards) in step.
  if (p.contact_id && ['asked', 'referred'].includes(to)) {
    const { logAction } = require('./linkedin-outreach');
    await logAction(p.contact_id, to === 'asked' ? 'message_sent' : 'referral', { detail: to === 'asked' ? 'Referral ask' : null });
    await pool.request().input('id', sql.Int, p.contact_id).input('s', sql.NVarChar, to === 'asked' ? 'messaged' : 'referral').input('t', sql.BigInt, now())
      .query(`UPDATE dbo.li_contacts SET status = @s, last_interaction_ms = @t, updated_ms = @t
              WHERE id = @id AND status IN ('connected', 'messaged', 'replied', 'referral')`);
  }
  res.json(await getPursuit(p.id));
}));

// POST /api/referrals/pipeline/:id/follow-up -> you sent the one follow-up (a second one is refused)
router.post('/referrals/pipeline/:id/follow-up', wrap(async (req, res) => {
  const p = await getPursuit(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Pursuit not found' });
  if (p.outcome || p.stage !== 'asked') return res.status(409).json({ error: 'Follow-ups are for an open "Referral asked" pursuit' });
  if (p.follow_ups >= 1) return res.status(409).json({ error: 'You already followed up once. Stop here and try another person.' });
  const pool = await getPool();
  await pool.request().input('id', sql.Int, p.id).input('due', sql.BigInt, now() + E.FOLLOW_UP_DAYS * E.DAY).input('t', sql.BigInt, now())
    .query(`UPDATE dbo.ref_pursuits SET follow_ups = follow_ups + 1, due_ms = @due, next_action = 'Wait for a reply; if none, try another person', updated_ms = @t WHERE id = @id`);
  await addHistory(p.id, p.stage, p.stage, 'Sent one follow-up');
  if (p.contact_id) await require('./linkedin-outreach').logAction(p.contact_id, 'message_sent', { detail: 'Referral follow-up' });
  res.json(await getPursuit(p.id));
}));

// POST /api/referrals/pipeline/:id/close { outcome, reason?, revisit_ms? }
router.post('/referrals/pipeline/:id/close', wrap(async (req, res) => {
  const p = await getPursuit(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Pursuit not found' });
  if (p.outcome) return res.status(409).json({ error: 'Already closed' });
  if (!E.OUTCOMES.includes(req.body.outcome)) return res.status(400).json({ error: `outcome must be one of ${E.OUTCOMES.join(', ')}` });
  if (req.body.outcome === 'parked' && !req.body.revisit_ms) return res.status(400).json({ error: 'Parking needs a revisit date' });
  const pool = await getPool();
  await pool.request().input('id', sql.Int, p.id).input('o', sql.NVarChar, req.body.outcome)
    .input('r', sql.NVarChar, req.body.reason ? String(req.body.reason).slice(0, 300) : null)
    .input('rv', sql.BigInt, req.body.revisit_ms ? Number(req.body.revisit_ms) : null).input('t', sql.BigInt, now())
    .query('UPDATE dbo.ref_pursuits SET outcome = @o, reason = @r, revisit_ms = @rv, next_action = NULL, due_ms = NULL, updated_ms = @t WHERE id = @id');
  await addHistory(p.id, p.stage, null, `Closed: ${req.body.outcome.replace('_', ' ')}${req.body.reason ? ` (${req.body.reason})` : ''}`);
  res.json(await getPursuit(p.id));
}));

// POST /api/referrals/pipeline/:id/reopen
router.post('/referrals/pipeline/:id/reopen', wrap(async (req, res) => {
  const p = await getPursuit(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Pursuit not found' });
  if (!p.outcome) return res.status(409).json({ error: 'It is already open' });
  const pool = await getPool();
  if ((await pool.request().input('c', sql.Int, p.company_id).query('SELECT 1 AS x FROM dbo.ref_pursuits WHERE company_id = @c AND outcome IS NULL')).recordset.length) {
    return res.status(409).json({ error: 'This company already has an open pursuit' });
  }
  const d = E.stageDefaults(p.stage);
  await pool.request().input('id', sql.Int, p.id).input('na', sql.NVarChar, d.next_action).input('due', sql.BigInt, d.due_ms).input('t', sql.BigInt, now())
    .query('UPDATE dbo.ref_pursuits SET outcome = NULL, reason = NULL, revisit_ms = NULL, next_action = @na, due_ms = @due, updated_ms = @t WHERE id = @id');
  await addHistory(p.id, null, p.stage, 'Reopened');
  res.json(await getPursuit(p.id));
}));

/* -------------------------------- insights -------------------------------- */

// GET /api/referrals/insights -> funnel, median days to a referral, what works, coverage grid, outreach funnel
router.get('/referrals/insights', wrap(async (req, res) => {
  const data = await loadAll();
  const pool = await getPool();
  const a = (await pool.request().query('SELECT type, COUNT(*) AS n FROM dbo.li_actions GROUP BY type')).recordset;
  const act = Object.fromEntries(a.map((x) => [x.type, x.n]));
  res.json({
    funnel: E.funnel(data.pursuits, data.history),
    medianDaysToReferral: E.medianDaysToReferral(data.pursuits, data.history),
    sources: E.sourcePerformance(data.pursuits, data.history, new Map(data.contacts.map((c) => [c.id, c]))),
    coverage: E.coverage(data.companies, data.contacts),
    outreach: [
      { key: 'request_sent', label: 'Connection requests sent', count: act.request_sent || 0 },
      { key: 'accepted', label: 'Accepted', count: act.accepted || 0 },
      { key: 'message_sent', label: 'Messages sent', count: act.message_sent || 0 },
      { key: 'reply', label: 'Replies', count: act.reply || 0 },
      { key: 'referral', label: 'Referrals', count: act.referral || 0 },
    ],
    closed: E.OUTCOMES.map((o) => ({ outcome: o, count: data.pursuits.filter((p) => p.outcome === o).length })),
  });
}));

/* ---------------------------------- jobs ---------------------------------- */

const JOB_STATUS = ['new', 'saved', 'hidden', 'applied'];

// GET /api/referrals/jobs?status=&min=&remote=&tier=&q= -> matching openings from your target companies' job boards
router.get('/referrals/jobs', wrap(async (req, res) => {
  const pool = await getPool();
  const status = JOB_STATUS.includes(req.query.status) ? req.query.status : null;
  const r = await pool.request()
    .input('st', sql.NVarChar, status).input('min', sql.Int, Number(req.query.min) || 0)
    .input('rem', sql.Bit, req.query.remote === '1' ? 1 : null).input('tier', sql.TinyInt, [1, 2, 3].includes(Number(req.query.tier)) ? Number(req.query.tier) : null)
    .input('q', sql.NVarChar, req.query.q ? `%${String(req.query.q).slice(0, 80)}%` : null)
    .query(`
      SELECT TOP 300 CAST(j.id AS int) AS id, CAST(j.company_id AS int) AS company_id, c.name AS company, c.tier, j.title, j.location, j.url, j.remote,
             j.department, j.posted_ms, j.first_seen_ms, j.score, j.reasons, j.status,
             (SELECT COUNT(*) FROM dbo.li_contacts k WHERE k.company_id = j.company_id AND k.do_not_contact = 0) AS contacts
      FROM dbo.ref_jobs j JOIN dbo.ref_companies c ON c.id = j.company_id
      WHERE j.closed_ms IS NULL AND c.is_target = 1 AND j.score >= @min
        AND ((@st IS NULL AND j.status <> 'hidden') OR j.status = @st)
        AND (@rem IS NULL OR j.remote = 1) AND (@tier IS NULL OR c.tier = @tier)
        AND (@q IS NULL OR j.title LIKE @q OR c.name LIKE @q OR j.location LIKE @q)
      ORDER BY j.score DESC, j.first_seen_ms DESC;
      SELECT COUNT(*) AS boards, MAX(jobs_ms) AS last_ms, SUM(CASE WHEN jobs_error IS NOT NULL THEN 1 ELSE 0 END) AS failing
      FROM dbo.ref_companies WHERE ats_provider IS NOT NULL AND is_target = 1;`);
  const meta = r.recordsets[1][0];
  const DAY = 86400000;
  res.json({
    boards: meta.boards, lastRefresh: num(meta.last_ms), failing: meta.failing,
    jobs: r.recordsets[0].map((j) => ({
      ...j, remote: !!j.remote, posted_ms: num(j.posted_ms), first_seen_ms: num(j.first_seen_ms), reasons: JSON.parse(j.reasons || '[]'),
      fresh: Date.now() - Number(j.first_seen_ms) < 3 * DAY,
    })),
  });
}));

// POST /api/referrals/jobs/refresh -> fetch every board now (one at a time; takes a minute)
router.post('/referrals/jobs/refresh', wrap(async (req, res) => {
  res.json(await require('../referrals/jobs-store').refreshJobs());
}));

// PATCH /api/referrals/jobs/:id { status }
router.patch('/referrals/jobs/:id', wrap(async (req, res) => {
  if (!JOB_STATUS.includes(req.body.status)) return res.status(400).json({ error: `status must be one of ${JOB_STATUS.join(', ')}` });
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, Number(req.params.id)).input('s', sql.NVarChar, req.body.status)
    .query('UPDATE dbo.ref_jobs SET status = @s WHERE id = @id');
  if (!r.rowsAffected[0]) return res.status(404).json({ error: 'Job not found' });
  res.json({ ok: true });
}));

// POST /api/referrals/jobs/:id/pipeline -> put this job on the company's pipeline card (creating it if needed)
router.post('/referrals/jobs/:id/pipeline', wrap(async (req, res) => {
  const pool = await getPool();
  const job = (await pool.request().input('id', sql.Int, Number(req.params.id))
    .query('SELECT CAST(company_id AS int) AS company_id, title, url FROM dbo.ref_jobs WHERE id = @id')).recordset[0];
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const open = (await pool.request().input('c', sql.Int, job.company_id)
    .query('SELECT CAST(id AS int) AS id FROM dbo.ref_pursuits WHERE company_id = @c AND outcome IS NULL')).recordset[0];
  let id = open?.id;
  if (id) {
    await pool.request().input('id', sql.Int, id).input('rt', sql.NVarChar, job.title.slice(0, 150)).input('ju', sql.NVarChar, job.url.slice(0, 400)).input('t', sql.BigInt, now())
      .query('UPDATE dbo.ref_pursuits SET role_title = @rt, job_url = @ju, updated_ms = @t WHERE id = @id');
    await addHistory(id, null, null, `Job: ${job.title}`);
  } else {
    const d = E.stageDefaults('target');
    const t = now();
    id = (await pool.request().input('co', sql.Int, job.company_id).input('rt', sql.NVarChar, job.title.slice(0, 150)).input('ju', sql.NVarChar, job.url.slice(0, 400))
      .input('na', sql.NVarChar, d.next_action).input('due', sql.BigInt, d.due_ms).input('t', sql.BigInt, t)
      .query(`INSERT INTO dbo.ref_pursuits (company_id, role_title, job_url, stage, next_action, due_ms, stage_ms, created_ms, updated_ms)
              OUTPUT CAST(INSERTED.id AS int) AS id VALUES (@co, @rt, @ju, 'target', @na, @due, @t, @t, @t)`)).recordset[0].id;
    await addHistory(id, null, 'target', `Added from the jobs feed: ${job.title}`);
  }
  await pool.request().input('id', sql.Int, Number(req.params.id)).query(`UPDATE dbo.ref_jobs SET status = 'saved' WHERE id = @id AND status = 'new'`);
  res.status(201).json(await getPursuit(id));
}));

/* -------------------------------- settings -------------------------------- */

// GET/PUT /api/referrals/settings { locations[], templates{ask, follow_up, thanks} }
router.get('/referrals/settings', wrap(async (req, res) => res.json(await refSettings())));
router.put('/referrals/settings', wrap(async (req, res) => {
  const b = req.body;
  const pool = await getPool();
  const put = (k, v) => pool.request().input('k', sql.NVarChar, k).input('v', sql.NVarChar(sql.MAX), v).query(`
    MERGE dbo.settings AS t USING (SELECT @k AS k) AS s ON t.k = s.k WHEN MATCHED THEN UPDATE SET v = @v WHEN NOT MATCHED THEN INSERT (k, v) VALUES (@k, @v);`);
  if ('locations' in b) {
    if (!Array.isArray(b.locations)) return res.status(400).json({ error: 'locations must be a list' });
    await put('ref_locations', JSON.stringify(b.locations.map((l) => String(l).trim()).filter(Boolean).slice(0, 10)));
  }
  if ('jobSkills' in b) {
    if (!Array.isArray(b.jobSkills)) return res.status(400).json({ error: 'jobSkills must be a list' });
    await put('ref_job_skills', JSON.stringify(b.jobSkills.map((x) => String(x).trim().toLowerCase()).filter(Boolean).slice(0, 30)));
  }
  if ('jobYears' in b) {
    const y = Number(b.jobYears);
    if (!(y >= 0 && y <= 30)) return res.status(400).json({ error: 'jobYears must be 0–30' });
    await put('ref_job_years', String(y));
  }
  for (const k of ['ask', 'follow_up', 'thanks']) {
    if (b.templates && k in b.templates) {
      const v = String(b.templates[k] || '').trim();
      if (!v || v.length > 1500) return res.status(400).json({ error: `The ${k.replace('_', '-')} template must be 1–1500 characters` });
      await put(`ref_tpl_${k}`, v);
    }
  }
  res.json(await refSettings());
}));

module.exports = { router, runImport };
