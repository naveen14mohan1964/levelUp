// LinkedIn module · Phase 3: assisted outreach. You search and press "Connect" on LinkedIn yourself;
// the app builds target lists, dedupes, writes notes, enforces caps/hours/pacing, and tracks everything.
const express = require('express');
const { sql, getPool } = require('../db');
const store = require('../linkedin/store');
const C = require('../linkedin/contacts');
const L = require('../linkedin/limits');
const { generate } = require('../gemini');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const now = () => Date.now();

const CONTACT_COLS = `CAST(c.id AS int) AS id, CAST(c.list_id AS int) AS list_id, c.name, c.headline, c.role, c.company, c.location,
  c.profile_url, c.status, c.do_not_contact, c.use_note, c.note, c.notes, c.source, c.requested_ms, c.connected_ms, c.created_ms, c.updated_ms, l.name AS list_name`;
const num = (v) => (v == null ? null : Number(v));
const contactOut = (c) => c && { ...c, requested_ms: num(c.requested_ms), connected_ms: num(c.connected_ms), created_ms: num(c.created_ms), updated_ms: num(c.updated_ms) };

async function getContact(id) {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, id)
    .query(`SELECT ${CONTACT_COLS} FROM dbo.li_contacts c LEFT JOIN dbo.li_lists l ON l.id = c.list_id WHERE c.id = @id`);
  return contactOut(r.recordset[0]);
}

async function logAction(contactId, type, { withNote = false, detail = null, at = now() } = {}) {
  const pool = await getPool();
  await pool.request().input('c', sql.Int, contactId).input('t', sql.NVarChar, type).input('n', sql.Bit, withNote)
    .input('at', sql.BigInt, at).input('d', sql.NVarChar, detail)
    .query('INSERT INTO dbo.li_actions (contact_id, type, with_note, at_ms, detail) VALUES (@c, @t, @n, @at, @d)');
}

/** Everything the limit rules need, from settings + the action log. */
async function limitState(at = now()) {
  const s = await store.liSettings();
  const pool = await getPool();
  const r = await pool.request()
    .input('day', sql.BigInt, L.startOfLocalDay(at)).input('week', sql.BigInt, at - L.WEEK).input('month', sql.BigInt, L.startOfLocalMonth(at))
    .query(`SELECT at_ms FROM dbo.li_actions WHERE type = 'request_sent' AND at_ms > @week ORDER BY at_ms;
            SELECT COUNT(*) AS n FROM dbo.li_actions WHERE type = 'request_sent' AND at_ms >= @day;
            SELECT COUNT(*) AS n FROM dbo.li_actions WHERE type = 'request_sent' AND with_note = 1 AND at_ms >= @month;`);
  const hours = { start: s.li_work_start, end: s.li_work_end, days: s.li_work_days };
  const state = {
    now: at, paused: s.li_paused, cooldownUntil: s.li_outreach_cooldown_until, hours,
    dailyCap: s.li_daily_cap, weeklyCap: s.li_weekly_cap,
    sentToday: r.recordsets[1][0].n, sentLast7Days: r.recordsets[0].map((x) => Number(x.at_ms)), nextSendMs: s.li_next_send_ms,
  };
  const left = L.notesLeft({ premium: s.li_premium, budget: s.li_note_budget_month, usedThisMonth: r.recordsets[2][0].n });
  return { s, state, check: L.checkSend(state), notesLeft: left, notesUsed: r.recordsets[2][0].n, noteMax: L.noteMaxChars(s.li_premium) };
}

/** Inserts people, skipping duplicates and anyone on your do-not-contact list. */
async function addPeople(people, { listId = null, source = 'paste' } = {}) {
  const pool = await getPool();
  const result = { added: [], duplicates: [], doNotContact: [] };
  for (const p of people) {
    const key = C.dedupeKey(p);
    const existing = await pool.request().input('k', sql.NVarChar, key)
      .query('SELECT CAST(id AS int) AS id, name, status, do_not_contact FROM dbo.li_contacts WHERE dedupe_key = @k');
    const e = existing.recordset[0];
    if (e) {
      (e.do_not_contact ? result.doNotContact : result.duplicates).push({ id: e.id, name: e.name, status: e.status });
      continue;
    }
    const t = now();
    const r = await pool.request()
      .input('list', sql.Int, listId).input('k', sql.NVarChar, key).input('name', sql.NVarChar, p.name.slice(0, 120))
      .input('h', sql.NVarChar, (p.headline || '').slice(0, 300) || null).input('role', sql.NVarChar, (p.role || '').slice(0, 150) || null)
      .input('co', sql.NVarChar, (p.company || '').slice(0, 150) || null).input('loc', sql.NVarChar, (p.location || '').slice(0, 100) || null)
      .input('url', sql.NVarChar, p.profile_url || null).input('src', sql.NVarChar, source).input('t', sql.BigInt, t)
      .query(`INSERT INTO dbo.li_contacts (list_id, dedupe_key, name, headline, role, company, location, profile_url, source, created_ms, updated_ms)
              OUTPUT CAST(INSERTED.id AS int) AS id VALUES (@list, @k, @name, @h, @role, @co, @loc, @url, @src, @t, @t)`);
    result.added.push({ id: r.recordset[0].id, name: p.name });
  }
  return result;
}

/* ------------------------------ overview / session ------------------------------ */

// GET /api/linkedin/outreach -> limits, today's queue, pipeline counts
router.get('/linkedin/outreach', wrap(async (req, res) => {
  const { s, state, check, notesLeft, notesUsed, noteMax } = await limitState();
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT TOP 40 ${CONTACT_COLS} FROM dbo.li_contacts c LEFT JOIN dbo.li_lists l ON l.id = c.list_id
      WHERE c.status = 'not_contacted' AND c.do_not_contact = 0 ORDER BY c.use_note DESC, c.created_ms;
    SELECT status, COUNT(*) AS n FROM dbo.li_contacts WHERE do_not_contact = 0 GROUP BY status;
    SELECT COUNT(*) AS n FROM dbo.li_contacts WHERE do_not_contact = 1;`);
  const counts = Object.fromEntries(r.recordsets[1].map((x) => [x.status, x.n]));
  const template = s.li_note_template;
  res.json({
    limits: {
      ...check, sentToday: state.sentToday, dailyCap: state.dailyCap, sentThisWeek: state.sentLast7Days.length, weeklyCap: state.weeklyCap,
      notesLeft: notesLeft === Infinity ? null : notesLeft, notesUsed, noteMax, premium: s.li_premium, hours: state.hours,
      cooldownUntil: state.cooldownUntil > now() ? state.cooldownUntil : null,
    },
    queue: r.recordsets[0].map(contactOut).map((c) => ({ ...c, missing: c.note ? [] : C.missingVars(template, c), suggested_note: c.note || C.renderTemplate(template, c) })),
    counts: { ...counts, do_not_contact: r.recordsets[2][0].n },
  });
}));

// POST /api/linkedin/outreach/contacts/:id/sent { with_note } -> you pressed Connect on LinkedIn
router.post('/linkedin/outreach/contacts/:id/sent', wrap(async (req, res) => {
  const c = await getContact(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Contact not found' });
  if (c.do_not_contact) return res.status(409).json({ error: `${c.name} is on your do-not-contact list` });
  if (c.status !== 'not_contacted') return res.status(409).json({ error: `Already ${c.status.replace('_', ' ')}: never request the same person twice` });
  const { s, check, notesLeft, noteMax } = await limitState();
  if (!check.ok) return res.status(429).json({ error: check.message, reason: check.reason, retryAt: check.retryAt });
  const withNote = !!req.body.with_note;
  if (withNote) {
    if (notesLeft <= 0) return res.status(409).json({ error: 'No personalised notes left this month. Send it without a note (personalise after they accept).' });
    if (!c.note || c.note.length > noteMax) return res.status(400).json({ error: `Note must be 1–${noteMax} characters` });
  }
  const t = now();
  const pool = await getPool();
  await pool.request().input('id', sql.Int, c.id).input('t', sql.BigInt, t)
    .query("UPDATE dbo.li_contacts SET status = 'requested', requested_ms = @t, updated_ms = @t WHERE id = @id AND status = 'not_contacted'");
  await logAction(c.id, 'request_sent', { withNote, at: t });
  await store.setSetting('li_next_send_ms', t + L.randomDelayMs(s.li_delay_min_s, s.li_delay_max_s));
  await store.audit('you', 'request_sent', 'contact', c.id, `${c.name}${withNote ? ' (with note)' : ''}`);
  res.json({ contact: await getContact(c.id) });
}));

// POST /api/linkedin/outreach/contacts/:id/undo-sent -> misclick within 10 minutes
router.post('/linkedin/outreach/contacts/:id/undo-sent', wrap(async (req, res) => {
  const c = await getContact(Number(req.params.id));
  if (!c || c.status !== 'requested' || now() - c.requested_ms > 10 * 60_000) return res.status(409).json({ error: 'Only a request marked in the last 10 minutes can be undone' });
  const pool = await getPool();
  await pool.request().input('id', sql.Int, c.id).input('t', sql.BigInt, now()).query(`
    UPDATE dbo.li_contacts SET status = 'not_contacted', requested_ms = NULL, updated_ms = @t WHERE id = @id;
    DELETE FROM dbo.li_actions WHERE id = (SELECT TOP 1 id FROM dbo.li_actions WHERE contact_id = @id AND type = 'request_sent' ORDER BY id DESC);`);
  await store.setSetting('li_next_send_ms', 0);
  await store.audit('you', 'request_undone', 'contact', c.id, c.name);
  res.json({ contact: await getContact(c.id) });
}));

// POST /api/linkedin/outreach/contacts/:id/accepted -> they accepted (or use the CSV import)
router.post('/linkedin/outreach/contacts/:id/accepted', wrap(async (req, res) => {
  const c = await getContact(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Contact not found' });
  if (c.status !== 'requested') return res.status(409).json({ error: `Only requested contacts can be marked accepted (this one is ${c.status})` });
  const t = now();
  const pool = await getPool();
  await pool.request().input('id', sql.Int, c.id).input('t', sql.BigInt, t)
    .query("UPDATE dbo.li_contacts SET status = 'connected', connected_ms = @t, updated_ms = @t WHERE id = @id");
  await logAction(c.id, 'accepted', { at: t });
  await store.audit('you', 'request_accepted', 'contact', c.id, c.name);
  res.json({ contact: await getContact(c.id) });
}));

// POST /api/linkedin/outreach/warning { detail } -> LinkedIn showed a warning / limit / CAPTCHA: stop outreach for 7 days
router.post('/linkedin/outreach/warning', wrap(async (req, res) => {
  const until = now() + 7 * L.DAY;
  await store.setSetting('li_outreach_cooldown_until', until);
  await logAction(null, 'warning', { detail: String(req.body.detail || '').slice(0, 500) || 'LinkedIn warning' });
  await store.audit('you', 'outreach_paused_warning', 'config', null, req.body.detail || 'LinkedIn showed a warning');
  res.json({ cooldownUntil: until });
}));

router.post('/linkedin/outreach/resume', wrap(async (req, res) => {
  await store.setSetting('li_outreach_cooldown_until', 0);
  await store.audit('you', 'outreach_cooldown_cleared', 'config', null);
  res.json({ cooldownUntil: null });
}));

/* ------------------------------------ lists ------------------------------------ */

const listOut = (l) => {
  const out = { ...l, roles: JSON.parse(l.roles || '[]'), companies: JSON.parse(l.companies || '[]'), locations: JSON.parse(l.locations || '[]'), created_ms: num(l.created_ms) };
  return { ...out, links: C.searchLinks(out) };
};
const cleanArr = (a) => (Array.isArray(a) ? a : String(a || '').split(',')).map((x) => String(x).trim()).filter(Boolean).slice(0, 12);

function validateList(b) {
  const errors = [];
  if (!String(b.name || '').trim()) errors.push('List name is required');
  if (!cleanArr(b.roles).length && !cleanArr(b.companies).length && !String(b.keywords || '').trim()) errors.push('Add at least one role, company or keyword');
  if (b.note_template && String(b.note_template).length > 400) errors.push('Template: max 400 characters');
  return errors;
}

router.get('/linkedin/outreach/lists', wrap(async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT CAST(l.id AS int) AS id, l.name, l.roles, l.companies, l.locations, l.keywords, l.note_template, l.created_ms,
      (SELECT COUNT(*) FROM dbo.li_contacts c WHERE c.list_id = l.id) AS people,
      (SELECT COUNT(*) FROM dbo.li_contacts c WHERE c.list_id = l.id AND c.status <> 'not_contacted') AS contacted
    FROM dbo.li_lists l ORDER BY l.id DESC`);
  res.json(r.recordset.map(listOut));
}));

async function saveList(req, res, id) {
  const errors = validateList(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });
  const b = req.body;
  const pool = await getPool();
  const q = pool.request()
    .input('name', sql.NVarChar, String(b.name).trim().slice(0, 100)).input('roles', sql.NVarChar(sql.MAX), JSON.stringify(cleanArr(b.roles)))
    .input('cos', sql.NVarChar(sql.MAX), JSON.stringify(cleanArr(b.companies))).input('locs', sql.NVarChar(sql.MAX), JSON.stringify(cleanArr(b.locations)))
    .input('kw', sql.NVarChar, String(b.keywords || '').trim().slice(0, 200) || null).input('tpl', sql.NVarChar, String(b.note_template || '').trim() || null)
    .input('t', sql.BigInt, now()).input('id', sql.Int, id ?? null);
  const r = await q.query(id
    ? 'UPDATE dbo.li_lists SET name = @name, roles = @roles, companies = @cos, locations = @locs, keywords = @kw, note_template = @tpl OUTPUT CAST(INSERTED.id AS int) AS id WHERE id = @id'
    : 'INSERT INTO dbo.li_lists (name, roles, companies, locations, keywords, note_template, created_ms) OUTPUT CAST(INSERTED.id AS int) AS id VALUES (@name, @roles, @cos, @locs, @kw, @tpl, @t)');
  if (!r.recordset.length) return res.status(404).json({ error: 'List not found' });
  const row = await pool.request().input('id', sql.Int, r.recordset[0].id).query('SELECT CAST(id AS int) AS id, name, roles, companies, locations, keywords, note_template, created_ms FROM dbo.li_lists WHERE id = @id');
  await store.audit('you', id ? 'list_updated' : 'list_created', 'list', r.recordset[0].id, b.name);
  res.status(id ? 200 : 201).json(listOut(row.recordset[0]));
}
router.post('/linkedin/outreach/lists', wrap((req, res) => saveList(req, res)));
router.put('/linkedin/outreach/lists/:id', wrap((req, res) => saveList(req, res, Number(req.params.id))));

router.delete('/linkedin/outreach/lists/:id', wrap(async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, Number(req.params.id)).query('DELETE FROM dbo.li_lists WHERE id = @id'); // contacts stay (list_id → NULL)
  if (!r.rowsAffected[0]) return res.status(404).json({ error: 'List not found' });
  res.json({ ok: true });
}));

/* ----------------------------------- contacts ----------------------------------- */

// GET /api/linkedin/outreach/contacts?status=&list_id=&q=
router.get('/linkedin/outreach/contacts', wrap(async (req, res) => {
  const pool = await getPool();
  const r = await pool.request()
    .input('status', sql.NVarChar, req.query.status || null).input('list', sql.Int, req.query.list_id ? Number(req.query.list_id) : null)
    .input('q', sql.NVarChar, req.query.q ? `%${String(req.query.q).slice(0, 100)}%` : null)
    .input('dnc', sql.Bit, req.query.status === 'do_not_contact' ? 1 : null)
    .query(`SELECT ${CONTACT_COLS} FROM dbo.li_contacts c LEFT JOIN dbo.li_lists l ON l.id = c.list_id
            WHERE (@dnc IS NULL OR c.do_not_contact = 1)
              AND (@status IS NULL OR @status = 'do_not_contact' OR c.status = @status)
              AND (@list IS NULL OR c.list_id = @list)
              AND (@q IS NULL OR c.name LIKE @q OR c.company LIKE @q OR c.headline LIKE @q)
            ORDER BY c.updated_ms DESC`);
  res.json(r.recordset.map(contactOut));
}));

// POST /api/linkedin/outreach/contacts/quick-add { text, list_id? }
router.post('/linkedin/outreach/contacts/quick-add', wrap(async (req, res) => {
  const { people, errors } = C.parseQuickAdd(req.body.text);
  if (!people.length) return res.status(400).json({ error: errors[0] || 'Paste at least one profile URL or "Name / headline" block' });
  if (people.length > 100) return res.status(400).json({ error: 'Add up to 100 people at a time' });
  const result = await addPeople(people, { listId: req.body.list_id ? Number(req.body.list_id) : null, source: 'paste' });
  if (result.added.length) await store.audit('you', 'contacts_added', 'list', req.body.list_id || null, `${result.added.length} added, ${result.duplicates.length} duplicates`);
  res.status(201).json({ ...result, errors });
}));

// POST /api/linkedin/outreach/contacts/import-csv { csv } -> LinkedIn's official Connections.csv export.
// Same importer as Referrals -> Import (URL/email/name+company matching, fill-empty merge, company moves), older response shape.
router.post('/linkedin/outreach/contacts/import-csv', wrap(async (req, res) => {
  let plan;
  try {
    plan = await require('./referrals').runImport(req.body.csv, { dryRun: false });
  } catch (e) {
    if (/Connections.csv/.test(e.message)) return res.status(400).json({ error: e.message });
    throw e;
  }
  const k = plan.counts;
  res.json({
    rows: k.rows, accepted: plan.ops.filter((o) => o.kind === 'accepted').map((o) => o.name), added: k.added,
    alreadyConnected: k.unchanged + k.merged + k.moved, moved: plan.moved,
  });
}));

const MANUAL_STATUSES = ['not_contacted', 'requested', 'connected', 'messaged', 'replied', 'referral', 'skipped'];

// PATCH /api/linkedin/outreach/contacts/:id { note?, use_note?, notes?, do_not_contact?, status?, list_id? }
router.patch('/linkedin/outreach/contacts/:id', wrap(async (req, res) => {
  const c = await getContact(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Contact not found' });
  const b = req.body;
  const { noteMax } = await limitState();
  if ('note' in b && b.note && String(b.note).length > noteMax) return res.status(400).json({ error: `Note: max ${noteMax} characters on your plan` });
  if ('status' in b && !MANUAL_STATUSES.includes(b.status)) return res.status(400).json({ error: 'Invalid status' });
  const pool = await getPool();
  const q = pool.request().input('id', sql.Int, c.id).input('t', sql.BigInt, now());
  const sets = [];
  const add = (col, type, v) => { q.input(col, type, v); sets.push(`${col} = @${col}`); };
  if ('note' in b) add('note', sql.NVarChar, b.note ? String(b.note).trim() : null);
  if ('use_note' in b) add('use_note', sql.Bit, !!b.use_note);
  if ('notes' in b) add('notes', sql.NVarChar(sql.MAX), b.notes || null);
  if ('do_not_contact' in b) add('do_not_contact', sql.Bit, !!b.do_not_contact);
  if ('status' in b) add('status', sql.NVarChar, b.status);
  if ('list_id' in b) add('list_id', sql.Int, b.list_id ? Number(b.list_id) : null);
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  await q.query(`UPDATE dbo.li_contacts SET ${sets.join(', ')}, updated_ms = @t WHERE id = @id`);
  if ('status' in b && b.status !== c.status && ['replied', 'referral'].includes(b.status)) await logAction(c.id, b.status === 'replied' ? 'reply' : 'referral');
  if ('do_not_contact' in b) await store.audit('you', b.do_not_contact ? 'do_not_contact_added' : 'do_not_contact_removed', 'contact', c.id, c.name);
  res.json({ contact: await getContact(c.id) });
}));

router.delete('/linkedin/outreach/contacts/:id', wrap(async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, Number(req.params.id)).query('DELETE FROM dbo.li_contacts WHERE id = @id');
  if (!r.rowsAffected[0]) return res.status(404).json({ error: 'Contact not found' });
  res.json({ ok: true });
}));

/* ------------------------------------ notes ------------------------------------ */

const NOTES_SCHEMA = {
  type: 'OBJECT',
  properties: { notes: { type: 'ARRAY', items: { type: 'OBJECT', properties: { id: { type: 'INTEGER' }, note: { type: 'STRING' } }, required: ['id', 'note'] } } },
  required: ['notes'],
};

// POST /api/linkedin/outreach/notes { contact_ids, mode: 'template' | 'ai' } -> fills each contact's note (you still review)
router.post('/linkedin/outreach/notes', wrap(async (req, res) => {
  const ids = (req.body.contact_ids || []).map(Number).filter(Boolean).slice(0, 15);
  if (!ids.length) return res.status(400).json({ error: 'Pick up to 15 contacts' });
  const { s, noteMax } = await limitState();
  const contacts = (await Promise.all(ids.map(getContact))).filter((c) => c && c.status === 'not_contacted');
  let notes;
  if (req.body.mode === 'ai') {
    const prompt = `Write a LinkedIn connection-request note for each person below, from me.
About me: ${s.li_my_intro}
Rules for every note:
- At most ${noteMax} characters (hard limit, count carefully). Use their first name.
- Give one specific, honest reason to connect based on their role/company/headline. Never invent shared history or facts.
- Do NOT ask for a job, referral or favour in this first note. No flattery clichés ("I'm impressed by your profile"), no emojis, no hashtags.
- Plain, warm, professional. Different wording for each person.
People (JSON): ${JSON.stringify(contacts.map((c) => ({ id: c.id, name: c.name, headline: c.headline, role: c.role, company: c.company, location: c.location })))}`;
    try {
      const out = await generate([{ text: prompt }], { schema: NOTES_SCHEMA, temperature: 0.7 });
      notes = out.notes.map((n) => ({ id: n.id, note: String(n.note).trim().slice(0, noteMax) }));
    } catch (err) {
      if (err.status === 429) return res.status(429).json({ error: err.message });
      throw err;
    }
  } else {
    const pool = await getPool();
    const lists = Object.fromEntries((await pool.request().query('SELECT CAST(id AS int) AS id, note_template FROM dbo.li_lists')).recordset.map((l) => [l.id, l.note_template]));
    notes = contacts.map((c) => ({ id: c.id, note: C.renderTemplate(lists[c.list_id] || s.li_note_template, c).slice(0, noteMax) }));
  }
  const pool = await getPool();
  const valid = notes.filter((n) => contacts.some((c) => c.id === n.id));
  for (const n of valid) {
    await pool.request().input('id', sql.Int, n.id).input('note', sql.NVarChar, n.note).input('t', sql.BigInt, now())
      .query('UPDATE dbo.li_contacts SET note = @note, updated_ms = @t WHERE id = @id');
  }
  await store.audit(req.body.mode === 'ai' ? 'ai' : 'you', 'notes_prepared', 'contact', null, `${valid.length} notes (${req.body.mode === 'ai' ? 'AI' : 'template'})`);
  res.json({ notes: valid });
}));

module.exports = { router, limitState, logAction };
