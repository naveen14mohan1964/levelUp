// System design drills: a 35-minute timed prompt, one answer per step (requirements → estimates → API → data →
// scaling → trade-offs), a self-review against each step's key points, and flashcards made from your answers.
const fs = require('fs');
const path = require('path');
const { sql } = require('./db');
const { localDay, addDays } = require('./game/days');

const DRILLS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'hld-drills.json'), 'utf8'));
const STEPS = DRILLS.steps;
const TOTAL_MIN = STEPS.reduce((n, s) => n + s.minutes, 0);
const MIN_ANSWER = 20; // shorter answers don't become flashcards
const promptByKey = (k) => DRILLS.prompts.find((p) => p.key === k) || null;

/** Score 0–100 = share of key points you ticked, each step weighted equally (pure). */
function scoreDrill(prompt, checked = {}) {
  const per = STEPS.map((s) => {
    const pts = prompt.points[s.key] || [];
    const ticks = new Set((checked[s.key] || []).filter((i) => Number.isInteger(i) && i >= 0 && i < pts.length));
    return pts.length ? ticks.size / pts.length : 0;
  });
  return Math.round((per.reduce((a, b) => a + b, 0) / STEPS.length) * 100);
}

/** One flashcard per answered step: your answer + the key points (missed ones marked) (pure). */
function cardsFor(prompt, answers = {}, checked = {}) {
  return STEPS.filter((s) => String(answers[s.key] || '').trim().length >= MIN_ANSWER).map((s) => {
    const ticks = new Set(checked[s.key] || []);
    const pts = (prompt.points[s.key] || []).map((p, i) => `${ticks.has(i) ? '✓' : '✗'} ${p}`).join('\n');
    return {
      front: `System design · ${prompt.title}: ${s.label}. What would you cover?`.slice(0, 500),
      back: `Key points:\n${pts}\n\nYour answer:\n${String(answers[s.key]).trim()}`.slice(0, 2000),
    };
  });
}

const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const rowOut = (r) => r && ({
  id: r.id, prompt: r.prompt_key, startedMs: Number(r.started_ms), finishedMs: r.finished_ms == null ? null : Number(r.finished_ms),
  answers: parse(r.answers, {}), checked: parse(r.checked, {}), score: r.score, aiFeedback: r.ai_feedback, cards: r.cards,
});
const COLS = 'CAST(id AS int) AS id, prompt_key, started_ms, finished_ms, answers, checked, score, ai_feedback, cards';

async function getDrill(pool, id) {
  return rowOut((await pool.request().input('id', sql.Int, id).query(`SELECT ${COLS} FROM dbo.hld_drills WHERE id = @id`)).recordset[0]);
}

/** Prompts with how often / how well you've done each, history, and the suggested next prompt. */
async function overview(pool) {
  const rows = (await pool.request().query(`SELECT ${COLS} FROM dbo.hld_drills ORDER BY started_ms DESC`)).recordset.map(rowOut);
  const done = rows.filter((r) => r.finishedMs);
  const prompts = DRILLS.prompts.map((p) => {
    const mine = done.filter((r) => r.prompt === p.key);
    return { key: p.key, title: p.title, level: p.level, brief: p.brief, scale: p.scale, times: mine.length, best: mine.length ? Math.max(...mine.map((r) => r.score)) : null, last: mine[0]?.finishedMs || null };
  });
  // next: never-done prompts first (starter → core → advanced), then the lowest best score
  const LEVEL = { starter: 0, core: 1, advanced: 2 };
  const suggested = [...prompts].sort((a, b) => (a.times ? 1 : 0) - (b.times ? 1 : 0) || (a.times ? (a.best - b.best) : LEVEL[a.level] - LEVEL[b.level]))[0]?.key || null;
  const recent = done.slice(0, 5);
  return {
    steps: STEPS, totalMin: TOTAL_MIN, prompts, suggested,
    running: rows.find((r) => !r.finishedMs) || null,
    history: done.slice(0, 20).map((r) => ({ id: r.id, prompt: r.prompt, title: promptByKey(r.prompt)?.title || r.prompt, finishedMs: r.finishedMs, score: r.score })),
    avg: recent.length ? Math.round(recent.reduce((n, r) => n + r.score, 0) / recent.length) : null,
  };
}

/** Average of your last 5 drill scores as 0–1 (null if none): feeds company readiness. */
async function drillAvg(pool) {
  const r = await pool.request().query('SELECT TOP 5 score FROM dbo.hld_drills WHERE finished_ms IS NOT NULL ORDER BY finished_ms DESC');
  return r.recordset.length ? r.recordset.reduce((n, x) => n + x.score, 0) / r.recordset.length / 100 : null;
}

async function start(pool, key, now = Date.now()) {
  // one drill at a time: an unfinished one is abandoned when you start another
  await pool.request().query('DELETE FROM dbo.hld_drills WHERE finished_ms IS NULL');
  const r = await pool.request().input('k', sql.NVarChar, key).input('now', sql.BigInt, now)
    .query("INSERT INTO dbo.hld_drills (prompt_key, started_ms, answers, checked) OUTPUT CAST(INSERTED.id AS int) AS id VALUES (@k, @now, '{}', '{}')");
  return getDrill(pool, r.recordset[0].id);
}

const cleanAnswers = (a) => Object.fromEntries(STEPS.map((s) => [s.key, String(a?.[s.key] ?? '').slice(0, 4000)]));

async function save(pool, id, answers) {
  const r = await pool.request().input('id', sql.Int, id).input('a', sql.NVarChar(sql.MAX), JSON.stringify(cleanAnswers(answers)))
    .query('UPDATE dbo.hld_drills SET answers = @a WHERE id = @id AND finished_ms IS NULL; SELECT @@ROWCOUNT AS n');
  return r.recordset[0].n > 0;
}

/** Finish: store answers + ticks, score it, turn the answers into HLD flashcards (due tomorrow). */
async function finish(pool, id, { answers, checked }, now = Date.now()) {
  const d = await getDrill(pool, id);
  if (!d) return null;
  const prompt = promptByKey(d.prompt);
  const a = cleanAnswers(answers ?? d.answers);
  const c = Object.fromEntries(STEPS.map((s) => [s.key, [...new Set((checked?.[s.key] || []).map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < (prompt.points[s.key] || []).length))]]));
  const score = scoreDrill(prompt, c);
  const cards = d.finishedMs ? [] : cardsFor(prompt, a, c);
  const due = addDays(localDay(now), 1);
  for (const card of cards) {
    await pool.request().input('f', sql.NVarChar, card.front).input('b', sql.NVarChar, card.back).input('due', sql.Date, due).input('now', sql.BigInt, now)
      .query("INSERT INTO dbo.flashcards (track, source, front, back, due, created_ms) VALUES ('hld', 'drill', @f, @b, @due, @now)");
  }
  await pool.request().input('id', sql.Int, id).input('a', sql.NVarChar(sql.MAX), JSON.stringify(a)).input('c', sql.NVarChar(sql.MAX), JSON.stringify(c))
    .input('s', sql.Int, score).input('now', sql.BigInt, now).input('n', sql.Int, (d.cards || 0) + cards.length)
    .query('UPDATE dbo.hld_drills SET answers = @a, checked = @c, score = @s, finished_ms = COALESCE(finished_ms, @now), cards = @n WHERE id = @id');
  return { drill: await getDrill(pool, id), cardsMade: cards.length };
}

/** One Gemini call: a short interviewer-style review of a finished drill (optional, uses the free quota). */
async function aiFeedback(pool, id, generate) {
  const d = await getDrill(pool, id);
  if (!d || !d.finishedMs) return null;
  if (d.aiFeedback) return d;
  const p = promptByKey(d.prompt);
  const answers = STEPS.map((s) => `## ${s.label}\n${d.answers[s.key] || '(blank)'}`).join('\n\n');
  const text = await generate([{ text:
    `You are a senior engineer running a system design interview. The candidate (2 years' experience, preparing for product companies) answered this prompt in 35 minutes.\n\nPrompt: ${p.title}: ${p.brief} Scale: ${p.scale}.\n\n${answers}\n\n` +
    'Give feedback in under 220 words, plain text, no markdown headings: 1) the two strongest parts, 2) the three most important gaps or mistakes, each with the concrete fix, 3) one follow-up question an interviewer would ask next. Be specific to their answer; never invent details they did not write.' }],
  { temperature: 0.3, maxOutputTokens: 1500 });
  const out = String(text?.text ?? text ?? '').trim().slice(0, 3000);
  await pool.request().input('id', sql.Int, id).input('f', sql.NVarChar(sql.MAX), out).query('UPDATE dbo.hld_drills SET ai_feedback = @f WHERE id = @id');
  return getDrill(pool, id);
}

module.exports = { DRILLS, STEPS, TOTAL_MIN, promptByKey, scoreDrill, cardsFor, overview, drillAvg, start, save, finish, aiFeedback, getDrill };
