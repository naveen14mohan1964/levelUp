-- DSA Tracker schema (SQL Server). Idempotent: safe to run repeatedly.

IF OBJECT_ID('dbo.settings') IS NULL
CREATE TABLE dbo.settings (
  k NVARCHAR(50) NOT NULL PRIMARY KEY,
  v NVARCHAR(MAX) NULL
);
GO

IF OBJECT_ID('dbo.weeks') IS NULL
CREATE TABLE dbo.weeks (
  week_no      INT           NOT NULL PRIMARY KEY,
  phase        TINYINT       NOT NULL,
  title        NVARCHAR(200) NOT NULL,
  start_date   DATE          NOT NULL,
  end_date     DATE          NOT NULL,
  resources    NVARCHAR(MAX) NULL,
  key_concepts NVARCHAR(MAX) NULL, -- JSON array
  milestone    NVARCHAR(MAX) NULL
);
GO

IF OBJECT_ID('dbo.days') IS NULL
CREATE TABLE dbo.days (
  id            INT IDENTITY(1,1) PRIMARY KEY,
  week_no       INT           NOT NULL REFERENCES dbo.weeks(week_no),
  day_index     TINYINT       NOT NULL, -- 0 = Mon ... 6 = Sun
  original_date DATE          NOT NULL, -- date in the original plan
  plan_date     DATE          NOT NULL, -- current (possibly re-scheduled) date
  day_type      NVARCHAR(20)  NOT NULL, -- study | selftest | revision
  focus         NVARCHAR(500) NOT NULL,
  topic         NVARCHAR(50)  NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_days_plan_date')
CREATE INDEX IX_days_plan_date ON dbo.days(plan_date);
GO

IF OBJECT_ID('dbo.tasks') IS NULL
CREATE TABLE dbo.tasks (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  day_id     INT           NOT NULL REFERENCES dbo.days(id),
  sort_order INT           NOT NULL,
  kind       NVARCHAR(20)  NOT NULL, -- concept | practice | review | selftest | mock | contest
  title      NVARCHAR(500) NOT NULL,
  minutes    INT           NOT NULL DEFAULT 0,
  done       BIT           NOT NULL DEFAULT 0,
  done_at    DATETIME2     NULL
);
GO

IF OBJECT_ID('dbo.problems') IS NULL
CREATE TABLE dbo.problems (
  id             INT IDENTITY(1,1) PRIMARY KEY,
  day_id         INT           NULL REFERENCES dbo.days(id), -- NULL = added by you, not from the plan
  sort_order     INT           NOT NULL DEFAULT 0,
  source         NVARCHAR(20)  NOT NULL, -- LeetCode | GfG | Other
  lc_number      INT           NULL,
  title          NVARCHAR(300) NOT NULL,
  url            NVARCHAR(500) NULL,
  difficulty     CHAR(1)       NOT NULL, -- E | M | H
  topic          NVARCHAR(50)  NULL,
  is_stretch     BIT           NOT NULL DEFAULT 0,
  is_selftest    BIT           NOT NULL DEFAULT 0,
  hint           NVARCHAR(300) NULL,
  status         NVARCHAR(20)  NOT NULL DEFAULT 'todo', -- todo | solved | revision
  attempts       INT           NOT NULL DEFAULT 0,
  time_taken_min INT           NULL,
  notes          NVARCHAR(MAX) NULL,
  confidence     TINYINT       NULL, -- 1..5
  interval_days  INT           NULL,
  next_review    DATE          NULL,
  solved_at      DATETIME2     NULL,
  updated_at     DATETIME2     NOT NULL DEFAULT SYSDATETIME()
);
GO

IF OBJECT_ID('dbo.review_log') IS NULL
CREATE TABLE dbo.review_log (
  id             INT IDENTITY(1,1) PRIMARY KEY,
  problem_id     INT       NOT NULL REFERENCES dbo.problems(id),
  reviewed_at    DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  confidence     TINYINT   NOT NULL,
  success        BIT       NOT NULL,
  time_taken_min INT       NULL
);
GO

IF OBJECT_ID('dbo.study_log') IS NULL
CREATE TABLE dbo.study_log (
  log_date DATE          NOT NULL PRIMARY KEY,
  minutes  INT           NOT NULL DEFAULT 0,
  notes    NVARCHAR(MAX) NULL
);
GO

-- ---------- Step 2: project track ----------
IF OBJECT_ID('dbo.projects') IS NULL
CREATE TABLE dbo.projects (
  code        NVARCHAR(40)  NOT NULL PRIMARY KEY,
  area        NVARCHAR(20)  NOT NULL, -- node | dotnet | react
  name        NVARCHAR(100) NOT NULL,
  description NVARCHAR(500) NULL,
  stack       NVARCHAR(MAX) NULL, -- JSON array
  resources   NVARCHAR(MAX) NULL, -- JSON array of { label, url }
  repo_url    NVARCHAR(300) NULL,
  sort_order  INT           NOT NULL DEFAULT 0
);
GO

IF OBJECT_ID('dbo.project_tasks') IS NULL
CREATE TABLE dbo.project_tasks (
  id                 INT IDENTITY(1,1) PRIMARY KEY,
  project_code       NVARCHAR(40)  NOT NULL REFERENCES dbo.projects(code),
  week_no            INT           NOT NULL,
  week_title         NVARCHAR(100) NOT NULL,
  day_index          TINYINT       NOT NULL, -- 0 = Mon ... 4 = Fri
  plan_date          DATE          NOT NULL,
  title              NVARCHAR(500) NOT NULL,
  done               BIT           NOT NULL DEFAULT 0,
  built_from_scratch BIT           NOT NULL DEFAULT 0, -- no tutorial copy, you can explain every line
  notes              NVARCHAR(MAX) NULL,
  done_at            DATETIME2     NULL
);
GO

-- ---------- Step 4: project roadmaps (learn + build + weekly checkpoint) ----------
IF COL_LENGTH('dbo.project_tasks', 'kind') IS NULL
ALTER TABLE dbo.project_tasks ADD kind NVARCHAR(20) NOT NULL CONSTRAINT DF_project_tasks_kind DEFAULT 'build'; -- build | checkpoint
GO
IF COL_LENGTH('dbo.project_tasks', 'learn') IS NULL
ALTER TABLE dbo.project_tasks ADD learn NVARCHAR(500) NULL; -- the concept to learn before building
GO
IF COL_LENGTH('dbo.project_tasks', 'learn_done') IS NULL
ALTER TABLE dbo.project_tasks ADD learn_done BIT NOT NULL CONSTRAINT DF_project_tasks_learn_done DEFAULT 0;
GO

-- ---------- Step 5: DSA tracker + LeetCode sync ----------
IF COL_LENGTH('dbo.problems', 'auto_synced') IS NULL
ALTER TABLE dbo.problems ADD auto_synced BIT NOT NULL CONSTRAINT DF_problems_auto_synced DEFAULT 0; -- ticked by LeetCode sync, still needs a confidence rating
GO
IF COL_LENGTH('dbo.problems', 'slug') IS NULL
ALTER TABLE dbo.problems ADD slug NVARCHAR(200) NULL; -- LeetCode titleSlug, used to match synced submissions
GO
UPDATE dbo.problems SET slug = SUBSTRING(url, 31, LEN(url) - 31)
WHERE slug IS NULL AND source = 'LeetCode' AND url LIKE 'https://leetcode.com/problems/%/';
GO

-- ---------- Step 7: workout, body metrics, nutrition ----------
IF OBJECT_ID('dbo.workout_log') IS NULL
CREATE TABLE dbo.workout_log (
  log_date DATE         NOT NULL,
  item_key NVARCHAR(60) NOT NULL, -- e.g. warmup-0, main-2, cardio, mini-1
  done_at  DATETIME2    NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_workout_log PRIMARY KEY (log_date, item_key)
);
GO

IF OBJECT_ID('dbo.body_log') IS NULL
CREATE TABLE dbo.body_log (
  log_date  DATE         NOT NULL PRIMARY KEY,
  weight_kg DECIMAL(5,2) NULL,
  waist_cm  DECIMAL(5,1) NULL,
  chest_cm  DECIMAL(5,1) NULL,
  hips_cm   DECIMAL(5,1) NULL,
  arm_cm    DECIMAL(5,1) NULL,
  thigh_cm  DECIMAL(5,1) NULL,
  steps     INT          NULL,
  water_ml  INT          NOT NULL DEFAULT 0,
  sleep_h   DECIMAL(3,1) NULL,
  notes     NVARCHAR(MAX) NULL
);
GO

IF OBJECT_ID('dbo.meals') IS NULL
CREATE TABLE dbo.meals (
  id          INT IDENTITY(1,1) PRIMARY KEY,
  log_date    DATE          NOT NULL,
  meal_type   NVARCHAR(20)  NOT NULL, -- breakfast | lunch | snack | dinner
  title       NVARCHAR(200) NOT NULL,
  calories    INT           NOT NULL,
  protein_g   DECIMAL(6,1)  NOT NULL DEFAULT 0,
  carbs_g     DECIMAL(6,1)  NOT NULL DEFAULT 0,
  fat_g       DECIMAL(6,1)  NOT NULL DEFAULT 0,
  items       NVARCHAR(MAX) NULL, -- JSON array from the AI estimate
  source      NVARCHAR(20)  NOT NULL DEFAULT 'manual', -- ai-photo | ai-text | manual
  confidence  NVARCHAR(10)  NULL,
  notes       NVARCHAR(MAX) NULL,
  photo_path  NVARCHAR(300) NULL, -- relative to server/uploads
  created_at  DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_meals_log_date')
CREATE INDEX IX_meals_log_date ON dbo.meals(log_date);
GO

IF OBJECT_ID('dbo.progress_photos') IS NULL
CREATE TABLE dbo.progress_photos (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  log_date   DATE          NOT NULL,
  pose       NVARCHAR(10)  NOT NULL, -- front | side | back
  photo_path NVARCHAR(300) NOT NULL,
  created_at DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

-- Profile + goal defaults (only inserted when missing; edit them on the Settings page)
MERGE dbo.settings AS t
USING (VALUES
  ('leetcode_username', ''), ('height_cm', '185'), ('start_weight_kg', '115'), ('goal_weight_kg', '80'),
  ('calorie_target', '2050'), ('protein_target_g', '130'), ('water_target_ml', '3250'), ('sleep_target_h', '7')
) AS s (k, v) ON t.k = s.k
WHEN NOT MATCHED THEN INSERT (k, v) VALUES (s.k, s.v);
GO

-- ---------- Step 6: exact documentation links + AI mentor ----------
IF COL_LENGTH('dbo.days', 'links') IS NULL
ALTER TABLE dbo.days ADD links NVARCHAR(MAX) NULL; -- JSON [{ label, url }]
GO
IF COL_LENGTH('dbo.project_tasks', 'learn_links') IS NULL
ALTER TABLE dbo.project_tasks ADD learn_links NVARCHAR(MAX) NULL; -- JSON [{ label, url }]
GO

IF OBJECT_ID('dbo.mentor_messages') IS NULL
CREATE TABLE dbo.mentor_messages (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  thread     NVARCHAR(80)  NOT NULL, -- general | problem:<id> | lesson:<taskId> | plan:<date> | mock
  role       NVARCHAR(10)  NOT NULL, -- user | model
  mode       NVARCHAR(20)  NULL,     -- chat | hint | explain | review | plan | mock
  content    NVARCHAR(MAX) NOT NULL,
  created_at DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_mentor_thread')
CREATE INDEX IX_mentor_thread ON dbo.mentor_messages(thread, id);
GO

-- ---------- LinkedIn module · Phase 1: 7 → 20 LPA goal, campaign stages + weekly targets ----------
IF OBJECT_ID('dbo.li_stages') IS NULL
CREATE TABLE dbo.li_stages (
  id                   INT IDENTITY(1,1) PRIMARY KEY,
  sort_order           INT           NOT NULL,
  name                 NVARCHAR(100) NOT NULL,
  focus                NVARCHAR(500) NULL,     -- what this stage is about
  start_date           DATE          NOT NULL,
  end_date             DATE          NOT NULL,
  posts_per_week       INT           NOT NULL DEFAULT 2,
  connections_per_week INT           NOT NULL DEFAULT 10,
  messages_per_week    INT           NOT NULL DEFAULT 0,
  completed            BIT           NOT NULL DEFAULT 0, -- you mark a stage done; otherwise status follows the dates
  CONSTRAINT CK_li_stages_dates CHECK (end_date >= start_date)
);
GO

-- ---------- LinkedIn module · Phase 2: posts, job queue, audit log ----------
-- Times are stored as epoch milliseconds (BIGINT): unambiguous across time zones and drivers.
IF OBJECT_ID('dbo.li_posts') IS NULL
CREATE TABLE dbo.li_posts (
  id             INT IDENTITY(1,1) PRIMARY KEY,
  week_start     DATE          NOT NULL,          -- Monday of the planner week
  slot_index     TINYINT       NOT NULL,          -- 0 or 1 (2 posts/week)
  pillar         NVARCHAR(100) NULL,
  angle          NVARCHAR(500) NULL,              -- your one-line idea for the post
  text           NVARCHAR(MAX) NOT NULL,
  status         NVARCHAR(20)  NOT NULL DEFAULT 'draft', -- draft | approved | scheduled | posted | failed
  ai_generated   BIT           NOT NULL DEFAULT 0,
  scheduled_ms   BIGINT        NULL,
  posted_ms      BIGINT        NULL,
  post_urn       NVARCHAR(100) NULL,
  post_url       NVARCHAR(300) NULL,
  error          NVARCHAR(1000) NULL,
  created_ms     BIGINT        NOT NULL,
  updated_ms     BIGINT        NOT NULL,
  CONSTRAINT UQ_li_posts_slot UNIQUE (week_start, slot_index)
);
GO

-- ---------- AI + FDE learning module: lesson progress and the "stay updated" news feed ----------
IF OBJECT_ID('dbo.ai_progress') IS NULL
CREATE TABLE dbo.ai_progress (
  lesson_id  NVARCHAR(20)   NOT NULL PRIMARY KEY, -- e.g. L3-2 (server/data/ai-roadmap.json)
  done_ms    BIGINT         NULL,
  notes      NVARCHAR(MAX)  NULL,
  updated_ms BIGINT         NOT NULL
);
GO
IF OBJECT_ID('dbo.ai_news') IS NULL
CREATE TABLE dbo.ai_news (
  id           INT IDENTITY(1,1) PRIMARY KEY,
  source       NVARCHAR(60)   NOT NULL,
  title        NVARCHAR(400)  NOT NULL,
  url          NVARCHAR(600)  NOT NULL,
  summary      NVARCHAR(1000) NULL,
  published_ms BIGINT         NULL,
  fetched_ms   BIGINT         NOT NULL,
  status       NVARCHAR(10)   NOT NULL DEFAULT 'new', -- new | read | saved | hidden
  CONSTRAINT UQ_ai_news_url UNIQUE (url)
);
GO

-- Post images: you generate the image from the suggested prompt in any tool and attach it; it's published with the post.
IF COL_LENGTH('dbo.li_posts', 'image_path') IS NULL
ALTER TABLE dbo.li_posts ADD
  image_path   NVARCHAR(400)  NULL,  -- relative to server/uploads (linkedin/…)
  image_alt    NVARCHAR(300)  NULL,  -- alt text for screen-reader users
  image_prompt NVARCHAR(MAX)  NULL;  -- the suggested prompt for an image tool
GO

IF OBJECT_ID('dbo.li_jobs') IS NULL
CREATE TABLE dbo.li_jobs (
  id           INT IDENTITY(1,1) PRIMARY KEY,
  type         NVARCHAR(40)   NOT NULL,          -- publish_post (later phases add more)
  ref_id       INT            NOT NULL,          -- e.g. li_posts.id
  run_ms       BIGINT         NOT NULL,          -- when it's due
  status       NVARCHAR(20)   NOT NULL DEFAULT 'queued', -- queued | running | done | failed | cancelled
  attempts     INT            NOT NULL DEFAULT 0,
  max_attempts INT            NOT NULL DEFAULT 3,
  last_error   NVARCHAR(1000) NULL,
  created_ms   BIGINT         NOT NULL,
  updated_ms   BIGINT         NOT NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_li_jobs_due')
CREATE INDEX IX_li_jobs_due ON dbo.li_jobs(status, run_ms);
GO

IF OBJECT_ID('dbo.li_audit') IS NULL
CREATE TABLE dbo.li_audit (
  id       INT IDENTITY(1,1) PRIMARY KEY,
  at_ms    BIGINT         NOT NULL,
  actor    NVARCHAR(20)   NOT NULL,              -- you | scheduler | ai
  action   NVARCHAR(60)   NOT NULL,
  ref_type NVARCHAR(30)   NULL,
  ref_id   INT            NULL,
  detail   NVARCHAR(2000) NULL
);
GO

-- ---------- LinkedIn module · Phase 3: assisted outreach (you send on LinkedIn; the app plans, writes, paces, tracks) ----------
IF OBJECT_ID('dbo.li_lists') IS NULL
CREATE TABLE dbo.li_lists (
  id            INT IDENTITY(1,1) PRIMARY KEY,
  name          NVARCHAR(100)  NOT NULL,
  roles         NVARCHAR(MAX)  NULL, -- JSON array, e.g. ["Engineering Manager","Technical Recruiter"]
  companies     NVARCHAR(MAX)  NULL, -- JSON array
  locations     NVARCHAR(MAX)  NULL, -- JSON array
  keywords      NVARCHAR(200)  NULL,
  note_template NVARCHAR(400)  NULL, -- overrides the default template for this list
  created_ms    BIGINT         NOT NULL
);
GO

IF OBJECT_ID('dbo.li_contacts') IS NULL
CREATE TABLE dbo.li_contacts (
  id             INT IDENTITY(1,1) PRIMARY KEY,
  list_id        INT            NULL REFERENCES dbo.li_lists(id) ON DELETE SET NULL,
  dedupe_key     NVARCHAR(200)  NOT NULL, -- url:<slug> or nc:<name>|<company>
  name           NVARCHAR(120)  NOT NULL,
  headline       NVARCHAR(300)  NULL,
  role           NVARCHAR(150)  NULL,
  company        NVARCHAR(150)  NULL,
  location       NVARCHAR(100)  NULL,
  profile_url    NVARCHAR(300)  NULL,
  status         NVARCHAR(20)   NOT NULL DEFAULT 'not_contacted', -- not_contacted | requested | connected | messaged | replied | referral | skipped
  do_not_contact BIT            NOT NULL DEFAULT 0,
  use_note       BIT            NOT NULL DEFAULT 0, -- spend one of your monthly personalised notes on this person
  note           NVARCHAR(400)  NULL,
  notes          NVARCHAR(MAX)  NULL,   -- your private notes about them
  source         NVARCHAR(20)   NOT NULL DEFAULT 'manual', -- manual | paste | csv
  requested_ms   BIGINT         NULL,
  connected_ms   BIGINT         NULL,
  created_ms     BIGINT         NOT NULL,
  updated_ms     BIGINT         NOT NULL,
  CONSTRAINT UQ_li_contacts_key UNIQUE (dedupe_key)
);
GO

-- Every outreach action (Phase 5 dashboards read this too)
IF OBJECT_ID('dbo.li_actions') IS NULL
CREATE TABLE dbo.li_actions (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  contact_id INT            NULL,
  type       NVARCHAR(30)   NOT NULL, -- request_sent | accepted | message_sent | reply | referral | warning
  with_note  BIT            NOT NULL DEFAULT 0,
  at_ms      BIGINT         NOT NULL,
  detail     NVARCHAR(500)  NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_li_actions_type_at')
CREATE INDEX IX_li_actions_type_at ON dbo.li_actions(type, at_ms);
GO

-- ---------- Referrals: target companies, richer contacts, referral pipeline, notes, import history ----------
IF OBJECT_ID('dbo.ref_companies') IS NULL
CREATE TABLE dbo.ref_companies (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  name       NVARCHAR(150)  NOT NULL,
  match_key  NVARCHAR(150)  NOT NULL, -- normalised name, used to match "Company" from LinkedIn
  aliases    NVARCHAR(MAX)  NULL,     -- JSON array of other names (Zomato -> Eternal)
  tier       TINYINT        NOT NULL, -- 1 = ₹35L+ · 2 = ₹25–40L · 3 = ₹18–28L (estimates)
  category   NVARCHAR(60)   NULL,
  is_target  BIT            NOT NULL DEFAULT 1,
  notes      NVARCHAR(500)  NULL,
  source     NVARCHAR(20)   NOT NULL DEFAULT 'seed', -- seed | you
  created_ms BIGINT         NOT NULL,
  CONSTRAINT UQ_ref_companies_key UNIQUE (match_key)
);
GO

IF COL_LENGTH('dbo.li_contacts', 'company_id') IS NULL
ALTER TABLE dbo.li_contacts ADD
  company_id          INT            NULL,  -- matched ref_companies row (NULL = not a target company)
  email               NVARCHAR(200)  NULL,
  rel_type            NVARCHAR(20)   NOT NULL CONSTRAINT DF_li_contacts_rel_type DEFAULT 'connection', -- connection | met | alumni | ex_colleague | friend
  last_interaction_ms BIGINT         NULL,  -- last real conversation (drives relationship strength)
  prev_company        NVARCHAR(150)  NULL,  -- before their latest move (from re-imports)
  moved_ms            BIGINT         NULL;  -- when a re-import noticed they changed company
GO

IF OBJECT_ID('dbo.ref_pursuits') IS NULL
CREATE TABLE dbo.ref_pursuits (
  id          INT IDENTITY(1,1) PRIMARY KEY,
  company_id  INT            NOT NULL REFERENCES dbo.ref_companies(id),
  contact_id  INT            NULL,     -- your referrer there (li_contacts)
  role_title  NVARCHAR(150)  NULL,     -- the job you want, e.g. "SDE 2 – Backend"
  job_url     NVARCHAR(400)  NULL,
  stage       NVARCHAR(20)   NOT NULL DEFAULT 'target', -- target | connected | asked | referred | applied | interview | offer
  next_action NVARCHAR(300)  NULL,
  due_ms      BIGINT         NULL,
  outcome     NVARCHAR(20)   NULL,     -- NULL (open) | parked | rejected | not_interested | won
  reason      NVARCHAR(300)  NULL,
  revisit_ms  BIGINT         NULL,
  follow_ups  INT            NOT NULL DEFAULT 0, -- referral follow-ups sent (max 1, then stop)
  stage_ms    BIGINT         NOT NULL, -- when it entered the current stage
  created_ms  BIGINT         NOT NULL,
  updated_ms  BIGINT         NOT NULL
);
GO
-- One open referral pursuit per company.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_ref_pursuits_open_company')
CREATE UNIQUE INDEX UX_ref_pursuits_open_company ON dbo.ref_pursuits(company_id) WHERE outcome IS NULL;
GO

IF OBJECT_ID('dbo.ref_history') IS NULL
CREATE TABLE dbo.ref_history (
  id          INT IDENTITY(1,1) PRIMARY KEY,
  pursuit_id  INT            NOT NULL REFERENCES dbo.ref_pursuits(id) ON DELETE CASCADE,
  at_ms       BIGINT         NOT NULL,
  from_stage  NVARCHAR(20)   NULL,
  to_stage    NVARCHAR(20)   NULL,
  note        NVARCHAR(500)  NULL
);
GO

IF OBJECT_ID('dbo.ref_notes') IS NULL
CREATE TABLE dbo.ref_notes (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  contact_id INT            NOT NULL,
  at_ms      BIGINT         NOT NULL,
  text       NVARCHAR(2000) NOT NULL
);
GO

IF OBJECT_ID('dbo.ref_imports') IS NULL
CREATE TABLE dbo.ref_imports (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  at_ms      BIGINT         NOT NULL,
  file_name  NVARCHAR(200)  NULL,
  rows_read  INT            NOT NULL,
  added      INT            NOT NULL,
  merged     INT            NOT NULL,
  unchanged  INT            NOT NULL,
  moved      INT            NOT NULL,
  accepted   INT            NOT NULL,
  skipped    INT            NOT NULL,
  detail     NVARCHAR(MAX)  NULL       -- JSON: who moved where, skipped rows
);
GO

-- Jobs feed: each company's public job board (Greenhouse / Lever / Ashby / SmartRecruiters APIs, made for listing jobs)
IF COL_LENGTH('dbo.ref_companies', 'ats_provider') IS NULL
ALTER TABLE dbo.ref_companies ADD
  ats_provider NVARCHAR(20)  NULL,   -- greenhouse | lever | ashby | smartrecruiters
  ats_token    NVARCHAR(100) NULL,   -- the company's board name on that provider
  jobs_ms      BIGINT        NULL,   -- last successful fetch
  jobs_error   NVARCHAR(300) NULL;
GO

IF OBJECT_ID('dbo.ref_jobs') IS NULL
CREATE TABLE dbo.ref_jobs (
  id            INT IDENTITY(1,1) PRIMARY KEY,
  company_id    INT            NOT NULL,
  provider      NVARCHAR(20)   NOT NULL,
  ext_id        NVARCHAR(100)  NOT NULL,
  title         NVARCHAR(300)  NOT NULL,
  location      NVARCHAR(300)  NULL,
  url           NVARCHAR(600)  NOT NULL,
  remote        BIT            NOT NULL DEFAULT 0,
  department    NVARCHAR(200)  NULL,
  posted_ms     BIGINT         NULL,
  first_seen_ms BIGINT         NOT NULL,
  last_seen_ms  BIGINT         NOT NULL,
  closed_ms     BIGINT         NULL,     -- no longer on the board
  score         INT            NOT NULL,
  reasons       NVARCHAR(MAX)  NULL,     -- JSON [{points, text}]
  status        NVARCHAR(20)   NOT NULL DEFAULT 'new', -- new | saved | hidden | applied
  CONSTRAINT UQ_ref_jobs UNIQUE (provider, ext_id)
);
GO

-- ---------- Progress photos: source (page / Telegram) + optional AI comparison ----------
IF COL_LENGTH('dbo.progress_photos', 'source') IS NULL
ALTER TABLE dbo.progress_photos ADD
  source       NVARCHAR(20)  NOT NULL CONSTRAINT DF_progress_photos_source DEFAULT 'upload', -- upload | telegram
  tg_update_id BIGINT        NULL,     -- Telegram message id: the same photo is never stored twice
  ai_status    NVARCHAR(20)  NULL,     -- NULL (AI off) | pending | done | failed
  ai_json      NVARCHAR(MAX) NULL,     -- { compared_with, changes[], body_fat{low,high,confidence}, consistency_tip, encouragement }
  ai_error     NVARCHAR(500) NULL,
  ai_attempts  INT           NOT NULL CONSTRAINT DF_progress_photos_ai_attempts DEFAULT 0,
  ai_next_ms   BIGINT        NOT NULL CONSTRAINT DF_progress_photos_ai_next DEFAULT 0;
GO

-- ---------- Telegram meal bot: every photo/text you send is stored here first, then estimated ----------
IF OBJECT_ID('dbo.tg_inbox') IS NULL
CREATE TABLE dbo.tg_inbox (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  update_id  BIGINT         NOT NULL, -- Telegram's id: the same message is never stored twice
  chat_id    BIGINT         NOT NULL,
  sent_ms    BIGINT         NOT NULL, -- when YOU sent it: decides the meal's day (local midnight to midnight)
  log_date   DATE           NOT NULL,
  meal_type  NVARCHAR(20)   NOT NULL,
  note       NVARCHAR(500)  NULL,     -- caption or text ("2 eggs + toast")
  photo_path NVARCHAR(300)  NULL,     -- relative to server/uploads
  status     NVARCHAR(20)   NOT NULL DEFAULT 'pending', -- pending | done | failed
  attempts   INT            NOT NULL DEFAULT 0,
  next_try_ms BIGINT        NOT NULL DEFAULT 0,
  error      NVARCHAR(500)  NULL,
  meal_id    INT            NULL,
  created_ms BIGINT         NOT NULL,
  CONSTRAINT UQ_tg_inbox_update UNIQUE (update_id)
);
GO

-- ---------- Game layer: XP, streak, level progression ----------
-- Lesson unlocks and XP are DERIVED from the progress tables above (ai_progress, tasks, problems, project_tasks),
-- so nothing here can get out of sync with what you actually did. These tables only hold what can't be derived.

-- Focus timer sessions ("Start" / "Just 5 minutes"): minutes learned + the small "started a lesson" XP
IF OBJECT_ID('dbo.focus_sessions') IS NULL
CREATE TABLE dbo.focus_sessions (
  id          INT IDENTITY(1,1) PRIMARY KEY,
  track       NVARCHAR(20)  NOT NULL, -- ai | dsa | react | dotnet | node
  lesson_ref  NVARCHAR(40)  NULL,     -- the lesson's ref in that track (NULL = a session not tied to a lesson)
  started_ms  BIGINT        NOT NULL,
  planned_min INT           NOT NULL, -- 5 for "Just 5 minutes", otherwise the lesson's estimate
  ended_ms    BIGINT        NULL,     -- NULL = still running
  minutes     INT           NULL      -- set when it ends
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_focus_sessions_started')
CREATE INDEX IX_focus_sessions_started ON dbo.focus_sessions(started_ms);
GO

-- Streak freezes that were used (one per Mon–Sun week); stored so a used freeze never moves
IF OBJECT_ID('dbo.streak_freezes') IS NULL
CREATE TABLE dbo.streak_freezes (
  day     DATE   NOT NULL PRIMARY KEY, -- the missed day the freeze covered
  used_ms BIGINT NOT NULL
);
GO

-- "LEVEL COMPLETE" celebrations you've already seen, so each plays exactly once
IF OBJECT_ID('dbo.game_seen') IS NULL
CREATE TABLE dbo.game_seen (
  track   NVARCHAR(20) NOT NULL,
  level   INT          NOT NULL,
  seen_ms BIGINT       NOT NULL,
  CONSTRAINT PK_game_seen PRIMARY KEY (track, level)
);
GO

-- Dev tools: snapshots taken before a dev-only "reset progress" (AI lessons + game state), so it can be undone
IF OBJECT_ID('dbo.dev_snapshots') IS NULL
CREATE TABLE dbo.dev_snapshots (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  created_ms BIGINT        NOT NULL,
  data       NVARCHAR(MAX) NOT NULL -- JSON: { ai_progress, focus_sessions, streak_freezes, game_seen, game_started_ms }
);
GO

-- Self-paced learning modules beyond AI + FDE (LLD, HLD, …): roadmaps live in server/data/<track>-roadmap.json
IF OBJECT_ID('dbo.learn_progress') IS NULL
CREATE TABLE dbo.learn_progress (
  track      NVARCHAR(20)  NOT NULL, -- lld | hld
  lesson_id  NVARCHAR(20)  NOT NULL, -- e.g. LLD3-2
  done_ms    BIGINT        NULL,
  notes      NVARCHAR(MAX) NULL,
  updated_ms BIGINT        NOT NULL,
  CONSTRAINT PK_learn_progress PRIMARY KEY (track, lesson_id)
);
GO
