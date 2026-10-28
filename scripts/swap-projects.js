// .NET first (2026-10-26: the user's company assigned a .NET course): JobHunt API moves from weeks 7–14 to 1–8 and
// SnippetVault (Node) from weeks 1–6 to 9–14. React (15–21) and the wrap-up (22) stay. Dates move with the weeks
// (−42 / +56 days); progress (done, learn_done and their timestamps) is untouched. Run once.
//
//   node scripts/swap-projects.js           dry run: shows what would change
//   node scripts/swap-projects.js --apply   does it (one transaction)
const { sql, getPool } = require('../server/src/db');

const apply = process.argv.includes('--apply');

async function summary(pool) {
  const r = await pool.request().query(`
    SELECT project_code AS code, MIN(week_no) AS fromWeek, MAX(week_no) AS toWeek,
           CONVERT(char(10), MIN(plan_date), 23) AS first, CONVERT(char(10), MAX(plan_date), 23) AS last,
           SUM(CAST(done AS int)) AS done, SUM(CAST(ISNULL(learn_done, 0) AS int)) AS learnDone
    FROM dbo.project_tasks GROUP BY project_code ORDER BY MIN(week_no);
    SELECT code, sort_order FROM dbo.projects ORDER BY sort_order;`);
  return { tasks: r.recordsets[0], order: r.recordsets[1] };
}

async function main() {
  const pool = await getPool();
  const before = await summary(pool);
  console.log('Before:'); console.table(before.tasks);
  const api = before.tasks.find((t) => t.code === 'jobhunt-api');
  if (api && api.fromWeek === 1) { console.log('.NET is already first: nothing to do.'); return; }
  if (!apply) { console.log('Dry run: .NET weeks 7–14 → 1–8 (−42 days), Node weeks 1–6 → 9–14 (+56 days). Add --apply to do it.'); return; }
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const q = (text) => new sql.Request(tx).query(text);
    await q(`UPDATE dbo.project_tasks SET week_no = week_no - 6, plan_date = DATEADD(day, -42, plan_date) WHERE project_code = 'jobhunt-api'`);
    await q(`UPDATE dbo.project_tasks SET week_no = week_no + 8, plan_date = DATEADD(day, 56, plan_date) WHERE project_code = 'snippetvault'`);
    await q(`UPDATE dbo.project_tasks SET week_title = RTRIM(REPLACE(week_title, '(holiday week)', '')) WHERE week_title LIKE '%(holiday week)%'`);
    await q(`UPDATE dbo.projects SET sort_order = CASE code WHEN 'jobhunt-api' THEN 0 WHEN 'snippetvault' THEN 1 ELSE sort_order END`);
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
  const after = await summary(pool);
  console.log('After:'); console.table(after.tasks);
  console.log('Order:', after.order.map((o) => `${o.code}=${o.sort_order}`).join(' '));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
