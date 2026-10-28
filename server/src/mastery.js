// Pattern mastery (DSA topics), the daily practice pick, and company readiness.
//   patternScore()  pure: 0–100 from coverage, confidence, review success and freshness
//   loadPatterns()  every pattern (plan topic) with its numbers, in plan order
//   choosePick()    pure: the weakest started pattern → one problem (new, or a shaky one to re-solve)
//   picks()         today's pick (locked the first time you see it) + tomorrow's (live until tomorrow)
//   readiness()     per target company: readiness % from its interview profile + the 3 biggest gaps
const fs = require('fs');
const path = require('path');
const { sql } = require('./db');
const { localDay, addDays, daysBetween } = require('./game/days');

const PROFILES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'interview-profiles.json'), 'utf8'));
const TARGET_SOLVES = 6; // solving 6 problems of a pattern earns full coverage credit
const FRESH_DAYS = 14; // after 2 weeks without practice, mastery fades slowly (to 70% at 60 days)

/** 0–100 for one pattern (pure). */
function patternScore({ solved = 0, total = 0, avgConf = null, reviews = 0, successRate = null, daysSince = null }) {
  if (!solved) return 0;
  const coverage = Math.min(1, solved / Math.max(1, Math.min(TARGET_SOLVES, total || TARGET_SOLVES)));
  const confidence = avgConf ? (avgConf - 1) / 4 : 0;
  const success = reviews ? successRate : 0.5;
  const fresh = daysSince == null || daysSince <= FRESH_DAYS ? 1 : Math.max(0.7, 1 - ((daysSince - FRESH_DAYS) * 0.3) / 46);
  return Math.round(100 * fresh * (0.4 * coverage + 0.35 * confidence + 0.25 * success));
}

const levelFor = (score, solved) => (!solved ? 'new' : score < 40 ? 'learning' : score < 70 ? 'building' : score < 85 ? 'solid' : 'mastered');

/** Every DSA pattern with its problems and numbers, in the order the plan teaches them. */
async function loadPatterns(pool, today) {
  const r = await pool.request().query(`
    SELECT CAST(p.id AS int) AS id, p.title, p.url, p.lc_number, p.difficulty, p.topic, p.status, p.confidence, p.is_stretch,
           p.interval_days, p.time_taken_min, p.notes, p.hint,
           CONVERT(char(10), p.next_review, 23) AS next_review, CONVERT(char(10), d.plan_date, 23) AS plan_date,
           CONVERT(char(10), p.solved_at, 23) AS solved_day
    FROM dbo.problems p LEFT JOIN dbo.days d ON d.id = p.day_id
    WHERE p.topic IS NOT NULL AND p.is_selftest = 0
    ORDER BY CASE WHEN d.plan_date IS NULL THEN 1 ELSE 0 END, d.plan_date, p.sort_order, p.id;
    SELECT CAST(l.problem_id AS int) AS problem_id, l.success, l.confidence, CONVERT(char(10), l.reviewed_at, 23) AS day
    FROM dbo.review_log l;`);
  const [problems, log] = r.recordsets;
  const logBy = new Map();
  for (const x of log) (logBy.get(x.problem_id) || logBy.set(x.problem_id, []).get(x.problem_id)).push(x);

  const order = [];
  const byTopic = new Map();
  for (const p of problems) {
    if (!byTopic.has(p.topic)) { byTopic.set(p.topic, []); order.push(p.topic); }
    byTopic.get(p.topic).push({ ...p, solved: p.status !== 'todo', log: logBy.get(p.id) || [] });
  }
  return order.map((topic) => {
    const list = byTopic.get(topic);
    const solvedList = list.filter((p) => p.solved);
    const confs = solvedList.map((p) => p.confidence).filter((c) => c != null);
    const attempts = list.flatMap((p) => p.log);
    const lastDay = [...attempts.map((a) => a.day), ...solvedList.map((p) => p.solved_day)].filter(Boolean).sort().at(-1) || null;
    const firstPlanDate = list.map((p) => p.plan_date).filter(Boolean).sort()[0] || null;
    const stats = {
      solved: solvedList.length,
      total: list.length,
      avgConf: confs.length ? Math.round((confs.reduce((a, b) => a + b, 0) / confs.length) * 10) / 10 : null,
      reviews: attempts.length,
      successRate: attempts.length ? attempts.filter((a) => a.success).length / attempts.length : null,
      daysSince: lastDay ? daysBetween(lastDay, today) : null,
    };
    const score = patternScore(stats);
    return {
      topic, ...stats, score, level: levelFor(score, stats.solved),
      successRate: stats.successRate == null ? null : Math.round(stats.successRate * 100),
      lastPracticed: lastDay, firstPlanDate,
      started: stats.solved > 0 || (!!firstPlanDate && firstPlanDate <= today),
      dueReviews: solvedList.filter((p) => p.next_review && p.next_review <= today).length,
      problems: list.map(({ log: l, ...p }) => ({ ...p, attempts: l.length, lastAttempt: l.map((a) => a.day).sort().at(-1) || p.solved_day || null })),
    };
  });
}

const DIFF_FOR = (score) => (score < 40 ? 'E' : score < 70 ? 'M' : 'H');
const DIFF_NAME = { E: 'easy', M: 'medium', H: 'hard' };

/**
 * The practice pick for `date` (pure): the weakest pattern you've started (by the plan date or by solving), then
 * a problem at the right difficulty: unsolved first, else a solved one you rated ≤ 2 to re-solve.
 * Skips problems the plan already has on that date and recent picks; avoids repeating yesterday's pattern if
 * another one is within 5 points.
 */
function choosePick(patterns, date, recent = []) {
  let pool = patterns.filter((p) => p.solved > 0 || (p.firstPlanDate && p.firstPlanDate <= date));
  const warmUp = !pool.length;
  if (warmUp) pool = patterns.filter((p) => p.firstPlanDate).slice(0, 1); // before the plan starts: a warm-up from the first pattern
  if (!pool.length) return null;
  const recentIds = new Set(recent.map((x) => x.problem_id));
  const lastTopic = recent[0]?.topic;
  const ranked = [...pool].sort((a, b) => a.score - b.score || patterns.indexOf(a) - patterns.indexOf(b));
  for (let i = 0; i < ranked.length; i++) {
    const pat = ranked[i];
    if (pat.topic === lastTopic && ranked[i + 1] && ranked[i + 1].score - pat.score <= 5) continue;
    const want = DIFF_FOR(pat.score);
    const usable = pat.problems.filter((p) => !recentIds.has(p.id) && p.plan_date !== date);
    const unsolved = usable.filter((p) => !p.solved && !p.is_stretch);
    const rank = (p) => Math.abs('EMH'.indexOf(p.difficulty) - 'EMH'.indexOf(want));
    const fresh = [...unsolved].sort((a, b) => rank(a) - rank(b))[0];
    const shaky = usable.filter((p) => p.solved && p.confidence != null && p.confidence <= 2).sort((a, b) => a.confidence - b.confidence)[0];
    // a shaky re-solve wins when there's one and the pattern is still weak
    const pick = shaky && pat.score < 70 ? { p: shaky, kind: 'resolve' } : fresh ? { p: fresh, kind: 'new' } : shaky ? { p: shaky, kind: 'resolve' } : null;
    if (!pick) continue;
    const why = pat.solved ? `${pat.topic} is your weakest pattern so far (mastery ${pat.score}%).`
      : warmUp ? `Warm-up: ${pat.topic} is first in your plan.`
        : `${pat.topic} is in your plan now and you haven't started it.`;
    const how = pick.kind === 'resolve'
      ? `Re-solve it from a blank editor: you rated it ${pick.p.confidence}/5.`
      : `${pick.p.difficulty === 'E' ? 'An' : 'A'} ${DIFF_NAME[pick.p.difficulty]} one${pick.p.difficulty === want ? '' : ' (closest to the right level)'} to build it up.`;
    return { date, topic: pat.topic, score: pat.score, problem_id: pick.p.id, kind: pick.kind, reason: `${why} ${how}` };
  }
  return null;
}

/** Today's pick (stored the first time it's shown, so it doesn't change under you) and tomorrow's (live). */
async function picks(pool, patterns, today) {
  const r = await pool.request().input('d', sql.Date, today).query(`
    SELECT CONVERT(char(10), pick_date, 23) AS date, topic, CAST(problem_id AS int) AS problem_id, kind, reason
    FROM dbo.pattern_picks WHERE pick_date >= DATEADD(day, -7, @d) ORDER BY pick_date DESC;`);
  const recent = r.recordset;
  let todayPick = recent.find((x) => x.date === today) || null;
  if (!todayPick) {
    todayPick = choosePick(patterns, today, recent.filter((x) => x.date < today));
    if (todayPick) {
      await pool.request().input('d', sql.Date, today).input('t', sql.NVarChar, todayPick.topic).input('p', sql.Int, todayPick.problem_id)
        .input('k', sql.NVarChar, todayPick.kind).input('r', sql.NVarChar, todayPick.reason).input('now', sql.BigInt, Date.now())
        .query(`IF NOT EXISTS (SELECT 1 FROM dbo.pattern_picks WHERE pick_date = @d)
                INSERT INTO dbo.pattern_picks (pick_date, topic, problem_id, kind, reason, created_ms) VALUES (@d, @t, @p, @k, @r, @now)`);
    }
  }
  const tomorrow = addDays(today, 1);
  const tomorrowPick = choosePick(patterns, tomorrow, [todayPick, ...recent.filter((x) => x.date < today)].filter(Boolean));
  const problem = (id) => patterns.flatMap((p) => p.problems).find((p) => p.id === id) || null;
  const withProblem = (pk) => {
    if (!pk) return null;
    const p = problem(pk.problem_id);
    const done = !!p && !!p.lastAttempt && p.lastAttempt >= pk.date; // solved or re-solved on/after the pick day
    return { ...pk, problem: p, done };
  };
  return { today: withProblem(todayPick), tomorrow: withProblem(tomorrowPick) };
}

// ---------------- company readiness ----------------

const profileFor = (category) => PROFILES.profiles.find((p) => p.categories.includes(category))
  || PROFILES.profiles.find((p) => p.key === PROFILES.fallback);

/** Completion (0–1) of the given roadmap levels (all levels when the list is empty). */
function levelsDone(track, levels) {
  const pick = track ? track.levels.filter((lv) => !levels?.length || levels.includes(lv.n)) : [];
  return pick.map((lv) => ({ n: lv.n, title: lv.title, done: lv.lessons.filter((x) => x.done).length, total: lv.lessons.length }));
}
const ratio = (rows) => { const t = rows.reduce((n, r) => n + r.total, 0); return t ? rows.reduce((n, r) => n + r.done, 0) / t : 0; };

/** Readiness for one interview profile (pure): score 0–100, per-area scores and gaps ranked by impact. */
function profileReadiness(profile, { patterns, tracks, drillAvg }) {
  const w = { dsa: 0, hld: 0, lld: 0, ai: 0, ...profile.weights };
  const emph = (topic) => profile.patterns?.[topic] ?? 1;
  const totalE = patterns.reduce((n, p) => n + emph(p.topic), 0) || 1;
  const dsa = patterns.reduce((n, p) => n + emph(p.topic) * p.score, 0) / totalE / 100;
  const hldRows = levelsDone(tracks.hld, profile.hld);
  const lldRows = levelsDone(tracks.lld, profile.lld);
  const aiRows = levelsDone(tracks.ai, profile.ai);
  const hld = 0.6 * ratio(hldRows) + 0.4 * (drillAvg ?? 0);
  const lld = ratio(lldRows);
  const ai = ratio(aiRows);
  const score = Math.round(100 * (w.dsa * dsa + w.hld * hld + w.lld * lld + w.ai * ai));

  const gaps = [];
  for (const p of patterns) {
    const impact = (w.dsa * emph(p.topic) / totalE) * (1 - p.score / 100);
    const n = p.score < 40 ? 3 : 2;
    gaps.push({ kind: 'pattern', key: p.topic, impact, label: `${p.topic} (mastery ${p.score}%)`, action: `Solve ${n} ${DIFF_NAME[DIFF_FOR(p.score)]} ${p.topic} problems`, to: '/dsa/patterns' });
  }
  const levelGaps = (rows, area, weight, label, to) => {
    for (const r of rows) {
      if (r.done >= r.total) continue;
      gaps.push({ kind: area, key: `${area}${r.n}`, impact: (weight / rows.length) * (1 - r.done / r.total), label: `${r.done}/${r.total} lessons done`, action: `Finish ${label} level ${r.n}: ${r.title}`, to });
    }
  };
  levelGaps(hldRows, 'hld', w.hld * 0.6, 'HLD', '/hld?tab=roadmap');
  levelGaps(lldRows, 'lld', w.lld, 'LLD', '/lld?tab=roadmap');
  levelGaps(aiRows, 'ai', w.ai, 'AI', '/ai?tab=roadmap');
  if (w.hld) gaps.push({ kind: 'drill', key: 'drills', impact: w.hld * 0.4 * (1 - (drillAvg ?? 0)), label: drillAvg == null ? 'No system design drills yet' : `System design drills (avg ${Math.round(drillAvg * 100)}%)`, action: 'Do a 35-minute system design drill', to: '/hld/drills' });
  gaps.sort((a, b) => b.impact - a.impact);
  return {
    score,
    areas: { dsa: Math.round(dsa * 100), hld: Math.round(hld * 100), lld: Math.round(lld * 100), ...(w.ai ? { ai: Math.round(ai * 100) } : {}) },
    gaps: gaps.slice(0, 3).map(({ impact, ...g }) => ({ ...g, points: Math.round(impact * 100) })),
  };
}

/** Every target company with its readiness (one computation per profile). */
async function readiness(pool, { patterns, tracks, drillAvg }) {
  const r = await pool.request().query('SELECT CAST(id AS int) AS id, name, tier, category FROM dbo.ref_companies WHERE is_target = 1 ORDER BY tier, name');
  const cache = new Map();
  const companies = r.recordset.map((c) => {
    const prof = profileFor(c.category);
    if (!cache.has(prof.key)) cache.set(prof.key, profileReadiness(prof, { patterns, tracks, drillAvg }));
    const rd = cache.get(prof.key);
    const bar = PROFILES.readyAt[String(c.tier)] ?? 65;
    return { ...c, profile: prof.key, score: rd.score, readyAt: bar, ready: rd.score >= bar };
  });
  const profiles = PROFILES.profiles.map((p) => ({ key: p.key, label: p.label, rounds: p.rounds, categories: p.categories, weights: p.weights, ...(cache.get(p.key) || profileReadiness(p, { patterns, tracks, drillAvg })) }));
  return { about: PROFILES.about, readyAt: PROFILES.readyAt, profiles, companies };
}

module.exports = { patternScore, levelFor, loadPatterns, choosePick, picks, profileFor, profileReadiness, readiness, PROFILES, TARGET_SOLVES };
