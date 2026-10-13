// The Mentor's voice: a demanding coach who believes in you. Builds the context, asks Gemini for the message, checks it,
// and falls back to a deterministic template if the AI is unavailable or breaks a rule. Pure except generate().
const { templateFor } = require('../schedule');
const { LABEL, MVD, CATEGORIES } = require('./rules');
const { addDays } = require('../game/days');
const { dowOf, freshStart } = require('./time');

// Where each goal fits in your day (Mon–Fri / Sat / Sun timeline blocks): the default time for "tomorrow's one action"
const BLOCK_FOR = { dsa: 'dsa-am', workout: 'workout', project: 'project', learning: 'dsa-review', nutrition: 'commute' };
const FALLBACK_TIME = { dsa: '07:00', workout: '06:00', project: '14:00', learning: '21:30', nutrition: '08:00' };
const PRIORITY = ['dsa', 'workout', 'learning', 'project', 'nutrition']; // which miss gets the one action when several tie
const ACTION = { dsa: 'solve 1 medium problem before opening anything else', learning: 'do one 25-minute lesson block', project: 'finish the 📖 learn step, then start the build', workout: 'do the full session (or the 10-minute mode, no negotiating)', nutrition: 'log breakfast with ~35 g protein' };
const MVD_ACTION = { dsa: 'solve 1 easy problem. Just one.', learning: 'start the 5-minute timer and do one lesson section', project: 'tick the 📖 learn step only', workout: 'do the 10-minute mode', nutrition: 'log every meal, whatever it is' };
const XP_ESTIMATE = { learning: 25, project: 25 }; // DSA is counted per unsolved problem
const MAX_CHARS = 700;
// Never criticise the person. Behaviour only. (Checked on every AI message; a hit falls back to the template.)
const BANNED = /\b(lazy|loser|pathetic|useless|worthless|stupid|idiot|failure|hopeless|disappointment|never make it|give up|shame on you|you always fail)\b/i;
const HAS_TIME = /\b([01]?\d|2[0-3]):[0-5]\d\b|\b(1[0-2]|0?[1-9])\s?(am|pm)\b/i;

const dow0Mon = (day) => (dowOf(day) + 6) % 7; // schedule templates count Monday as 0

/** Time of the block where this goal lives on that day ("06:10"), or a sensible default. */
function slotTime(category, day) {
  const block = templateFor(dow0Mon(day)).find((b) => b.key === BLOCK_FOR[category]);
  return block ? block.start : FALLBACK_TIME[category];
}

/** The one concrete next action: a commitment you made beats the default slot; minimum days get the tiny version. */
function nextAction(ctx) {
  const missed = CATEGORIES.filter((c) => ctx.missedToday.includes(c));
  const pool = missed.length ? missed : ctx.tracked;
  const cat = [...pool].sort((a, b) => (ctx.misses[b] || 0) - (ctx.misses[a] || 0) || PRIORITY.indexOf(a) - PRIORITY.indexOf(b))[0] || 'dsa';
  const commit = ctx.commitmentsTomorrow.find((c) => c.category === cat);
  const time = commit ? commit.planned_at : slotTime(cat, ctx.tomorrow);
  const task = ctx.mvdTomorrow.includes(cat) ? MVD_ACTION[cat] : ACTION[cat];
  return { category: cat, time, task, place: commit?.place || null };
}

/**
 * Structured context for one message.
 * @param kind     evening | morning
 * evaluation: the day just evaluated (evening) or yesterday (morning), so "tomorrow" is the day the action is for
 */
function buildContext({ kind, evaluation, yesterdayEval, pace, streak, shields, commitments, settings, reason, blocker = null, shift = null }) {
  const day = evaluation.date;
  const tomorrow = addDays(day, 1); // evening: the day after; morning (evaluation = yesterday): today
  const tracked = settings.categories;
  const res = evaluation.results;
  const missedToday = tracked.filter((c) => ['missed', 'partial'].includes(res[c]?.status));
  const metToday = tracked.filter((c) => res[c]?.status === 'met');
  // XP you'd have earned: ~20 per unsolved DSA problem, a lesson or a project step for the others (workout/nutrition give none)
  const xpLost = missedToday.reduce((n, c) => n + (c === 'dsa' ? (res.dsa?.left || 0) * 20 : XP_ESTIMATE[c] || 0), 0);
  const comebackCats = yesterdayEval ? tracked.filter((c) => res[c]?.status === 'met' && ['missed', 'partial'].includes(yesterdayEval.results?.[c]?.status)) : [];
  const ctx = {
    kind,
    strictness: settings.strictness,
    date: day,
    tomorrow,
    level: evaluation.level,
    rest: evaluation.rest,
    tracked,
    results: Object.fromEntries(tracked.map((c) => [c, { status: res[c]?.status, detail: res[c]?.detail }])),
    missedToday,
    metToday,
    misses: evaluation.misses,
    mvdTomorrow: evaluation.mvdTomorrow || [],
    comebacks: comebackCats,
    xpLost,
    streak: streak ? { current: streak.current, best: streak.best, todayActive: streak.todayActive, shieldsLeft: streak.shields?.available ?? 0 } : null,
    shields: shields?.available ?? 0,
    daysLeft: pace?.daysLeft ?? null,
    pace: pace ? { status: pace.overall.status, daysBehind: pace.overall.daysBehind } : null,
    commitmentsKept: commitments.filter((c) => c.date === day && c.fulfilled != null).map((c) => ({ category: c.category, time: c.planned_at, kept: c.fulfilled })),
    commitmentsTomorrow: commitments.filter((c) => c.date === tomorrow),
    freshStart: freshStart(tomorrow),
    reason: reason || evaluation.reason || null,
    blocker,
    preStart: !evaluation.rest && tracked.every((c) => !res[c] || res[c].status === 'off'), // nothing counts yet (e.g. before the plan starts)
    shiftOffer: shift?.any ? { dsaDays: shift.dsa?.days || 0, projectDays: shift.project?.days || 0 } : null,
  };
  ctx.action = nextAction(ctx);
  return ctx;
}

const TONE = {
  gentle: 'Warm and calm, still direct. Encouraging, never soft on the facts.',
  standard: 'Direct, short and firm. A good senior engineer mentoring a junior.',
  drill: 'Blunt drill-sergeant energy: clipped sentences, zero excuses accepted, high intensity. Still never insulting the person.',
};

const SYSTEM = `You are "The Mentor" inside Level Up, a personal tracker for a 5-month software-engineer job switch (target: 20 LPA).
You are a demanding coach who believes in the user. Your purpose is to get them back on track tomorrow, never to make them feel bad.

Rules (never break them):
- Direct, short, specific. 2–5 short sentences plus the action line. No fluff, no excessive praise, at most one emoji.
- Name what was missed plainly with numbers from the context ("You skipped DSA. That's 2 days in a row.").
- Only mention misses that are in missedToday and numbers that are in the context. Never invent a miss, a number or a goal.
- Connect it to the mission: mention the days left in the 5-month plan.
- Criticise behaviour, never the person. Never say or imply they are lazy, a failure, hopeless, or will "never make it".
- Acknowledge wins and comebacks briefly and honestly.
- Escalation level decides the stance:
  0 on track: brief acknowledgement, no lecture.
  1 one miss: firm and short, ask for tomorrow's commitment (when + where).
  2 two misses: stronger, show the cumulative cost (streak, XP left on the table, days behind), say tomorrow is a minimum viable day with the tiny goals.
  3 three to four misses: serious talk. Ask what's blocking them (time, energy, difficulty or motivation) and offer to adjust the plan.
  4 five+ misses: stop pushing harder. Check in on how they are overall, propose a reduced plan, remind them why they started. Supportive but clear.
- Fresh start (Monday or the 1st): frame tomorrow as a clean reset point.
- End with exactly ONE concrete next action that includes the time, using the provided action (you may rephrase, keep the time).
Reply as JSON: { "message": "...", "action": "Tomorrow, HH:MM: ..." }.`;

/** The prompt sent with the context. */
function prompt(ctx) {
  const type = ctx.kind === 'morning' ? "morning message (today's goals + the commitment for today)"
    : ctx.kind === 'reply' ? "reply to what the user just told you (their reason and/or blocker): acknowledge it in one line, adjust the advice to the blocker, offer the plan shift if shiftOffer is set, then the one action"
      : 'end-of-day check-in';
  return `Tone: ${TONE[ctx.strictness] || TONE.standard}\nMessage type: ${type}\nContext (JSON):\n${JSON.stringify(ctx)}`;
}

const SCHEMA = { type: 'object', properties: { message: { type: 'string' }, action: { type: 'string' } }, required: ['message', 'action'] };

/** Does an AI message follow the rules? (length, an action with a time, no insults) */
function validate(text) {
  if (!text || text.length > MAX_CHARS) return 'length';
  if (BANNED.test(text)) return 'insult';
  if (!HAS_TIME.test(text)) return 'no time';
  return null;
}

const list = (cats) => cats.map((c) => LABEL[c]).join(', ');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// What to change for each blocker (level 3 "what's blocking you?")
const BLOCKER_ADVICE = {
  time: 'Then we shrink it, not skip it: one 25-minute block at a fixed time. Protect it like a meeting.',
  energy: 'Then we move it to your best hour and cut it to the minimum. Sleep and food are part of the plan, not a distraction from it.',
  difficulty: 'Then drop a level: easier problems, hints allowed, re-read the concept first. Struggling here is normal, not a verdict.',
  motivation: 'Then we go small and fast: 5 minutes, then decide. You started this for the switch; that reason hasn\'t changed.',
};

/** Deterministic fallback in the same voice. */
function template(ctx) {
  if (ctx.kind === 'reply') return replyTemplate(ctx);
  if (ctx.preStart) {
    const left = ctx.daysLeft != null ? ` ${ctx.daysLeft} days in the plan.` : '';
    const dsaAm = templateFor(0).find((b) => b.key === 'dsa-am')?.start || '06:10'; // Monday's DSA morning block
    return `Your plan hasn't started yet, so nothing counts today. From day 1, I check every goal at the end of the day and tell you plainly what slipped and the one thing to do next.${left}\nDay 1, ${dsaAm}: open DSA Day 1 and read the concept before anything else.`;
  }
  const a = ctx.action;
  const when = ctx.kind === 'morning' ? 'Today' : 'Tomorrow';
  const actionLine = `${when}, ${a.time}${a.place ? ` (${a.place})` : ''}: ${a.task}`;
  const left = ctx.daysLeft != null ? `${ctx.daysLeft} days left in the plan.` : '';
  const drill = ctx.strictness === 'drill';
  const gentle = ctx.strictness === 'gentle';
  const lines = [];

  if (ctx.kind === 'morning') {
    if (ctx.freshStart) lines.push(ctx.freshStart === 'month' ? 'New month. Clean slate. What you do today sets the tone for the next 30 days.' : 'New week. Clean slate.');
    lines.push(ctx.mvdTomorrow.length ? `Minimum day for ${list(ctx.mvdTomorrow)}: ${ctx.mvdTomorrow.map((c) => MVD[c]).join(', ')}. Never miss twice.` : `Today: ${list(ctx.tracked)}.`);
    const c = ctx.commitmentsTomorrow[0];
    if (c) lines.push(`You committed to ${LABEL[c.category]} at ${c.planned_at}${c.place ? `, ${c.place}` : ''}. Keep your word.`);
    if (left) lines.push(left);
    return `${lines.join(' ')}\n${actionLine}`;
  }

  if (ctx.comebacks.length) lines.push(`Comeback on ${list(ctx.comebacks)}. +${ctx.comebacks.length * 20} XP. That's how it's done.`);
  if (ctx.level === 0) {
    lines.push(drill ? 'All targets hit. Do it again tomorrow.' : 'All goals met today. Good. Same again tomorrow.');
    if (left) lines.push(left);
    return `${lines.join(' ')}\n${actionLine}`;
  }
  const worst = Math.max(...ctx.missedToday.map((c) => ctx.misses[c] || 0), 0);
  const active = ctx.tracked.filter((c) => ctx.results[c]?.status && ctx.results[c].status !== 'off');
  const sameRun = new Set(ctx.missedToday.map((c) => ctx.misses[c] || 0)).size === 1;
  // Everything slipped by the same count: one line instead of a list of five
  const missedText = ctx.missedToday.length > 1 && ctx.missedToday.length === active.length && sameRun
    ? `All ${ctx.missedToday.length} goals slipped (${list(ctx.missedToday)})`
    : ctx.missedToday.map((c) => `${LABEL[c]}${ctx.misses[c] > 1 ? ` (${plural(ctx.misses[c], 'day')} in a row)` : ''}`).join(', ');
  // Strictness changes the tone of the opening line, never the content (and never insults)
  const lead = {
    1: { gentle: "Today didn't go to plan:", standard: 'You missed:', drill: 'Missed. No excuses:' },
    2: { gentle: `Two days in a row now.`, standard: `That's ${plural(worst, 'day')} straight.`, drill: `${plural(worst, 'day')} straight. That ends tomorrow.` },
    3: { gentle: "Let's talk honestly.", standard: 'Serious talk.', drill: 'Serious talk. Stop and listen.' },
  };
  const tone = (lvl) => lead[lvl][ctx.strictness] || lead[lvl].standard;
  if (ctx.level === 1) {
    lines.push(`${tone(1)} ${missedText}.`);
    lines.push(gentle ? 'One day is a blip. Two is a pattern. Let\'s not make it two.' : 'One miss is a blip. Don\'t let it become two.');
    lines.push('When and where will you do it tomorrow? Reply /commit HH:MM place.');
  } else if (ctx.level === 2) {
    lines.push(`${missedText}. ${tone(2)}`);
    const cost = [ctx.streak && !ctx.streak.todayActive && ctx.streak.current === 0 ? 'your streak' : null, ctx.xpLost ? `~${ctx.xpLost} XP left on the table` : null, ctx.pace?.daysBehind > 1 ? `${plural(ctx.pace.daysBehind, 'day')} behind plan` : null].filter(Boolean);
    if (cost.length) lines.push(`Cost so far: ${cost.join(', ')}.`);
    lines.push(`Tomorrow is a minimum viable day: ${ctx.mvdTomorrow.map((c) => MVD[c]).join(', ') || 'the tiny version of each goal'}. Never miss twice.`);
  } else if (ctx.level === 3) {
    lines.push(`${tone(3)} ${missedText}: ${plural(worst, 'day')} without it.`);
    lines.push('What\'s blocking you: time, energy, difficulty or motivation? Tell me and we adjust the plan instead of pretending.');
    if (ctx.pace?.daysBehind > 1) lines.push(`You're ${plural(ctx.pace.daysBehind, 'day')} behind. I can shift the unfinished days if that's the honest fix.`);
  } else {
    lines.push(`${worst} days off track. I'm not going to push harder; that doesn't work.`);
    lines.push('How are you doing, really? Let\'s cut the plan to the minimum for a few days and rebuild from there.');
    lines.push('Remember why you started: the switch to a better role.');
  }
  if (ctx.reason) lines.push(`You said: "${ctx.reason.slice(0, 120)}". Noted.`);
  if (left) lines.push(left);
  if (ctx.freshStart) lines.push(ctx.freshStart === 'month' ? 'Tomorrow starts a new month: a clean reset point.' : 'Tomorrow is Monday: a clean reset point.');
  return `${lines.join(' ')}\n${actionLine}`;
}

function replyTemplate(ctx) {
  const a = ctx.action;
  const lines = [];
  if (ctx.reason) lines.push(`Noted: "${ctx.reason.slice(0, 120)}". That explains today; it doesn't change tomorrow.`);
  if (ctx.blocker) lines.push(BLOCKER_ADVICE[ctx.blocker]);
  if (ctx.shiftOffer) {
    const parts = [ctx.shiftOffer.dsaDays ? `DSA by ${plural(ctx.shiftOffer.dsaDays, 'day')}` : null, ctx.shiftOffer.projectDays ? `projects by ${plural(ctx.shiftOffer.projectDays, 'day')}` : null].filter(Boolean);
    lines.push(`If the plan is the problem, I can shift your unfinished days (${parts.join(', ')}) so today is a fair start. Your call.`);
  }
  if (ctx.daysLeft != null) lines.push(`${ctx.daysLeft} days left.`);
  return `${lines.join(' ')}\nTomorrow, ${a.time}${a.place ? ` (${a.place})` : ''}: ${a.task}`;
}

/**
 * Write the message: Gemini first (persona + structured context), validated; the template if that fails.
 * @param generate injected for tests (defaults to the app's Gemini wrapper)
 * @returns { content, source: ai | template, reason? }
 */
async function writeMessage(ctx, { generate = require('../gemini').generate, isConfigured = require('../gemini').isConfigured } = {}) {
  if (ctx.preStart) return { content: template(ctx), source: 'template', reason: 'nothing is scheduled yet' };
  if (!isConfigured()) return { content: template(ctx), source: 'template', reason: 'ai not configured' };
  try {
    const raw = await generate([{ text: prompt(ctx) }], { system: SYSTEM, schema: SCHEMA, temperature: ctx.strictness === 'drill' ? 0.6 : 0.5, maxOutputTokens: 600 });
    const out = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const action = String(out.action || '').trim();
    const content = `${String(out.message || '').trim()}\n${action}`.trim();
    const problem = validate(content) || (HAS_TIME.test(action) ? null : 'action has no time');
    if (problem) return { content: template(ctx), source: 'template', reason: `ai message rejected (${problem})` };
    return { content, source: 'ai' };
  } catch (e) {
    return { content: template(ctx), source: 'template', reason: `ai failed (${e.message})` };
  }
}

module.exports = { SYSTEM, TONE, BLOCKER_ADVICE, buildContext, nextAction, slotTime, template, validate, writeMessage, prompt, MAX_CHARS };
