// Flashcards: spaced repetition for the concept tracks (AI + FDE, LLD, HLD).
// Every finished lesson becomes a card automatically: front = its checkpoint question, back = its key idea.
// You can add your own cards too. Scheduling is SM-2 style:
//   again (1)  forgot: back to the start, shown again today, ease -0.2
//   hard  (2)  interval x 1.2, ease -0.15
//   good  (3)  1 day -> 3 days -> interval x ease
//   easy  (4)  3 days -> interval x ease x 1.3, ease +0.15
const { sql } = require('./db');
const { ROADMAP } = require('./ai/feeds');
const { MODULES } = require('./learn/modules');
const { localDay } = require('./game/days');

const GRADES = { again: 1, hard: 2, good: 3, easy: 4 };
const MIN_EASE = 1.3;
const MAX_INTERVAL = 180;
const TRACK_LABEL = { ai: 'AI + FDE', lld: 'LLD', hld: 'HLD', judge: 'Judgement' };

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The next schedule for a card after a grade (pure). */
function schedule(card, grade, today) {
  let { ease = 2.5, interval_days: interval = 0, reps = 0 } = card;
  const { lapses = 0 } = card;
  if (grade === 1) return { ease: round2(Math.max(MIN_EASE, ease - 0.2)), interval_days: 0, reps: 0, lapses: lapses + 1, due: today };
  if (grade === 2) { interval = Math.max(1, Math.round(Math.max(interval, 1) * 1.2)); ease = Math.max(MIN_EASE, ease - 0.15); }
  else if (grade === 3) interval = reps === 0 ? 1 : reps === 1 ? 3 : Math.round(Math.max(interval, 1) * ease);
  else { interval = reps === 0 ? 3 : Math.round(Math.max(interval, 1) * ease * 1.3); ease += 0.15; }
  interval = Math.min(MAX_INTERVAL, interval);
  reps += 1;
  return { ease: round2(ease), interval_days: interval, reps, lapses, due: addDays(today, interval) };
}
const round2 = (x) => Math.round(x * 100) / 100;

/** Every lesson of the card tracks: "track|ref" -> { track, ref, title, level, front, back }. */
function lessonCatalog() {
  const map = new Map();
  const add = (track, roadmap) => {
    for (const lv of roadmap.levels) {
      for (const x of lv.lessons) {
        if (!x.check) continue;
        map.set(`${track}|${x.id}`, { track, ref: x.id, title: x.title, level: lv.n, front: x.check, back: `${x.learn}${x.build ? `\n\nTry it: ${x.build}` : ''}` });
      }
    }
  };
  add('ai', ROADMAP);
  for (const m of Object.values(MODULES)) add(m.key, m.roadmap);
  return map;
}

/** Make the missing cards for finished lessons (due the day after you finished the lesson, or today). */
async function syncLessonCards(pool, now = Date.now()) {
  const catalog = lessonCatalog();
  const r = await pool.request().query(`
    SELECT 'ai' AS track, lesson_id, done_ms FROM dbo.ai_progress WHERE done_ms IS NOT NULL
    UNION ALL SELECT track, lesson_id, done_ms FROM dbo.learn_progress WHERE done_ms IS NOT NULL;
    SELECT track, lesson_ref FROM dbo.flashcards WHERE lesson_ref IS NOT NULL;`);
  const have = new Set(r.recordsets[1].map((x) => `${x.track}|${x.lesson_ref}`));
  const today = localDay(now);
  let made = 0;
  for (const row of r.recordsets[0]) {
    const key = `${row.track}|${row.lesson_id}`;
    const l = catalog.get(key);
    if (!l || have.has(key)) continue;
    const due = addDays(localDay(Number(row.done_ms)), 1);
    await pool.request().input('t', sql.NVarChar, l.track).input('ref', sql.NVarChar, l.ref)
      .input('f', sql.NVarChar, l.front.slice(0, 500)).input('b', sql.NVarChar, l.back.slice(0, 2000))
      .input('due', sql.Date, due < today ? today : due).input('now', sql.BigInt, now)
      .query(`IF NOT EXISTS (SELECT 1 FROM dbo.flashcards WHERE track = @t AND lesson_ref = @ref)
              INSERT INTO dbo.flashcards (track, lesson_ref, source, front, back, due, created_ms) VALUES (@t, @ref, 'lesson', @f, @b, @due, @now)`);
    made++;
  }
  return made;
}

const CARD_COLS = `CAST(id AS int) AS id, track, lesson_ref, source, front, back, ease, interval_days, reps, lapses,
  CONVERT(char(10), due, 23) AS due, created_ms, last_review_ms`;

/** The deck: today's queue (oldest due first), counts per track, and every card. */
async function deck(pool, now = Date.now()) {
  await syncLessonCards(pool, now);
  const today = localDay(now);
  const catalog = lessonCatalog();
  const r = await pool.request().query(`
    SELECT ${CARD_COLS} FROM dbo.flashcards ORDER BY due, id;
    SELECT reviewed_ms, grade FROM dbo.flashcard_reviews ORDER BY reviewed_ms;`);
  const cards = r.recordsets[0].map((c) => ({
    ...c,
    created_ms: Number(c.created_ms),
    last_review_ms: c.last_review_ms == null ? null : Number(c.last_review_ms),
    title: catalog.get(`${c.track}|${c.lesson_ref}`)?.title || null,
    trackLabel: TRACK_LABEL[c.track] || c.track,
  }));
  const todayReviews = r.recordsets[1].filter((x) => localDay(Number(x.reviewed_ms)) === today);
  // each due card carries what each grade would do (the buttons show "1d", "3d", ...)
  const due = cards.filter((c) => c.due <= today)
    .map((c) => ({ ...c, preview: Object.fromEntries(Object.entries(GRADES).map(([k, g]) => [k, schedule(c, g, today).interval_days])) }));
  return {
    today,
    due,
    counts: {
      total: cards.length,
      due: due.length,
      learning: cards.filter((c) => c.interval_days < 21).length,
      mature: cards.filter((c) => c.interval_days >= 21).length,
      reviewedToday: todayReviews.length,
      rememberedToday: todayReviews.filter((x) => x.grade >= 3).length,
    },
    byTrack: Object.keys(TRACK_LABEL).map((t) => ({ track: t, label: TRACK_LABEL[t], total: cards.filter((c) => c.track === t).length, due: due.filter((c) => c.track === t).length })),
    cards,
  };
}

/** Grade a card: store its next schedule and log the review (for XP and the weekly report). */
async function review(pool, id, grade, now = Date.now()) {
  const r = await pool.request().input('id', sql.Int, id).query(`SELECT ${CARD_COLS} FROM dbo.flashcards WHERE id = @id`);
  const card = r.recordset[0];
  if (!card) return null;
  const next = schedule(card, grade, localDay(now));
  await pool.request().input('id', sql.Int, id).input('e', sql.Float, next.ease).input('i', sql.Int, next.interval_days)
    .input('r', sql.Int, next.reps).input('l', sql.Int, next.lapses).input('due', sql.Date, next.due).input('now', sql.BigInt, now).input('g', sql.TinyInt, grade)
    .query(`UPDATE dbo.flashcards SET ease = @e, interval_days = @i, reps = @r, lapses = @l, due = @due, last_review_ms = @now WHERE id = @id;
            INSERT INTO dbo.flashcard_reviews (card_id, reviewed_ms, grade) VALUES (@id, @now, @g);`);
  return { id, ...next };
}

module.exports = { GRADES, TRACK_LABEL, schedule, lessonCatalog, syncLessonCards, deck, review, addDays };
