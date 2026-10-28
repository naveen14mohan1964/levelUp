// 2026-10-28: the .NET / React / Node.js tracks become from-scratch courses instead of three apps to build.
// After STUDY_PLAN.md §7 is rewritten and `npm run plan:build` regenerated plan.json, this updates the existing rows
// IN PLACE (matched by project, week, day and kind): titles, learn topics, "done when", week titles, and the project
// names/descriptions/stacks. Dates, ticks, notes and "built from scratch" stay exactly as they are.
// The daily lesson briefs and each week's objective/level/deliverable are refreshed by `npm run db:setup` afterwards.
//
//   node scripts/apply-courses.js           dry run
//   node scripts/apply-courses.js --apply   one transaction
const fs = require('fs');
const path = require('path');
const { sql, getPool } = require('../server/src/db');

const apply = process.argv.includes('--apply');
const plan = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'server', 'data', 'plan.json'), 'utf8'));
const CODES = ['jobhunt-api', 'jobhunt-web', 'snippetvault', 'portfolio'];

async function main() {
  const pool = await getPool();
  const projects = plan.projects.filter((p) => CODES.includes(p.code));
  let matched = 0;
  const unmatched = [];
  const tx = apply ? new sql.Transaction(pool) : null;
  if (tx) await tx.begin();
  const req = () => (tx ? new sql.Request(tx) : pool.request());
  try {
    for (const p of projects) {
      if (apply) {
        await req().input('code', sql.NVarChar, p.code).input('name', sql.NVarChar, p.name).input('desc', sql.NVarChar, p.description || '')
          .input('stack', sql.NVarChar, JSON.stringify(p.stack || []))
          .query('UPDATE dbo.projects SET name = @name, description = @desc, stack = @stack WHERE code = @code');
      }
      for (const t of p.tasks) {
        const r = await req()
          .input('code', sql.NVarChar, p.code).input('week', sql.Int, t.week).input('dow', sql.TinyInt, t.dow).input('kind', sql.NVarChar, t.kind)
          .input('title', sql.NVarChar, t.title).input('learn', sql.NVarChar, t.learn || null).input('wt', sql.NVarChar, t.weekTitle)
          .input('dw', sql.NVarChar, t.doneWhen || null)
          .query(apply
            ? `UPDATE dbo.project_tasks SET title = @title, learn = @learn, week_title = @wt, done_when = @dw
               WHERE project_code = @code AND week_no = @week AND kind = @kind AND (kind = 'checkpoint' OR day_index = @dow)`
            : `SELECT COUNT(*) AS n FROM dbo.project_tasks
               WHERE project_code = @code AND week_no = @week AND kind = @kind AND (kind = 'checkpoint' OR day_index = @dow)`);
        const n = apply ? r.rowsAffected[0] : r.recordset[0].n;
        if (n === 1) matched++;
        else unmatched.push(`${p.code} W${t.week} d${t.dow} ${t.kind} (${n} rows)`);
      }
    }
    if (unmatched.length) throw new Error(`Rows that don't match exactly one task (nothing changed):\n  ${unmatched.join('\n  ')}`);
    if (tx) await tx.commit();
  } catch (e) {
    if (tx) await tx.rollback();
    throw e;
  }
  console.log(`${apply ? 'Updated' : 'Would update'} ${matched} tasks in ${projects.map((p) => `${p.code} (${p.name})`).join(', ')}.`);
  if (!apply) console.log('Dry run. Add --apply to do it.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
