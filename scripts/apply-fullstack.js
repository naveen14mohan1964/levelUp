// 2026-11-18: the separate .NET (JobHunt API) and React (JobHunt Web) courses become ONE full-stack course,
// built feature by feature (scripts/fullstack-course.js). Run after `npm run plan:build`.
//
// In one transaction:
//   - the old two projects get area 'archived': hidden everywhere, every row and tick kept (nothing is deleted)
//   - the portfolio week moves to the full-stack area
//   - the full-stack project, its 21 weeks and 126 lessons are added, dated from your current plan start
//     (lesson + practice + done-when + links + daily brief), or refreshed in place if they already exist (ticks kept)
//   - active tracks: dotnet / react become fullstack
//
//   node scripts/apply-fullstack.js           dry run: shows what would change
//   node scripts/apply-fullstack.js --apply   does it
const fs = require('fs');
const path = require('path');
const { sql, getPool, DB_NAME } = require('../server/src/db');
const { CODE, REPLACES, briefKey } = require('./fullstack-course');

const apply = process.argv.includes('--apply');
const plan = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'server', 'data', 'plan.json'), 'utf8'));
const project = plan.projects.find((p) => p.code === CODE);
const briefs = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'server', 'data', 'briefs', `${CODE}.json`), 'utf8'));
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function main() {
  if (!project) throw new Error(`plan.json has no ${CODE} project: run npm run plan:build first`);
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT v FROM dbo.settings WHERE k = 'start_date';
    SELECT v FROM dbo.settings WHERE k = 'active_tracks';
    SELECT code, area FROM dbo.projects;
    SELECT project_code, COUNT(*) AS n, SUM(CAST(done AS int)) AS done FROM dbo.project_tasks GROUP BY project_code;`);
  const start = r.recordsets[0][0]?.v;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '')) throw new Error('settings.start_date is missing');
  const active = String(r.recordsets[1][0]?.v || 'dsa,dotnet').split(',').filter(Boolean);
  const newActive = [...new Set(active.map((k) => (k === 'dotnet' || k === 'react' ? 'fullstack' : k)))];
  const existing = r.recordsets[2];
  const counts = Object.fromEntries(r.recordsets[3].map((x) => [x.project_code, x]));
  const exists = existing.some((p) => p.code === CODE);

  console.log(`Database: ${DB_NAME} · plan starts ${start}`);
  console.log(`Archive (hidden, kept): ${REPLACES.map((c) => `${c} (${counts[c]?.n || 0} lessons, ${counts[c]?.done || 0} ticked)`).join(', ')}`);
  console.log(`${exists ? 'Refresh' : 'Add'}: ${project.name}, ${project.weeks.length} weeks, ${project.tasks.length} lessons, ${Object.keys(briefs).length} daily briefs, ${addDays(start, 0)} → ${addDays(start, 20 * 7 + 4)}`);
  console.log(`Active tracks: ${active.join(',')} → ${newActive.join(',')}`);
  if (!apply) { console.log('Dry run. Add --apply to do it.'); return; }

  // two lessons a day need the lane column (same statement as schema.sql; a no-op when it exists)
  await pool.request().query("IF COL_LENGTH('dbo.project_tasks', 'lane') IS NULL ALTER TABLE dbo.project_tasks ADD lane NVARCHAR(10) NULL;");
  const tx = new sql.Transaction(pool);
  await tx.begin();
  const q = () => new sql.Request(tx);
  try {
    await q().query(`UPDATE dbo.projects SET area = 'archived' WHERE code IN (${REPLACES.map((c) => `'${c}'`).join(',')})`);
    await q().input('area', sql.NVarChar, project.area).query("UPDATE dbo.projects SET area = @area WHERE code = 'portfolio'");
    await q().input('code', sql.NVarChar, CODE).input('area', sql.NVarChar, project.area).input('name', sql.NVarChar, project.name)
      .input('desc', sql.NVarChar, project.description).input('stack', sql.NVarChar(sql.MAX), JSON.stringify(project.stack))
      .input('res', sql.NVarChar(sql.MAX), JSON.stringify(project.resources)).query(`
        IF EXISTS (SELECT 1 FROM dbo.projects WHERE code = @code)
          UPDATE dbo.projects SET area = @area, name = @name, description = @desc, stack = @stack, resources = @res, sort_order = 0 WHERE code = @code
        ELSE INSERT INTO dbo.projects (code, area, name, description, stack, resources, sort_order) VALUES (@code, @area, @name, @desc, @stack, @res, 0);
        UPDATE dbo.projects SET sort_order = CASE code WHEN 'portfolio' THEN 1 WHEN 'snippetvault' THEN 2 ELSE sort_order END WHERE code <> @code;`);
    for (const w of project.weeks) {
      await q().input('code', sql.NVarChar, CODE).input('week', sql.Int, w.week).input('title', sql.NVarChar, w.title)
        .input('obj', sql.NVarChar, w.objective).input('lvl', sql.NVarChar, w.level).input('del', sql.NVarChar, w.deliverable).query(`
          MERGE dbo.project_weeks AS d USING (SELECT @code AS c, @week AS w) AS s ON d.project_code = s.c AND d.week_no = s.w
          WHEN MATCHED THEN UPDATE SET title = @title, objective = @obj, level = @lvl, deliverable = @del
          WHEN NOT MATCHED THEN INSERT (project_code, week_no, title, objective, level, deliverable) VALUES (@code, @week, @title, @obj, @lvl, @del);`);
    }
    for (const t of project.tasks) {
      const brief = briefs[briefKey(t)] || null;
      await q().input('code', sql.NVarChar, CODE).input('week', sql.Int, t.week).input('wt', sql.NVarChar, t.weekTitle)
        .input('dow', sql.TinyInt, t.dow).input('date', sql.Date, addDays(start, (t.week - 1) * 7 + t.dow))
        .input('title', sql.NVarChar, t.title).input('kind', sql.NVarChar, t.kind).input('lane', sql.NVarChar, t.lane || null)
        .input('learn', sql.NVarChar, t.learn || null)
        .input('dw', sql.NVarChar, t.doneWhen || null).input('links', sql.NVarChar(sql.MAX), JSON.stringify(t.learnLinks || []))
        .input('brief', sql.NVarChar(sql.MAX), brief).query(`
          IF EXISTS (SELECT 1 FROM dbo.project_tasks WHERE project_code = @code AND week_no = @week AND day_index = @dow AND kind = @kind AND ISNULL(lane, '') = ISNULL(@lane, ''))
            UPDATE dbo.project_tasks SET week_title = @wt, title = @title, learn = @learn, done_when = @dw, learn_links = @links, brief = @brief
            WHERE project_code = @code AND week_no = @week AND day_index = @dow AND kind = @kind AND ISNULL(lane, '') = ISNULL(@lane, '')
          ELSE INSERT INTO dbo.project_tasks (project_code, week_no, week_title, day_index, plan_date, title, kind, lane, learn, done_when, learn_links, brief)
            VALUES (@code, @week, @wt, @dow, @date, @title, @kind, @lane, @learn, @dw, @links, @brief);`);
    }
    await q().input('v', sql.NVarChar, newActive.join(',')).query(`
      MERGE dbo.settings AS t USING (SELECT 'active_tracks' AS k) AS s ON t.k = s.k
      WHEN MATCHED THEN UPDATE SET v = @v WHEN NOT MATCHED THEN INSERT (k, v) VALUES ('active_tracks', @v);`);
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
  const after = await pool.request().input('code', sql.NVarChar, CODE).query(`
    SELECT COUNT(*) AS n, SUM(CASE WHEN brief IS NOT NULL THEN 1 ELSE 0 END) AS briefs,
      CONVERT(char(10), MIN(plan_date), 23) AS first, CONVERT(char(10), MAX(plan_date), 23) AS last FROM dbo.project_tasks WHERE project_code = @code`);
  console.log('Done:', JSON.stringify(after.recordset[0]));
}

main().then(() => process.exit(0), (e) => { console.error(e.message); process.exit(1); });
