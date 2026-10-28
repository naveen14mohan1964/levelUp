// Creates the database (if missing), applies schema.sql, and seeds the study plan.
// Usage: node src/setup-db.js           -> create + seed only if empty
//        node src/setup-db.js --reset   -> DELETE all data and re-seed from data/plan.json
const fs = require('fs');
const path = require('path');
const { sql, getPool, poolConfig, DB_NAME, SERVER } = require('./db');


async function createDatabase() {
  const master = await new sql.ConnectionPool(poolConfig('master')).connect();
  await master.request().input('name', sql.NVarChar, DB_NAME).query(`
    IF DB_ID(@name) IS NULL EXEC('CREATE DATABASE [' + @name + ']')`);
  await master.close();
}

async function applySchema(pool) {
  const script = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  for (const batch of script.split(/^\s*GO\s*$/m).map((s) => s.trim()).filter(Boolean)) {
    await pool.request().batch(batch);
  }
}

async function wipe(pool) {
  await pool.request().batch(`
    DELETE FROM dbo.li_stages; DELETE FROM dbo.li_jobs; DELETE FROM dbo.li_posts; DELETE FROM dbo.li_audit;
    DELETE FROM dbo.focus_sessions; DELETE FROM dbo.streak_freezes; DELETE FROM dbo.game_seen; DELETE FROM dbo.dev_snapshots;
    DELETE FROM dbo.mentor_evaluations; DELETE FROM dbo.mentor_outbox; DELETE FROM dbo.mentor_commitments; DELETE FROM dbo.streak_shields; DELETE FROM dbo.rest_days; DELETE FROM dbo.flashcards; DELETE FROM dbo.flashcard_reviews; DELETE FROM dbo.pattern_picks; DELETE FROM dbo.hld_drills; DELETE FROM dbo.assignment_progress;
    DELETE FROM dbo.learn_progress; DELETE FROM dbo.ai_progress; DELETE FROM dbo.ai_news; DELETE FROM dbo.ref_jobs; DELETE FROM dbo.ref_history; DELETE FROM dbo.ref_pursuits; DELETE FROM dbo.ref_notes; DELETE FROM dbo.ref_imports; DELETE FROM dbo.ref_companies;
    DELETE FROM dbo.li_actions; DELETE FROM dbo.li_contacts; DELETE FROM dbo.li_lists;
    DELETE FROM dbo.mentor_messages; DELETE FROM dbo.tg_inbox; DELETE FROM dbo.meals; DELETE FROM dbo.body_log;
    DELETE FROM dbo.workout_log; DELETE FROM dbo.progress_photos;
    DELETE FROM dbo.project_tasks; DELETE FROM dbo.project_weeks; DELETE FROM dbo.projects;
    DELETE FROM dbo.review_log; DELETE FROM dbo.problems; DELETE FROM dbo.tasks;
    DELETE FROM dbo.days; DELETE FROM dbo.weeks; DELETE FROM dbo.settings; DELETE FROM dbo.study_log;
    DBCC CHECKIDENT ('dbo.days', RESEED, 0) WITH NO_INFOMSGS;
    DBCC CHECKIDENT ('dbo.tasks', RESEED, 0) WITH NO_INFOMSGS;
    DBCC CHECKIDENT ('dbo.problems', RESEED, 0) WITH NO_INFOMSGS;
    DBCC CHECKIDENT ('dbo.review_log', RESEED, 0) WITH NO_INFOMSGS;
    DBCC CHECKIDENT ('dbo.project_tasks', RESEED, 0) WITH NO_INFOMSGS;`);
}

const loadPlan = () => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'plan.json'), 'utf8'));
const loadBriefs = (code) => {
  const file = path.join(__dirname, '..', 'data', 'briefs', `${code}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
};

async function seed(pool) {
  const plan = loadPlan();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx)
      .input('start', sql.NVarChar, plan.startDate)
      .query(`INSERT INTO dbo.settings (k, v) VALUES ('start_date', @start)`);

    for (const w of plan.weeks) {
      await new sql.Request(tx)
        .input('week_no', sql.Int, w.week)
        .input('phase', sql.TinyInt, w.phase)
        .input('title', sql.NVarChar, w.title)
        .input('start', sql.Date, w.startDate)
        .input('end', sql.Date, w.endDate)
        .input('resources', sql.NVarChar(sql.MAX), w.resources)
        .input('kc', sql.NVarChar(sql.MAX), JSON.stringify(w.keyConcepts))
        .input('milestone', sql.NVarChar(sql.MAX), w.milestone)
        .query(`INSERT INTO dbo.weeks (week_no, phase, title, start_date, end_date, resources, key_concepts, milestone)
                VALUES (@week_no, @phase, @title, @start, @end, @resources, @kc, @milestone)`);
    }

    for (const d of plan.days) {
      const r = await new sql.Request(tx)
        .input('week_no', sql.Int, d.week)
        .input('dow', sql.TinyInt, d.dow)
        .input('date', sql.Date, d.date)
        .input('type', sql.NVarChar, d.type)
        .input('focus', sql.NVarChar, d.focus)
        .input('topic', sql.NVarChar, d.topic)
        .query(`INSERT INTO dbo.days (week_no, day_index, original_date, plan_date, day_type, focus, topic)
                OUTPUT INSERTED.id VALUES (@week_no, @dow, @date, @date, @type, @focus, @topic)`);
      const dayId = r.recordset[0].id;

      for (const [i, t] of d.tasks.entries()) {
        await new sql.Request(tx)
          .input('day', sql.Int, dayId).input('ord', sql.Int, i)
          .input('kind', sql.NVarChar, t.kind).input('title', sql.NVarChar, t.title).input('min', sql.Int, t.minutes)
          .query(`INSERT INTO dbo.tasks (day_id, sort_order, kind, title, minutes) VALUES (@day, @ord, @kind, @title, @min)`);
      }
      for (const [i, p] of d.problems.entries()) {
        await new sql.Request(tx)
          .input('day', sql.Int, dayId).input('ord', sql.Int, i)
          .input('source', sql.NVarChar, p.source).input('num', sql.Int, p.number)
          .input('title', sql.NVarChar, p.title).input('url', sql.NVarChar, p.url)
          .input('diff', sql.Char(1), p.difficulty).input('topic', sql.NVarChar, p.topic)
          .input('stretch', sql.Bit, p.stretch).input('selftest', sql.Bit, p.selftest).input('hint', sql.NVarChar, p.hint)
          .input('slug', sql.NVarChar, /leetcode\.com\/problems\/([^/]+)\//.exec(p.url || '')?.[1] || null)
          .query(`INSERT INTO dbo.problems (day_id, sort_order, source, lc_number, title, url, slug, difficulty, topic, is_stretch, is_selftest, hint)
                  VALUES (@day, @ord, @source, @num, @title, @url, @slug, @diff, @topic, @stretch, @selftest, @hint)`);
      }
    }
    await tx.commit();
    const probs = plan.days.reduce((n, d) => n + d.problems.length, 0);
    console.log(`Seeded ${plan.weeks.length} weeks, ${plan.days.length} days, ${probs} problems.`);
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

async function seedProjects(pool) {
  const { projects } = loadPlan();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    for (const [i, p] of projects.entries()) {
      await new sql.Request(tx)
        .input('code', sql.NVarChar, p.code).input('area', sql.NVarChar, p.area).input('name', sql.NVarChar, p.name)
        .input('desc', sql.NVarChar, p.description).input('stack', sql.NVarChar(sql.MAX), JSON.stringify(p.stack))
        .input('res', sql.NVarChar(sql.MAX), JSON.stringify(p.resources)).input('ord', sql.Int, i)
        .query(`INSERT INTO dbo.projects (code, area, name, description, stack, resources, sort_order)
                VALUES (@code, @area, @name, @desc, @stack, @res, @ord)`);
      for (const t of p.tasks) {
        await new sql.Request(tx)
          .input('code', sql.NVarChar, p.code).input('week', sql.Int, t.week).input('wt', sql.NVarChar, t.weekTitle)
          .input('dow', sql.TinyInt, t.dow).input('date', sql.Date, t.date).input('title', sql.NVarChar, t.title)
          .input('kind', sql.NVarChar, t.kind || 'build').input('learn', sql.NVarChar, t.learn || null).input('dw', sql.NVarChar, t.doneWhen || null)
          .query(`INSERT INTO dbo.project_tasks (project_code, week_no, week_title, day_index, plan_date, title, kind, learn, done_when)
                  VALUES (@code, @week, @wt, @dow, @date, @title, @kind, @learn, @dw)`);
      }
    }
    await tx.commit();
    console.log(`Seeded ${projects.length} projects, ${projects.reduce((n, p) => n + p.tasks.length, 0)} project tasks.`);
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

// Step 4 upgrade for databases seeded before roadmaps existed: fill in learn topics and add
// Friday checkpoints, without touching done/notes/from-scratch progress. Safe to run repeatedly.
async function syncRoadmaps(pool) {
  const { projects } = loadPlan();
  let learn = 0;
  let checkpoints = 0;
  for (const p of projects) {
    for (const t of p.tasks) {
      const req = pool.request()
        .input('code', sql.NVarChar, p.code).input('week', sql.Int, t.week).input('dow', sql.TinyInt, t.dow)
        .input('title', sql.NVarChar, t.title).input('learn', sql.NVarChar, t.learn || null)
        .input('wt', sql.NVarChar, t.weekTitle).input('date', sql.Date, t.date);
      if (t.kind === 'checkpoint') {
        const r = await req.query(`
          IF NOT EXISTS (SELECT 1 FROM dbo.project_tasks WHERE project_code = @code AND week_no = @week AND kind = 'checkpoint')
            INSERT INTO dbo.project_tasks (project_code, week_no, week_title, day_index, plan_date, title, kind)
            VALUES (@code, @week, @wt, @dow, @date, @title, 'checkpoint')`);
        checkpoints += r.rowsAffected.reduce((a, b) => a + b, 0);
      } else if (t.learn) {
        const r = await req.query(`
          UPDATE dbo.project_tasks SET learn = @learn
          WHERE project_code = @code AND week_no = @week AND day_index = @dow AND kind = 'build' AND learn IS NULL`);
        learn += r.rowsAffected.reduce((a, b) => a + b, 0);
      }
    }
  }
  if (learn || checkpoints) console.log(`Roadmaps: added ${learn} learn topics and ${checkpoints} checkpoints.`);
  // assignment details are reference data: always refreshed from plan.json (progress is untouched)
  for (const p of projects) {
    for (const t of p.tasks.filter((x) => x.kind === 'build' && x.doneWhen)) {
      await pool.request().input('code', sql.NVarChar, p.code).input('week', sql.Int, t.week).input('dow', sql.TinyInt, t.dow).input('dw', sql.NVarChar, t.doneWhen)
        .query("UPDATE dbo.project_tasks SET done_when = @dw WHERE project_code = @code AND week_no = @week AND day_index = @dow AND kind = 'build'");
    }
    // detailed daily briefs (Markdown) live beside the plan, one file per project: { "<week>-<dow>-<kind>": "..." }
    const briefs = loadBriefs(p.code);
    for (const [key, md] of Object.entries(briefs)) {
      const [week, dow, kind] = key.split('-');
      await pool.request().input('code', sql.NVarChar, p.code).input('week', sql.Int, Number(week)).input('dow', sql.TinyInt, Number(dow))
        .input('kind', sql.NVarChar, kind).input('brief', sql.NVarChar(sql.MAX), md)
        .query(`UPDATE dbo.project_tasks SET brief = @brief WHERE project_code = @code AND week_no = @week AND kind = @kind
                AND (kind = 'checkpoint' OR day_index = @dow)`);
    }
    for (const w of p.weeks || []) {
      await pool.request().input('code', sql.NVarChar, p.code).input('week', sql.Int, w.week).input('title', sql.NVarChar, w.title)
        .input('obj', sql.NVarChar, w.objective || null).input('lvl', sql.NVarChar, w.level || null).input('del', sql.NVarChar, w.deliverable || null)
        .query(`MERGE dbo.project_weeks AS d USING (SELECT @code AS c, @week AS w) AS s ON d.project_code = s.c AND d.week_no = s.w
                WHEN MATCHED THEN UPDATE SET title = @title, objective = @obj, level = @lvl, deliverable = @del
                WHEN NOT MATCHED THEN INSERT (project_code, week_no, title, objective, level, deliverable) VALUES (@code, @week, @title, @obj, @lvl, @del);`);
    }
  }
}

// LinkedIn posts: AI-forward pillars and real proof points, so drafts read like an experienced engineer (not a beginner diary).
const OLD_PILLARS = [
  { name: "Projects I'm building", hint: 'What I built this week in SnippetVault / JobHunt, a problem I hit and how I solved it' },
  { name: 'DSA journey', hint: 'A pattern I learned, a problem that clicked, honest progress numbers' },
  { name: 'Engineering lessons', hint: 'A practical lesson about clean code, debugging, APIs, testing' },
  { name: 'Career learnings', hint: 'What I am learning about preparing for a job switch, interviews, consistency' },
];
const NEW_PILLARS = [
  { name: 'AI engineering in practice', hint: 'Real lessons from building with LLMs: tool-calling agents and MCP, structured JSON outputs, latency and cost (thinking levels, timeouts, model fallback), quotas, testing LLM code without spending quota, when NOT to use an LLM' },
  { name: 'Building real products', hint: 'Systems I built end-to-end (a LinkedIn MCP server, a jobs feed over the hiring APIs of 70 companies, a Telegram meal bot), the design trade-offs, and the bugs that taught me something' },
  { name: 'Engineering depth', hint: 'Backend and system-design trade-offs, data modelling, matching/dedupe logic, performance, testing strategy, Java/.NET/Node/React specifics' },
  { name: 'Career & growth', hint: 'Honest, useful takes from 2 years in: interview prep and DSA, referrals vs job portals, learning in public, what actually moves a career' },
];
const OLD_INTRO = 'Software engineer (Java, React, .NET, Node) building full-stack projects and preparing for product-company roles';
const NEW_INTRO = 'Software engineer with 2 years of experience in Java, Spring, React, .NET and Node, building AI-powered tools: LLM integrations, an MCP server and data pipelines';
// Things you have genuinely built (DONE): the only achievements posts may cite. Edit on LinkedIn → Settings.
const BUILD_LOG = [
  'Built a personal MCP server in Node.js that lets an AI assistant publish to LinkedIn through the official Posts API, with a preview-then-publish safety lock: a hash of the exact text must match before anything goes live',
  "Cut an LLM feature's response time from about 27 s to about 5.6 s by lowering the model's thinking level, and added a 15 s timeout that falls back to a backup model instead of failing",
  'Built a jobs feed that reads the public hiring APIs of 70 companies (Greenhouse, Lever, Ashby, SmartRecruiters) and filters thousands of postings down to a few hundred relevant roles with an explainable match score',
  'Built a Telegram bot that turns a meal photo into calories and macros with a multimodal LLM; a durable inbox means no photo is lost when the free AI quota runs out',
  'Built a referral tracker that matches my LinkedIn connections to 260 target companies with whole-word name matching (so Intel never matches Intelligent Systems) and detects when a contact changes company',
  'Wrote 160+ automated tests for my side project, including tests that stub the LLM so they never spend real AI quota',
].join('\n');

// Profile + goal defaults: inserted only when missing (so a --reset restores them, and your edits are kept otherwise).
const DEFAULT_SETTINGS = {
  leetcode_username: '', height_cm: '185', start_weight_kg: '115', goal_weight_kg: '80',
  calorie_target: '2050', protein_target_g: '130', water_target_ml: '3250', sleep_target_h: '7',
  // LinkedIn module: the one salary goal (a direct switch, no intermediate rungs)
  li_current_ctc_lpa: '7', li_target_ctc_lpa: '20', li_target_date: '2027-04-30', li_goal_achieved: '0',
  // LinkedIn Phase 2: posting (all editable on the LinkedIn → Settings tab)
  li_paused: '0', // global kill switch
  li_auto_approve: '0', // drafts never post without your approval unless you turn this on
  li_post_slots: JSON.stringify([{ day: 2, time: '08:30' }, { day: 4, time: '08:30' }]), // Tue + Thu (0 = Sun)
  li_pillars: JSON.stringify(NEW_PILLARS),
  li_voice_samples: '',
  li_avoid_employer: '1',
  li_employer_name: '',
  // LinkedIn Phase 3: outreach pacing and safety (editable on LinkedIn → Settings)
  li_daily_cap: '15',
  li_weekly_cap: '80', // LinkedIn's own ceiling is ~100 per rolling 7 days; stay well under it
  li_work_start: '09:00',
  li_work_end: '21:00',
  li_work_days: JSON.stringify([1, 2, 3, 4, 5, 6]), // Mon–Sat (0 = Sun)
  li_delay_min_s: '45',
  li_delay_max_s: '120',
  li_next_send_ms: '0',
  li_outreach_cooldown_until: '0',
  li_premium: '0', // free: 5 personalised notes/month, 200 chars; Premium: unlimited, 300 chars
  li_note_budget_month: '5',
  li_my_intro: NEW_INTRO,
  li_years_experience: '2',
  li_build_log: BUILD_LOG,
  li_note_template: "Hi {{first_name}}, I'm a software engineer learning a lot from people at {{company}}. I'd love to connect and follow your work as {{role}}.",
  // Referrals hub (editable on LinkedIn → Referrals → Settings)
  // Jobs feed: your stack (matched in job titles/descriptions) and years of experience
  ref_job_skills: JSON.stringify(['java', 'spring', 'react', 'node', 'javascript', 'typescript', '.net', 'c#', 'sql', 'full stack', 'backend', 'rest']),
  ref_job_years: '2',
  ref_locations: JSON.stringify(['Bengaluru', 'Chennai', 'Hyderabad', 'Remote']),
  ref_tpl_ask: "Hi {{first_name}}, hope you're doing well! I'm applying for {{role_title}} at {{company}}{{job_line}}. "
    + "A bit about me: {{my_intro}}. Would you be comfortable referring me? I can send my resume and a 3-line summary so it takes you "
    + "under 2 minutes. Completely fine if not, and thanks either way!",
  ref_tpl_follow_up: "Hi {{first_name}}, a gentle nudge on my note about {{role_title}} at {{company}}. No worries at all if it isn't "
    + 'possible right now. Thanks for reading!',
  ref_tpl_thanks: "Thank you so much for the referral, {{first_name}}! I've applied for {{role_title}} at {{company}} and I'll keep you "
    + 'posted on how it goes.',
  // Progress photos: AI comparison is off until you turn it on (photos then go to Google Gemini)
  progress_ai: '0',
  // Telegram meal bot (the bot token itself lives in server/.env as TELEGRAM_BOT_TOKEN)
  tg_chat_id: '', // your private chat, set when you send /start <pairing code>
  tg_pair_code: '',
  tg_offset: '0', // last Telegram update handled, so a restart never re-reads old messages
  // The Mentor: daily check-ins (Settings → Mentor). Times are HH:MM local; an empty timezone means this machine's.
  mentor_enabled: '1',
  mentor_strictness: 'standard', // gentle | standard | drill (tone only: never personal insults)
  mentor_eval_time: '23:00',
  mentor_morning: '1',
  mentor_morning_time: '06:30',
  mentor_tz: '',
  mentor_telegram: '1',
  mentor_pause_until: '', // vacation mode: YYYY-MM-DD (inclusive)
  mentor_rest_per_month: '2',
  mentor_sick_per_month: '3',
  mentor_categories: 'dsa,learning,project,workout,nutrition',
  mentor_learning_minutes: '30',
};
/** Replaces old default pillars/intro with the new ones, but only if you never edited them. */
async function upgradeLinkedInDefaults(pool) {
  const r = await pool.request().query("SELECT k, v FROM dbo.settings WHERE k IN ('li_pillars', 'li_my_intro')");
  const cur = Object.fromEntries(r.recordset.map((x) => [x.k, x.v]));
  const set = (k, v) => pool.request().input('k', sql.NVarChar, k).input('v', sql.NVarChar, v).query('UPDATE dbo.settings SET v = @v WHERE k = @k');
  try { if (JSON.stringify(JSON.parse(cur.li_pillars)) === JSON.stringify(OLD_PILLARS)) await set('li_pillars', JSON.stringify(NEW_PILLARS)); } catch { /* not JSON: leave it */ }
  if (cur.li_my_intro === OLD_INTRO) await set('li_my_intro', NEW_INTRO);
}

async function ensureDefaults(pool) {
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    await pool.request().input('k', sql.NVarChar, k).input('v', sql.NVarChar, v)
      .query('IF NOT EXISTS (SELECT 1 FROM dbo.settings WHERE k = @k) INSERT INTO dbo.settings (k, v) VALUES (@k, @v)');
  }
  // LeetCode slugs drive auto-sync; fill any that are missing (e.g. databases created before Step 5).
  await pool.request().query(`UPDATE dbo.problems SET slug = SUBSTRING(url, 31, LEN(url) - 31)
    WHERE slug IS NULL AND source = 'LeetCode' AND url LIKE 'https://leetcode.com/problems/%/'`);
}

// Documentation links are reference data: always refresh them from plan.json (progress is untouched).
async function syncLinks(pool) {
  const plan = loadPlan();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    for (const d of plan.days) {
      await new sql.Request(tx).input('date', sql.Date, d.date).input('links', sql.NVarChar(sql.MAX), JSON.stringify(d.links || []))
        .query('UPDATE dbo.days SET links = @links WHERE original_date = @date');
    }
    for (const p of plan.projects) {
      for (const t of p.tasks.filter((x) => x.kind === 'build')) {
        await new sql.Request(tx)
          .input('code', sql.NVarChar, p.code).input('week', sql.Int, t.week).input('dow', sql.TinyInt, t.dow)
          .input('links', sql.NVarChar(sql.MAX), JSON.stringify(t.learnLinks || []))
          .query(`UPDATE dbo.project_tasks SET learn_links = @links
                  WHERE project_code = @code AND week_no = @week AND day_index = @dow AND kind = 'build'`);
      }
    }
    await new sql.Request(tx).input('v', sql.NVarChar(sql.MAX), JSON.stringify(plan.channels || [])).query(`
      MERGE dbo.settings AS t USING (SELECT 'channels' AS k) AS s ON t.k = s.k
      WHEN MATCHED THEN UPDATE SET v = @v WHEN NOT MATCHED THEN INSERT (k, v) VALUES ('channels', @v);`);
    await tx.commit();
    console.log('Documentation links refreshed.');
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

// LinkedIn campaign stages for the 7 → 20 LPA switch (editable in the app).
const DEFAULT_LI_STAGES = [
  ['Foundation', 'Rewrite headline/about/featured, start posting twice a week, connect with your existing network', '2026-10-05', '2026-11-15', 2, 10, 0],
  ['Visibility', 'Consistent posts about your projects + DSA journey; grow toward engineers and recruiters at target companies', '2026-11-16', '2026-12-27', 2, 15, 3],
  ['Outreach & referrals', 'Informational chats and referral asks with engineers at target companies; start applying', '2026-12-28', '2027-01-31', 2, 20, 8],
  ['Interviewing', 'Keep the pipeline full while interviewing; follow up with recruiters', '2027-02-01', '2027-03-14', 2, 15, 10],
  ['Offer & negotiation', 'Compare offers, negotiate to 20 LPA, thank everyone who helped', '2027-03-15', '2027-04-30', 1, 5, 5],
];
async function seedLinkedInStages(pool) {
  for (const [i, [name, focus, start, end, posts, conns, msgs]] of DEFAULT_LI_STAGES.entries()) {
    await pool.request()
      .input('ord', sql.Int, i).input('name', sql.NVarChar, name).input('focus', sql.NVarChar, focus)
      .input('start', sql.Date, start).input('end', sql.Date, end)
      .input('p', sql.Int, posts).input('c', sql.Int, conns).input('m', sql.Int, msgs)
      .query(`INSERT INTO dbo.li_stages (sort_order, name, focus, start_date, end_date, posts_per_week, connections_per_week, messages_per_week)
              VALUES (@ord, @name, @focus, @start, @end, @p, @c, @m)`);
  }
  console.log(`Seeded ${DEFAULT_LI_STAGES.length} LinkedIn campaign stages.`);
}

// Each area seeds independently, so adding a new area never touches existing progress.
async function seedIfEmpty(pool, table, label, fn) {
  const { recordset } = await pool.request().query(`SELECT COUNT(*) AS n FROM dbo.${table}`);
  if (recordset[0].n === 0) await fn(pool);
  else console.log(`${label}: already seeded, keeping your progress.`);
}

/** Creates the DB if needed, applies the schema, seeds empty areas and refreshes reference data. */
async function setupDatabase({ reset = false, quiet = false, expectDb } = {}) {
  const log = quiet ? () => {} : console.log;
  // Safety: callers that only mean to reset a specific database (the tests) pass expectDb.
  if (expectDb && DB_NAME !== expectDb) throw new Error(`setupDatabase: refusing to touch "${DB_NAME}" (expected "${expectDb}")`);
  if (reset && process.env.TRACKER_TEST === '1' && DB_NAME === 'DSATracker') throw new Error('Refusing to reset the real DSATracker database from a test run');
  log(`SQL Server: ${SERVER}  database: ${DB_NAME}`);
  await createDatabase();
  const pool = await getPool();
  await applySchema(pool);
  if (reset) {
    await wipe(pool);
    log('Existing data deleted (--reset).');
  }
  const origLog = console.log;
  if (quiet) console.log = () => {};
  try {
    await seedIfEmpty(pool, 'weeks', 'DSA plan', seed);
    await seedIfEmpty(pool, 'projects', 'Projects', seedProjects);
    await seedIfEmpty(pool, 'li_stages', 'LinkedIn stages', seedLinkedInStages);
    await syncRoadmaps(pool);
    await syncLinks(pool);
    await ensureDefaults(pool);
    await upgradeLinkedInDefaults(pool);
    // Referral targets: adds any company from data/target-companies.json you don't have yet (your edits are kept).
    const referralCompanies = require('./referrals/companies');
    await referralCompanies.seedCompanies(pool);
    await referralCompanies.relinkContacts(pool);
    await require('./referrals/jobs-store').seedBoards(pool);
  } finally {
    console.log = origLog;
  }
  return pool;
}

module.exports = { setupDatabase };

if (require.main === module) {
  setupDatabase({ reset: process.argv.includes('--reset') })
    .then((pool) => pool.close())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Database setup failed:', err.message);
      process.exit(1);
    });
}
