# Level Up

Gamified learning and fitness tracker: DSA, AI, system design and project roadmaps as unlockable level maps, with XP,
streaks, a Telegram meal bot and LinkedIn tools. React (Vite) + Node/Express + SQL Server; runs always-on with PM2 or in Docker.

## Requirements
- Node.js 18+ (tested on 22)
- SQL Server with Windows Authentication + **ODBC Driver 17 for SQL Server**
- Connection settings live in `server/.env` (`DB_SERVER`, `DB_NAME`, `DB_DRIVER`, `PORT`)

## First-time setup
```powershell
cd tracker
npm run setup        # installs everything, creates the DSATracker database, loads the plan
```

## Daily use: always on at http://localhost:4000
The app runs in the background under **PM2** (a Node process manager): it restarts itself if it crashes, and a script in
your Windows Startup folder starts it every time you log in. You don't need to start anything by hand.

| Command (in `tracker`) | What it does |
|---|---|
| `npm run app:start` | Build the UI and start (or reload) the always-on app on **:4000** |
| `npm run app:update` | Same: run it after code changes so :4000 picks them up |
| `npm run app:status` | Is it running? Uptime, restarts, memory |
| `npm run app:logs` | Recent logs (also in `tracker/logs/app.log`) |
| `npm run app:stop` | Stop it (until the next login or `app:start`) |
| `npm run app:autostart` / `app:autostart:remove` | Turn start-at-login on / off |

The always-on app also runs the background jobs: scheduled LinkedIn posts and LeetCode sync. If the laptop sleeps,
they pick up again on wake (posts more than 12 hours late are not sent).

On your phone (same Wi-Fi): http://&lt;your-PC-IP&gt;:4000 (`ipconfig` shows the IP).

## 🧩 LLD + 🏗️ HLD + ⚖️ Judgement (system design, architecture & engineering judgement)
- **LLD** (`server/data/lld-roadmap.json`, 10 levels, 43 lessons, Java): OOP → SOLID + clean code → UML → creational,
  structural and behavioural patterns → concurrency (thread-safe LRU) → the 90-minute machine-coding method → classic
  problems (parking lot, Splitwise, BookMyShow, elevator, rate limiter, food delivery) → DDD, TDD, mock interviews.
- **HLD** (`server/data/hld-roadmap.json`, 10 levels, 43 lessons): how the web works → load balancers, caches, CDNs →
  databases, indexes, replication, sharding, CAP → REST/gRPC/GraphQL, real-time, queues, idempotency → scaling and
  reliability → clocks, Raft, sagas, outbox → the interview framework → classic designs (URL shortener, feed, chat, video,
  Uber, payments) → observability, deploys, security, DR → papers, design docs, mock interviews.
- **Judgement** (`server/data/judge-roadmap.json`, 11 levels, 54 lessons): deciding under uncertainty, one-way vs two-way doors
  → trade-offs & cost models → decision records (ADRs, RFCs) → estimation, risk & scope control → code review & refactoring
  judgement → production incidents, rollouts & postmortems → AI tools & harnesses judgement → product & business sense →
  domain expertise (glossaries, workflows, DDD ubiquitous language) → payments domain deep dive → interview readiness.
- Same lesson format as AI + FDE (free links, checked; a build; a checkpoint) and the same game layer: level maps, unlocks,
  XP, streak, LEVEL COMPLETE, Today's "up next". Many HLD builds apply the idea to Level Up itself.
- Code: `server/src/learn/modules.js` (add a module = a roadmap JSON + one line there + an area in `client/src/areas.js`),
  API `routes/learn.js` (`GET /api/learn/:track`, `POST /api/learn/:track/lessons/:id`), progress in `dbo.learn_progress`,
  page `client/src/pages/Learn.jsx`.

## Today, XP, streaks and level maps (the game layer)
- **Today** (`/`): one big card with your next unlocked lesson, its estimate, **▶ Start** and **⚡ Just 5 minutes** (a focus
  timer stored on the server, so it survives reloads; it also shows in the sidebar). It follows your timeline: during a DSA
  or project block it shows that roadmap, otherwise AI + FDE. Below: up next on your other roadmaps, wins this week, a daily
  motivation quote (`client/src/lib/quotes.js`) and the day's schedule.
- **Level maps** on every roadmap tab (AI + FDE levels, DSA weeks, React/.NET/Node weeks): completed levels glow green,
  the current level is the hero card, future levels are locked. Lessons unlock one by one. Unlocks are worked out from
  your saved progress, so real progress (even a LeetCode sync done out of order) is never locked away.
- **LEVEL COMPLETE**: full-screen celebration (badge, XP count-up, confetti), then the map animates the unlock. Plays once.
- **XP**: +5 for starting a lesson (once a day per lesson), +25 per lesson, +15/25/40 per Easy/Medium/Hard problem,
  +150 per level. Player level n needs 100 + 50·(n−1) XP. Un-ticking takes XP back.
- **Streak**: any day with 5+ minutes (focus timer + estimated time of what you finished). One freeze per Mon–Sun week
  covers a missed day; after a break you get "welcome back", never "streak lost".
- Code: `server/src/game/` (progression, xp, streak, tracks) + `routes/game.js`; UI in `client/src/components/`
  (Sidebar, TodayHero, LevelMap, LevelComplete, fx). Design rules: `.claude/skills/level-up-design/SKILL.md`, live preview at `/design`.

## 🧭 The Mentor (daily accountability)
A strict coach who believes in you. Every evening (default **23:00**) it checks five goals and messages you in the app
(Today card, Mentor → Check-ins) and on Telegram. It names what slipped, ties it to the days left in the 5-month plan, and
ends with **one action at a time**. Behaviour is criticised, never the person; strictness (gentle / standard / drill)
changes the tone only.

| Goal | Met when | Minimum viable day (after 2+ misses in a row) |
|---|---|---|
| DSA | the day's core problems are solved | 1 easy problem |
| Learning (AI/LLD/HLD) | 30+ minutes (setting) | 5 minutes |
| Project (weekdays) | today's 📖 learn + 🛠 build | the learn step |
| Workout (not Sundays) | the session (10-minute mode counts) | the 10-minute mode |
| Nutrition | protein ≥ 80% of target | log your meals |

- **Escalation** per goal (consecutive misses): 1 day → firm + "when and where tomorrow?", 2 → cost (streak, XP, days
  behind) + minimum viable day, 3–4 → "serious talk" with **what's blocking you?** buttons (time / energy / difficulty /
  motivation) and an offer to **shift your unfinished plan days** (with a confirm step), 5+ → a supportive reset, no more pressure.
- **Comeback bonus**: +20 XP per goal completed the day after missing it. **Streak shields** replace the weekly freeze: you
  start with 1, a perfect week earns another (bank of 2); one is spent automatically when it saves your streak.
- **Plan vs actual**: ahead / on track / behind per roadmap, plus days left. **Fresh starts** on Mondays and the 1st.
- **Morning message** (default 06:30, optional): today's goals and your commitment. **At most 2 unsolicited messages a day**;
  quiet on rest/sick days, in vacation mode, and before the plan starts.
- **Telegram**: reply to a mentor message to answer it (never logged as a meal), or use `/commit 7am desk dsa`,
  `/why …`, `/rest tomorrow`, `/sick`, `/mentor`.
- **Rest / sick days** are limited per month (default 2 / 3); rest days are planned in advance, a sick day can be today.
- Messages are written by Gemini with the persona prompt and checked (length, a time in the action, no insults); if the AI
  is down, out of quota or breaks a rule, a built-in template in the same voice is used.
- **Settings → The Mentor**: on/off, strictness, evening and morning times, time zone (empty = this machine), Telegram,
  vacation mode, rest/sick allowance, which goals count, and "Send a test message". No new environment variables:
  it uses the existing `GEMINI_API_KEY` and `TELEGRAM_BOT_TOKEN`, and runs in the always-on app under PM2 or Docker.
- Code: `server/src/checkin/` (rules, time, pace, data, messages, runner, actions, telegram), API `routes/checkin.js`,
  UI `components/MentorCard.jsx`, `CheckinsTab.jsx`, `MentorSettings.jsx`.

## 🎯 Focus Mode (study buddy, camera guard, sounds, flashcards, weekly report)

- **Study buddy** (Today hero): an original ninja-style trainee who studies with you, cheers XP, takes breaks and
  gets sleepy late at night. Every state is on `/design`.
- **📷 Camera focus guard** (off by default; switch it on per session under the timer): MediaPipe runs entirely in
  the browser (models served from `/mediapipe`, copied by `client/scripts/focus-assets.js` at build time; nothing is
  recorded or sent). It learns how you sit in the first 2 s, ignores glances under 3 s, then counts distraction (face
  away, head turned, phone in view, eyes closed 3 s): a chime at 15 s, an alarm at 45 s. **Office mode** = screen
  flash, no sound; **Reading notes** = looking down is fine. The buddy watches you (eyes follow your face, a 👍 every
  2 focused minutes). Only focused minutes count; the Mentor's evening message reports today's camera focus %.
  The session lives at app level (`client/src/focus.jsx`): the guard, the sound and auto-stop follow you to every page,
  with a floating dock (mini preview, status, time left; `components/FocusDock.jsx`). It keeps watching while you study
  in another tab (YouTube, lesson links: facing the screen counts as studying; a Web Worker keeps its pace in a hidden
  tab), sends a desktop notification instead of the flash there, and **⧉ Pop out** opens an always-on-top buddy window
  (Document Picture-in-Picture, Edge/Chrome).
- **Focus sounds**: rain, brown noise, ocean, lo-fi pad, generated with Web Audio (no audio files); they drop to a
  whisper while the guard sees you away.
- **Install + notifications** (Settings → App & notifications): installable app (`client/public/manifest.webmanifest`,
  `sw.js`; `/api` is never cached), local notifications when a session ends, at 21:00 if the streak is at risk, and
  in the morning when flashcards are due. No push server.
- **🃏 Flashcards** (`/cards`): every finished AI / LLD / HLD lesson becomes a card (its checkpoint question) the day
  after; add your own too. Space flips, 1–4 grades (SM-2 style scheduling, `server/src/cards.js`). +2 XP per review,
  first 10 a day.
- **📊 Weekly report** (`/report`): Mon–Sun minutes, XP, lessons, problems, reviews and workouts vs last week, the
  Mentor's goal grid, highlights and a short verdict (`server/src/report.js`, no AI call). "Copy summary" for sharing.
- **Ctrl+K** anywhere (or 🔍 in the sidebar): go to any page, start "Just 5 minutes" or 25 minutes, stop the timer,
  switch the focus sound, find any lesson.

## 🧭 Interview readiness (patterns, companies, design drills)

- **DSA → Patterns** (`/dsa/patterns`): a heatmap of the plan's 26 patterns. Mastery (0–100) = 40% coverage (6 solves =
  full credit) + 35% your confidence ratings + 25% attempts that succeeded, fading slowly after 2 weeks without
  practice. Each day your weakest started pattern picks one extra problem (a new one at the right level, or one you
  rated 1–2 to re-solve), shown on DSA → Today. Today's pick is stored when first shown; tomorrow's updates live.
- **DSA → Companies** (`/dsa/companies`): readiness % for every target company from its type's typical interview focus
  (`server/data/interview-profiles.json`: an estimate you can edit, not data about any one company) and your
  progress, against a ready bar per tier (T1 75%, T2 65%, T3 55%), with the 3 gaps that would add the most points.
- **HLD → 35-min design drills** (`/hld/drills`): 16 original prompts (`server/data/hld-drills.json`), six timed steps,
  autosave, then tick the key points you covered. The score feeds readiness; answers become HLD flashcards; starting a
  drill starts a 35-minute focus session. Optional interviewer feedback = 1 Gemini call.
- Code: `server/src/mastery.js`, `server/src/drills.js`, `routes/mastery.js`; pages `Patterns.jsx`, `Companies.jsx`, `Drills.jsx`.

## Run it in Docker (phone access from anywhere, free)
Containers (`docker-compose.yml`): **SQL Server 2022 Express** (free edition), the **app**, and an optional **Tailscale** sidecar
(`COMPOSE_PROFILES=phone`) that puts the app on your private Tailscale network. Your phone opens it from anywhere (mobile data, any Wi-Fi): no firewall
change, nothing public, so no login screen needed. The laptop (or any always-on PC) just needs internet.

**First time**
1. `copy .env.docker.example .env` in `tracker/`, then set a strong `DB_PASSWORD`. The app's own keys stay in `server/.env`.
2. `npm run docker:up` builds and starts everything (first build downloads ~1.5 GB).
3. `npm run docker:migrate` copies all your data from the laptop's SQL Server (a copy-only backup, so your local database
   isn't changed) into the container.
4. **Tailscale** (free personal plan):
   - Sign up at tailscale.com (Google/GitHub login).
   - In the admin console → **DNS**, turn on **MagicDNS** and **HTTPS certificates**.
   - **Settings → Keys → Generate auth key**, put it in `tracker/.env` as `TS_AUTHKEY=…`, add `COMPOSE_PROFILES=phone`, then run `npm run docker:up` again.
   - Tailscale needs a network that allows it. Office networks that inspect TLS (e.g. Fortinet) block it, so run this from home Wi-Fi
     or on a personal machine. The app itself keeps working without it.
   - **Machines →** levelup **→ Disable key expiry**, so it stays connected.
   - On the phone: install the Tailscale app, sign in with the same account, and open `https://levelup.<your-tailnet>.ts.net`.

**Switch from PM2 to Docker** (only one copy may run the background jobs, or the Telegram bot conflicts):
`npm run app:stop` and `npm run app:autostart:remove`; in `tracker/.env` set `APP_PORT=4000` and `LEVELUP_NO_JOBS=0`;
`npm run docker:migrate` (fresh copy of today's data); `npm run docker:up`. In Docker Desktop → Settings → General, tick
"Start Docker Desktop when you sign in" so it's always on. **Back to PM2**: `npm run docker:down`, `npm run app:start`, `npm run app:autostart`.

| Command | What it does |
|---|---|
| `npm run docker:up` | Build + start (or update after code changes) |
| `npm run docker:status` / `docker:logs` | What's running / the app's logs |
| `npm run docker:migrate` | Copy the laptop database into Docker (replaces the container's database) |
| `npm run docker:down` | Stop (data stays in the `mssql-data` volume) |

Notes: meal/progress photos stay in `server/uploads` and the LinkedIn login in `../linkedin-mcp` (both mounted). Connect
LinkedIn from this laptop at http://localhost:4000 (its login callback is localhost:3999). In Docker the app uses a SQL
login (tedious); on the laptop it keeps using Windows authentication (`DB_USER` unset).

## Log meals from your phone (Telegram, free)
Send a meal photo, or text like "2 eggs + toast", to your own Telegram bot from anywhere. When the laptop is online, the app
fetches it (outgoing only: no firewall change), estimates it with Gemini, saves it to `meals` and replies with today's totals.
1. Telegram → **@BotFather** → `/newbot` → put the token in `server/.env` as `TELEGRAM_BOT_TOKEN=…` → `npm run app:update`.
2. Settings → **Telegram meal bot** → *Link my Telegram* → open the link on your phone → **Start**. Only that chat is accepted.
- A meal counts for the day you **sent** it (local midnight to midnight), even if the laptop picks it up later.
- Telegram keeps unread messages for 24 hours. Messages are saved to `tg_inbox` first, so an AI quota error just retries later.
- In the chat: `/today` (what you ate), `/undo` (remove the last meal), `/progress`, `/help`.
- **Progress photos** go through the same bot: caption the photo `progress front` (or `side` / `back`).

## ✨ AI + FDE (learn AI engineering + Forward Deployed Engineer skills)
- **Roadmap** (`server/data/ai-roadmap.json`): 14 levels, 69 lessons, from scratch to hired: math (linear algebra,
  probability, gradients) → Python/NumPy/pandas/Pydantic → ML with scikit-learn → deep learning with PyTorch → transformers/LLMs
  → LLM APIs (Claude, OpenAI, Gemini, Hugging Face, Ollama), structured output, tool calling → RAG + vector DBs + GraphRAG
  ("enormous knowledge") → tools/agents/MCP → **orchestration, multi-agent teams and harness engineering** → evals → FastAPI +
  Docker + Cloud Run + observability → LoRA fine-tuning → **FDE skills** → portfolio (3–4 GitHub projects), writing, open source,
  applying. Each lesson: free links (checked), a build in your own Level Up app, a checkpoint.
- **Today**: the next lesson, notes, streak, weekly count. **Stay updated**: 8 official AI blog feeds (RSS/Atom) refreshed
  daily by the always-on app; save/hide; "✍️ Post idea" opens LinkedIn → Posts with the article as your angle.

## LinkedIn connector (LinkedIn → 🔌 Connector)
One place for everything LinkedIn gives the app (idea adapted from ASTRA's Integrations page, rebuilt here):
1. **Your account**: a guided setup of your own free LinkedIn developer app (Page → app → products → redirect URL), keys
   saved only in `linkedin-mcp/.env` (changeable from this laptop only, never shown again), then **Connect LinkedIn**
   (OAuth, scopes `openid profile w_member_social`). Shows your photo, name, connected date and days left (logins last 60 days).
2. **Your network**: drop LinkedIn's official `Connections.csv` export; preview, then import (URL → email → name + company
   matching, fill-empty merge, company-move detection); tiles for fetched / new / merged / moved / accepted / skipped.
3. **Sync history**. The header chip and banners remind you when the login expires or the export is 30+ days old.
LinkedIn's API never shares connections, so nothing is scraped; every message is still sent by you.

## Referrals hub (LinkedIn → 🚀 Referrals)
Everything for a referral-led switch in one place. Nothing contacts LinkedIn: you send every message yourself.
- **228 target companies** (`server/data/target-companies.json`): Tier 1 ₹35L+, Tier 2 ₹25–40L, Tier 3 ₹18–28L (estimates from
  public salary reports; edit tiers, switch companies off or add your own in the app).
- **Import** your official `Connections.csv` with a preview first. Matches by URL → email → name + company, fills only empty
  fields, and notices when someone **moved to a target company**. Re-import monthly.
- **Hub**: next best people to ask (one per company, ranked by tier × role × relationship, with the reasons), alerts
  (moved, follow-up due → once, then stop, only one contact at a company, revisit, dormant ties).
- **Pipeline**: Target → Have a contact → Referral asked → Referred → Applied → Interviewing → Offer; one open card per
  company, next step + due date, park with a revisit date, reopen. Drag on desktop, stage menu on phone.
- **Jobs**: openings from 70 target companies' **public job-board APIs** (Greenhouse, Lever, Ashby, SmartRecruiters:
  made for listing jobs; no HTML scraping, no logins), refreshed daily by the always-on app. Keeps engineering roles in
  India or open-remote at your level (no staff/lead/manager, no US-only remote, no "far more years than you have"),
  scored for your stack/years (Referrals → Settings). Boards: `server/data/job-boards.json` (verified by sampling postings).
  Companies with their own careers sites (Google, Microsoft, Amazon…) keep a Careers link.
- **Remote (global)** category: 32 remote-first companies abroad that have hired engineers based in India.
- **People** search in plain English ("tier 1 engineering managers in bangalore"); unknown words are shown, never silently filter.
- **Insights**: funnel, median days to a referral, which relationships turn into referrals, coverage by category × tier.
- Logic: `server/src/referrals/` (engine, search, importer, companies), API `server/src/routes/referrals.js`.

## Workout, Meals, Progress
- **Workout**: today's session with a **▶ How to do it** for every move (demo frames + 3 form cues + video link), steps, sleep.
  Demo images are public domain ([free-exercise-db](https://github.com/yuhonas/free-exercise-db)) and live in
  `client/public/exercises` (`npm run exercises:fetch` re-downloads them). Moves come from `server/src/exercise-guide.js`.
- **Meals**: calories, protein, water, food log (photo → AI estimate, or the Telegram bot).
- **Progress**: weigh-in + trend + badges, weekly tape measurements, progress photos. Optional **AI comparison** (off by
  default): compares each photo with the last one in the same pose and gives a rough body-fat *range*. It can't measure cm;
  the tape is the real metric. When on, those photos are sent to Google Gemini.

## Development
```powershell
npm run dev          # UI on http://localhost:5173 + API on :4001 (live reload; the :4000 app keeps running)
```
The dev API starts with `--no-jobs`, so only the always-on app syncs and publishes. Nothing ever runs twice.

**Dev-only reset** (to replay unlocks + LEVEL COMPLETE): on the dev server only, Settings → 🧪 Developer tools → type RESET.
It clears AI + FDE lessons and game state (focus sessions, freezes, seen celebrations) after saving a snapshot you can
restore from the same card. DSA, projects, LeetCode and meals are never touched. The always-on app answers 404 for it.
When you're happy with a change, `npm run app:update` puts it on :4000.

## Database scripts
| Command | What it does |
|---|---|
| `npm run db:setup` | Creates the database and tables if they're missing, and loads the plan if it's empty. Your progress is kept. |
| `npm run db:reset` | **Deletes all progress** and reloads the plan from `server/data/plan.json` |
| `npm run plan:shift -- --days 7 --apply` | Move the whole plan (DSA days, project roadmap, plan start date) by N days; progress untouched. Dry run without `--apply`; undo with the opposite number |
| `npm run plan:build` | Re-generates `server/data/plan.json` from `../STUDY_PLAN.md` (run `db:reset` afterwards to load it) |

You can browse the data in SSMS: connect to `PSILENL266` → Databases → `DSATracker` → Tables
(`weeks`, `days`, `tasks`, `problems`, `review_log`, `study_log`, `settings`, `projects`, `project_tasks`).

## Code map
```
tracker/
├─ scripts/build-plan.js      STUDY_PLAN.md → server/data/plan.json (DSA days + project tasks)
├─ server/
│  ├─ .env                    SQL Server connection settings
│  └─ src/
│     ├─ index.js             Express app: mounts routes, serves client/dist in production
│     ├─ db.js                Connection pool (Windows auth via ODBC)
│     ├─ schema.sql           Tables (idempotent: IF OBJECT_ID(...) IS NULL CREATE ...)
│     ├─ setup-db.js          Create the DB, apply the schema, seed each area only if it's empty
│     └─ routes/
│        ├─ plan.js           /api/meta, /api/day/:date, /api/weeks, task + problem updates
│        └─ projects.js       /api/projects/:area, PATCH /api/project-tasks/:id  ← your TODO
└─ client/src/
   ├─ App.jsx                 Layout (sidebar / bottom tabs) + routes
   ├─ areas.js                The 6 areas: order, label, icon, accent colour
   ├─ api.js                  fetch wrapper, one function per endpoint
   ├─ styles.css              Colour tokens (top of file) + components
   ├─ components/ui.jsx       ProgressBar, ProgressRing, DiffPill, Md, …
   └─ pages/                  Home, DsaLayout + Today + Plan, ProjectPage, Workout (session, steps, sleep, weight),
                              Meals (calories, protein, water, food log)
```
