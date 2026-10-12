// Telegram meal bot: pure rules + the full flow against a fake Telegram server and a stub AI
// (no real bot, no Gemini quota used). Runs on DSATracker_Test like every other test file.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { startServer, stopServer, api, sqlQuery } = require('./helpers');
const bot = require('../src/telegram/bot');

const at = (y, mo, d, h, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime(); // local time

describe('rules', () => {
  test('a meal belongs to the local day it was sent (midnight to midnight)', () => {
    assert.equal(bot.localDate(at(2026, 10, 9, 0, 5)), '2026-10-09');
    assert.equal(bot.localDate(at(2026, 10, 9, 23, 59)), '2026-10-09');
    assert.equal(bot.localDate(at(2026, 10, 10, 0, 0)), '2026-10-10');
  });

  test('meal type: a word in the caption wins, otherwise the time of day', () => {
    assert.equal(bot.mealTypeFor('Lunch: 2 chapatis', at(2026, 10, 9, 21)), 'lunch');
    assert.equal(bot.mealTypeFor('evening snack', at(2026, 10, 9, 8)), 'snack');
    assert.equal(bot.mealTypeFor('', at(2026, 10, 9, 7, 30)), 'breakfast');
    assert.equal(bot.mealTypeFor('', at(2026, 10, 9, 13)), 'lunch');
    assert.equal(bot.mealTypeFor('', at(2026, 10, 9, 17)), 'snack');
    assert.equal(bot.mealTypeFor('', at(2026, 10, 9, 21)), 'dinner');
    assert.equal(bot.mealTypeFor('', at(2026, 10, 9, 1)), 'snack');
  });

  test('commands and message kinds', () => {
    assert.deepEqual(bot.parseCommand('/start AB12CD'), { cmd: 'start', arg: 'AB12CD' });
    assert.deepEqual(bot.parseCommand('/today@LevelUpBot'), { cmd: 'today', arg: '' });
    assert.equal(bot.parseCommand('2 eggs'), null);
    const chat = { id: 1, type: 'private' };
    assert.equal(bot.classify({ chat: { id: 1, type: 'group' }, text: 'hi' }).kind, 'ignore');
    assert.deepEqual(bot.classify({ chat, photo: [{ file_id: 's' }, { file_id: 'L' }], caption: 'lunch' }),
      { kind: 'photo', fileId: 'L', mimeType: 'image/jpeg', note: 'lunch' });
    assert.equal(bot.classify({ chat, document: { file_id: 'h', mime_type: 'image/heic', file_size: 3e6 } }).mimeType, 'image/heic');
    assert.equal(bot.classify({ chat, document: { file_id: 'h', mime_type: 'image/jpeg', file_size: 20e6 } }).kind, 'too_big');
    assert.equal(bot.classify({ chat, document: { file_id: 'p', mime_type: 'application/pdf' } }).kind, 'unsupported');
    assert.deepEqual(bot.classify({ chat, text: '2 eggs + toast' }), { kind: 'text', note: '2 eggs + toast' });
    assert.equal(bot.classify({ chat, sticker: {} }).kind, 'unsupported');
  });

  test('progress photo captions', () => {
    assert.equal(bot.progressPose('progress'), 'front');
    assert.equal(bot.progressPose('Progress side'), 'side');
    assert.equal(bot.progressPose('progress back pic'), 'back');
    assert.equal(bot.progressPose('lunch, back from office'), null); // meals mentioning "back" stay meals
  });

  test('replies escape HTML from the AI', () => {
    const text = bot.mealReply({
      estimate: { title: 'Eggs <b>&</b> toast', total: { calories: 300, protein_g: 18, carbs_g: 20, fat_g: 15 }, items: [], confidence: 'high', tip: '' },
      mealType: 'breakfast', date: '2026-10-09', today: '2026-10-09', eaten: { calories: 300, protein_g: 18 }, targets: { calories: 2050, protein_g: 130 },
    });
    assert.match(text, /Eggs &lt;b&gt;&amp;&lt;\/b&gt; toast/);
    assert.match(text, /1,750 kcal left/);
  });
});

describe('meal bot flow (fake Telegram + stub AI)', () => {
  const OWNER = 111;
  const STRANGER = 999;
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 0xff, 0xd9]);
  let tg; // fake Telegram server
  let queue = [];
  let sent = [];
  const typing = [];
  let nextId = 1;
  let runner;
  let pool;
  let aiMode = 'ok';

  const msg = (chatId, fields, ms = Date.now()) => queue.push({ update_id: nextId++, message: { chat: { id: chatId, type: 'private' }, date: Math.floor(ms / 1000), ...fields } });
  const poll = async () => { await runner.pollOnce(pool, { timeout: 0 }); };
  const repliesTo = (chat) => sent.filter((s) => s.chat_id === chat).map((s) => s.text);

  before(async () => {
    await startServer();
    tg = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const ok = (result) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: true, result })); };
        if (req.url.startsWith('/file/')) return res.end(JSON_PHOTO());
        const method = req.url.split('/').pop();
        const p = body ? JSON.parse(body) : {};
        if (method === 'getMe') return ok({ id: 42, is_bot: true, username: 'LevelUpTestBot' });
        if (method === 'getUpdates') return ok(queue.filter((u) => !p.offset || u.update_id >= p.offset));
        if (method === 'getFile') return ok({ file_id: p.file_id, file_path: `photos/${p.file_id}.jpg` });
        if (method === 'sendMessage') { sent.push(p); return ok({ message_id: sent.length }); }
        if (method === 'sendChatAction') { typing.push(p); return ok(true); }
        res.statusCode = 404;
        return res.end(JSON.stringify({ ok: false, error_code: 404, description: 'Not Found' }));
      });
    });
    const JSON_PHOTO = () => JPEG;
    await new Promise((r) => tg.listen(0, '127.0.0.1', r));
    process.env.TELEGRAM_API_BASE = `http://127.0.0.1:${tg.address().port}`;
    process.env.TELEGRAM_BOT_TOKEN = '123456:TEST_TOKEN_abcdefghijklmnopqrstu';

    runner = require('../src/telegram/runner');
    pool = await require('../src/db').getPool();
    runner._setEstimator(async ({ imageBase64, note }) => {
      if (aiMode === 'quota') throw Object.assign(new Error('Free quota used up'), { status: 429 });
      if (aiMode === 'nofood') return { title: 'Nothing', items: [], total: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }, confidence: 'low', notes: 'That looks like a desk.', tip: '' };
      const cal = imageBase64 ? 520 : 300;
      return {
        title: imageBase64 ? 'Chicken curry with 2 chapatis' : `Text meal: ${note}`,
        items: [{ name: 'main', portion: '1 plate', calories: cal, protein_g: 30, carbs_g: 50, fat_g: 18 }],
        total: { calories: cal, protein_g: 30, carbs_g: 50, fat_g: 18 }, confidence: 'medium', notes: 'Assumed 1 tbsp oil', tip: 'Add a salad',
      };
    });
  });

  after(async () => {
    for (const { photo_path: p } of await sqlQuery('SELECT photo_path FROM dbo.tg_inbox WHERE photo_path IS NOT NULL')) {
      fs.rmSync(path.join(__dirname, '..', 'uploads', p), { force: true });
    }
    delete process.env.TELEGRAM_API_BASE;
    delete process.env.TELEGRAM_BOT_TOKEN;
    await new Promise((r) => tg.close(r));
    await stopServer();
  });

  test('pairing: only the one-time code links a chat; strangers are refused, then ignored', async () => {
    assert.equal((await api('GET', '/telegram')).body.linked, false);
    const { body } = await api('POST', '/telegram/pair');
    assert.match(body.code, /^[A-Z2-9]{6}$/);
    assert.equal(body.link, `https://t.me/LevelUpTestBot?start=${body.code}`);

    msg(STRANGER, { text: '/start WRONG1' });
    await poll();
    assert.match(repliesTo(STRANGER)[0], /not linked yet/);

    // A meal sent before linking gets instructions instead of silence, and isn't stored.
    msg(OWNER, { photo: [{ file_id: 'early' }] });
    await poll();
    assert.match(repliesTo(OWNER)[0], /not linked yet.*send this again/s);
    sent = [];

    msg(OWNER, { text: `/start ${body.code.toLowerCase()}` });
    await poll();
    assert.match(repliesTo(OWNER)[0], /Linked/);
    assert.equal((await api('GET', '/telegram')).body.linked, true);

    // The code was single-use, and a stranger's meal is silently ignored.
    msg(STRANGER, { text: `/start ${body.code}` });
    msg(STRANGER, { text: '2 eggs' });
    await poll();
    assert.equal(repliesTo(STRANGER).length, 0); // after linking: silence

    assert.equal((await sqlQuery('SELECT COUNT(*) AS n FROM dbo.tg_inbox'))[0].n, 0);
  });

  test('a photo becomes a meal for the day it was sent, with the photo stored and a reply', async () => {
    sent = [];
    msg(OWNER, { photo: [{ file_id: 'small' }, { file_id: 'big' }], caption: 'lunch, 2 chapatis' });
    await poll();
    const [meal] = await sqlQuery(`SELECT CONVERT(char(10), log_date, 23) AS d, meal_type, title, calories, source, photo_path FROM dbo.meals`);
    assert.equal(meal.d, bot.localDate(Date.now()));
    assert.equal(meal.meal_type, 'lunch');
    assert.equal(meal.calories, 520);
    assert.equal(meal.source, 'ai-photo');
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'uploads', meal.photo_path)));
    assert.match(repliesTo(OWNER)[0], /Chicken curry.*\n\n~<b>520 kcal<\/b>/s);
    assert.match(repliesTo(OWNER)[0], /520 \/ 2,050 kcal/);
    assert.ok(typing.some((t) => t.chat_id === OWNER && t.action === 'typing'), 'shows typing… while the AI works');
    // The Meals page sees it too.
    assert.equal((await api('GET', `/goals/${meal.d}`)).body.eaten.calories, 520);
  });

  test('a text meal sent late last night counts for last night, even when processed today', async () => {
    sent = [];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(23, 30, 0, 0);
    msg(OWNER, { text: '2 boiled eggs + 1 toast' }, yesterday.getTime());
    await poll();
    const [m] = await sqlQuery(`SELECT CONVERT(char(10), log_date, 23) AS d, meal_type, source FROM dbo.meals WHERE source = 'ai-text'`);
    assert.equal(m.d, bot.localDate(yesterday.getTime()));
    assert.equal(m.meal_type, 'dinner');
    assert.doesNotMatch(repliesTo(OWNER)[0], /Today/); // totals are only shown for today's meals
  });

  test('AI quota used up: saved as pending, one notice, then estimated on retry', async () => {
    sent = [];
    aiMode = 'quota';
    msg(OWNER, { text: 'dosa with sambar' });
    await poll();
    assert.match(repliesTo(OWNER)[0], /free AI limit/);
    let [row] = await sqlQuery(`SELECT status, attempts FROM dbo.tg_inbox WHERE note = 'dosa with sambar'`);
    assert.deepEqual(row, { status: 'pending', attempts: 1 });

    await poll(); // not due yet: no second attempt, no second notice
    assert.equal(repliesTo(OWNER).length, 1);

    aiMode = 'ok';
    const r = await api('POST', '/telegram/retry');
    assert.equal(r.body.logged, 1);
    [row] = await sqlQuery(`SELECT status FROM dbo.tg_inbox WHERE note = 'dosa with sambar'`);
    assert.equal(row.status, 'done');
    assert.match(repliesTo(OWNER)[1], /dosa with sambar/);
  });

  test('no food in the photo: nothing logged, photo removed, helpful reply', async () => {
    sent = [];
    aiMode = 'nofood';
    const before = (await sqlQuery('SELECT COUNT(*) AS n FROM dbo.meals'))[0].n;
    msg(OWNER, { photo: [{ file_id: 'desk' }] });
    await poll();
    aiMode = 'ok';
    assert.equal((await sqlQuery('SELECT COUNT(*) AS n FROM dbo.meals'))[0].n, before);
    const [row] = await sqlQuery(`SELECT status, photo_path FROM dbo.tg_inbox ORDER BY id DESC OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY`);
    assert.equal(row.status, 'failed');
    assert.ok(!fs.existsSync(path.join(__dirname, '..', 'uploads', row.photo_path)));
    assert.match(repliesTo(OWNER)[0], /couldn't see food.*desk/s);
  });

  test('/today lists meals, /undo removes the last Telegram meal, and the same update is never stored twice', async () => {
    sent = [];
    msg(OWNER, { text: '/today' });
    await poll();
    assert.match(repliesTo(OWNER)[0], /lunch: Chicken curry/);

    const before = (await sqlQuery('SELECT COUNT(*) AS n FROM dbo.meals'))[0].n;
    msg(OWNER, { text: '/undo' });
    await poll();
    assert.match(repliesTo(OWNER)[1], /Removed: Text meal: dosa with sambar/);
    assert.equal((await sqlQuery('SELECT COUNT(*) AS n FROM dbo.meals'))[0].n, before - 1);

    const update = { update_id: 5000, message: { chat: { id: OWNER, type: 'private' }, date: Math.floor(Date.now() / 1000), text: 'idli' } };
    await runner.handleUpdate(pool, update);
    await runner.handleUpdate(pool, update);
    assert.equal((await sqlQuery(`SELECT COUNT(*) AS n FROM dbo.tg_inbox WHERE update_id = 5000`))[0].n, 1);

    // The offset is saved, so a restart never re-reads handled messages.
    assert.equal(Number((await sqlQuery(`SELECT v FROM dbo.settings WHERE k = 'tg_offset'`))[0].v), nextId - 1);
  });

  test('"progress side" photos go to Progress photos; with AI on, the comparison comes back in the chat', async () => {
    const pp = require('../src/progress-photos');
    let seen = null;
    pp._setAnalyzer(async (input) => {
      seen = input;
      return { is_body_photo: true, changes: ['Waist looks narrower'], body_fat: { low: 30, high: 31, confidence: 'high' }, consistency_tip: 'Same lamp', encouragement: 'Keep going' };
    });
    sent = [];
    msg(OWNER, { photo: [{ file_id: 'side1' }], caption: 'Progress side' });
    await poll();
    assert.match(repliesTo(OWNER)[0], /side photo saved.*AI comparison is off/s);
    let rows = await sqlQuery(`SELECT pose, source, ai_status FROM dbo.progress_photos`);
    assert.deepEqual(rows, [{ pose: 'side', source: 'telegram', ai_status: null }]);
    assert.equal((await sqlQuery(`SELECT COUNT(*) AS n FROM dbo.tg_inbox WHERE note = 'Progress side'`))[0].n, 0); // not a meal

    // Turn the AI on; backdate the first photo so the new one has something to compare with.
    await api('PUT', '/settings', { progress_ai: true });
    await sqlQuery(`UPDATE dbo.progress_photos SET log_date = DATEADD(day, -14, log_date)`);
    sent = [];
    msg(OWNER, { photo: [{ file_id: 'side2' }], caption: 'progress side' });
    await poll();
    assert.match(repliesTo(OWNER)[0], /Comparing it/);
    const reply = repliesTo(OWNER)[1];
    assert.match(reply, /Waist looks narrower/);
    assert.match(reply, /30–35%/); // a range is never narrower than 5 points, and confidence is capped
    assert.match(reply, /medium confidence|low confidence/);
    assert.ok(seen.previous, 'compared with the earlier side photo');
    rows = await sqlQuery(`SELECT ai_status FROM dbo.progress_photos ORDER BY id`);
    assert.deepEqual(rows.map((r) => r.ai_status), [null, 'done']);

    // The page sees the analysis too.
    const list = (await api('GET', '/progress-photos')).body;
    assert.equal(list[0].ai.compared_with, list[1].log_date);
    for (const p of list) await api('DELETE', `/progress-photos/${p.id}`);
    await api('PUT', '/settings', { progress_ai: false });
  });

  test('settings card data and unlink', async () => {
    const info = (await api('GET', '/telegram')).body;
    assert.equal(info.configured, true);
    assert.equal(info.botUsername, 'LevelUpTestBot');
    assert.ok(info.recent.length >= 4);
    assert.equal((await api('POST', '/telegram/unlink')).body.linked, false);
  });
});
