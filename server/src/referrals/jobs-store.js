// Jobs feed storage + refresh. Runs once a day in the always-on app (and on "Refresh now"), one board at a time.
const fs = require('fs');
const path = require('path');
const { sql, getPool } = require('../db');
const J = require('./jobs');

const BOARDS_FILE = path.join(__dirname, '..', '..', 'data', 'job-boards.json');

/** Fills in each company's verified job board from data/job-boards.json (never overwrites one you changed). */
async function seedBoards(pool) {
  if (!fs.existsSync(BOARDS_FILE)) return 0;
  const boards = JSON.parse(fs.readFileSync(BOARDS_FILE, 'utf8')).boards || [];
  let n = 0;
  for (const b of boards) {
    const r = await pool.request().input('n', sql.NVarChar, b.company).input('p', sql.NVarChar, b.provider).input('t', sql.NVarChar, b.token)
      .query('UPDATE dbo.ref_companies SET ats_provider = @p, ats_token = @t WHERE name = @n AND ats_provider IS NULL');
    n += r.rowsAffected[0];
  }
  return n;
}

async function jobSettings(pool) {
  const r = await pool.request().query(`SELECT k, v FROM dbo.settings WHERE k IN ('ref_job_skills', 'ref_job_years')`);
  const s = Object.fromEntries(r.recordset.map((x) => [x.k, x.v]));
  let skills = [];
  try { skills = JSON.parse(s.ref_job_skills || '[]'); } catch { /* keep [] */ }
  return { skills, years: Number(s.ref_job_years) || 2 };
}

/**
 * Refreshes every company with a job board (or just `companyId`). Returns a summary.
 * fetchImpl is injectable for tests.
 */
let running = null;
function refreshJobs(opts = {}) {
  running ||= doRefresh(opts).finally(() => { running = null; });
  return running;
}

async function doRefresh({ companyId = null, fetchImpl } = {}) {
  const pool = await getPool();
  const companies = (await pool.request().input('id', sql.Int, companyId).query(`
    SELECT CAST(id AS int) AS id, name, tier, ats_provider, ats_token FROM dbo.ref_companies
    WHERE ats_provider IS NOT NULL AND ats_token IS NOT NULL AND is_target = 1 AND (@id IS NULL OR id = @id)`)).recordset;
  const known = new Set((await pool.request().query('SELECT DISTINCT CAST(company_id AS int) AS id FROM dbo.li_contacts WHERE company_id IS NOT NULL AND do_not_contact = 0')).recordset.map((r) => r.id));
  const profile = await jobSettings(pool);
  const summary = { boards: companies.length, ok: 0, failed: [], kept: 0, newJobs: 0 };
  const isNetwork = (e) => /fetch failed|timeout|ENOTFOUND|ECONNRESET|EAI_AGAIN|network/i.test(`${e.message} ${e.cause?.code || ''}`);
  // Network errors (laptop just woke, Wi-Fi not up yet) get one more try at the end of the pass.
  const queue = companies.map((co) => ({ co, retried: false }));
  while (queue.length) {
    const { co, retried } = queue.shift();
    const t = Date.now();
    let raw;
    try {
      raw = await J.fetchBoard(co.ats_provider, co.ats_token, fetchImpl);
    } catch (e) {
      if (!retried && isNetwork(e)) {
        queue.push({ co, retried: true });
        if (queue.every((q) => q.retried)) await new Promise((r) => setTimeout(r, fetchImpl ? 0 : 20_000)); // give the network a moment
        continue;
      }
      summary.failed.push({ company: co.name, error: e.message, network: isNetwork(e) });
      await pool.request().input('id', sql.Int, co.id).input('e', sql.NVarChar, String(e.message).slice(0, 300))
        .query('UPDATE dbo.ref_companies SET jobs_error = @e WHERE id = @id');
      continue;
    }
    const seen = [];
    for (const job of raw) {
      if (!job.url || !job.title) continue;
      const m = J.scoreJob(job, co, profile, known.has(co.id));
      if (!m) continue;
      seen.push(job.ext_id);
      const r = await pool.request()
        .input('co', sql.Int, co.id).input('p', sql.NVarChar, co.ats_provider).input('x', sql.NVarChar, job.ext_id.slice(0, 100))
        .input('ti', sql.NVarChar, job.title.slice(0, 300)).input('loc', sql.NVarChar, (job.location || '').slice(0, 300) || null)
        .input('url', sql.NVarChar, job.url.slice(0, 600)).input('rem', sql.Bit, !!job.remote).input('dep', sql.NVarChar, (job.department || '').slice(0, 200) || null)
        .input('posted', sql.BigInt, job.posted_ms || null).input('t', sql.BigInt, t).input('s', sql.Int, m.score)
        .input('why', sql.NVarChar(sql.MAX), JSON.stringify(m.reasons))
        .query(`MERGE dbo.ref_jobs AS j USING (SELECT @p AS provider, @x AS ext_id) AS s ON j.provider = s.provider AND j.ext_id = s.ext_id
                WHEN MATCHED THEN UPDATE SET title = @ti, location = @loc, url = @url, remote = @rem, department = @dep, posted_ms = @posted,
                  last_seen_ms = @t, closed_ms = NULL, score = @s, reasons = @why
                WHEN NOT MATCHED THEN INSERT (company_id, provider, ext_id, title, location, url, remote, department, posted_ms, first_seen_ms, last_seen_ms, score, reasons)
                  VALUES (@co, @p, @x, @ti, @loc, @url, @rem, @dep, @posted, @t, @t, @s, @why)
                OUTPUT $action AS action;`);
      if (r.recordset[0]?.action === 'INSERT') summary.newJobs++;
    }
    summary.kept += seen.length;
    // Jobs that disappeared from the board are closed (kept so your saved/applied history stays).
    await pool.request().input('co', sql.Int, co.id).input('t', sql.BigInt, t)
      .query('UPDATE dbo.ref_jobs SET closed_ms = @t WHERE company_id = @co AND closed_ms IS NULL AND last_seen_ms < @t');
    await pool.request().input('id', sql.Int, co.id).input('t', sql.BigInt, t).query('UPDATE dbo.ref_companies SET jobs_ms = @t, jobs_error = NULL WHERE id = @id');
    summary.ok++;
    await new Promise((r) => setTimeout(r, fetchImpl ? 0 : 400)); // be gentle with the providers
  }
  return summary;
}

/** Daily refresh in the always-on app (first run 2 minutes after start). */
function start() {
  const run = () => refreshJobs().then((s) => {
    console.log(`Jobs feed: ${s.ok}/${s.boards} boards, ${s.newJobs} new matching jobs`);
    // Still offline for some boards? Try again in 30 minutes rather than waiting a whole day.
    if (s.failed.some((f) => f.network)) setTimeout(run, 30 * 60 * 1000).unref();
  }).catch((e) => console.warn('Jobs feed failed:', e.message));
  setTimeout(run, 2 * 60 * 1000).unref();
  setInterval(run, J.DAY).unref();
}

module.exports = { seedBoards, refreshJobs, start, jobSettings };
