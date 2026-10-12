// LinkedIn Phase 3 tests: dedupe + parsing (unit), limit enforcement (unit), and the outreach API on DSATracker_Test.
// Nothing here contacts LinkedIn: outreach is assisted (you send on LinkedIn yourself).
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/linkedin/contacts');
const L = require('../src/linkedin/limits');
const { startServer, stopServer, api, sqlQuery } = require('./helpers');

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const at = (y, mo, d, h, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime(); // local time

describe('dedupe + parsing (linkedin/contacts.js)', () => {
  test('profile URLs normalise (case, tracking params, missing scheme); non-profiles are rejected', () => {
    const n = 'https://www.linkedin.com/in/jane-doe-4b2a19/';
    assert.equal(C.normalizeProfileUrl('https://www.linkedin.com/in/Jane-Doe-4b2a19/?utm_source=share&trk=x'), n);
    assert.equal(C.normalizeProfileUrl('linkedin.com/in/jane-doe-4b2a19'), n);
    assert.equal(C.normalizeProfileUrl('https://in.linkedin.com/in/jane-doe-4b2a19/details/experience/'), n);
    assert.equal(C.normalizeProfileUrl('https://www.linkedin.com/company/razorpay/'), null);
    assert.equal(C.normalizeProfileUrl('https://evil.com/in/jane'), null);
  });

  test('one person = one key: URL variants collide; without a URL, name + company (ignoring case/spaces/accents)', () => {
    assert.equal(C.dedupeKey({ profile_url: 'linkedin.com/in/Jane-Doe/' }), C.dedupeKey({ profile_url: 'https://www.linkedin.com/in/jane-doe?x=1', name: 'Other' }));
    assert.equal(C.dedupeKey({ name: 'José  Kumar', company: 'Razor Pay' }), C.dedupeKey({ name: 'jose kumar', company: 'RAZORPAY' }));
    assert.notEqual(C.dedupeKey({ name: 'Ravi', company: 'Swiggy' }), C.dedupeKey({ name: 'Ravi', company: 'Zomato' }));
  });

  test('quick-add parses URL-only, multi-line and one-line formats, and reports what it can\'t read', () => {
    const { people, errors } = C.parseQuickAdd([
      'https://www.linkedin.com/in/priya-sharma-9a1b2c/',
      '',
      'Rahul Verma\nEngineering Manager at Swiggy | Ex-Amazon\nBengaluru\nhttps://linkedin.com/in/rahulverma',
      '',
      'Anita Rao | Technical Recruiter @ Atlassian | https://www.linkedin.com/in/anita-rao-77/',
      '',
      'https://www.linkedin.com/in/a-one/\nhttps://www.linkedin.com/in/b-two/',
      '',
      'just some text at a company',
    ].join('\n'));
    assert.deepEqual(people.map((p) => p.name), ['Priya Sharma', 'Rahul Verma', 'Anita Rao', 'A One', 'B Two']);
    assert.deepEqual([people[1].role, people[1].company, people[1].location], ['Engineering Manager', 'Swiggy', 'Bengaluru']);
    assert.deepEqual([people[2].role, people[2].company], ['Technical Recruiter', 'Atlassian']);
    assert.equal(errors.length, 1);
  });

  test("LinkedIn's Connections.csv: skips the Notes preamble, handles quoted commas, parses dates", () => {
    const csv = 'Notes:\n"When exporting your connection data, you may notice that some of the email addresses are missing."\n\nFirst Name,Last Name,URL,Email Address,Company,Position,Connected On\nRahul,Verma,https://www.linkedin.com/in/rahulverma,,"Swiggy, Bundl",Engineering Manager,06 Oct 2026\n';
    const rows = C.parseConnectionsCsv(csv);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, 'Rahul Verma');
    assert.equal(rows[0].company, 'Swiggy, Bundl');
    assert.equal(rows[0].profile_url, 'https://www.linkedin.com/in/rahulverma/');
    assert.equal(new Date(rows[0].connected_ms).getDate(), 6);
    assert.throws(() => C.parseConnectionsCsv('a,b\n1,2'), /Connections\.csv/);
  });

  test('templates render variables and report missing ones', () => {
    const c = { name: 'Rahul Verma', company: 'Swiggy', role: 'Engineering Manager' };
    assert.equal(C.renderTemplate('Hi {{first_name}}, love {{ company }}!', c), 'Hi Rahul, love Swiggy!');
    assert.deepEqual(C.missingVars('Hi {{first_name}} {{role}} {{location}}', c), ['location']);
  });

  test('search links: one per role × company, opened by you (LinkedIn + Google), capped at 12', () => {
    const links = C.searchLinks({ roles: ['Engineering Manager', 'Recruiter'], companies: ['Razorpay', 'Swiggy'], locations: ['Bengaluru'] });
    assert.equal(links.length, 4);
    assert.match(links[0].linkedin, /^https:\/\/www\.linkedin\.com\/search\/results\/people\/\?keywords=Engineering%20Manager%20Razorpay%20Bengaluru/);
    assert.match(decodeURIComponent(links[0].google), /site:linkedin\.com\/in "Engineering Manager" "Razorpay" Bengaluru/);
    assert.equal(C.searchLinks({ roles: Array.from({ length: 5 }, (_, i) => `r${i}`), companies: ['a', 'b', 'c'] }).length, 12);
  });
});

describe('limit enforcement (linkedin/limits.js)', () => {
  const hours = { start: '09:00', end: '21:00', days: [1, 2, 3, 4, 5, 6] }; // Mon–Sat
  const base = (now, extra = {}) => ({ now, paused: false, cooldownUntil: 0, hours, dailyCap: 15, weeklyCap: 80, sentToday: 0, sentLast7Days: [], nextSendMs: 0, ...extra });
  const tue10 = at(2026, 10, 6, 10);

  test('working hours and weekdays (local time)', () => {
    assert.equal(L.inWorkingHours(tue10, hours), true);
    assert.equal(L.inWorkingHours(at(2026, 10, 6, 8, 59), hours), false);
    assert.equal(L.inWorkingHours(at(2026, 10, 6, 21, 0), hours), false, 'end is exclusive');
    assert.equal(L.inWorkingHours(at(2026, 10, 11, 10), hours), false, 'Sunday is off');
    assert.equal(L.nextWindowStart(at(2026, 10, 10, 22), hours), at(2026, 10, 12, 9), 'Sat night → Mon 09:00 (skips Sunday)');
  });

  test('allowed when everything is fine', () => {
    assert.deepEqual(L.checkSend(base(tue10)), { ok: true });
  });

  test('blocked in priority order: kill switch, cool-down, hours, daily cap, weekly cap, pacing', () => {
    assert.equal(L.checkSend(base(tue10, { paused: true, cooldownUntil: tue10 + DAY })).reason, 'paused');
    assert.equal(L.checkSend(base(tue10, { cooldownUntil: tue10 + DAY })).reason, 'cooldown');
    assert.equal(L.checkSend(base(at(2026, 10, 6, 22))).reason, 'hours');
    const daily = L.checkSend(base(tue10, { sentToday: 15 }));
    assert.equal(daily.reason, 'daily_cap');
    assert.equal(daily.retryAt, at(2026, 10, 7, 9), 'tomorrow at 09:00');
    assert.equal(L.checkSend(base(tue10, { nextSendMs: tue10 + 30_000 })).reason, 'pacing');
  });

  test('weekly cap is a ROLLING 7 days and frees up when the oldest request ages out', () => {
    const sent = Array.from({ length: 80 }, (_, i) => tue10 - 6 * DAY + i * MIN);
    const r = L.checkSend(base(tue10, { sentLast7Days: sent }));
    assert.equal(r.reason, 'weekly_cap');
    assert.equal(r.retryAt, sent[0] + 7 * DAY);
    const older = sent.map((t) => t - 2 * DAY); // all older than 7 days
    assert.deepEqual(L.checkSend(base(tue10, { sentLast7Days: older })), { ok: true });
  });

  test('randomised pacing stays within [min, max] seconds', () => {
    assert.equal(L.randomDelayMs(45, 120, () => 0), 45_000);
    assert.equal(L.randomDelayMs(45, 120, () => 1), 120_000);
    for (let i = 0; i < 200; i++) {
      const d = L.randomDelayMs(45, 120);
      assert.ok(d >= 45_000 && d <= 120_000);
    }
  });

  test('notes budget: free = monthly budget (200 chars), Premium = unlimited (300 chars)', () => {
    assert.equal(L.notesLeft({ premium: false, budget: 5, usedThisMonth: 3 }), 2);
    assert.equal(L.notesLeft({ premium: false, budget: 5, usedThisMonth: 9 }), 0);
    assert.equal(L.notesLeft({ premium: true, budget: 5, usedThisMonth: 50 }), Infinity);
    assert.deepEqual([L.noteMaxChars(false), L.noteMaxChars(true)], [200, 300]);
  });
});

describe('outreach API (test database)', () => {
  before(async () => {
    await startServer();
    // Make the test independent of the clock: every day, all day; minimum pacing.
    const r = await api('PUT', '/linkedin/config', { work_days: [0, 1, 2, 3, 4, 5, 6], work_start: '00:00', work_end: '23:59', delay_min_s: 10, delay_max_s: 10, daily_cap: 5, weekly_cap: 80 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  });
  after(stopServer);
  beforeEach(async () => {
    await sqlQuery("DELETE FROM dbo.li_actions; DELETE FROM dbo.li_contacts; DELETE FROM dbo.li_lists; UPDATE dbo.settings SET v = '0' WHERE k IN ('li_next_send_ms', 'li_outreach_cooldown_until', 'li_paused')");
  });
  const clearPacing = () => sqlQuery("UPDATE dbo.settings SET v = '0' WHERE k = 'li_next_send_ms'");

  async function addList() {
    const r = await api('POST', '/linkedin/outreach/lists', { name: 'EMs', roles: 'Engineering Manager', companies: 'Razorpay, Swiggy', locations: 'Bengaluru' });
    assert.equal(r.status, 201);
    return r.body;
  }
  async function addPeople(n, listId) {
    const text = Array.from({ length: n }, (_, i) => `https://www.linkedin.com/in/person-${i}/`).join('\n\n');
    return (await api('POST', '/linkedin/outreach/contacts/quick-add', { text, list_id: listId })).body;
  }

  test('lists produce search links; quick-add dedupes and respects do-not-contact', async () => {
    const list = await addList();
    assert.equal(list.links.length, 2);
    const first = await addPeople(3, list.id);
    assert.equal(first.added.length, 3);
    const again = await api('POST', '/linkedin/outreach/contacts/quick-add', { text: 'https://www.linkedin.com/in/PERSON-0/?trk=x\n\nhttps://www.linkedin.com/in/person-9/', list_id: list.id });
    assert.deepEqual([again.body.added.length, again.body.duplicates.length], [1, 1], 'same person with a different URL form is a duplicate');
    await api('PATCH', `/linkedin/outreach/contacts/${first.added[1].id}`, { do_not_contact: true });
    const blocked = (await api('POST', '/linkedin/outreach/contacts/quick-add', { text: 'linkedin.com/in/person-1' })).body;
    assert.equal(blocked.doNotContact.length, 1);
    const queue = (await api('GET', '/linkedin/outreach')).body.queue.map((c) => c.name);
    assert.ok(!queue.includes('Person 1'), 'do-not-contact people never show in the queue');
  });

  test('sending: pacing between sends, daily cap, never the same person twice, undo', async () => {
    const { added } = await addPeople(7);
    assert.equal((await api('POST', `/linkedin/outreach/contacts/${added[0].id}/sent`, {})).status, 200);
    const tooSoon = await api('POST', `/linkedin/outreach/contacts/${added[1].id}/sent`, {});
    assert.equal(tooSoon.status, 429);
    assert.equal(tooSoon.body.reason, 'pacing');

    assert.equal((await api('POST', `/linkedin/outreach/contacts/${added[0].id}/sent`, {})).status, 409, 'never request the same person twice');

    for (const p of added.slice(1, 5)) {
      await clearPacing();
      assert.equal((await api('POST', `/linkedin/outreach/contacts/${p.id}/sent`, {})).status, 200);
    }
    await clearPacing();
    const capped = await api('POST', `/linkedin/outreach/contacts/${added[5].id}/sent`, {});
    assert.equal(capped.status, 429);
    assert.equal(capped.body.reason, 'daily_cap');
    assert.equal((await api('GET', '/linkedin/goal')).body.thisWeek.actual.connections, 5, 'counted on the Goal tab');

    const undo = await api('POST', `/linkedin/outreach/contacts/${added[4].id}/undo-sent`);
    assert.equal(undo.body.contact.status, 'not_contacted');
    assert.equal((await api('GET', '/linkedin/outreach')).body.limits.sentToday, 4);
  });

  test('weekly cap counts the rolling last 7 days', async () => {
    await api('PUT', '/linkedin/config', { daily_cap: 3, weekly_cap: 3 });
    const old = Date.now() - 6 * DAY;
    await sqlQuery(`INSERT INTO dbo.li_actions (contact_id, type, with_note, at_ms) VALUES (NULL, 'request_sent', 0, ${old}), (NULL, 'request_sent', 0, ${old + 1}), (NULL, 'request_sent', 0, ${old + 2})`);
    const { added } = await addPeople(1);
    const r = await api('POST', `/linkedin/outreach/contacts/${added[0].id}/sent`, {});
    assert.equal(r.status, 429);
    assert.equal(r.body.reason, 'weekly_cap');
    assert.ok(Math.abs(r.body.retryAt - (old + 7 * DAY)) < 1000);
    await api('PUT', '/linkedin/config', { daily_cap: 5, weekly_cap: 80 });
  });

  test('kill switch and LinkedIn-warning cool-down block sending', async () => {
    const { added } = await addPeople(1);
    await api('POST', '/linkedin/pause', { paused: true });
    assert.equal((await api('POST', `/linkedin/outreach/contacts/${added[0].id}/sent`, {})).body.reason, 'paused');
    await api('POST', '/linkedin/pause', { paused: false });
    const w = await api('POST', '/linkedin/outreach/warning', { detail: 'weekly invitation limit' });
    assert.ok(w.body.cooldownUntil > Date.now() + 6 * DAY);
    assert.equal((await api('POST', `/linkedin/outreach/contacts/${added[0].id}/sent`, {})).body.reason, 'cooldown');
    await api('POST', '/linkedin/outreach/resume');
    assert.equal((await api('POST', `/linkedin/outreach/contacts/${added[0].id}/sent`, {})).status, 200);
  });

  test('personalised notes: template rendering, length limit and the monthly budget', async () => {
    await api('PUT', '/linkedin/config', { note_budget_month: 1, premium: false });
    const { added } = (await api('POST', '/linkedin/outreach/contacts/quick-add', { text: 'Rahul Verma | Engineering Manager at Swiggy | https://www.linkedin.com/in/rahulverma/\n\nAnita Rao | Recruiter at Atlassian | https://www.linkedin.com/in/anita-rao/' })).body;
    const notes = (await api('POST', '/linkedin/outreach/notes', { contact_ids: added.map((a) => a.id), mode: 'template' })).body.notes;
    assert.match(notes[0].note, /^Hi Rahul,.*Swiggy/);
    assert.equal((await api('PATCH', `/linkedin/outreach/contacts/${added[0].id}`, { note: 'x'.repeat(201) })).status, 400, '200 characters on free accounts');

    assert.equal((await api('POST', `/linkedin/outreach/contacts/${added[0].id}/sent`, { with_note: true })).status, 200);
    await clearPacing();
    const none = await api('POST', `/linkedin/outreach/contacts/${added[1].id}/sent`, { with_note: true });
    assert.equal(none.status, 409);
    assert.match(none.body.error, /No personalised notes left/);
    assert.equal((await api('POST', `/linkedin/outreach/contacts/${added[1].id}/sent`, { with_note: false })).status, 200, 'without a note is fine');
    await api('PUT', '/linkedin/config', { note_budget_month: 5 });
  });

  test("Connections.csv import marks accepted requests as Connected and adds the rest of your network", async () => {
    const { added } = (await api('POST', '/linkedin/outreach/contacts/quick-add', { text: 'https://www.linkedin.com/in/rahulverma/' })).body;
    await api('POST', `/linkedin/outreach/contacts/${added[0].id}/sent`, {});
    const csv = 'Notes:\n"..."\n\nFirst Name,Last Name,URL,Email Address,Company,Position,Connected On\nRahul,Verma,https://www.linkedin.com/in/RahulVerma,,Swiggy,Engineering Manager,06 Oct 2026\nNeha,Iyer,https://www.linkedin.com/in/neha-iyer,,Flipkart,SDE 2,01 Jan 2025\n';
    const r = (await api('POST', '/linkedin/outreach/contacts/import-csv', { csv })).body;
    assert.deepEqual([r.rows, r.accepted.length, r.added], [2, 1, 1]);
    const rahul = (await api('GET', '/linkedin/outreach/contacts?q=Rahul')).body[0];
    assert.equal(rahul.status, 'connected');
    const again = (await api('POST', '/linkedin/outreach/contacts/import-csv', { csv })).body;
    assert.deepEqual([again.accepted.length, again.added, again.alreadyConnected], [0, 0, 2], 'importing twice changes nothing');
    assert.equal((await api('POST', '/linkedin/outreach/contacts/import-csv', { csv: 'nope' })).status, 400);
  });

  test('config validation keeps limits safe', async () => {
    assert.equal((await api('PUT', '/linkedin/config', { weekly_cap: 150 })).status, 400);
    assert.equal((await api('PUT', '/linkedin/config', { daily_cap: 20, weekly_cap: 10 })).status, 400);
    assert.equal((await api('PUT', '/linkedin/config', { delay_min_s: 200, delay_max_s: 100 })).status, 400);
    assert.equal((await api('PUT', '/linkedin/config', { work_days: [] })).status, 400);
  });
});
