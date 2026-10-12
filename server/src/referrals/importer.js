// Connections.csv import v2: plan first (pure, so a dry run shows exactly what would change), then apply.
// Match order: LinkedIn URL -> email -> name + company. Existing people only get EMPTY fields filled,
// except a changed company, which is recorded as a move (the "they just joined a target company" signal).
const { sql } = require('../db');
const C = require('../linkedin/contacts');

const squash = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '');
const nameCo = (name, company) => `${squash(name)}|${squash(company)}`;

/**
 * rows: parsed Connections.csv rows. existing: li_contacts rows ({ id, dedupe_key, name, company, role, headline,
 * profile_url, email, status, connected_ms }). Returns { ops[], counts, moved[], skipped[] } without touching the DB.
 */
function planImport(rows, existing, now = Date.now()) {
  const byKey = new Map();
  const byEmail = new Map();
  const byNameCo = new Map();
  const index = (c) => {
    if (c.dedupe_key) byKey.set(c.dedupe_key, c);
    const u = C.normalizeProfileUrl(c.profile_url);
    if (u) byKey.set(C.dedupeKey({ profile_url: u }), c);
    if (c.email) byEmail.set(String(c.email).toLowerCase(), c);
    if (c.name) byNameCo.set(nameCo(c.name, c.company), c);
  };
  existing.forEach(index);

  const ops = [];
  const counts = { rows: rows.length, added: 0, accepted: 0, moved: 0, merged: 0, unchanged: 0, skipped: 0 };
  const moved = [];
  const skipped = [];
  for (const [i, r] of rows.entries()) {
    if (!r.name) { counts.skipped++; skipped.push({ row: i + 1, reason: 'No name' }); continue; }
    const urlKey = r.profile_url ? C.dedupeKey({ profile_url: r.profile_url }) : null;
    const hit = (urlKey && byKey.get(urlKey)) || (r.email && byEmail.get(r.email)) || byNameCo.get(nameCo(r.name, r.company));
    if (!hit) {
      const c = { ...r, dedupe_key: C.dedupeKey(r), status: 'connected', id: null, _new: true };
      ops.push({ type: 'add', row: c });
      counts.added++;
      index(c); // later rows in the same file merge into this one
      continue;
    }
    if (hit._new) { counts.unchanged++; continue; } // the same person twice in one file
    const set = {};
    let kind = 'unchanged';
    if (hit.status === 'requested') {
      Object.assign(set, { status: 'connected', connected_ms: r.connected_ms || now });
      kind = 'accepted';
    }
    if (r.company && hit.company && squash(r.company) !== squash(hit.company)) {
      Object.assign(set, { prev_company: hit.company, company: r.company, role: r.role || hit.role, headline: r.headline || hit.headline, moved_ms: now });
      moved.push({ id: hit.id, name: hit.name, from: hit.company, to: r.company, role: r.role || hit.role });
      if (kind === 'unchanged') kind = 'moved';
    }
    // Fill only what's empty.
    for (const k of ['profile_url', 'email', 'role', 'company', 'headline', 'connected_ms']) {
      if (r[k] && !hit[k] && set[k] === undefined) set[k] = r[k];
    }
    if (kind === 'unchanged' && Object.keys(set).length) kind = 'merged';
    counts[kind]++;
    if (Object.keys(set).length) {
      ops.push({ type: 'update', id: hit.id, name: hit.name, kind, set });
      Object.assign(hit, set); // a second row for the same person sees the updated values
    }
  }
  return { ops, counts, moved, skipped };
}

const COLS = {
  status: sql.NVarChar, connected_ms: sql.BigInt, prev_company: sql.NVarChar, company: sql.NVarChar, role: sql.NVarChar,
  headline: sql.NVarChar, moved_ms: sql.BigInt, profile_url: sql.NVarChar, email: sql.NVarChar,
};
const LIMIT = { name: 120, headline: 300, role: 150, company: 150, prev_company: 150, profile_url: 300, email: 200 };
const cut = (k, v) => (typeof v === 'string' && LIMIT[k] ? v.slice(0, LIMIT[k]) : v);

/** Applies a plan in one transaction and returns the ids it touched. */
async function applyImport(pool, plan, { logAction } = {}) {
  const tx = new sql.Transaction(pool);
  await tx.begin();
  const t = Date.now();
  try {
    for (const op of plan.ops) {
      if (op.type === 'add') {
        const r = op.row;
        await new sql.Request(tx)
          .input('k', sql.NVarChar, r.dedupe_key).input('name', sql.NVarChar, cut('name', r.name)).input('h', sql.NVarChar, cut('headline', r.headline) || null)
          .input('role', sql.NVarChar, cut('role', r.role) || null).input('co', sql.NVarChar, cut('company', r.company) || null)
          .input('url', sql.NVarChar, r.profile_url || null).input('email', sql.NVarChar, cut('email', r.email) || null)
          .input('c', sql.BigInt, r.connected_ms || t).input('t', sql.BigInt, t)
          .query(`IF NOT EXISTS (SELECT 1 FROM dbo.li_contacts WHERE dedupe_key = @k)
                  INSERT INTO dbo.li_contacts (dedupe_key, name, headline, role, company, profile_url, email, status, source, connected_ms, created_ms, updated_ms)
                  VALUES (@k, @name, @h, @role, @co, @url, @email, 'connected', 'csv', @c, @t, @t)`);
      } else {
        const req = new sql.Request(tx).input('id', sql.Int, op.id).input('t', sql.BigInt, t);
        const sets = Object.entries(op.set).map(([k, v]) => { req.input(k, COLS[k], cut(k, v)); return `${k} = @${k}`; });
        await req.query(`UPDATE dbo.li_contacts SET ${sets.join(', ')}, updated_ms = @t WHERE id = @id`);
      }
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback().catch(() => {});
    throw e;
  }
  if (logAction) {
    for (const op of plan.ops.filter((o) => o.type === 'update' && o.kind === 'accepted')) await logAction(op.id, 'accepted', { at: op.set.connected_ms, detail: 'from Connections.csv' });
  }
}

module.exports = { planImport, applyImport };
