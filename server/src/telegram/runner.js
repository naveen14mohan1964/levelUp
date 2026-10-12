// Telegram meal bot runner. Flow for every message you send to your bot:
//   Telegram holds it (up to 24 h) -> laptop long-polls when online -> photo + text saved to dbo.tg_inbox
//   -> Gemini estimate -> dbo.meals -> reply with calories and today's totals.
// If the AI quota is used up or the laptop goes offline mid-way, the inbox row stays 'pending' and is retried.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { sql, getPool } = require('../db');
const tg = require('./api');
const bot = require('./bot');
const meals = require('../meals');
const { readSettings } = require('../routes/settings');
const progressPhotos = require('../progress-photos');

// When a progress photo that came from Telegram has been compared, send the result back to the chat.
progressPhotos.setNotifier(async (photo, err) => {
  if (photo?.source !== 'telegram') return;
  if (err?.willRetry && photo.ai_attempts > 1) return; // tell you about a retry only once
  const pool = await getPool();
  const chat = await getSetting(pool, 'tg_chat_id');
  if (chat) await reply(Number(chat), bot.progressReply(photo, err));
});

const NOT_LINKED = 'This bot is not linked yet. On the laptop open Level Up → Settings → Telegram meal bot → Link my Telegram, ' +
  'then tap the link it shows (or send /start CODE here).';
const MAX_ATTEMPTS = 8;
const RETRY_STEPS_MS = [2, 10, 30, 60].map((m) => m * 60 * 1000); // slow/unreachable AI: retry soon, then back off
const QUOTA_RETRY_MS = 2 * 60 * 60 * 1000; // daily AI quota: try again in 2 h

let estimateFn = (...a) => require('../gemini').estimateMeal(...a);
const state = { running: false, botUsername: null, lastPollAt: null, lastError: null, stopped: false };

/* ------------------------------- settings ------------------------------- */

async function getSetting(pool, k) {
  const r = await pool.request().input('k', sql.NVarChar, k).query('SELECT v FROM dbo.settings WHERE k = @k');
  return r.recordset[0]?.v ?? '';
}
async function setSetting(pool, k, v) {
  await pool.request().input('k', sql.NVarChar, k).input('v', sql.NVarChar, String(v)).query(`
    MERGE dbo.settings AS t USING (SELECT @k AS k) AS s ON t.k = s.k
    WHEN MATCHED THEN UPDATE SET v = @v WHEN NOT MATCHED THEN INSERT (k, v) VALUES (@k, @v);`);
}

/** A fresh one-time pairing code (no look-alike characters). */
async function newPairCode(pool) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const code = Array.from(crypto.randomBytes(6), (b) => alphabet[b % alphabet.length]).join('');
  await setSetting(pool, 'tg_pair_code', code);
  return code;
}

/* -------------------------------- replies -------------------------------- */

async function reply(chatId, text) {
  try {
    await tg.sendMessage(chatId, text);
  } catch (e) {
    console.warn('Telegram reply failed:', e.message); // the meal is saved either way
  }
}

async function targetsAndEaten(pool, date) {
  const s = await readSettings();
  return { targets: { calories: s.calorie_target, protein_g: s.protein_target_g }, eaten: await meals.dayTotals(pool, date) };
}

/* --------------------------------- inbox --------------------------------- */

/** Handles one Telegram update. Safe to call twice for the same update (dedupe on update_id). */
async function handleUpdate(pool, update) {
  const msg = update.message;
  const c = bot.classify(msg);
  if (c.kind === 'ignore') return;
  const chatId = msg.chat.id;
  const owner = await getSetting(pool, 'tg_chat_id');

  if (c.kind === 'command' && c.cmd === 'start') {
    if (owner && String(owner) === String(chatId)) return reply(chatId, `You're already linked ✅\n\n${bot.HELP}`);
    const code = await getSetting(pool, 'tg_pair_code');
    if (!owner && code && c.arg.toUpperCase() === code) {
      await setSetting(pool, 'tg_chat_id', chatId);
      await setSetting(pool, 'tg_pair_code', '');
      return reply(chatId, `Linked to your Level Up tracker ✅\n\n${bot.HELP}`);
    }
    if (owner) return; // someone else found the bot: stay silent
    return reply(chatId, NOT_LINKED);
  }
  // Not linked yet: explain how (the message itself isn't saved). Once linked, everyone else is ignored silently.
  if (!owner) return reply(chatId, `${NOT_LINKED}\n\nThen send this again.`);
  if (String(owner) !== String(chatId)) return; // only you, after pairing

  if (c.kind === 'command') {
    if (c.cmd === 'today') {
      const today = bot.localDate(Date.now());
      const r = await pool.request().input('d', sql.Date, today)
        .query('SELECT meal_type, title, calories FROM dbo.meals WHERE log_date = @d ORDER BY created_at');
      return reply(chatId, bot.todayReply({ meals: r.recordset, ...(await targetsAndEaten(pool, today)) }));
    }
    if (c.cmd === 'undo') return undo(pool, chatId);
    if (c.cmd === 'progress') return reply(chatId, bot.PROGRESS_HELP);
    return reply(chatId, bot.HELP);
  }
  if (c.kind === 'too_big') return reply(chatId, 'That file is over 12 MB. Send it as a normal photo instead.');
  if (c.kind === 'unsupported') return reply(chatId, bot.HELP);

  const sentMs = Number(msg.date) * 1000;
  const date = bot.localDate(sentMs);

  // "progress front/side/back" -> a progress photo (Progress page), compared by the AI later if that's on.
  const pose = c.kind === 'photo' ? bot.progressPose(c.note) : null;
  if (pose) {
    const file = await tg.downloadFile(c.fileId);
    const photo = await progressPhotos.addPhoto(pool, {
      buffer: file.buffer, mimeType: c.mimeType, date, pose, source: 'telegram', tgUpdateId: update.update_id,
    });
    return reply(chatId, photo.ai_status === 'pending'
      ? `📸 ${pose} photo saved for ${date}. Comparing it with your last one…`
      : `📸 ${pose} photo saved for ${date} (Progress page). AI comparison is off; you can turn it on there.`);
  }

  // Photo or text meal: store it first, so nothing is lost if the AI or network fails afterwards.
  let photoPath = null;
  if (c.kind === 'photo') {
    const file = await tg.downloadFile(c.fileId);
    photoPath = meals.savePhoto(file.buffer, c.mimeType, 'meals', date);
  }
  await pool.request()
    .input('u', sql.BigInt, update.update_id).input('chat', sql.BigInt, chatId).input('sent', sql.BigInt, sentMs)
    .input('d', sql.Date, date).input('type', sql.NVarChar, bot.mealTypeFor(c.note, sentMs))
    .input('note', sql.NVarChar, c.note || null).input('photo', sql.NVarChar, photoPath).input('now', sql.BigInt, Date.now())
    .query(`IF NOT EXISTS (SELECT 1 FROM dbo.tg_inbox WHERE update_id = @u)
            INSERT INTO dbo.tg_inbox (update_id, chat_id, sent_ms, log_date, meal_type, note, photo_path, created_ms)
            VALUES (@u, @chat, @sent, @d, @type, @note, @photo, @now)`);
}

async function undo(pool, chatId) {
  const r = await pool.request().query(`
    SELECT TOP 1 CAST(i.id AS int) AS id, CAST(m.id AS int) AS meal_id, m.title, m.photo_path
    FROM dbo.tg_inbox i JOIN dbo.meals m ON m.id = i.meal_id
    WHERE i.status = 'done' ORDER BY i.id DESC`);
  const last = r.recordset[0];
  if (!last) return reply(chatId, 'Nothing to undo: no meal from Telegram is logged.');
  await pool.request().input('m', sql.Int, last.meal_id).input('i', sql.Int, last.id).query(`
    DELETE FROM dbo.meals WHERE id = @m;
    UPDATE dbo.tg_inbox SET status = 'undone', meal_id = NULL WHERE id = @i;`);
  if (last.photo_path) fs.rm(path.join(meals.UPLOADS, last.photo_path), { force: true }, () => {});
  return reply(chatId, `Removed: ${bot.esc(last.title)} ↩️`);
}

const MIME = { '.png': 'image/png', '.webp': 'image/webp', '.heic': 'image/heic', '.heif': 'image/heif' };

/** Estimates every pending inbox row that is due. Returns how many meals were logged. */
let busy = false;
async function processInbox(pool) {
  if (busy) return 0;
  busy = true;
  let logged = 0;
  try {
    const due = await pool.request().input('now', sql.BigInt, Date.now()).query(`
      SELECT CAST(id AS int) AS id, chat_id, CONVERT(char(10), log_date, 23) AS log_date, meal_type, note, photo_path, attempts
      FROM dbo.tg_inbox WHERE status = 'pending' AND next_try_ms <= @now ORDER BY id`);
    for (const row of due.recordset) {
      if (await processOne(pool, row)) logged++;
    }
  } finally {
    busy = false;
  }
  return logged;
}

async function processOne(pool, row) {
  const chatId = Number(row.chat_id);
  const today = bot.localDate(Date.now());
  const { targets, eaten } = await targetsAndEaten(pool, row.log_date);
  const ctx = `Daily targets ${targets.calories} kcal and ${targets.protein_g} g protein (fat-loss plan, non-vegetarian Indian diet). ` +
    `Already eaten that day: ${eaten.calories} kcal, ${eaten.protein_g} g protein. Meal: ${row.meal_type}.`;

  let estimate;
  // "typing…" in Telegram while the AI works (it lasts ~5 s, so refresh it until the answer is ready).
  await tg.sendTyping(chatId);
  const typing = setInterval(() => tg.sendTyping(chatId), 4500);
  try {
    const image = row.photo_path ? fs.readFileSync(path.join(meals.UPLOADS, row.photo_path)) : null;
    estimate = await estimateFn({
      imageBase64: image ? image.toString('base64') : null,
      mimeType: image ? MIME[path.extname(row.photo_path).toLowerCase()] || 'image/jpeg' : undefined,
      note: row.note || '',
      context: ctx,
    });
  } catch (e) {
    const attempts = row.attempts + 1;
    const giveUp = attempts >= MAX_ATTEMPTS;
    // Daily quota: wait for it to reset. A slow/unreachable AI: try again soon (2, 10, 30 min…).
    const wait = e.status === 429 ? QUOTA_RETRY_MS : RETRY_STEPS_MS[Math.min(attempts - 1, RETRY_STEPS_MS.length - 1)];
    await pool.request().input('id', sql.Int, row.id).input('a', sql.Int, attempts)
      .input('st', sql.NVarChar, giveUp ? 'failed' : 'pending').input('next', sql.BigInt, Date.now() + wait)
      .input('err', sql.NVarChar, String(e.message).slice(0, 500))
      .query('UPDATE dbo.tg_inbox SET attempts = @a, status = @st, next_try_ms = @next, error = @err WHERE id = @id');
    if (giveUp) await reply(chatId, "❌ I couldn't estimate that meal after several tries. Please add it on the Meals page.");
    else if (attempts === 1) {
      await reply(chatId, e.status === 429
        ? "⏳ Saved. The free AI limit for today is used up, so I'll estimate it automatically in a couple of hours."
        : "⏳ Saved. The AI was slow to answer just now; I'll try again in 2 minutes.");
    }
    return false;
  } finally {
    clearInterval(typing);
  }

  if (!estimate.items?.length || !estimate.total?.calories) {
    await pool.request().input('id', sql.Int, row.id).input('err', sql.NVarChar, 'No food found')
      .query(`UPDATE dbo.tg_inbox SET status = 'failed', error = @err WHERE id = @id`);
    if (row.photo_path) fs.rm(path.join(meals.UPLOADS, row.photo_path), { force: true }, () => {});
    await reply(chatId, `🤔 I couldn't see food there. ${bot.esc(estimate.notes || '')}\nTry another photo, or type what you ate.`);
    return false;
  }

  const t = estimate.total;
  const mealId = await meals.insertMeal(pool, {
    date: row.log_date, meal_type: row.meal_type, title: estimate.title,
    calories: t.calories, protein_g: t.protein_g, carbs_g: t.carbs_g, fat_g: t.fat_g, items: estimate.items,
    source: row.photo_path ? 'ai-photo' : 'ai-text', confidence: estimate.confidence,
    notes: [row.note && `You said: ${row.note}`, estimate.notes, 'Logged from Telegram'].filter(Boolean).join(' · '),
    photo_path: row.photo_path,
  });
  await pool.request().input('id', sql.Int, row.id).input('m', sql.Int, mealId)
    .query(`UPDATE dbo.tg_inbox SET status = 'done', meal_id = @m, error = NULL WHERE id = @id`);
  await reply(chatId, bot.mealReply({
    estimate, mealType: row.meal_type, date: row.log_date, today, targets, eaten: await meals.dayTotals(pool, row.log_date),
  }));
  return true;
}

/* ---------------------------------- loop ---------------------------------- */

/** One long-poll round: store new messages, then estimate whatever is due. */
async function pollOnce(pool, { timeout = 50 } = {}) {
  const offset = Number(await getSetting(pool, 'tg_offset')) || 0;
  const updates = await tg.getUpdates(offset ? offset + 1 : undefined, timeout);
  for (const u of updates) {
    try {
      await handleUpdate(pool, u);
    } catch (e) {
      // A photo that can't be downloaded now is gone once acknowledged, so tell the user instead of looping.
      console.warn('Telegram message failed:', e.message);
      const chat = u.message?.chat?.id;
      const owner = await getSetting(pool, 'tg_chat_id');
      if (chat && String(chat) === String(owner)) await reply(chat, `⚠️ I couldn't save that one (${bot.esc(e.message)}). Please send it again.`);
    }
    await setSetting(pool, 'tg_offset', u.update_id); // acknowledged: Telegram won't send it again
  }
  state.lastPollAt = Date.now();
  state.lastError = null;
  await processInbox(pool);
  await progressPhotos.processPending(pool);
  return updates.length;
}

async function loop() {
  let backoff = 5000;
  while (!state.stopped) {
    try {
      const pool = await getPool();
      await pollOnce(pool);
      backoff = 5000;
    } catch (e) {
      state.lastError = e.message;
      if (e.status === 401) {
        console.warn('Telegram bot token was rejected: check TELEGRAM_BOT_TOKEN in server/.env. Bot stopped.');
        state.running = false;
        return;
      }
      // Offline (laptop asleep / no Wi-Fi) or Telegram busy: wait and try again, up to every 2 minutes.
      const wait = e.status === 409 ? 60_000 : backoff;
      backoff = Math.min(backoff * 2, 120_000);
      await new Promise((r) => setTimeout(r, wait).unref());
    }
  }
}

async function start() {
  if (!tg.isConfigured()) {
    console.log('Telegram meal bot: off (add TELEGRAM_BOT_TOKEN to server/.env to turn it on).');
    return;
  }
  try {
    state.botUsername = (await tg.getMe()).username;
  } catch (e) {
    state.lastError = e.message; // offline at startup is fine: the loop keeps retrying
  }
  state.running = true;
  console.log(`Telegram meal bot: listening${state.botUsername ? ` as @${state.botUsername}` : ''}.`);
  loop();
  // Pending meals (AI quota / network) are retried even when no new messages arrive.
  setInterval(() => getPool().then(async (pool) => {
    await processInbox(pool);
    await progressPhotos.processPending(pool);
  }).catch(() => {}), 10 * 60 * 1000).unref();
}

async function info(pool) {
  if (!state.botUsername && tg.isConfigured()) {
    state.botUsername = await tg.getMe().then((m) => m.username).catch(() => null);
  }
  const r = await pool.request().query(`
    SELECT status, COUNT(*) AS n FROM dbo.tg_inbox GROUP BY status;
    SELECT TOP 8 CAST(i.id AS int) AS id, i.status, i.meal_type, CONVERT(char(10), i.log_date, 23) AS log_date, i.note, i.error,
           i.photo_path, i.created_ms, m.title, m.calories
    FROM dbo.tg_inbox i LEFT JOIN dbo.meals m ON m.id = i.meal_id ORDER BY i.id DESC;`);
  return {
    configured: tg.isConfigured(),
    running: state.running,
    botUsername: state.botUsername,
    linked: !!(await getSetting(pool, 'tg_chat_id')),
    lastPollAt: state.lastPollAt,
    lastError: state.lastError,
    counts: Object.fromEntries(r.recordsets[0].map((x) => [x.status, x.n])),
    recent: r.recordsets[1].map((x) => ({ ...x, created_ms: Number(x.created_ms), photo_url: x.photo_path ? `/uploads/${x.photo_path}` : null })),
  };
}

module.exports = {
  start, info, pollOnce, processInbox, handleUpdate, newPairCode, setSetting,
  _setEstimator: (fn) => { estimateFn = fn; }, // tests only
};
