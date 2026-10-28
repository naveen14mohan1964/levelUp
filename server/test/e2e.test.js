// End-to-end UI tests in real Microsoft Edge (headless) via playwright-core, against the built client
// (client/dist) served by the API on the test database. Run `npm run build` in client/ first (root `npm test` does it).
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startServer, stopServer, api } = require('./helpers');

const DIST = path.join(__dirname, '..', '..', 'client', 'dist', 'index.html');
let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch {
  chromium = null;
}
const skip = !chromium ? 'playwright-core not installed' : !fs.existsSync(DIST) ? 'client not built (npm run build)' : false;

describe('UI in Microsoft Edge', { skip, timeout: 900_000 }, () => {
  let browser;
  let base;
  const errors = [];

  async function open(urlPath, { width = 1280, height = 900 } = {}) {
    const page = await browser.newPage({ viewport: { width, height } });
    page.on('pageerror', (e) => errors.push(`${urlPath}: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && !/favicon/.test(m.text()) && errors.push(`${urlPath}: ${m.text()}`));
    await page.goto(base + urlPath, { waitUntil: 'networkidle' });
    return page;
  }

  before(async () => {
    base = await startServer();
    // E2E_BROWSER=chrome runs the same tests in Chrome (e.g. while an Edge update is pending and Edge won't start).
    browser = await chromium.launch({ channel: process.env.E2E_BROWSER || 'msedge', headless: true });
  });
  after(async () => {
    await browser?.close();
    await stopServer();
  });

  // ~22 pages × 2 widths at ~3–5 s each on a busy laptop, so this one test gets a much longer cap than the others.
  test('every page renders without errors (desktop and phone width)', { timeout: 420_000 }, async () => {
    const pages = ['/', '/dsa', '/dsa/day/2026-10-05', '/dsa/problems', '/dsa/review', '/dsa/plan', '/node', '/node/roadmap', '/dotnet', '/react/roadmap', '/workout', '/meals', '/meals/day/2026-10-05', '/progress', '/mentor', '/linkedin', '/linkedin/planner', '/linkedin/outreach', '/linkedin/outreach?view=lists', '/linkedin/outreach?view=people', '/linkedin/activity', '/linkedin/settings', '/linkedin/referrals', '/linkedin/referrals?view=companies', '/linkedin/referrals?view=pipeline', '/linkedin/referrals?view=insights', '/linkedin/referrals?view=import', '/settings', '/cards', '/report', '/report/2026-10-05', '/dsa/patterns', '/dsa/companies', '/hld/drills'];
    for (const p of pages) {
      for (const width of [1280, 390]) {
        const page = await open(p, { width });
        assert.equal(await page.locator('.card.error').count(), 0, `${p} @${width}px shows an error card`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(overflow <= 1, `${p} @${width}px scrolls sideways by ${overflow}px`);
        await page.close();
      }
    }
    assert.deepEqual(errors, []);
  });

  test('DSA day: ticking a problem opens the log dialog and schedules a review', { timeout: 90_000 }, async () => {
    const page = await open('/dsa/day/2026-10-05');
    await page.getByText("📚 Today's reading").waitFor();
    // Ticking opens the log dialog instead of ticking immediately (the tick happens on Save).
    await page.locator('.problem', { hasText: 'Two Sum' }).locator('input[type=checkbox]').click();
    const dialog = page.locator('dialog.dialog[open]');
    await dialog.getByRole('button', { name: /Clean/ }).click();
    await dialog.locator('input[type=number]').fill('12');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await dialog.getByText(/Next review in 14 days/).waitFor();
    await dialog.getByRole('button', { name: 'Done' }).click();
    await page.locator('.problem.status-solved', { hasText: 'Two Sum' }).waitFor();
    await page.close();
  });

  test('Problems: search filters; the hint button opens the mentor drawer with the hint ladder', { timeout: 90_000 }, async () => {
    const page = await open('/dsa/problems');
    await page.getByPlaceholder('Search title or number…').fill('trapping');
    await page.getByText('42. Trapping Rain Water').waitFor();
    assert.equal(await page.locator('.prow').count(), 1);
    await page.getByText('42. Trapping Rain Water').click();
    await page.getByRole('button', { name: '🤖 Ask mentor' }).click();
    const drawer = page.locator('dialog.drawer[open]');
    await drawer.getByRole('button', { name: /1 · Nudge/ }).waitFor();
    assert.equal(await drawer.locator('.hint-ladder button').count(), 4);
    await page.close();
  });

  test('Node lesson (week 23): learn/build/checkpoint steps with exact doc links', { timeout: 90_000 }, async () => {
    const page = await open('/node/day/2027-03-12'); // Node is weeks 23–28 (after .NET and React): W23 Friday
    await page.getByText('Weekly checkpoint').waitFor();
    const hrefs = await page.locator('.step .doc-link').evaluateAll((as) => as.map((a) => a.href));
    assert.ok(hrefs.includes('https://expressjs.com/en/guide/error-handling/'), hrefs.join(', '));
    await page.close();
  });

  test('Workout: "How to do it" shows the demo + cues without ticking the exercise; Meals and Progress are linked', { timeout: 90_000 }, async () => {
    const page = await open('/workout/day/2026-10-05'); // a Monday: Strength A
    const first = page.locator('.exercises li').filter({ hasText: /push-up/i }).first();
    await first.getByRole('button', { name: '▶ How to do it' }).click();
    // a photo demo (free-exercise-db) or, for moves without one (e.g. wall push-up), the animated stick figure
    const demo = first.locator('.ex-demo img, .stick-demo svg').first();
    await demo.waitFor();
    assert.ok(await demo.evaluate((el) => (el.tagName === 'IMG' ? el.complete && el.naturalWidth > 0 : el.getBBox().width > 0)), 'demo loaded');
    assert.equal(await first.locator('.ex-cues li').count(), 3);
    assert.equal(await first.locator('input[type=checkbox]').isChecked(), false); // the button didn't tick it
    await page.getByText('Recovery burns fat too').waitFor(); // sleep ring
    assert.equal(await page.getByLabel('Morning weight (kg)').count(), 0); // weight moved to Progress
    assert.equal(await page.getByRole('button', { name: '➕ Manual' }).count(), 0); // food moved to Meals
    await page.locator('.meals-link', { hasText: 'Progress' }).click();
    await page.getByRole('heading', { name: '📈 Progress' }).waitFor();
    await page.close();
  });

  test('Progress: weigh-in saves; AI comparison is off by default with a privacy note', { timeout: 90_000 }, async () => {
    const page = await open('/progress');
    await page.getByLabel('Morning weight (kg)').fill('114.8');
    await page.getByLabel('Morning weight (kg)').press('Enter');
    await page.locator('.stat strong', { hasText: '114.8' }).waitFor();
    const ai = page.locator('.ai-toggle input');
    assert.equal(await ai.isChecked(), false);
    await page.getByText(/sent to Google Gemini/).waitFor();
    await page.close();
  });

  test('Meals: water button and a manual meal both save', { timeout: 90_000 }, async () => {
    const page = await open('/meals');
    await page.getByRole('button', { name: '+ Glass (250 ml)' }).click();
    await page.getByText(/^1 of 13 glasses$/).waitFor();
    await page.getByRole('button', { name: '➕ Manual' }).click();
    await page.getByPlaceholder('e.g. Chicken curry + 2 rotis').fill('Paneer bhurji + 1 roti');
    await page.locator('.macro-form label', { hasText: 'kcal' }).locator('input').fill('480');
    await page.locator('.macro-form label', { hasText: 'Protein' }).locator('input').fill('28');
    await page.getByRole('button', { name: 'Save meal' }).click();
    await page.locator('.meal-title', { hasText: 'Paneer bhurji + 1 roti' }).waitFor();
    const d = new Date(); // the app uses your local date, not UTC
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const goals = (await api('GET', `/goals/${local}`)).body;
    assert.ok(goals.eaten.calories >= 480);
    await page.close();
  });

  test('Mentor page: tabs and context summary render', { timeout: 90_000 }, async () => {
    const page = await open('/mentor');
    await page.getByText('What your mentor knows right now:').waitFor();
    for (const name of ['💬 Ask', '🗓️ Plan my day', '🎤 Mock interview', '🔍 Code review']) {
      await page.getByRole('button', { name }).click();
    }
    await page.getByRole('button', { name: 'Review it' }).waitFor();
    await page.close();
  });

  test("LinkedIn: goal card, this week's targets from the current stage, and editing a stage", { timeout: 90_000 }, async () => {
    const page = await open('/linkedin');
    await page.getByText("This week's LinkedIn targets").waitFor();
    assert.match(await page.locator('.li-salary').innerText(), /7 LPA\s*→\s*20 LPA/);
    assert.equal(await page.locator('.li-stage').count(), 5);
    await page.locator('.li-stage').first().getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('🤝 Requests / week').fill('12');
    await page.getByRole('button', { name: 'Save stage' }).click();
    await page.getByText('🤝 12 requests/wk').waitFor();
    await page.close();
  });

  test('LinkedIn posts: write a draft, approve it for its slot, and see it scheduled; kill switch toggles', { timeout: 90_000 }, async () => {
    const page = await open('/linkedin/planner');
    // so both slots are in the future; wait for next week's slots, or "Write my own" lands on the old week's re-rendering card
    const nextWeek = page.waitForResponse((r) => r.url().includes('/api/linkedin/planner') && r.ok());
    await page.getByRole('button', { name: 'Next week' }).click();
    await nextWeek;
    await page.waitForTimeout(300);
    const slot = page.locator('.li-slot').first();
    await slot.getByRole('button', { name: '✍️ Write my own' }).click();
    await slot.getByPlaceholder('Write your post…').fill('Testing my planner: week 2 of DSA starts with two pointers. #DSA');
    await slot.getByRole('button', { name: 'Save draft' }).click();
    await slot.getByText('Draft', { exact: true }).waitFor();
    await slot.getByRole('button', { name: /✅ Approve · post/ }).click();
    await slot.getByText('Scheduled', { exact: true }).waitFor();
    await slot.getByText(/⏰ Publishes/).waitFor();
    await page.getByRole('button', { name: /Automation on · pause/ }).click(); // pausing is instant (no confirm)
    await page.getByText('All LinkedIn automation is paused.', { exact: false }).waitFor();
    page.once('dialog', (d) => d.accept()); // resuming asks for confirmation
    await page.getByRole('button', { name: /Paused · resume/ }).click();
    await page.getByRole('button', { name: /Automation on · pause/ }).waitFor();
    await page.close();
  });

  test('LinkedIn outreach: list → search links → quick-add (dedupe) → session card → open profile → I sent it → pacing', { timeout: 90_000 }, async () => {
    // Independent of the clock: allow every day, all day.
    await api('PUT', '/linkedin/config', { work_days: [0, 1, 2, 3, 4, 5, 6], work_start: '00:00', work_end: '23:59' });
    const page = await open('/linkedin/outreach?view=lists');
    await page.getByRole('button', { name: '+ New target list' }).click();
    await page.getByLabel('List name').fill('EMs at target companies');
    await page.getByLabel('Roles (comma-separated)').fill('Engineering Manager');
    await page.getByLabel('Companies').fill('Razorpay, Swiggy');
    await page.getByRole('button', { name: 'Save list' }).click();
    await page.getByText('EMs at target companies').waitFor();
    assert.equal(await page.getByRole('link', { name: 'LinkedIn search ↗' }).count(), 2);
    const box = page.getByPlaceholder(/linkedin\.com\/in\/priya-sharma/);
    await box.fill('Rahul Verma | Engineering Manager at Swiggy | https://www.linkedin.com/in/rahul-e2e/');
    await page.getByRole('button', { name: 'Add to this list' }).click();
    await page.getByText('✅ 1 added').waitFor();
    await box.fill('https://www.linkedin.com/in/Rahul-E2E/?trk=x');
    await page.getByRole('button', { name: 'Add to this list' }).click();
    await page.getByText(/already in your list \(Rahul Verma\)/).waitFor();

    await page.getByRole('button', { name: "🎯 Today's session" }).click();
    const card = page.locator('.li-person', { hasText: 'Rahul Verma' });
    await card.waitFor();
    assert.equal(await card.getByRole('button', { name: '✓ I sent it' }).isDisabled(), true, 'open the profile first');
    const popup = page.waitForEvent('popup');
    await card.getByRole('button', { name: 'Open profile ↗' }).click();
    await (await popup).close();
    await card.getByRole('button', { name: '✓ I sent it' }).click();
    await page.getByText(/Next one in \d+s/).waitFor();
    await page.close();
  });

  test('no console or page errors across the whole run', () => {
    assert.deepEqual(errors, []);
  });
});
