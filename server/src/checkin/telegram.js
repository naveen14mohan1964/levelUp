// The Mentor on Telegram: commands (/commit, /why, /rest, /sick, /mentor), replies to its messages, and the level-3
// buttons (blocker → advice → optional plan shift with a confirm step). Parsing is pure and unit-tested.
const { addDays } = require('../game/days');
const { localParts, hhmm } = require('./time');
const { LABEL } = require('./rules');
const actions = require('./actions');

const CATEGORY_WORDS = [
  ['dsa', /^(dsa|leetcode|lc|problems?|algo)$/i],
  ['learning', /^(learning|learn|ai|lld|hld|lesson|study)$/i],
  ['project', /^(project|projects|node|react|dotnet|\.net|build)$/i],
  ['workout', /^(workout|gym|jog|jogging|run|exercise|training)$/i],
  ['nutrition', /^(nutrition|food|meals?|diet|protein)$/i],
];
const BLOCKER_BUTTONS = [[['⏰ Time', 'time'], ['🔋 Energy', 'energy']], [['🧩 Difficulty', 'difficulty'], ['💭 Motivation', 'motivation']]];

/** "7", "7am", "7:30pm", "19:00", "0730" → "HH:MM" or null */
function parseTime(token) {
  const m = /^(\d{1,2})(?::?(\d{2}))?\s*(am|pm)?$/i.exec(String(token || '').trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  const ap = (m[3] || '').toLowerCase();
  if (ap && (h < 1 || h > 12)) return null; // '13pm' isn't a time
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * "/commit 7am desk dsa" → { time: '07:00', category: 'dsa', place: 'desk' }. Category words can go anywhere;
 * everything else is the place. Missing category → null (the caller uses the mentor's suggestion).
 */
function parseCommit(arg) {
  const tokens = String(arg || '').trim().split(/\s+/).filter(Boolean);
  // allow "7 am" written apart
  for (let i = 0; i < tokens.length - 1; i++) if (/^\d{1,2}(:\d{2})?$/.test(tokens[i]) && /^(am|pm)$/i.test(tokens[i + 1])) tokens.splice(i, 2, tokens[i] + tokens[i + 1]);
  let time = null;
  let category = null;
  const place = [];
  for (const t of tokens) {
    if (!time && parseTime(t)) { time = parseTime(t); continue; }
    const cat = CATEGORY_WORDS.find(([, re]) => re.test(t));
    if (!category && cat) { category = cat[0]; continue; }
    if (!/^(at|in|on|@)$/i.test(t)) place.push(t);
  }
  return { time, category, place: place.join(' ').slice(0, 100) || null };
}

/** The commitment's date: today if that time is still ahead, otherwise tomorrow. */
function commitDate(now, tz, time) {
  const { date, minutes } = localParts(now, tz);
  return hhmm(time) > minutes ? date : addDays(date, 1);
}

/** "/rest", "/rest tomorrow", "/rest 2026-10-24 family trip", "/sick today" → { date, note } */
function parseDayArg(arg, today, defaultDay) {
  const [first, ...rest] = String(arg || '').trim().split(/\s+/).filter(Boolean);
  const word = (first || '').toLowerCase();
  if (word === 'today') return { date: today, note: rest.join(' ') || null };
  if (word === 'tomorrow' || word === 'tmrw') return { date: addDays(today, 1), note: rest.join(' ') || null };
  if (/^\d{4}-\d{2}-\d{2}$/.test(word)) return { date: word, note: rest.join(' ') || null };
  return { date: defaultDay, note: [first, ...rest].filter(Boolean).join(' ') || null };
}

const blockerKeyboard = (date) => ({ inline_keyboard: BLOCKER_BUTTONS.map((row) => row.map(([text, b]) => ({ text, callback_data: `blk:${b}:${date}` }))) });

/** "/mentor": today so far, in one glance. */
async function statusText(pool, now) {
  const st = await require('./data').status(pool, now);
  const t = st.today;
  const icon = { met: '✅', partial: '◐', missed: '○', off: '–' };
  const lines = st.settings.categories.map((c) => `${icon[t.results[c]?.status] || '–'} ${LABEL[c]}: ${t.results[c]?.detail || ''}`);
  const commits = st.commitments.filter((c) => c.date >= t.date && c.fulfilled == null).map((c) => `• ${c.date === t.date ? 'Today' : c.date} ${c.planned_at}: ${LABEL[c.category]}${c.place ? ` (${c.place})` : ''}`);
  return [
    `<b>Today so far</b> (level ${t.level})`,
    ...lines,
    commits.length ? `\n<b>Commitments</b>\n${commits.join('\n')}` : '',
    `\n🛡 ${st.shields.available} shield${st.shields.available === 1 ? '' : 's'} · plan ${st.pace ? `${st.pace.overall.status}, ${st.pace.daysLeft} days left` : 'not started'}`,
    st.paused ? '⏸ Mentor paused (vacation mode)' : '',
  ].filter(Boolean).join('\n');
}

const HELP = [
  '/mentor: today so far',
  '/commit 7am desk dsa: when and where you\'ll do it (category optional)',
  '/why office ran late: tell the mentor what happened',
  '/rest tomorrow · /rest 2026-10-24: plan a rest day (limited per month)',
  '/sick · /sick tomorrow: a sick day (can be today)',
  'Or reply to any mentor message to answer it.',
].join('\n');

/**
 * Handle a mentor command. Returns true when it was one (so the meal bot ignores it).
 * @param send (text, extra?) → sends a notice to your chat · mentorSay(content, level, source, markup?) → a mentor message (saved + sent)
 */
async function handleCommand(pool, cmd, arg, { send, mentorSay }, now = Date.now(), deps = {}) {
  const s = await require('./data').mentorSettings();
  const { date: today } = localParts(now, s.tz);
  const esc = require('../telegram/bot').esc;
  try {
    if (cmd === 'mentor') { await send(await statusText(pool, now)); return true; }
    if (cmd === 'commit') {
      const c = parseCommit(arg);
      if (!c.time) { await send('When? Example: <b>/commit 7am desk dsa</b> (time first or last, category optional).'); return true; }
      const day = commitDate(now, s.tz, c.time);
      const category = c.category || (await suggestedCategory(pool, now));
      await actions.addCommitment(pool, { date: day, category, plannedAt: c.time, place: c.place });
      await send(`Locked in: ${day === today ? 'today' : 'tomorrow'} ${c.time}${c.place ? `, ${esc(c.place)}` : ''}: ${LABEL[category]}. I'll check.`);
      return true;
    }
    if (cmd === 'why') {
      if (!arg) { await send('Tell me what happened, e.g. <b>/why office release ran till 11pm</b>'); return true; }
      const day = await actions.currentDay(pool, now);
      const r = await actions.mentorReply(pool, { date: day, reason: arg }, now, deps);
      await mentorSay(r.content, r.level, r.source);
      return true;
    }
    if (cmd === 'rest' || cmd === 'sick') {
      const { date, note } = parseDayArg(arg, today, cmd === 'rest' ? addDays(today, 1) : today);
      const r = await actions.setRest(pool, { date, kind: cmd, note }, today);
      await send(`${cmd === 'rest' ? '🛌 Rest day' : '🤒 Sick day'} set for ${date === today ? 'today' : date}. The mentor stays quiet and nothing counts as missed. ${r.left} left this month.${cmd === 'sick' ? ' Rest properly.' : ''}`);
      return true;
    }
  } catch (e) {
    await send(`⚠️ ${esc(e.message)}`);
    return true;
  }
  return false;
}

/** The category the latest check-in pointed at (most consecutive misses), for "/commit 7am" without a category. */
async function suggestedCategory(pool, now) {
  const st = await require('./data').status(pool, now);
  const misses = st.today.misses || {};
  return st.settings.categories.slice().sort((a, b) => (misses[b] || 0) - (misses[a] || 0))[0] || 'dsa';
}

/**
 * A button press. Data: blk:<blocker>:<date> · shift:<date> · shiftok:<date> · shiftno
 * @param send (text, extra?) · answer(text) acknowledges the press · clear() removes the pressed message's buttons
 */
async function handleCallback(pool, data, { send, mentorSay, answer, clear }, now = Date.now(), deps = {}) {
  const esc = require('../telegram/bot').esc;
  const [kind, a, b] = String(data || '').split(':');
  try {
    if (kind === 'blk' && actions.BLOCKERS.includes(a)) {
      await answer('Thanks. Got it.');
      await clear();
      const r = await actions.mentorReply(pool, { date: b, blocker: a }, now, deps);
      await mentorSay(r.content, r.level, r.source, r.shift?.any ? { inline_keyboard: [[{ text: 'Shift my unfinished days', callback_data: `shift:${b}` }]] } : null);
      return true;
    }
    if (kind === 'shift') {
      const s = await require('./data').mentorSettings();
      const today = localParts(now, s.tz).date;
      const p = await actions.proposeShift(pool, today);
      await answer();
      if (!p.any) { await send('Nothing to shift: you have no unfinished days behind you.'); return true; }
      const parts = [p.dsa?.days ? `DSA by ${p.dsa.days} day${p.dsa.days === 1 ? '' : 's'}` : null, p.project?.days ? `projects by ${p.project.days} day${p.project.days === 1 ? '' : 's'}` : null].filter(Boolean);
      await send(`This moves your unfinished days forward (${parts.join(', ')}), so the first one is today. Finished work stays. The plan end moves too. Sure?`,
        { reply_markup: { inline_keyboard: [[{ text: `Yes, shift (${parts.join(', ')})`, callback_data: `shiftok:${today}` }, { text: 'No, keep the plan', callback_data: 'shiftno' }]] } });
      return true;
    }
    if (kind === 'shiftok') {
      await answer('Shifting…');
      await clear();
      const p = await actions.applyShift(pool, a);
      await send(`Done. ${[p.dsa?.days ? `DSA moved ${p.dsa.days} day${p.dsa.days === 1 ? '' : 's'}` : null, p.project?.days ? `projects moved ${p.project.days} day${p.project.days === 1 ? '' : 's'}` : null].filter(Boolean).join(', ')}. Today is a fair start, so now it counts.`);
      return true;
    }
    if (kind === 'shiftno') { await answer('Plan unchanged.'); await clear(); await send('Plan unchanged. Then tomorrow we hit it.'); return true; }
  } catch (e) {
    await answer();
    await send(`⚠️ ${esc(e.message)}`);
    return true;
  }
  return false;
}

/** A reply to one of the mentor's messages: your reason; the mentor answers. */
async function handleReply(pool, day, text, mentorSay, now = Date.now(), deps = {}) {
  const r = await actions.mentorReply(pool, { date: day, reason: text }, now, deps);
  await mentorSay(r.content, r.level, r.source);
}

module.exports = { HELP, parseTime, parseCommit, commitDate, parseDayArg, blockerKeyboard, statusText, handleCommand, handleCallback, handleReply };
