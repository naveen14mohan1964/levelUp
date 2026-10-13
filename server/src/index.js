const { getPool, SERVER, DB_NAME } = require('./db');
const app = require('./app');

// LeetCode only exposes your ~20 most recent accepted submissions, so sync on startup and every 30 minutes.
function startLeetCodeAutoSync() {
  const { syncLeetCode } = require('./leetcode');
  const run = () => syncLeetCode()
    .then((r) => !r.skipped && (r.newlySolved.length || r.added.length) &&
      console.log(`LeetCode sync: ${r.newlySolved.length} plan problems ticked, ${r.added.length} extra added`))
    .catch((e) => console.warn('LeetCode sync failed:', e.message));
  run();
  setInterval(run, 30 * 60 * 1000).unref();
}

const PORT = Number(process.env.PORT) || 4001;
getPool()
  .then(async (pool) => {
    await require('./progress').linkProblemTasks(pool); // DSA tasks follow their problems (idempotent)
    app.listen(PORT, () => console.log(`DSA Tracker API on http://localhost:${PORT}  (SQL Server ${SERVER} / ${DB_NAME})`));
    // Background jobs run only in the always-on app (PM2). The dev server passes --no-jobs so
    // nothing is synced or published twice while both are running against the same database.
    if (process.argv.includes('--no-jobs') || process.env.LEVELUP_NO_JOBS === '1') {
      console.log('Background jobs disabled (--no-jobs): the always-on app on port 4000 runs them.');
      return;
    }
    startLeetCodeAutoSync();
    require('./linkedin/runner').start(); // LinkedIn job queue: scheduled posts, retries, audit log
    require('./telegram/runner').start(); // Telegram meal bot: photos/texts from your phone -> meals
    require('./referrals/jobs-store').start(); // Jobs feed: target companies' public job boards, daily
    require('./ai/feeds').start(); // AI news: official AI blogs' RSS feeds, daily
    require('./checkin/runner').start(); // the Mentor: end-of-day check-in + morning message
  })
  .catch((err) => {
    console.error('Could not connect to SQL Server:', err.message);
    console.error('Run "npm run db:setup" first and check server/.env');
    process.exit(1);
  });
