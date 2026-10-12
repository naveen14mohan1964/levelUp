// Moves the whole 5-month plan by N days: DSA days + weeks, project roadmap steps, and the plan start date
// (which the workout program and timeline count from). Progress is untouched: problem statuses, LeetCode sync data,
// done ticks and their timestamps stay exactly as they are. days.original_date is kept, so the plan's first dates
// stay known. Undo with the opposite number of days.
//
//   node scripts/shift-plan.js --days 7            dry run: shows what would change
//   node scripts/shift-plan.js --days 7 --apply    does it (one transaction)
const { sql, getPool } = require('../server/src/db');

const arg = (name) => { const i = process.argv.indexOf(name); return i === -1 ? null : process.argv[i + 1]; };
const days = Number(arg('--days'));
const apply = process.argv.includes('--apply');

async function summary(pool) {
  const r = await pool.request().query(`
    SELECT CONVERT(char(10), MIN(plan_date), 23) AS first, CONVERT(char(10), MAX(plan_date), 23) AS last FROM dbo.days;
    SELECT CONVERT(char(10), MIN(plan_date), 23) AS first, CONVERT(char(10), MAX(plan_date), 23) AS last FROM dbo.project_tasks;
    SELECT v FROM dbo.settings WHERE k = 'start_date';`);
  return { dsa: r.recordsets[0][0], projects: r.recordsets[1][0], start_date: r.recordsets[2][0]?.v };
}

async function main() {
  if (!Number.isInteger(days) || days === 0 || Math.abs(days) > 366) throw new Error('Pass --days <non-zero whole number>, e.g. --days 7');
  const pool = await getPool();
  console.log('Before:', JSON.stringify(await summary(pool)));
  if (!apply) { console.log(`Dry run: would move everything by ${days} day(s). Add --apply to do it.`); return; }
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const q = (text) => new sql.Request(tx).input('n', sql.Int, days).query(text);
    await q('UPDATE dbo.days SET plan_date = DATEADD(day, @n, plan_date)');
    await q('UPDATE dbo.weeks SET start_date = DATEADD(day, @n, start_date), end_date = DATEADD(day, @n, end_date)');
    await q('UPDATE dbo.project_tasks SET plan_date = DATEADD(day, @n, plan_date)');
    await q(`UPDATE dbo.settings SET v = CONVERT(char(10), DATEADD(day, @n, TRY_CONVERT(date, v)), 23) WHERE k = 'start_date'`);
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
  console.log('After: ', JSON.stringify(await summary(pool)));
}

main().then(() => process.exit(0), (e) => { console.error(e.message); process.exit(1); });
