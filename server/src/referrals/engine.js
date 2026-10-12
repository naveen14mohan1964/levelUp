// Referral engine: pure functions (no I/O), unit-tested in test/referrals.test.js.
// Idea adapted from relationship-intelligence tools: rank people by how much a referral from them is worth
// (company pay tier × how much their role helps × how strong your relationship is), and explain every point.

const DAY = 86400000;

/* ------------------------------- roles ------------------------------- */

// Order matters: "Engineering Manager" is a manager, not an engineer; "Technical Recruiter" is a recruiter.
const ROLE_RULES = [
  ['recruiter', /recruit|talent|sourcer|\bhr\b|human resources|people partner|people ops/i],
  ['manager', /manager|\bem\b|head of|director|\bvp\b|vice president|\bcto\b|tech(nical)? lead|team lead|lead engineer|architect|principal|staff engineer/i],
  ['engineer', /engineer|developer|\bsde\b|\bswe\b|programmer|devops|\bsre\b|backend|frontend|full.?stack|data scientist|\bml\b|software/i],
];
const ROLE_POINTS = { manager: 30, recruiter: 28, engineer: 22, other: 8 };
const ROLE_WHY = {
  manager: 'can push your profile to the hiring team',
  recruiter: 'sees open roles and can move you to a call',
  engineer: 'can submit an internal referral',
  other: 'can introduce you to someone in engineering',
};
function roleOf(text) {
  for (const [kind, re] of ROLE_RULES) if (re.test(text || '')) return kind;
  return 'other';
}

/* ---------------------------- relationship ---------------------------- */

const REL_POINTS = { friend: 20, ex_colleague: 20, alumni: 15, met: 12, connection: 6 };
const REL_LABEL = { friend: 'friend', ex_colleague: 'ex-colleague', alumni: 'college alum', met: 'you have talked', connection: 'LinkedIn connection' };
const TIER_POINTS = { 1: 40, 2: 30, 3: 20 };

/** Recency multiplier for the relationship: talked in the last 3 months ×1, last year ×0.8, older ×0.6. */
function recency(contact, now) {
  const at = contact.last_interaction_ms || (contact.rel_type === 'connection' ? contact.connected_ms : null);
  if (!at) return { factor: 0.7, text: 'no recent conversation logged' };
  const days = (now - at) / DAY;
  if (days <= 90) return { factor: 1, text: 'in touch recently' };
  if (days <= 365) return { factor: 0.8, text: 'in touch this year' };
  return { factor: 0.6, text: 'no contact for over a year' };
}

/** How warm the tie is: 0..1 plus Strong / Warm / Cold. */
function strength(contact, now = Date.now()) {
  const pts = REL_POINTS[contact.rel_type] ?? REL_POINTS.connection;
  const r = recency(contact, now);
  const value = Math.round(((pts * r.factor) / 20) * 100) / 100;
  return { value, label: value >= 0.75 ? 'Strong' : value >= 0.4 ? 'Warm' : 'Cold', points: Math.round(pts * r.factor), recency: r.text };
}

const CONNECTED = new Set(['connected', 'messaged', 'replied', 'referral']);

/**
 * Referral-fit score 0–100 with reasons.
 * company tier (40/30/20) + role (30/28/22/8) + relationship (≤20, × recency) + already connected (+5) + preferred city (+5)
 */
function fitFor(contact, company, { locations = [], now = Date.now() } = {}) {
  const reasons = [];
  let score = 0;
  if (company && company.is_target) {
    score += TIER_POINTS[company.tier] || 0;
    reasons.push({ points: TIER_POINTS[company.tier] || 0, text: `${company.name} is Tier ${company.tier}` });
  } else {
    reasons.push({ points: 0, text: company ? `${company.name} is switched off in your targets` : 'Not at one of your target companies' });
  }
  const role = roleOf(`${contact.role || ''} ${contact.headline || ''}`);
  score += ROLE_POINTS[role];
  reasons.push({ points: ROLE_POINTS[role], text: `${role === 'other' ? 'Role' : role.charAt(0).toUpperCase() + role.slice(1)}: ${ROLE_WHY[role]}` });
  const st = strength(contact, now);
  score += st.points;
  reasons.push({ points: st.points, text: `${REL_LABEL[contact.rel_type] || REL_LABEL.connection}, ${st.recency}` });
  if (CONNECTED.has(contact.status)) {
    score += 5;
    reasons.push({ points: 5, text: 'Already connected, so you can message them' });
  }
  const loc = String(contact.location || '').toLowerCase();
  const city = locations.find((l) => l && loc.includes(String(l).toLowerCase()));
  if (city) {
    score += 5;
    reasons.push({ points: 5, text: `Based in ${city}` });
  }
  return { score: Math.max(0, Math.min(100, Math.round(score))), role, strength: st, reasons };
}

/** What to do next with this person. */
function nextStep(contact, pursuit) {
  if (contact.do_not_contact) return null;
  if (!CONNECTED.has(contact.status)) return contact.status === 'requested' ? 'Wait for them to accept' : 'Connect first (no referral ask in the note)';
  if (pursuit && pursuit.contact_id === contact.id && ['asked', 'referred', 'applied', 'interview', 'offer'].includes(pursuit.stage)) return null;
  if (contact.rel_type === 'connection' && !contact.last_interaction_ms) return 'Start a conversation, then ask for a referral';
  return 'Ask for a referral';
}

/* ------------------------------ pipeline ------------------------------ */

const STAGES = ['target', 'connected', 'asked', 'referred', 'applied', 'interview', 'offer'];
const STAGE_LABEL = {
  target: 'Target', connected: 'Have a contact', asked: 'Referral asked', referred: 'Referred', applied: 'Applied', interview: 'Interviewing', offer: 'Offer',
};
const OUTCOMES = ['parked', 'rejected', 'not_interested', 'won'];
const FOLLOW_UP_DAYS = 5;

/** Guards for moving a pursuit. Returns an error message or null. */
function moveError(pursuit, toStage) {
  if (pursuit.outcome) return 'This pursuit is closed: reopen it first';
  if (!STAGES.includes(toStage)) return 'Unknown stage';
  const i = STAGES.indexOf(toStage);
  if (i >= STAGES.indexOf('connected') && i <= STAGES.indexOf('referred') && !pursuit.contact_id) return 'Pick who will refer you at this company first';
  return null;
}

/** Default next action + due date when a pursuit enters a stage. */
function stageDefaults(stage, now = Date.now()) {
  const d = (days, text) => ({ next_action: text, due_ms: now + days * DAY });
  switch (stage) {
    case 'target': return d(7, 'Find a person here: connect with an engineer or manager in your stack');
    case 'connected': return d(5, 'Have a short conversation, then ask for a referral');
    case 'asked': return d(FOLLOW_UP_DAYS, 'If no reply, follow up once (then stop)');
    case 'referred': return d(2, 'Apply on the careers page with the referral and tell them you applied');
    case 'applied': return d(10, 'Prepare: revise DSA patterns for this company; check application status');
    case 'interview': return d(3, 'Interview prep + send a thank-you note after each round');
    case 'offer': return d(3, 'Compare offers and negotiate towards 20 LPA');
    default: return { next_action: null, due_ms: null };
  }
}

/* ------------------------------- alerts ------------------------------- */

/**
 * Relationship alerts, most useful first. Inputs are plain rows:
 * contacts (with company/fit), companies, pursuits (open + parked), now.
 */
function alerts({ contacts, companies, pursuits, now = Date.now() }) {
  const out = [];
  const byCompany = new Map();
  for (const c of contacts) if (c.company_id && !c.do_not_contact) (byCompany.get(c.company_id) || byCompany.set(c.company_id, []).get(c.company_id)).push(c);
  const company = new Map(companies.map((c) => [c.id, c]));

  for (const p of pursuits) {
    const co = company.get(p.company_id);
    if (!co) continue;
    if (!p.outcome && p.stage === 'asked' && p.due_ms && p.due_ms <= now) {
      out.push(p.follow_ups >= 1
        ? { kind: 'stop', rank: 1, pursuit_id: p.id, company_id: co.id, title: `No reply at ${co.name} after a follow-up`, text: 'Stop here (never a third message) and try another person at this company.' }
        : { kind: 'follow_up', rank: 0, pursuit_id: p.id, company_id: co.id, title: `Follow up once at ${co.name}`, text: `It's been ${FOLLOW_UP_DAYS}+ days since you asked. One short, polite nudge.` });
    }
    if (p.outcome === 'parked' && p.revisit_ms && p.revisit_ms <= now) {
      out.push({ kind: 'revisit', rank: 2, pursuit_id: p.id, company_id: co.id, title: `Revisit ${co.name}`, text: p.reason ? `You parked it: "${p.reason}"` : 'Your revisit date has come.' });
    }
    if (!p.outcome && p.stage === 'target' && !(byCompany.get(co.id) || []).length) {
      out.push({ kind: 'no_contact', rank: 4, pursuit_id: p.id, company_id: co.id, title: `No one at ${co.name} yet`, text: 'Open the people search and connect with 2–3 engineers there.' });
    }
  }
  for (const c of contacts) {
    if (c.do_not_contact) continue;
    const co = company.get(c.company_id);
    if (c.moved_ms && now - c.moved_ms <= 60 * DAY && co?.is_target) {
      out.push({ kind: 'moved', rank: 3, contact_id: c.id, company_id: co.id, title: `${c.name} moved to ${co.name} (Tier ${co.tier})`, text: `From ${c.prev_company || 'another company'}. Congratulate them now; ask about referrals in 2–3 weeks, once they've settled in.` });
    }
    if (co?.is_target && ['friend', 'ex_colleague', 'alumni'].includes(c.rel_type) && (!c.last_interaction_ms || now - c.last_interaction_ms > 180 * DAY)) {
      out.push({ kind: 'dormant', rank: 6, contact_id: c.id, company_id: co.id, title: `Reconnect with ${c.name} (${co.name})`, text: `Your ${REL_LABEL[c.rel_type]} at a Tier ${co.tier} company: catch up before asking for anything.` });
    }
  }
  for (const [cid, list] of byCompany) {
    const co = company.get(cid);
    if (co?.is_target && co.tier <= 2 && list.length === 1) {
      out.push({ kind: 'single', rank: 5, company_id: cid, contact_id: list[0].id, title: `Only ${list[0].name} at ${co.name}`, text: 'One more contact there makes a referral much more likely. Connect with another engineer or manager.' });
    }
  }
  return out.sort((a, b) => a.rank - b.rank);
}

/* ------------------------------ insights ------------------------------ */

/** Funnel: how many pursuits ever reached each stage (from history), with conversion from the previous stage. */
function funnel(pursuits, history) {
  const reached = new Map(pursuits.map((p) => [p.id, STAGES.indexOf(p.stage)]));
  for (const h of history) {
    const i = STAGES.indexOf(h.to_stage);
    if (reached.has(h.pursuit_id) && i > reached.get(h.pursuit_id)) reached.set(h.pursuit_id, i);
  }
  const vals = [...reached.values()];
  return STAGES.map((s, i) => {
    const count = vals.filter((v) => v >= i).length;
    const prev = i ? vals.filter((v) => v >= i - 1).length : count;
    return { stage: s, label: STAGE_LABEL[s], count, conversion: i && prev ? Math.round((count / prev) * 100) : null };
  });
}

/** Median days from adding a company to the pipeline until a referral (only pursuits that got one). */
function medianDaysToReferral(pursuits, history) {
  const days = [];
  for (const p of pursuits) {
    const first = history.filter((h) => h.pursuit_id === p.id && h.to_stage === 'referred').sort((a, b) => a.at_ms - b.at_ms)[0];
    if (first) days.push((first.at_ms - p.created_ms) / DAY);
  }
  if (!days.length) return null;
  days.sort((a, b) => a - b);
  const mid = Math.floor(days.length / 2);
  return Math.round((days.length % 2 ? days[mid] : (days[mid - 1] + days[mid]) / 2) * 10) / 10;
}

/** Which relationship types turn a referral ask into a referral. */
function sourcePerformance(pursuits, history, contactsById) {
  const rows = {};
  for (const p of pursuits) {
    const c = contactsById.get(p.contact_id);
    if (!c) continue;
    const stages = new Set([p.stage, ...history.filter((h) => h.pursuit_id === p.id).map((h) => h.to_stage)]);
    const idx = Math.max(...[...stages].map((s) => STAGES.indexOf(s)));
    if (idx < STAGES.indexOf('asked')) continue;
    const k = c.rel_type || 'connection';
    rows[k] ||= { rel_type: k, label: REL_LABEL[k], asked: 0, referred: 0 };
    rows[k].asked++;
    if (idx >= STAGES.indexOf('referred')) rows[k].referred++;
  }
  return Object.values(rows).map((r) => ({ ...r, rate: Math.round((r.referred / r.asked) * 100) })).sort((a, b) => b.rate - a.rate);
}

/** Target companies × tier: how many you have at least one contact in. */
function coverage(companies, contacts) {
  const withContact = new Set(contacts.filter((c) => c.company_id && !c.do_not_contact).map((c) => c.company_id));
  const grid = {};
  for (const co of companies.filter((c) => c.is_target)) {
    const row = (grid[co.category || 'Other'] ||= { category: co.category || 'Other', tiers: { 1: [0, 0], 2: [0, 0], 3: [0, 0] } });
    row.tiers[co.tier][1]++;
    if (withContact.has(co.id)) row.tiers[co.tier][0]++;
  }
  return Object.values(grid).sort((a, b) => a.category.localeCompare(b.category));
}

module.exports = {
  DAY, STAGES, STAGE_LABEL, OUTCOMES, FOLLOW_UP_DAYS, REL_LABEL, CONNECTED,
  roleOf, strength, fitFor, nextStep, moveError, stageDefaults, alerts, funnel, medianDaysToReferral, sourcePerformance, coverage,
};
