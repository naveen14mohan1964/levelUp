// Referrals hub: engine rules (pure) + the API flow on DSATracker_Test.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, api, sqlQuery } = require('./helpers');
const E = require('../src/referrals/engine');
const Co = require('../src/referrals/companies');
const { parseSearch, applySearch } = require('../src/referrals/search');
const { planImport } = require('../src/referrals/importer');

const DAY = 86400000;
const NOW = Date.parse('2026-10-10T10:00:00Z');

describe('engine', () => {
  const google = { id: 1, name: 'Google', tier: 1, category: 'Big Tech', is_target: true };
  test('company names from LinkedIn match the list on whole words', () => {
    const m = Co.buildMatcher([{ id: 1, name: 'Intel', aliases: [] }, { id: 2, name: 'Amazon', aliases: ['AWS'] }, { id: 3, name: 'Eternal', aliases: ['Zomato'] }]);
    assert.equal(m('Intel Corporation').id, 1);
    assert.equal(m('Intelligent Systems Pvt Ltd'), null);
    assert.equal(m('Amazon Web Services (AWS)').id, 2);
    assert.equal(m('Zomato').id, 3);
    assert.equal(m('Infosys'), null);
  });

  test('message templates keep tech names intact', () => {
    const C = require('../src/linkedin/contacts');
    assert.equal(C.renderTemplate('Hi {{first_name}} , I use Java, React, .NET and Node .', { name: 'Asha Rao' }), 'Hi Asha, I use Java, React, .NET and Node.');
  });

  test('roles: manager beats engineer, recruiter beats manager', () => {
    assert.equal(E.roleOf('Software Engineering Manager'), 'manager');
    assert.equal(E.roleOf('Senior Software Engineer'), 'engineer');
    assert.equal(E.roleOf('Technical Recruiter | Hiring for SDE roles'), 'recruiter');
    assert.equal(E.roleOf('Product Designer'), 'other');
  });

  test('fit: tier + role + relationship × recency + connected + city, with a reason for every point', () => {
    const em = { name: 'Asha', role: 'Engineering Manager', rel_type: 'ex_colleague', last_interaction_ms: NOW - 10 * DAY, status: 'connected', location: 'Bengaluru, Karnataka' };
    const f = E.fitFor(em, google, { locations: ['Bengaluru'], now: NOW });
    assert.equal(f.score, 40 + 30 + 20 + 5 + 5);
    assert.equal(f.strength.label, 'Strong');
    assert.equal(f.reasons.reduce((s, r) => s + r.points, 0), f.score);
    const cold = E.fitFor({ name: 'Ravi', role: 'Software Engineer', rel_type: 'connection', connected_ms: NOW - 800 * DAY, status: 'not_contacted' }, google, { now: NOW });
    assert.equal(cold.score, 40 + 22 + Math.round(6 * 0.6));
    assert.equal(cold.strength.label, 'Cold');
    assert.equal(E.fitFor(em, null, { now: NOW }).score, 30 + 20 + 5, 'no tier points outside your targets');
    assert.equal(E.fitFor(em, { ...google, is_target: false }, { now: NOW }).reasons[0].points, 0);
  });

  test('next step: connect first, never ask twice, nothing for do-not-contact', () => {
    assert.match(E.nextStep({ status: 'not_contacted' }), /Connect first/);
    assert.match(E.nextStep({ status: 'requested' }), /Wait/);
    assert.match(E.nextStep({ id: 1, status: 'connected', rel_type: 'connection' }), /conversation/);
    assert.equal(E.nextStep({ id: 1, status: 'connected', rel_type: 'friend' }), 'Ask for a referral');
    assert.equal(E.nextStep({ id: 1, status: 'messaged', rel_type: 'friend' }, { contact_id: 1, stage: 'asked' }), null);
    assert.equal(E.nextStep({ status: 'connected', do_not_contact: true }), null);
  });

  test('pipeline guards and defaults', () => {
    assert.match(E.moveError({ stage: 'target', contact_id: null }, 'asked'), /Pick who will refer/);
    assert.equal(E.moveError({ stage: 'target', contact_id: 3 }, 'asked'), null);
    assert.equal(E.moveError({ stage: 'asked', contact_id: null }, 'applied'), null, 'you can apply without a referral');
    assert.match(E.moveError({ outcome: 'parked' }, 'asked'), /closed/);
    assert.equal(E.stageDefaults('asked', NOW).due_ms, NOW + 5 * DAY);
  });

  test('alerts: follow up once, then stop; revisit; moved to a target; single contact; dormant ties', () => {
    const companies = [google, { id: 2, name: 'Stripe', tier: 1, is_target: true }, { id: 3, name: 'Paytm', tier: 3, is_target: true }];
    const contacts = [
      { id: 10, name: 'Asha', company_id: 1, moved_ms: NOW - 3 * DAY, prev_company: 'Infosys', rel_type: 'connection' },
      { id: 11, name: 'Ben', company_id: 1, rel_type: 'connection' },
      { id: 12, name: 'Chen', company_id: 2, rel_type: 'ex_colleague', last_interaction_ms: NOW - 400 * DAY },
    ];
    const pursuits = [
      { id: 1, company_id: 1, stage: 'asked', due_ms: NOW - DAY, follow_ups: 0 },
      { id: 2, company_id: 2, stage: 'asked', due_ms: NOW - DAY, follow_ups: 1 },
      { id: 3, company_id: 3, stage: 'target', outcome: 'parked', revisit_ms: NOW - DAY, reason: 'hiring freeze' },
    ];
    const kinds = E.alerts({ contacts, companies, pursuits, now: NOW }).map((a) => a.kind);
    assert.deepEqual(kinds, ['follow_up', 'stop', 'revisit', 'moved', 'single', 'dormant']);
  });

  test('insights: funnel from history, median days to referral, what works, coverage', () => {
    const pursuits = [
      { id: 1, stage: 'applied', created_ms: 0, contact_id: 7 },
      { id: 2, stage: 'asked', created_ms: 0, contact_id: 8 },
      { id: 3, stage: 'target', created_ms: 0 },
    ];
    const history = [{ pursuit_id: 1, to_stage: 'referred', at_ms: 4 * DAY }];
    const f = E.funnel(pursuits, history);
    assert.deepEqual(f.map((x) => x.count), [3, 2, 2, 1, 1, 0, 0]);
    assert.equal(f[3].conversion, 50);
    assert.equal(E.medianDaysToReferral(pursuits, history), 4);
    const src = E.sourcePerformance(pursuits, history, new Map([[7, { rel_type: 'friend' }], [8, { rel_type: 'connection' }]]));
    assert.deepEqual(src.map((s) => [s.rel_type, s.rate]), [['friend', 100], ['connection', 0]]);
    const cov = E.coverage([{ id: 1, tier: 1, category: 'Big Tech', is_target: true }, { id: 2, tier: 1, category: 'Big Tech', is_target: true }], [{ company_id: 1 }]);
    assert.deepEqual(cov[0].tiers[1], [1, 2]);
  });
});

describe('search', () => {
  const companies = [{ id: 1, name: 'Google', tier: 1, category: 'Big Tech', aliases: [] }, { id: 2, name: 'Razorpay', tier: 2, category: 'Fintech', aliases: [] }, { id: 3, name: 'Target', tier: 2, category: 'Retail Tech', aliases: [] }];
  test('plain English becomes filters; unknown words are reported and ignored', () => {
    const r = parseSearch('Tier 1 engineering managers in Bangalore who are not connected', companies);
    assert.deepEqual(r.filters.tiers, [1]);
    assert.deepEqual(r.filters.roles, ['manager']);
    assert.deepEqual(r.filters.cities, ['bengaluru']);
    assert.deepEqual(r.filters.statuses, ['not_contacted']);
    assert.deepEqual(parseSearch('ex-colleagues at fintech', companies).filters.rels, ['ex_colleague']);
    assert.deepEqual(parseSearch('recruiters at Target', companies).filters.companyIds, [3]);
    const odd = parseSearch('people like us at razorpay', companies);
    assert.deepEqual(odd.unknown, ['like', 'us']);
    assert.deepEqual(odd.filters.companyIds, [2]);
  });
  test('applySearch', () => {
    const people = [
      { id: 1, company_id: 1, company: companies[0], fit: { role: 'manager' }, location: 'Bengaluru', status: 'connected', rel_type: 'connection' },
      { id: 2, company_id: 2, company: companies[1], fit: { role: 'engineer' }, location: 'Chennai', status: 'not_contacted', rel_type: 'alumni' },
    ];
    assert.deepEqual(applySearch(people, parseSearch('managers in bangalore', companies).filters).map((p) => p.id), [1]);
    assert.deepEqual(applySearch(people, parseSearch('fintech alumni', companies).filters).map((p) => p.id), [2]);
    assert.equal(applySearch(people, parseSearch('nonsense words', companies).filters).length, 2, 'unknown words never filter');
  });
});

describe('import plan', () => {
  const existing = [
    { id: 1, dedupe_key: 'url:asha', name: 'Asha Rao', company: 'Infosys', role: 'SDE', status: 'requested', profile_url: 'https://www.linkedin.com/in/asha/' },
    { id: 2, dedupe_key: 'nc:benkumar|tcs', name: 'Ben Kumar', company: 'TCS', email: null, status: 'connected' },
  ];
  test('URL -> email -> name+company; accepted, moved and fill-empty; in-file duplicates', () => {
    const rows = [
      { name: 'Asha Rao', profile_url: 'https://www.linkedin.com/in/asha/', company: 'Google', role: 'Software Engineer III', headline: 'Software Engineer III at Google', connected_ms: 5 },
      { name: 'Ben Kumar', company: 'TCS', email: 'ben@x.com', role: 'Engineer' },
      { name: 'New Person', profile_url: 'https://www.linkedin.com/in/newp/', company: 'Stripe' },
      { name: 'New Person', profile_url: 'https://www.linkedin.com/in/newp/', company: 'Stripe' },
      { name: '', company: 'X' },
    ];
    const plan = planImport(rows, existing.map((e) => ({ ...e })), 100);
    assert.deepEqual(plan.counts, { rows: 5, added: 1, accepted: 1, moved: 0, merged: 1, unchanged: 1, skipped: 1 });
    assert.deepEqual(plan.moved, [{ id: 1, name: 'Asha Rao', from: 'Infosys', to: 'Google', role: 'Software Engineer III' }]);
    const asha = plan.ops.find((o) => o.id === 1);
    assert.equal(asha.set.status, 'connected');
    assert.equal(asha.set.prev_company, 'Infosys');
    const ben = plan.ops.find((o) => o.id === 2);
    assert.deepEqual(ben.set, { email: 'ben@x.com', role: 'Engineer' }, 'only empty fields are filled');
  });
});

describe('API flow', () => {
  before(startServer);
  after(stopServer);
  const csv = [
    'Notes:', '"When exporting your connection data, you may notice…"', '',
    'First Name,Last Name,URL,Email Address,Company,Position,Connected On',
    'Asha,Rao,https://www.linkedin.com/in/asha-rao,,Google India Pvt Ltd,Engineering Manager,12 Mar 2025',
    'Ravi,Iyer,https://www.linkedin.com/in/ravi-iyer,,Razorpay,Senior Software Engineer,01 Jan 2024',
    'Meena,S,https://www.linkedin.com/in/meena-s,,Infosys,Technology Analyst,05 Feb 2023',
    'Kiran,Das,https://www.linkedin.com/in/kiran-das,,Razorpay,Technical Recruiter,05 Feb 2025',
  ].join('\n');
  let asha;
  let pursuit;

  test('228 seeded targets; dry run changes nothing; import links people to companies', async () => {
    assert.equal((await sqlQuery('SELECT COUNT(*) AS n FROM dbo.ref_companies'))[0].n, Co.SEED_COUNT);
    const dry = (await api('POST', '/referrals/import', { csv, dry_run: true })).body;
    assert.deepEqual([dry.dryRun, dry.added, dry.newAtTargets], [true, 4, 3]);
    assert.equal((await sqlQuery('SELECT COUNT(*) AS n FROM dbo.li_contacts'))[0].n, 0);
    const real = (await api('POST', '/referrals/import', { csv, file_name: 'Connections.csv' })).body;
    assert.equal(real.added, 4);
    const linked = await sqlQuery(`SELECT c.name, r.name AS co FROM dbo.li_contacts c LEFT JOIN dbo.ref_companies r ON r.id = c.company_id ORDER BY c.name`);
    assert.deepEqual(linked.map((x) => x.co), ['Google', 'Razorpay', null, 'Razorpay']);
    assert.equal((await api('GET', '/referrals/imports')).body[0].added, 4);
    assert.equal((await api('POST', '/referrals/import', { csv: 'not a csv' })).status, 400);
  });

  test('hub: KPIs, best person per company first, alerts with search links', async () => {
    const hub = (await api('GET', '/referrals/hub')).body;
    assert.equal(hub.kpis.targets, Co.SEED_COUNT);
    assert.equal(hub.kpis.covered, 2);
    assert.deepEqual(hub.queue.map((q) => q.name), ['Asha Rao', 'Kiran Das'], 'one person per company, highest fit first');
    asha = hub.queue[0];
    assert.equal(asha.fit.role, 'manager');
    assert.ok(hub.alerts.some((a) => a.kind === 'single' && /Asha Rao/.test(a.title) && a.links.engineers.startsWith('https://www.linkedin.com/search/')));
  });

  test('re-import: someone moving to a target company is detected', async () => {
    const moved = csv.replace('Infosys,Technology Analyst', 'Stripe,Software Engineer');
    const r = (await api('POST', '/referrals/import', { csv: moved })).body;
    assert.equal(r.moved.length, 1);
    assert.deepEqual([r.moved[0].name, r.moved[0].target, r.moved[0].tier], ['Meena S', 'Stripe', 1]);
    const hub = (await api('GET', '/referrals/hub')).body;
    assert.ok(hub.alerts.some((a) => a.kind === 'moved' && /Meena S moved to Stripe/.test(a.title)));
  });

  test('search in plain English', async () => {
    const r = (await api('GET', `/referrals/contacts?q=${encodeURIComponent('recruiters at razorpay')}`)).body;
    assert.deepEqual(r.items.map((x) => x.name), ['Kiran Das']);
    assert.deepEqual(r.chips.map((c) => c.kind), ['company', 'role']);
  });

  test('contact profile: fit reasons, messages from templates, notes, relationship', async () => {
    assert.equal((await api('PATCH', `/referrals/contacts/${asha.id}`, { rel_type: 'ex_colleague', talked_now: true })).status, 200);
    assert.equal((await api('PATCH', `/referrals/contacts/${asha.id}`, { rel_type: 'bestie' })).status, 400);
    assert.equal((await api('POST', `/referrals/contacts/${asha.id}/notes`, { text: 'Worked together on the payments team' })).status, 201);
    const p = (await api('GET', `/referrals/contacts/${asha.id}`)).body;
    assert.equal(p.contact.fit.strength.label, 'Strong');
    assert.match(p.messages.ask, /^Hi Asha, .*at Google/);
    assert.doesNotMatch(p.messages.ask, /\{\{|\(\)/, 'no leftover template variables');
    assert.equal(p.notes[0].text, 'Worked together on the payments team');
    assert.ok(p.timeline.some((t) => /Connected on LinkedIn/.test(t.text)));
  });

  test('pipeline: one open per company, guards, follow up once, close/reopen, insights', async () => {
    const add = await api('POST', '/referrals/pipeline', { company_id: asha.company_id, role_title: 'SDE 2' });
    assert.equal(add.status, 201);
    pursuit = add.body;
    assert.equal(pursuit.stage, 'target');
    assert.equal((await api('POST', '/referrals/pipeline', { company_id: asha.company_id })).status, 409);
    assert.equal((await api('POST', `/referrals/pipeline/${pursuit.id}/move`, { stage: 'asked' })).status, 422, 'needs a referrer');
    const other = (await sqlQuery("SELECT CAST(id AS int) AS id FROM dbo.li_contacts WHERE name = 'Ravi Iyer'"))[0].id;
    assert.equal((await api('PATCH', `/referrals/pipeline/${pursuit.id}`, { contact_id: other })).status, 400, "Ravi doesn't work at Google");
    const withReferrer = await api('PATCH', `/referrals/pipeline/${pursuit.id}`, { contact_id: asha.id });
    assert.equal(withReferrer.body.stage, 'connected', 'choosing a referrer on a Target card moves it to Have a contact');
    assert.equal((await api('POST', `/referrals/pipeline/${pursuit.id}/move`, { stage: 'asked' })).body.stage, 'asked');
    assert.equal((await sqlQuery(`SELECT status FROM dbo.li_contacts WHERE id = ${asha.id}`))[0].status, 'messaged');
    assert.equal((await api('POST', `/referrals/pipeline/${pursuit.id}/follow-up`)).status, 200);
    assert.equal((await api('POST', `/referrals/pipeline/${pursuit.id}/follow-up`)).status, 409, 'never a second follow-up');
    assert.equal((await api('POST', `/referrals/pipeline/${pursuit.id}/move`, { stage: 'referred' })).status, 200);
    assert.equal((await api('POST', `/referrals/pipeline/${pursuit.id}/close`, { outcome: 'parked' })).status, 400, 'parking needs a revisit date');
    assert.equal((await api('POST', `/referrals/pipeline/${pursuit.id}/close`, { outcome: 'parked', reason: 'Hiring freeze', revisit_ms: Date.now() + 30 * DAY })).status, 200);
    assert.equal((await api('POST', `/referrals/pipeline/${pursuit.id}/move`, { stage: 'applied' })).status, 409);
    const pipe = (await api('GET', '/referrals/pipeline')).body;
    assert.deepEqual([pipe.open.length, pipe.closed.length, pipe.closed[0].company.name], [0, 1, 'Google']);
    assert.equal((await api('POST', `/referrals/pipeline/${pursuit.id}/reopen`)).body.stage, 'referred');
    const ins = (await api('GET', '/referrals/insights')).body;
    assert.equal(ins.funnel.find((f) => f.stage === 'referred').count, 1);
    assert.deepEqual(ins.sources.map((s) => [s.rel_type, s.rate]), [['ex_colleague', 100]]);
    assert.ok(ins.outreach.find((o) => o.key === 'referral').count >= 1);
  });

  test('companies: coverage, your own company, tier edits, settings', async () => {
    const list = (await api('GET', '/referrals/companies')).body.companies;
    const google = list.find((c) => c.name === 'Google');
    assert.deepEqual([google.contacts, google.best.name, google.pursuit.stage], [1, 'Asha Rao', 'referred']);
    assert.equal((await api('POST', '/referrals/companies', { name: 'Psiog Digital', tier: 3, category: 'Other' })).status, 201);
    assert.equal((await api('POST', '/referrals/companies', { name: 'GOOGLE' })).status, 400);
    assert.equal((await api('POST', '/referrals/companies', { name: 'google', tier: 1 })).status, 409);
    assert.equal((await api('PATCH', `/referrals/companies/${google.id}`, { tier: 5 })).status, 400);
    assert.equal((await api('PATCH', `/referrals/companies/${google.id}`, { is_target: false })).status, 200);
    assert.equal((await api('GET', '/referrals/hub')).body.kpis.covered, 2, 'Stripe + Razorpay (Google switched off)');
    const s = (await api('PUT', '/referrals/settings', { locations: ['Chennai'], templates: { thanks: 'Thanks {{first_name}}!' } })).body;
    assert.deepEqual([s.locations, s.templates.thanks], [['Chennai'], 'Thanks {{first_name}}!']);
    assert.equal((await api('PUT', '/referrals/settings', { templates: { ask: '' } })).status, 400);
  });
});

describe('jobs feed', () => {
  const J = require('../src/referrals/jobs');
  const prof = { skills: ['java', 'react', '.net', 'full stack'], years: 2 };
  const job = (title, location, extra = {}) => ({ title, location, remote: /remote/i.test(location), text: '', ...extra });

  test('keeps engineering roles you can get, in India or open-remote; drops the rest', () => {
    assert.ok(J.scoreJob(job('Software Engineer II', 'Bengaluru, India'), { tier: 1 }, prof));
    assert.ok(J.scoreJob(job('Backend Engineer', 'Remote, Global'), { tier: 1 }, prof));
    assert.equal(J.scoreJob(job('Software Engineer', 'US Remote'), { tier: 1 }, prof), null, 'remote but US-only');
    assert.equal(J.scoreJob(job('Software Engineer', 'Toronto, Canada - Remote'), { tier: 1 }, prof), null);
    assert.equal(J.scoreJob(job('Software Engineer', 'San Francisco'), { tier: 1 }, prof), null);
    assert.equal(J.scoreJob(job('Staff Software Engineer', 'Bengaluru'), { tier: 1 }, prof), null);
    assert.equal(J.scoreJob(job('Engineering Manager', 'Bengaluru'), { tier: 1 }, prof), null);
    assert.equal(J.scoreJob(job('Backend - Technical Lead', 'Noida'), { tier: 1 }, prof), null);
    assert.equal(J.scoreJob(job('Solutions Engineer', 'Mumbai'), { tier: 1 }, prof), null);
    assert.equal(J.scoreJob(job('Account Executive', 'Bengaluru'), { tier: 1 }, prof), null);
    assert.equal(J.scoreJob(job('Software Engineer', 'Pune', { text: 'You have 6+ years of experience' }), { tier: 1 }, prof), null, 'too senior');
  });

  test('scores: level, stack, tier, a contact there; bare "Remote" is flagged', () => {
    const a = J.scoreJob(job('Software Engineer II', 'Chennai', { text: 'Java, React and 2+ years of experience' }), { tier: 2 }, prof, true);
    assert.deepEqual(a.reasons.map((r) => r.points), [25, 10, 30, 10, 10, 10, 10]);
    assert.equal(a.score, 100);
    const senior = J.scoreJob(job('Senior Software Engineer', 'Bengaluru'), { tier: 3 }, prof);
    assert.ok(senior.score < a.score);
    const bare = J.scoreJob(job('Software Engineer', 'Remote'), { tier: 1 }, prof);
    assert.match(bare.reasons[0].text, /open to India/);
    assert.equal(J.minYears('Requires 3-5 years of professional experience'), 3);
    assert.equal(J.minYears('No experience mentioned'), null);
  });

  test('provider parsing (Greenhouse, Lever, Ashby, SmartRecruiters) with a fake board', async () => {
    const fake = (body) => async () => ({ ok: true, json: async () => body });
    const gh = await J.fetchBoard('greenhouse', 'x', fake({ jobs: [{ id: 1, title: 'SWE', location: { name: 'Bengaluru' }, absolute_url: 'https://x/1', updated_at: '2026-10-01T00:00:00Z', content: '&lt;p&gt;Java&lt;/p&gt;', departments: [{ name: 'Eng' }] }] }));
    assert.deepEqual([gh[0].ext_id, gh[0].location, gh[0].department, gh[0].text], ['1', 'Bengaluru', 'Eng', 'Java']);
    const lv = await J.fetchBoard('lever', 'x', fake([{ id: 'a', text: 'SDE', hostedUrl: 'https://l/a', categories: { location: 'Remote', allLocations: ['Remote', 'Pune'] }, workplaceType: 'remote', descriptionPlain: 'React' }]));
    assert.deepEqual([lv[0].location, lv[0].remote], ['Remote / Pune', true]);
    const ab = await J.fetchBoard('ashby', 'x', fake({ jobs: [{ id: 'b', title: 'Eng', location: 'Remote, Global', isRemote: true, jobUrl: 'https://a/b', descriptionPlain: '.NET' }, { id: 'c', title: 'Hidden', isListed: false }] }));
    assert.equal(ab.length, 1);
    const sr = await J.fetchBoard('smartrecruiters', 'acme', fake({ content: [{ id: 9, name: 'Dev', location: { city: 'Chennai', country: 'in' } }] }));
    assert.equal(sr[0].url, 'https://jobs.smartrecruiters.com/acme/9');
    await assert.rejects(J.fetchBoard('nope', 'x'), /Unknown job-board provider/);
  });
});

describe('jobs API', () => {
  before(startServer);
  after(stopServer);
  test('refresh stores matching jobs, closes vanished ones, add-to-pipeline, save/hide', async () => {
    const store = require('../src/referrals/jobs-store');
    const zeta = (await sqlQuery("SELECT CAST(id AS int) AS id, ats_provider FROM dbo.ref_companies WHERE name = 'Zeta'"))[0];
    assert.equal(zeta.ats_provider, 'lever', 'verified boards are seeded');
    await sqlQuery("UPDATE dbo.ref_companies SET ats_provider = NULL WHERE name <> 'Zeta'"); // only fetch Zeta in this test
    let postings = [
      { id: 'p1', text: 'Software Engineer II', hostedUrl: 'https://jobs.lever.co/zeta/p1', categories: { location: 'Bangalore' }, descriptionPlain: 'Java, 2+ years of experience' },
      { id: 'p2', text: 'Account Executive', hostedUrl: 'https://jobs.lever.co/zeta/p2', categories: { location: 'Bangalore' } },
      { id: 'p3', text: 'Backend Engineer', hostedUrl: 'https://jobs.lever.co/zeta/p3', categories: { location: 'Remote, US' }, workplaceType: 'remote' },
    ];
    const fetchImpl = async () => ({ ok: true, json: async () => postings });
    const s = await store.refreshJobs({ fetchImpl });
    assert.deepEqual([s.boards, s.ok, s.kept, s.newJobs], [1, 1, 1, 1]);
    const list = (await api('GET', '/referrals/jobs')).body;
    assert.deepEqual(list.jobs.map((j) => [j.company, j.title, j.fresh]), [['Zeta', 'Software Engineer II', true]]);
    const id = list.jobs[0].id;
    const p = await api('POST', `/referrals/jobs/${id}/pipeline`);
    assert.deepEqual([p.status, p.body.role_title, p.body.job_url], [201, 'Software Engineer II', 'https://jobs.lever.co/zeta/p1']);
    assert.equal((await api('GET', '/referrals/jobs?status=saved')).body.jobs.length, 1);
    assert.equal((await api('PATCH', `/referrals/jobs/${id}`, { status: 'hidden' })).status, 200);
    assert.equal((await api('GET', '/referrals/jobs')).body.jobs.length, 0, 'hidden jobs leave the list');
    assert.equal((await api('PATCH', `/referrals/jobs/${id}`, { status: 'bogus' })).status, 400);
    postings = []; // the job left the board
    await store.refreshJobs({ fetchImpl });
    assert.ok((await sqlQuery(`SELECT closed_ms FROM dbo.ref_jobs WHERE id = ${id}`))[0].closed_ms);
    const bad = await store.refreshJobs({ fetchImpl: async () => ({ ok: false, status: 404 }) });
    assert.match(bad.failed[0].error, /404/);
    assert.equal(bad.failed[0].network, false);
    // Laptop just woke up: the first try has no network, the retry at the end of the pass works.
    let tries = 0;
    const flaky = await store.refreshJobs({ fetchImpl: async () => { tries++; if (tries === 1) throw new TypeError('fetch failed'); return { ok: true, json: async () => [] }; } });
    assert.deepEqual([flaky.ok, flaky.failed.length, tries], [1, 0, 2]);
    assert.equal((await api('PATCH', `/referrals/companies/${zeta.id}`, { ats_provider: 'myspace', ats_token: 'x' })).status, 400);
    const prof = (await api('PUT', '/referrals/settings', { jobSkills: ['Go', 'Kotlin'], jobYears: 3 })).body;
    assert.deepEqual([prof.jobSkills, prof.jobYears], [['go', 'kotlin'], 3]);
  });
});
