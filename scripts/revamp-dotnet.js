// 2026-10-26: the .NET track becomes 14 weekly assignments (basic → advanced) and the order becomes
// .NET (weeks 1–14) → React (15–21) → wrap-up (22) → Node (23–28, after the 5-month plan).
// Replaces the old 8-week .NET tasks with the new ones from plan.json (refuses if any of them has progress),
// moves Node by +14 weeks, and fixes the project order. React and the wrap-up are untouched. Run once.
//
//   node scripts/revamp-dotnet.js           dry run
//   node scripts/revamp-dotnet.js --apply   one transaction
const fs = require('fs');
const path = require('path');
const { sql, getPool } = require('../server/src/db');

const apply = process.argv.includes('--apply');
const plan = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'server', 'data', 'plan.json'), 'utf8'));
const dotnet = plan.projects.find((p) => p.code === 'jobhunt-api');
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function main() {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT v FROM dbo.settings WHERE k = 'start_date';
    SELECT COUNT(*) AS n, SUM(CAST(done AS int)) AS done, SUM(CAST(ISNULL(learn_done, 0) AS int)) AS learnDone,
           SUM(CASE WHEN notes IS NULL OR notes = '' THEN 0 ELSE 1 END) AS notes, MAX(week_no) AS lastWeek
    FROM dbo.project_tasks WHERE project_code = 'jobhunt-api';
    SELECT MIN(week_no) AS first FROM dbo.project_tasks WHERE project_code = 'snippetvault';`);
  const start = r.recordsets[0][0]?.v;
  const old = r.recordsets[1][0];
  const nodeFirst = r.recordsets[2][0].first;
  console.log(`Plan start ${start} · current .NET tasks ${old.n} (weeks 1–${old.lastWeek}), progress: done ${old.done}, learned ${old.learnDone}, notes ${old.notes} · Node starts week ${nodeFirst}`);
  if (old.lastWeek >= 14 && nodeFirst >= 23) { console.log('Already revamped: nothing to do.'); return; }
  if (old.done || old.learnDone || old.notes) throw new Error('Some .NET tasks have progress: not replacing them automatically.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '')) throw new Error('No start_date setting.');
  const rows = dotnet.tasks.map((t) => ({ ...t, date: addDays(start, (t.week - 1) * 7 + t.dow) }));
  console.log(`New .NET tasks: ${rows.length} (${rows[0].date} → ${rows.at(-1).date}); Node moves +14 weeks (+98 days).`);
  if (!apply) { console.log('Dry run. Add --apply to do it.'); return; }

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx).query("DELETE FROM dbo.project_tasks WHERE project_code = 'jobhunt-api'");
    for (const t of rows) {
      await new sql.Request(tx)
        .input('week', sql.Int, t.week).input('wt', sql.NVarChar, t.weekTitle).input('dow', sql.TinyInt, t.dow).input('date', sql.Date, t.date)
        .input('title', sql.NVarChar, t.title).input('kind', sql.NVarChar, t.kind).input('learn', sql.NVarChar, t.learn || null)
        .input('dw', sql.NVarChar, t.doneWhen || null).input('links', sql.NVarChar(sql.MAX), JSON.stringify(t.learnLinks || []))
        .query(`INSERT INTO dbo.project_tasks (project_code, week_no, week_title, day_index, plan_date, title, kind, learn, done_when, learn_links)
                VALUES ('jobhunt-api', @week, @wt, @dow, @date, @title, @kind, @learn, @dw, @links)`);
    }
    // db:setup run before this script saw Node at weeks 23–28 in plan.json and added empty checkpoints there;
    // drop those (untouched ones only) before moving the real Node weeks 9–14 to 23–28
    await new sql.Request(tx).query(`DELETE FROM dbo.project_tasks WHERE project_code = 'snippetvault' AND week_no >= 23
                                     AND kind = 'checkpoint' AND done = 0 AND (notes IS NULL OR notes = '')`);
    await new sql.Request(tx).query("UPDATE dbo.project_tasks SET week_no = week_no + 14, plan_date = DATEADD(day, 98, plan_date) WHERE project_code = 'snippetvault'");
    await new sql.Request(tx).query(`UPDATE dbo.projects SET sort_order = CASE code WHEN 'jobhunt-api' THEN 0 WHEN 'jobhunt-web' THEN 1 WHEN 'snippetvault' THEN 2 WHEN 'portfolio' THEN 3 ELSE sort_order END`);
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
  const after = await pool.request().query(`
    SELECT project_code AS code, MIN(week_no) AS fromWeek, MAX(week_no) AS toWeek, COUNT(*) AS tasks,
           CONVERT(char(10), MIN(plan_date), 23) AS first, CONVERT(char(10), MAX(plan_date), 23) AS last, SUM(CAST(ISNULL(learn_done, 0) AS int)) AS learnDone
    FROM dbo.project_tasks GROUP BY project_code ORDER BY MIN(week_no)`);
  console.table(after.recordset);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
