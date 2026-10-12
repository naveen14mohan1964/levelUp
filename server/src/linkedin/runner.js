// LinkedIn module · the job runner. Every automated LinkedIn action goes through here:
// queue → (kill switch? due? missed?) → claim atomically → run → done / retry with backoff / failed, all audited.
const { sql, getPool } = require('../db');
const { decideJob, afterFailure } = require('./scheduler');
const { liSettings, audit, getPost, updatePost } = require('./store');
const mcp = require('./mcp-client');

let busy = false;

/** Job handlers. `publisher` is injectable so tests never touch LinkedIn. */
const HANDLERS = {
  async publish_post(job, { publisher }) {
    const post = await getPost(job.ref_id);
    if (!post || post.status !== 'scheduled') return { cancelled: `post is ${post ? post.status : 'deleted'}` };
    const { urn, url } = await publisher.publish(post);
    await updatePost(post.id, { status: 'posted', posted_ms: Date.now(), post_urn: urn, post_url: url, error: null });
    await audit('scheduler', 'post_published', 'post', post.id, url || urn);
    return { done: url || urn };
  },
};

async function setJob(id, fields) {
  const pool = await getPool();
  await pool.request().input('id', sql.Int, id).input('status', sql.NVarChar, fields.status)
    .input('run', sql.BigInt, fields.run_ms ?? null).input('err', sql.NVarChar, fields.last_error ?? null).input('now', sql.BigInt, Date.now())
    .query('UPDATE dbo.li_jobs SET status = @status, run_ms = COALESCE(@run, run_ms), last_error = @err, updated_ms = @now WHERE id = @id');
}

/** What the job was for, so a failure shows up on the thing you look at (e.g. the post card). */
async function markRefFailed(job, message) {
  if (job.type === 'publish_post') await updatePost(job.ref_id, { status: 'failed', error: message.slice(0, 1000) });
}

/**
 * Processes every due job once. Safe to call often (it's a no-op while a previous tick is running).
 * Returns a summary for logs/tests.
 */
async function tick({ now = Date.now(), publisher = mcp } = {}) {
  if (busy) return { skipped: 'busy' };
  busy = true;
  const summary = { ran: 0, done: 0, retried: 0, failed: 0, missed: 0, cancelled: 0, paused: false };
  try {
    const settings = await liSettings();
    const pool = await getPool();
    const { recordset: jobs } = await pool.request().query(`
      SELECT CAST(id AS int) AS id, type, CAST(ref_id AS int) AS ref_id, run_ms, attempts, max_attempts
      FROM dbo.li_jobs WHERE status = 'queued' ORDER BY run_ms, id`);

    for (const raw of jobs) {
      const job = { ...raw, run_ms: Number(raw.run_ms) };
      const decision = decideJob(job, now, { paused: settings.li_paused });
      if (decision === 'paused') {
        summary.paused = true;
        break;
      }
      if (decision === 'wait') continue;
      if (decision === 'missed') {
        await setJob(job.id, { status: 'failed', last_error: 'missed' });
        await markRefFailed(job, 'Missed its slot by more than 12 hours (the app wasn\'t running). Reschedule it or publish now.');
        await audit('scheduler', 'job_missed', job.type, job.ref_id);
        summary.missed++;
        continue;
      }

      // Claim atomically: only one runner can move a job from queued → running.
      const claim = await pool.request().input('id', sql.Int, job.id).input('now', sql.BigInt, Date.now())
        .query("UPDATE dbo.li_jobs SET status = 'running', attempts = attempts + 1, updated_ms = @now WHERE id = @id AND status = 'queued'");
      if (!claim.rowsAffected[0]) continue;
      job.attempts += 1;
      summary.ran++;

      try {
        const handler = HANDLERS[job.type];
        if (!handler) throw new Error(`Unknown job type ${job.type}`);
        const result = await handler(job, { publisher });
        if (result.cancelled) {
          await setJob(job.id, { status: 'cancelled', last_error: result.cancelled });
          summary.cancelled++;
        } else {
          await setJob(job.id, { status: 'done' });
          summary.done++;
        }
      } catch (err) {
        const next = afterFailure(job, err.message, Date.now());
        await setJob(job.id, { status: next.status, run_ms: next.run_ms, last_error: err.message.slice(0, 1000) });
        await audit('scheduler', next.status === 'queued' ? 'job_retry_scheduled' : 'job_failed', job.type, job.ref_id,
          `attempt ${job.attempts}/${job.max_attempts} (${next.kind}): ${err.message}`);
        if (next.status === 'failed') {
          await markRefFailed(job, err.message);
          summary.failed++;
        } else {
          summary.retried++;
        }
      }
    }
  } finally {
    busy = false;
  }
  return summary;
}

/**
 * On startup, jobs left "running" mean the app stopped mid-action. We can't know whether LinkedIn
 * received the post, so never retry blindly: mark them failed and ask you to check.
 */
async function recoverInterrupted() {
  const pool = await getPool();
  const { recordset } = await pool.request().input('now', sql.BigInt, Date.now()).query(`
    UPDATE dbo.li_jobs SET status = 'failed', last_error = 'interrupted', updated_ms = @now
    OUTPUT CAST(INSERTED.ref_id AS int) AS ref_id, INSERTED.type
    WHERE status = 'running'`);
  for (const j of recordset) {
    await markRefFailed(j, 'Interrupted while publishing (the app stopped). Check your LinkedIn profile before retrying.');
    await audit('scheduler', 'job_interrupted', j.type, j.ref_id);
  }
  return recordset.length;
}

/** Starts the background loop (every minute). Called from index.js. */
function start({ intervalMs = 60_000 } = {}) {
  recoverInterrupted()
    .then(() => tick())
    .catch((e) => console.warn('LinkedIn scheduler:', e.message));
  setInterval(() => tick().catch((e) => console.warn('LinkedIn scheduler:', e.message)), intervalMs).unref();
}

module.exports = { tick, recoverInterrupted, start, HANDLERS };
