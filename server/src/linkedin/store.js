// LinkedIn module · small DB helpers shared by the routes and the job runner.
const { sql, getPool } = require('../db');

const JSON_KEYS = ['li_post_slots', 'li_pillars', 'li_work_days'];
const NUMBER_KEYS = ['li_daily_cap', 'li_weekly_cap', 'li_delay_min_s', 'li_delay_max_s', 'li_next_send_ms', 'li_outreach_cooldown_until', 'li_note_budget_month'];

/** All li_* settings, with JSON values parsed and flags as booleans. */
async function liSettings() {
  const pool = await getPool();
  const { recordset } = await pool.request().query("SELECT k, v FROM dbo.settings WHERE k LIKE 'li[_]%'");
  const s = Object.fromEntries(recordset.map((r) => [r.k, r.v]));
  for (const k of JSON_KEYS) s[k] = JSON.parse(s[k] || '[]');
  for (const k of ['li_paused', 'li_auto_approve', 'li_avoid_employer', 'li_goal_achieved', 'li_premium']) s[k] = s[k] === '1';
  for (const k of NUMBER_KEYS) s[k] = Number(s[k] || 0);
  return s;
}

async function setSetting(k, v) {
  const pool = await getPool();
  const value = typeof v === 'boolean' ? (v ? '1' : '0') : typeof v === 'object' ? JSON.stringify(v) : String(v);
  await pool.request().input('k', sql.NVarChar, k).input('v', sql.NVarChar(sql.MAX), value).query(`
    MERGE dbo.settings AS t USING (SELECT @k AS k) AS s ON t.k = s.k
    WHEN MATCHED THEN UPDATE SET v = @v WHEN NOT MATCHED THEN INSERT (k, v) VALUES (@k, @v);`);
}

/** Audit log: every action by you, the scheduler or the AI. */
async function audit(actor, action, refType, refId, detail) {
  const pool = await getPool();
  await pool.request()
    .input('at', sql.BigInt, Date.now()).input('actor', sql.NVarChar, actor).input('action', sql.NVarChar, action)
    .input('rt', sql.NVarChar, refType || null).input('rid', sql.Int, refId ?? null)
    .input('d', sql.NVarChar, detail ? String(detail).slice(0, 2000) : null)
    .query('INSERT INTO dbo.li_audit (at_ms, actor, action, ref_type, ref_id, detail) VALUES (@at, @actor, @action, @rt, @rid, @d)');
}

async function enqueue(type, refId, runMs, maxAttempts = 3) {
  const pool = await getPool();
  const now = Date.now();
  const r = await pool.request()
    .input('t', sql.NVarChar, type).input('ref', sql.Int, refId).input('run', sql.BigInt, runMs)
    .input('max', sql.Int, maxAttempts).input('now', sql.BigInt, now)
    .query(`INSERT INTO dbo.li_jobs (type, ref_id, run_ms, max_attempts, created_ms, updated_ms)
            OUTPUT CAST(INSERTED.id AS int) AS id VALUES (@t, @ref, @run, @max, @now, @now)`);
  return r.recordset[0].id;
}

/** Cancels queued jobs for something (e.g. when you unschedule or edit a post). */
async function cancelJobs(type, refId) {
  const pool = await getPool();
  await pool.request().input('t', sql.NVarChar, type).input('ref', sql.Int, refId).input('now', sql.BigInt, Date.now())
    .query("UPDATE dbo.li_jobs SET status = 'cancelled', updated_ms = @now WHERE type = @t AND ref_id = @ref AND status = 'queued'");
}

const POST_COLS = `CAST(id AS int) AS id, CONVERT(char(10), week_start, 23) AS week_start, slot_index, pillar, angle, text, status,
  ai_generated, scheduled_ms, posted_ms, post_urn, post_url, error, created_ms, updated_ms, image_path, image_alt, image_prompt`;
const num = (v) => (v == null ? null : Number(v)); // BIGINT comes back as a string
const postOut = (p) => p && {
  ...p, scheduled_ms: num(p.scheduled_ms), posted_ms: num(p.posted_ms), created_ms: num(p.created_ms), updated_ms: num(p.updated_ms),
  image_url: p.image_path ? `/uploads/${p.image_path}` : null,
};

async function getPost(id) {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, id).query(`SELECT ${POST_COLS} FROM dbo.li_posts WHERE id = @id`);
  return postOut(r.recordset[0]);
}

async function updatePost(id, fields) {
  const pool = await getPool();
  const req = pool.request().input('id', sql.Int, id).input('updated_ms', sql.BigInt, Date.now());
  const TYPES = { status: sql.NVarChar, text: sql.NVarChar(sql.MAX), pillar: sql.NVarChar, angle: sql.NVarChar, scheduled_ms: sql.BigInt, posted_ms: sql.BigInt, post_urn: sql.NVarChar, post_url: sql.NVarChar, error: sql.NVarChar, ai_generated: sql.Bit,
    image_path: sql.NVarChar, image_alt: sql.NVarChar, image_prompt: sql.NVarChar(sql.MAX) };
  const sets = Object.keys(fields).filter((k) => TYPES[k]).map((k) => {
    req.input(k, TYPES[k], fields[k]);
    return `${k} = @${k}`; // column names come from the TYPES whitelist
  });
  await req.query(`UPDATE dbo.li_posts SET ${[...sets, 'updated_ms = @updated_ms'].join(', ')} WHERE id = @id`);
  return getPost(id);
}

module.exports = { liSettings, setSetting, audit, enqueue, cancelJobs, getPost, updatePost, POST_COLS, postOut };
