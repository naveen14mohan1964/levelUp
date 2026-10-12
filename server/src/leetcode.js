// LeetCode auto-sync via LeetCode's public GraphQL endpoint (the one leetcode.com itself uses).
// It only exposes your *recent* accepted submissions (~last 20), so we sync often instead of in bulk.
// Not available publicly: time taken and failed attempts. Those stay as quick inputs in the app.
const { sql, getPool } = require('./db');
const { linkProblemTasks } = require('./progress');

const ENDPOINT = 'https://leetcode.com/graphql';

async function gql(query, variables) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Referer: 'https://leetcode.com',
      'User-Agent': 'Mozilla/5.0 (personal DSA tracker)',
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`LeetCode responded ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

async function fetchProfile(username) {
  const data = await gql(
    `query ($u: String!) { matchedUser(username: $u) { username submitStatsGlobal { acSubmissionNum { difficulty count } } } }`,
    { u: username },
  ).catch((e) => {
    if (/does not exist/i.test(e.message)) return { matchedUser: null };
    throw e;
  });
  if (!data.matchedUser) return null;
  const counts = Object.fromEntries(data.matchedUser.submitStatsGlobal.acSubmissionNum.map((x) => [x.difficulty, x.count]));
  return { username: data.matchedUser.username, solved: counts };
}

async function fetchRecentAccepted(username, limit = 20) {
  const data = await gql(
    `query ($u: String!, $l: Int!) { recentAcSubmissionList(username: $u, limit: $l) { title titleSlug timestamp } }`,
    { u: username, l: limit },
  );
  return data.recentAcSubmissionList || [];
}

async function fetchQuestion(slug) {
  const data = await gql(
    `query ($s: String!) { question(titleSlug: $s) { questionFrontendId title difficulty topicTags { name } } }`,
    { s: slug },
  );
  return data.question;
}

const DIFF = { Easy: 'E', Medium: 'M', Hard: 'H' };

async function setSetting(pool, k, v) {
  await pool.request().input('k', sql.NVarChar, k).input('v', sql.NVarChar, v).query(`
    MERGE dbo.settings AS t USING (SELECT @k AS k) AS s ON t.k = s.k
    WHEN MATCHED THEN UPDATE SET v = @v WHEN NOT MATCHED THEN INSERT (k, v) VALUES (@k, @v);`);
}

/** Pulls recent accepted submissions and ticks the matching problems. Returns a summary. */
async function syncLeetCode() {
  const pool = await getPool();
  const s = await pool.request().query(`SELECT v FROM dbo.settings WHERE k = 'leetcode_username'`);
  const username = (s.recordset[0]?.v || '').trim();
  if (!username) return { skipped: true, reason: 'No LeetCode username set (Settings page).' };

  const recent = await fetchRecentAccepted(username);
  const newlySolved = [];
  const added = [];

  for (const sub of recent) {
    const solvedAt = new Date(Number(sub.timestamp) * 1000);
    const found = await pool.request().input('slug', sql.NVarChar, sub.titleSlug)
      .query(`SELECT TOP 1 CAST(id AS int) AS id, title, status FROM dbo.problems WHERE slug = @slug ORDER BY id`);
    const p = found.recordset[0];

    if (p) {
      if (p.status !== 'todo') continue; // already tracked; reviews are logged in the app with a confidence rating
      await pool.request().input('id', sql.Int, p.id).input('at', sql.DateTime2, solvedAt).query(`
        UPDATE dbo.problems SET status = 'solved', auto_synced = 1, solved_at = @at,
          attempts = CASE WHEN attempts = 0 THEN 1 ELSE attempts END, updated_at = SYSUTCDATETIME()
        WHERE id = @id`);
      newlySolved.push({ id: p.id, title: p.title });
    } else {
      // Solved something outside the plan: add it so it still counts and enters spaced repetition.
      const q = await fetchQuestion(sub.titleSlug).catch(() => null);
      const r = await pool.request()
        .input('num', sql.Int, q ? Number(q.questionFrontendId) || null : null)
        .input('title', sql.NVarChar, q?.title || sub.title)
        .input('url', sql.NVarChar, `https://leetcode.com/problems/${sub.titleSlug}/`)
        .input('slug', sql.NVarChar, sub.titleSlug)
        .input('diff', sql.Char(1), DIFF[q?.difficulty] || 'M')
        .input('topic', sql.NVarChar, q?.topicTags?.[0]?.name || 'Other')
        .input('at', sql.DateTime2, solvedAt)
        .query(`INSERT INTO dbo.problems (source, lc_number, title, url, slug, difficulty, topic, status, attempts, auto_synced, solved_at)
                OUTPUT CAST(INSERTED.id AS int) AS id
                VALUES ('LeetCode', @num, @title, @url, @slug, @diff, @topic, 'solved', 1, 1, @at)`);
      added.push({ id: r.recordset[0].id, title: q?.title || sub.title });
    }
  }

  // Tick each day's "LeetCode block" / self-test task once all of its problems are solved.
  const tasksTicked = newlySolved.length ? await linkProblemTasks(pool) : 0;
  const summary = { username, checkedAt: new Date().toISOString(), checked: recent.length, newlySolved, added, tasksTicked };
  await setSetting(pool, 'leetcode_last_sync', JSON.stringify(summary));
  return summary;
}

module.exports = { fetchProfile, syncLeetCode };
