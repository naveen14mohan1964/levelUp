// Telegram meal bot: pure rules (no I/O), unit-tested in test/telegram.test.js.

/** YYYY-MM-DD in this machine's local time zone: a meal belongs to the day you SENT it (midnight to midnight). */
function localDate(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const MEAL_WORDS = [
  ['breakfast', /\b(breakfast|bf|morning)\b/i],
  ['lunch', /\blunch\b/i],
  ['snack', /\b(snack|snacks|evening snack)\b/i],
  ['dinner', /\b(dinner|supper)\b/i],
];

/** A meal word in the caption wins; otherwise the local time you sent it decides. */
function mealTypeFor(text, ms) {
  for (const [type, re] of MEAL_WORDS) if (re.test(text || '')) return type;
  const h = new Date(ms).getHours();
  if (h >= 4 && h < 11) return 'breakfast';
  if (h >= 11 && h < 16) return 'lunch';
  if (h >= 16 && h < 19) return 'snack';
  if (h >= 19) return 'dinner';
  return 'snack'; // midnight to 4 AM: a late-night bite
}

/** "/start ABC123" -> { cmd: 'start', arg: 'ABC123' }; also handles "/start@MyBot". */
function parseCommand(text) {
  const m = /^\/([a-z]+)(?:@\w+)?(?:\s+(.*))?$/i.exec((text || '').trim());
  return m ? { cmd: m[1].toLowerCase(), arg: (m[2] || '').trim() } : null;
}

/** What kind of message this is: a meal photo, a text meal, a command, or something we can't use. */
function classify(msg) {
  if (!msg) return { kind: 'ignore' };
  if (msg.chat?.type !== 'private') return { kind: 'ignore' };
  if (msg.photo?.length) {
    // Telegram sends several sizes; the largest is plenty (≤1280 px) and small enough to upload.
    const best = msg.photo[msg.photo.length - 1];
    return { kind: 'photo', fileId: best.file_id, mimeType: 'image/jpeg', note: msg.caption || '' };
  }
  const doc = msg.document;
  if (doc && /^image\/(jpeg|png|webp|heic|heif)$/.test(doc.mime_type || '')) {
    if ((doc.file_size || 0) > 12 * 1024 * 1024) return { kind: 'too_big' };
    return { kind: 'photo', fileId: doc.file_id, mimeType: doc.mime_type, note: msg.caption || '' };
  }
  if (typeof msg.text === 'string') {
    const command = parseCommand(msg.text);
    if (command) return { kind: 'command', ...command };
    return { kind: 'text', note: msg.text.slice(0, 500) };
  }
  return { kind: 'unsupported' };
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n0 = (x) => Math.round(Number(x) || 0).toLocaleString('en-IN');

function totalsLine(eaten, targets) {
  const left = targets.calories - eaten.calories;
  return `📊 <b>Today</b>: ${n0(eaten.calories)} / ${n0(targets.calories)} kcal · ${n0(eaten.protein_g)} / ${n0(targets.protein_g)} g protein\n` +
    (left >= 0 ? `${n0(left)} kcal left` : `${n0(-left)} kcal over (it's one day: tomorrow is a fresh start)`);
}

function mealReply({ estimate, mealType, date, today, eaten, targets }) {
  const t = estimate.total;
  const lines = [
    `🍽 <b>${esc(estimate.title)}</b> (${mealType}${date !== today ? `, ${date}` : ''})`,
    `~<b>${n0(t.calories)} kcal</b> · P ${n0(t.protein_g)} g · C ${n0(t.carbs_g)} g · F ${n0(t.fat_g)} g · confidence ${esc(estimate.confidence)}`,
  ];
  if (estimate.items?.length > 1) lines.push(estimate.items.map((i) => `• ${esc(i.name)} (${esc(i.portion)}): ${n0(i.calories)} kcal`).join('\n'));
  if (estimate.tip) lines.push(`💡 ${esc(estimate.tip)}`);
  if (date === today) lines.push(totalsLine(eaten, targets));
  lines.push('Wrong? /undo removes it (or delete it on the Meals page and log it again).');
  return lines.join('\n\n');
}

function todayReply({ meals, eaten, targets }) {
  if (!meals.length) return `Nothing logged today yet.\n\n${totalsLine(eaten, targets)}`;
  const list = meals.map((m) => `• ${m.meal_type}: ${esc(m.title)} (${n0(m.calories)} kcal)`).join('\n');
  return `${list}\n\n${totalsLine(eaten, targets)}`;
}

/** A photo captioned "progress …" is a progress photo: returns its pose (front unless side/back is named), else null. */
function progressPose(caption) {
  if (!/\bprogress\b/i.test(caption || '')) return null;
  return /\bside\b/i.exec(caption) ? 'side' : /\bback\b/i.exec(caption) ? 'back' : 'front';
}

function progressReply(photo, err) {
  if (err) {
    return err.willRetry
      ? `⏳ Your ${photo.pose} photo is saved. The AI comparison didn't work just now (${esc(err.message)}); I'll retry automatically.`
      : `📸 Your ${photo.pose} photo is saved, but I couldn't compare it: ${esc(err.message)}`;
  }
  const a = photo.ai;
  const lines = [`📸 <b>${photo.pose}</b> photo, ${photo.log_date}${a.compared_with ? ` vs ${a.compared_with}` : ' (first one in this pose: your baseline)'}`];
  if (a.changes.length) lines.push(a.changes.map((c) => `• ${esc(c)}`).join('\n'));
  lines.push(`Body fat (rough visual estimate): <b>${a.body_fat.low}–${a.body_fat.high}%</b>, ${a.body_fat.confidence} confidence. Your tape measurements are the real numbers.`);
  if (a.consistency_tip) lines.push(`📷 Next time: ${esc(a.consistency_tip)}`);
  if (a.encouragement) lines.push(`💪 ${esc(a.encouragement)}`);
  return lines.join('\n\n');
}

const PROGRESS_HELP = 'Send the photo with the caption <b>progress front</b>, <b>progress side</b> or <b>progress back</b>. ' +
  'Same light, clothes and distance every 2 weeks makes the comparison meaningful. Photos go to the Progress page.';

const HELP = [
  '📸 <b>Send a photo</b> of your meal (add a caption like "lunch, 2 chapatis" if you like).',
  '✍️ Or <b>type it</b>: "2 boiled eggs + 1 toast".',
  '📈 <b>Progress photo</b>: caption it "progress front" (or side / back).',
  'Everything counts for the day you send it. The laptop picks it up whenever it is online.',
  '/today: what you have eaten today\n/undo: remove the last meal I logged\n/progress: how to send progress photos\n/help: this message',
  '🧭 <b>The Mentor</b>\n/mentor: today so far\n/commit 7am desk dsa: when and where you\'ll do it\n/why …: tell it what happened\n/rest tomorrow · /sick: rest or sick day\nOr reply to any mentor message.',
].join('\n\n');

module.exports = { localDate, mealTypeFor, parseCommand, classify, mealReply, todayReply, progressPose, progressReply, HELP, PROGRESS_HELP, esc };
