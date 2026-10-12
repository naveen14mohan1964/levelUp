import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { EmptyState } from '../components/fx.jsx';
import { formatShort } from '../dates.js';
import { ErrorBox, Loading, ProgressBar } from '../components/ui.jsx';
import ConnectionsSync from '../components/ConnectionsSync.jsx';

/**
 * Referrals hub: everything for a referral-led job switch in one place.
 * Who to ask today (ranked, explained) → companies (228 targets, tiers) → referral pipeline → alerts → insights.
 * You send every message yourself on LinkedIn; the app ranks, drafts, reminds and tracks.
 */
const VIEWS = [
  { key: 'hub', label: '🎯 Hub' },
  { key: 'jobs', label: '💼 Jobs' },
  { key: 'people', label: '🔎 People' },
  { key: 'companies', label: '🏢 Companies' },
  { key: 'pipeline', label: '📌 Pipeline' },
  { key: 'insights', label: '📊 Insights' },
  { key: 'import', label: '⬆ Import' },
  { key: 'settings', label: '⚙️ Settings' },
];
const REL = { connection: 'LinkedIn connection', met: 'Talked before', alumni: 'College alum', ex_colleague: 'Ex-colleague', friend: 'Friend' };
const STATUS = { not_contacted: 'Not connected', requested: 'Request sent', connected: 'Connected', messaged: 'Messaged', replied: 'Replied', referral: 'Referred you', skipped: 'Skipped' };
const OUTCOME = { parked: 'Parked', rejected: 'Rejected', not_interested: 'Not interested', won: 'Offer accepted 🎉' };
const DAY = 86400000;

export default function Referrals() {
  const [params, setParams] = useSearchParams();
  const view = VIEWS.some((v) => v.key === params.get('view')) ? params.get('view') : 'hub';
  const contactId = Number(params.get('contact')) || null;
  const [version, setVersion] = useState(0); // bump to reload the current view after drawer changes
  const go = (patch) => setParams((p) => {
    const next = new URLSearchParams(p);
    for (const [k, v] of Object.entries(patch)) (v == null ? next.delete(k) : next.set(k, v));
    return next;
  });
  const open = (id) => go({ contact: id });
  const props = { open, go };
  const k = `${view}-${version}`;
  return (
    <>
      <div className="li-subtabs">
        {VIEWS.map((v) => (
          <button key={v.key} className={`chip-btn${view === v.key ? ' on' : ''}`} onClick={() => go({ view: v.key, contact: null })}>{v.label}</button>
        ))}
      </div>
      {view === 'hub' && <Hub key={k} {...props} />}
      {view === 'jobs' && <Jobs key={k} {...props} />}
      {view === 'people' && <People key={k} {...props} />}
      {view === 'companies' && <Companies key={k} {...props} />}
      {view === 'pipeline' && <Pipeline key={k} {...props} />}
      {view === 'insights' && <Insights key={k} {...props} />}
      {view === 'import' && <Import key={k} {...props} />}
      {view === 'settings' && <Settings />}
      {contactId && <ContactDrawer id={contactId} onClose={() => { go({ contact: null }); setVersion((v) => v + 1); }} />}
    </>
  );
}

function useLoad(fn) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => fn().then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message)), [fn]);
  useEffect(() => { load(); }, [load]);
  return { data, error, load, setError };
}

const TierPill = ({ tier }) => (tier ? <span className={`pill ref-tier ref-tier-${tier}`}>Tier {tier}</span> : null);
const Fit = ({ fit }) => <span className={`ref-fit ref-fit-${fit.score >= 75 ? 'hi' : fit.score >= 55 ? 'mid' : 'lo'}`} title="Referral fit (0–100)">{fit.score}</span>;
const Strength = ({ s }) => <span className={`chip ref-str-${s.label.toLowerCase()}`}>{s.label}</span>;

/* ------------------------------------------------------------------------ */
/* Hub                                                                      */
/* ------------------------------------------------------------------------ */
function Hub({ open, go }) {
  const { data, error, load, setError } = useLoad(api.refHub);
  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!data) return <Loading />;
  const k = data.kpis;
  async function addToPipeline(c) {
    try {
      await api.refAddPursuit({ company_id: c.company_id, contact_id: c.next === 'Ask for a referral' ? c.id : undefined });
      go({ view: 'pipeline' });
    } catch (e) { setError(e.message); }
  }
  return (
    <>
      <section className="card">
        <div className="ref-kpis">
          {/* before any data: show what's waiting, not a row of zeros */}
          <Kpi value={k.covered ? `${k.covered}/${k.targets}` : k.targets} label={k.covered ? 'target companies where you know someone' : 'target companies to find contacts at (import connections)'} />
          {k.contactsAtTargets > 0 && <Kpi value={k.contactsAtTargets} label="contacts at target companies" />}
          <Kpi value={k.openPursuits || '+'} label={k.openPursuits ? 'companies in your pipeline' : 'add your first company to the pipeline'} />
          {k.referrals > 0 && <Kpi value={k.referrals} label="referrals so far" />}
          {k.overdue > 0 && <Kpi value={k.overdue} label="overdue next steps" warn />}
        </div>
        <div className="ref-stage-strip">
          {data.pipeline.map((s) => (
            <button key={s.stage} className="ref-stage-chip" onClick={() => go({ view: 'pipeline' })}>{s.label} <strong>{s.count}</strong></button>
          ))}
        </div>
      </section>

      {k.contactsAtTargets === 0 ? (
        <section className="card notice">
          <span>👋 <strong>Start here:</strong> import your LinkedIn Connections.csv. The app finds who you already know at 228 high-paying companies and ranks who to ask.</span>
          <button className="btn primary" onClick={() => go({ view: 'import' })}>⬆ Import connections</button>
        </section>
      ) : null}

      <div className="ref-hub-grid">
        <section className="card">
          <h2>🙋 Next best people to ask</h2>
          <p className="muted small">One person per company, ranked by pay tier × how much their role helps × how well you know them.</p>
          {!data.queue.length && <p className="muted">Nobody to act on yet. Connect with engineers at your target companies (Companies → search links).</p>}
          <ol className="ref-queue">
            {data.queue.map((c, i) => (
              <li key={c.id} className="ref-person">
                <span className="ref-rank">{i + 1}</span>
                <div className="ref-person-main">
                  <button className="link-btn ref-name" onClick={() => open(c.id)}>{c.name}</button>
                  <div className="small muted">{c.role || c.headline} · {c.company}</div>
                  <div className="row gap wrap top-gap-sm">
                    <TierPill tier={c.tier} /><Strength s={c.fit.strength} /><span className="chip">{REL[c.rel_type]}</span>
                  </div>
                  <div className="small ref-next">➡ {c.next}</div>
                </div>
                <div className="ref-person-side">
                  <Fit fit={c.fit} />
                  <button className="btn small-btn" onClick={() => addToPipeline(c)}>+ Pipeline</button>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="card">
          <h2>🔔 Alerts</h2>
          {!data.alerts.length && <p className="muted small">All quiet. Alerts appear when someone moves to a target company, a follow-up is due, or a company depends on a single contact.</p>}
          <ul className="ref-alerts">
            {data.alerts.map((a, i) => (
              <li key={i} className={`ref-alert ref-alert-${a.kind}`}>
                <strong>{a.title}</strong>
                <div className="small">{a.text}</div>
                <div className="row gap wrap small top-gap-sm">
                  {a.contact && <button className="link-btn" onClick={() => open(a.contact.id)}>Open {a.contact.name.split(' ')[0]}</button>}
                  {a.pursuit_id && <button className="link-btn" onClick={() => go({ view: 'pipeline' })}>Open pipeline</button>}
                  {a.links && ['single', 'no_contact'].includes(a.kind) && <a href={a.links.engineers} target="_blank" rel="noreferrer">Find engineers ↗</a>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

const Kpi = ({ value, label, warn }) => (
  <div className={`ref-kpi${warn ? ' warn' : ''}`}><strong>{value}</strong><span>{label}</span></div>
);

/* ------------------------------------------------------------------------ */
/* Jobs: openings from your target companies' public job boards             */
/* ------------------------------------------------------------------------ */
const JOB_TABS = [['', 'To review'], ['saved', 'Saved'], ['applied', 'Applied'], ['hidden', 'Hidden']];

function Jobs({ go }) {
  const [f, setF] = useState({ status: '', min: '50', tier: '', remote: '', q: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const load = useCallback(() => api.refJobs(f).then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message)), [f]);
  useEffect(() => { load(); }, [load]);
  async function refresh() {
    setBusy(true); setNote(null);
    try {
      const s = await api.refRefreshJobs();
      setNote(`Checked ${s.ok}/${s.boards} job boards: ${s.newJobs} new matching jobs${s.failed.length ? ` · ${s.failed.length} boards failed` : ''}.`);
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const act = (fn) => fn().then(load).catch((e) => setError(e.message));
  return (
    <>
      <section className="card">
        <div className="row center-v wrap" style={{ justifyContent: 'space-between', gap: '0.6rem' }}>
          <h2 style={{ margin: 0 }}>💼 Jobs that fit you</h2>
          <button className="btn" disabled={busy} onClick={refresh}>{busy ? 'Checking boards… (about a minute)' : '↻ Refresh now'}</button>
        </div>
        <p className="muted small">
          Openings from {data?.boards ?? '…'} target companies' public job boards, checked daily
          {data?.lastRefresh ? ` (last ${new Date(data.lastRefresh).toLocaleString('en-IN')})` : ''}. Only engineering roles in India or remote-open,
          at a level you can get, scored for your stack and Settings. Google, Microsoft, Amazon and other big companies run their own careers
          sites: use their <button className="link-btn" onClick={() => go({ view: 'companies' })}>Careers ↗ links</button>.
        </p>
        {note && <div className="small ok-text">{note}</div>}
        <div className="li-subtabs top-gap-sm">
          {JOB_TABS.map(([k, label]) => <button key={k} className={`chip-btn${f.status === k ? ' on' : ''}`} onClick={() => setF({ ...f, status: k })}>{label}</button>)}
        </div>
        <div className="row gap wrap top-gap-sm">
          <input className="search" placeholder="Search title, company, city" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} aria-label="Search jobs" />
          <select value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} aria-label="Minimum match">
            <option value="0">Any match</option><option value="50">Match 50+</option><option value="70">Match 70+</option><option value="85">Match 85+</option>
          </select>
          <select value={f.tier} onChange={(e) => setF({ ...f, tier: e.target.value })} aria-label="Tier"><option value="">All tiers</option><option value="1">Tier 1</option><option value="2">Tier 2</option><option value="3">Tier 3</option></select>
          <label className="small row gap center-v"><input type="checkbox" checked={f.remote === '1'} onChange={(e) => setF({ ...f, remote: e.target.checked ? '1' : '' })} /> Remote only</label>
        </div>
      </section>
      {error && <ErrorBox error={error} onRetry={load} />}
      {!data ? <Loading /> : (
        <section className="card">
          <div className="small muted">{data.jobs.length} jobs{data.failing ? ` · ${data.failing} boards had errors last time` : ''}</div>
          {!data.jobs.length && <p className="muted">Nothing here yet. Press <strong>Refresh now</strong> (the first check takes about a minute) or lower the match filter.</p>}
          <ul className="ref-jobs">
            {data.jobs.map((j) => (
              <li key={j.id} className="ref-job">
                <div className="ref-job-main">
                  <div className="row gap center-v wrap">
                    <a className="ref-job-title" href={j.url} target="_blank" rel="noreferrer">{j.title} ↗</a>
                    {j.fresh && j.status === 'new' && <span className="pill ref-new">New</span>}
                  </div>
                  <div className="small">{j.company} <TierPill tier={j.tier} /> · <span className="muted">{j.location || 'Location not stated'}{j.remote ? ' · remote' : ''}</span></div>
                  <ul className="small muted ref-job-why">{j.reasons.map((r, i) => <li key={i}>+{r.points} {r.text}</li>)}</ul>
                  {j.contacts > 0 && <div className="small ref-next">🤝 You know {j.contacts} {j.contacts === 1 ? 'person' : 'people'} at {j.company}: ask for a referral before applying</div>}
                </div>
                <div className="ref-person-side">
                  <span className={`ref-fit ref-fit-${j.score >= 80 ? 'hi' : j.score >= 60 ? 'mid' : 'lo'}`} title="Match (0–100)">{j.score}</span>
                  <button className="btn small-btn" onClick={() => act(() => api.refJobToPipeline(j.id))}>+ Pipeline</button>
                  <div className="row gap small">
                    {j.status !== 'saved' && <button className="link-btn" onClick={() => act(() => api.refJobStatus(j.id, 'saved'))}>Save</button>}
                    {j.status !== 'applied' && <button className="link-btn" onClick={() => act(() => api.refJobStatus(j.id, 'applied'))}>Applied</button>}
                    {j.status !== 'hidden'
                      ? <button className="link-btn" onClick={() => act(() => api.refJobStatus(j.id, 'hidden'))}>Hide</button>
                      : <button className="link-btn" onClick={() => act(() => api.refJobStatus(j.id, 'new'))}>Unhide</button>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* People: plain-English search                                             */
/* ------------------------------------------------------------------------ */
const EXAMPLES = ['tier 1 engineering managers in bangalore', 'ex-colleagues at fintech', 'recruiters not connected', 'engineers at google'];

function People({ open }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [error, setError] = useState(null);
  const run = useCallback((text) => api.refSearch(text).then((r) => { setRes(r); setError(null); }).catch((e) => setError(e.message)), []);
  useEffect(() => { run(''); }, [run]);
  return (
    <section className="card">
      <h2>🔎 Your people</h2>
      <form className="row gap wrap" onSubmit={(e) => { e.preventDefault(); run(q); }}>
        <input className="search ref-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. tier 1 engineering managers in bangalore" aria-label="Search your contacts" />
        <button className="btn primary">Search</button>
      </form>
      <div className="row gap wrap small top-gap-sm">
        <span className="muted">Try:</span>
        {EXAMPLES.map((x) => <button key={x} className="link-btn" onClick={() => { setQ(x); run(x); }}>{x}</button>)}
      </div>
      {error && <div className="form-error">{error}</div>}
      {res && (
        <>
          <div className="row gap wrap top-gap">
            {res.chips.map((c, i) => <span key={i} className="chip ref-chip">{c.kind}: <strong>{String(c.value).replace('_', ' ')}</strong></span>)}
            <span className="small muted">{res.total} {res.total === 1 ? 'person' : 'people'}</span>
          </div>
          {res.unknown.length > 0 && <div className="small muted top-gap-sm">Ignored (not understood): {res.unknown.join(', ')}</div>}
          <div className="table-wrap top-gap">
            <table className="data-table ref-table">
              <thead><tr><th>Person</th><th>Company</th><th>Fit</th><th>Tie</th><th>Status</th><th>Next</th></tr></thead>
              <tbody>
                {res.items.map((c) => (
                  <tr key={c.id}>
                    <td><button className="link-btn" onClick={() => open(c.id)}>{c.name}</button><div className="small muted">{c.role}</div></td>
                    <td>{c.company || '—'} {c.tier && <TierPill tier={c.tier} />}</td>
                    <td><Fit fit={c.fit} /></td>
                    <td><Strength s={c.fit.strength} /></td>
                    <td className="small">{STATUS[c.status] || c.status}</td>
                    <td className="small muted">{c.next || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* Companies                                                                */
/* ------------------------------------------------------------------------ */
function Companies({ open, go }) {
  const { data, error, load, setError } = useLoad(api.refCompanies);
  const [f, setF] = useState({ q: '', tier: '', category: '', only: 'all' });
  const [shown, setShown] = useState(60);
  const [form, setForm] = useState({ name: '', tier: '2', category: '' });
  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!data) return <Loading />;
  const cats = [...new Set(data.companies.map((c) => c.category).filter(Boolean))].sort();
  const list = data.companies.filter((c) => (!f.q || c.name.toLowerCase().includes(f.q.toLowerCase()) || c.aliases.some((a) => a.toLowerCase().includes(f.q.toLowerCase())))
    && (!f.tier || c.tier === Number(f.tier)) && (!f.category || c.category === f.category)
    && (f.only === 'all' || (f.only === 'known' ? c.contacts > 0 : f.only === 'unknown' ? c.contacts === 0 : !c.is_target)));
  const act = (fn) => fn().then(load).catch((e) => setError(e.message));
  async function add(e) {
    e.preventDefault();
    await act(() => api.refAddCompany({ name: form.name, tier: Number(form.tier), category: form.category || 'Other' }));
    setForm({ name: '', tier: '2', category: '' });
  }
  return (
    <>
      <section className="card">
        <h2>🏢 Target companies <span className="muted small">· {data.companies.filter((c) => c.is_target).length} targets</span></h2>
        <div className="ref-tier-legend small">
          {Object.entries(data.tiers).map(([t, x]) => <span key={t}><TierPill tier={Number(t)} /> {x.band}</span>)}
          <span className="muted">Pay bands are estimates from public salary reports for ~1–4 years' experience; verify for your level.</span>
        </div>
        <div className="row gap wrap top-gap">
          <input className="search" placeholder="Search companies" value={f.q} onChange={(e) => { setF({ ...f, q: e.target.value }); setShown(60); }} aria-label="Search companies" />
          <select value={f.tier} onChange={(e) => setF({ ...f, tier: e.target.value })} aria-label="Tier"><option value="">All tiers</option><option value="1">Tier 1</option><option value="2">Tier 2</option><option value="3">Tier 3</option></select>
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} aria-label="Category"><option value="">All categories</option>{cats.map((c) => <option key={c}>{c}</option>)}</select>
          <select value={f.only} onChange={(e) => setF({ ...f, only: e.target.value })} aria-label="Show">
            <option value="all">All</option><option value="known">Where I know someone</option><option value="unknown">No contacts yet</option><option value="off">Switched off</option>
          </select>
        </div>
      </section>

      <section className="card">
        <div className="small muted">{list.length} companies</div>
        <ul className="ref-companies">
          {list.slice(0, shown).map((c) => (
            <li key={c.id} className={`ref-company${c.is_target ? '' : ' off'}`}>
              <div className="ref-company-main">
                <div className="row gap center-v wrap">
                  <strong>{c.name}</strong>
                  <select className="ref-tier-select" value={c.tier} onChange={(e) => act(() => api.refUpdateCompany(c.id, { tier: Number(e.target.value) }))} aria-label={`Tier for ${c.name}`}>
                    <option value="1">Tier 1</option><option value="2">Tier 2</option><option value="3">Tier 3</option>
                  </select>
                  <span className="small muted">{c.category}</span>
                </div>
                <div className="small top-gap-sm">
                  {c.contacts ? <>👥 {c.contacts} {c.contacts === 1 ? 'contact' : 'contacts'} · best: <button className="link-btn" onClick={() => open(c.best.id)}>{c.best.name}</button> <span className="muted">({c.best.fit.score})</span></> : <span className="muted">No contacts yet</span>}
                </div>
                <div className="row gap wrap small top-gap-sm">
                  <a href={c.links.engineers} target="_blank" rel="noreferrer">Engineers ↗</a>
                  <a href={c.links.managers} target="_blank" rel="noreferrer">Managers ↗</a>
                  <a href={c.links.recruiters} target="_blank" rel="noreferrer">Recruiters ↗</a>
                  <a href={c.links.careers} target="_blank" rel="noreferrer">Careers ↗</a>
                </div>
              </div>
              <div className="ref-company-side">
                {c.pursuit
                  ? <button className="chip ref-chip" onClick={() => go({ view: 'pipeline' })}>📌 {c.pursuit.label}</button>
                  : c.is_target && <button className="btn small-btn" onClick={() => act(() => api.refAddPursuit({ company_id: c.id }))}>+ Pipeline</button>}
                <label className="small row gap center-v"><input type="checkbox" checked={c.is_target} onChange={(e) => act(() => api.refUpdateCompany(c.id, { is_target: e.target.checked }))} /> Target</label>
              </div>
            </li>
          ))}
        </ul>
        {list.length > shown && <button className="btn top-gap" onClick={() => setShown((s) => s + 60)}>Show more ({list.length - shown} left)</button>}
      </section>

      <section className="card">
        <h2>➕ Add a company</h2>
        <form className="row gap wrap" onSubmit={add}>
          <input className="search" required placeholder="Company name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Company name" />
          <select value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })} aria-label="Tier"><option value="1">Tier 1</option><option value="2">Tier 2</option><option value="3">Tier 3</option></select>
          <input placeholder="Category (optional)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} aria-label="Category" />
          <button className="btn primary">Add</button>
        </form>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Pipeline (Kanban: drag on desktop, the stage menu works with keyboard/phone) */
/* ------------------------------------------------------------------------ */
function Pipeline({ open }) {
  const { data, error, load, setError } = useLoad(api.refPipeline);
  const [closing, setClosing] = useState(null);
  const dragged = useRef(null);
  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!data) return <Loading />;
  const act = (fn) => fn().then(load).catch((e) => { setError(e.message); });
  const move = (p, stage) => stage !== p.stage && act(() => api.refMove(p.id, stage));
  return (
    <>
      <section className="card">
        <h2>📌 Referral pipeline</h2>
        <p className="muted small">
          One card per company. Pick who refers you, then move it along: ask → (one follow-up max) → referred → apply → interview → offer.
          Drag cards on a computer, or use the stage menu on your phone.
        </p>
        {!data.open.length && <p className="muted">Empty. Add companies from the Hub or the Companies list.</p>}
      </section>
      <div className="ref-board">
        {data.stages.map((s) => {
          const cards = data.open.filter((p) => p.stage === s.stage);
          return (
            <section key={s.stage} className="ref-col" onDragOver={(e) => e.preventDefault()}
              onDrop={() => { const p = dragged.current; dragged.current = null; if (p) move(p, s.stage); }}>
              <h3 className="ref-col-head">{s.label} <span className="muted small">{cards.length}</span></h3>
              {cards.map((p) => (
                <article key={p.id} className={`ref-card${p.overdue ? ' overdue' : ''}`} draggable onDragStart={() => { dragged.current = p; }}>
                  <div className="row gap center-v wrap"><strong>{p.company?.name}</strong><TierPill tier={p.company?.tier} /></div>
                  {p.role_title && <div className="small">{p.role_title}</div>}
                  <label className="small field-inline">Referrer
                    <select value={p.contact_id || ''} onChange={(e) => act(() => api.refUpdatePursuit(p.id, { contact_id: e.target.value ? Number(e.target.value) : null }))}>
                      <option value="">— choose —</option>
                      {p.candidates.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.fit})</option>)}
                    </select>
                  </label>
                  {p.contact && <button className="link-btn small" onClick={() => open(p.contact.id)}>Open {p.contact.name.split(' ')[0]} → messages</button>}
                  {p.next_action && <div className={`small ref-next${p.overdue ? ' warn-text' : ''}`}>➡ {p.next_action}{p.due_ms ? ` · ${formatShort(new Date(p.due_ms).toISOString().slice(0, 10))}` : ''}</div>}
                  <div className="row gap wrap top-gap-sm">
                    <select value={p.stage} onChange={(e) => move(p, e.target.value)} aria-label={`Stage for ${p.company?.name}`}>
                      {data.stages.map((x) => <option key={x.stage} value={x.stage}>{x.label}</option>)}
                    </select>
                    {p.stage === 'asked' && p.follow_ups < 1 && <button className="btn small-btn" onClick={() => act(() => api.refFollowUp(p.id))}>Sent follow-up</button>}
                    <button className="link-btn small" onClick={() => setClosing(p)}>Close…</button>
                  </div>
                </article>
              ))}
            </section>
          );
        })}
      </div>

      {data.closed.length > 0 && (
        <section className="card">
          <h2>🗄️ Closed</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Company</th><th>Reached</th><th>Outcome</th><th>Reason</th><th>Revisit</th><th /></tr></thead>
              <tbody>
                {data.closed.map((p) => (
                  <tr key={p.id}>
                    <td>{p.company?.name}</td><td className="small">{p.label}</td><td className="small">{OUTCOME[p.outcome]}</td>
                    <td className="small muted">{p.reason || '—'}</td>
                    <td className="small">{p.revisit_ms ? formatShort(new Date(p.revisit_ms).toISOString().slice(0, 10)) : '—'}</td>
                    <td><button className="link-btn" onClick={() => act(() => api.refReopen(p.id))}>Reopen</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {closing && <CloseDialog p={closing} onClose={() => setClosing(null)} onDone={() => { setClosing(null); load(); }} />}
    </>
  );
}

function CloseDialog({ p, onClose, onDone }) {
  const ref = useRef(null);
  const [f, setF] = useState({ outcome: 'parked', reason: '', revisit: new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10) });
  const [error, setError] = useState(null);
  useEffect(() => { const d = ref.current; d?.showModal(); return () => d?.close(); }, []);
  async function save(e) {
    e.preventDefault();
    try {
      await api.refClose(p.id, { outcome: f.outcome, reason: f.reason, revisit_ms: f.outcome === 'parked' ? Date.parse(`${f.revisit}T09:00:00`) : undefined });
      onDone();
    } catch (err) { setError(err.message); }
  }
  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={onClose}>
      <form onSubmit={save}>
        <div className="dialog-head"><h2>Close {p.company?.name}</h2><button type="button" className="btn icon" onClick={onClose} aria-label="Close">×</button></div>
        <div className="dialog-body">
          <label className="field"><span className="field-label">Outcome</span>
            <select value={f.outcome} onChange={(e) => setF({ ...f, outcome: e.target.value })}>{Object.entries(OUTCOME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          <label className="field"><span className="field-label">Reason (optional)</span><input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} maxLength={300} /></label>
          {f.outcome === 'parked' && <label className="field"><span className="field-label">Revisit on</span><input type="date" required value={f.revisit} onChange={(e) => setF({ ...f, revisit: e.target.value })} /></label>}
          {error && <div className="form-error">{error}</div>}
          <div className="dialog-actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary">Close pursuit</button></div>
        </div>
      </form>
    </dialog>
  );
}

/* ------------------------------------------------------------------------ */
/* Insights                                                                 */
/* ------------------------------------------------------------------------ */
function Insights() {
  const { data, error, load } = useLoad(api.refInsights);
  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!data) return <Loading />;
  const max = Math.max(1, data.funnel[0].count);
  return (
    <>
      <section className="card">
        <h2>📊 Referral funnel</h2>
        <p className="muted small">How many companies ever reached each stage, and the % that made it from the stage before.</p>
        {!data.funnel[0].count ? (
          <EmptyState icon="🚀" title="Your funnel starts with one company">Add a target company to your pipeline from the Hub, then ask one contact there for a referral. Every stage shows up here.</EmptyState>
        ) : (
        <ul className="ref-funnel">
          {data.funnel.map((s) => (
            <li key={s.stage}>
              <span className="ref-funnel-label">{s.label}</span>
              <ProgressBar value={s.count} total={max} />
              <span className="small nowrap"><strong>{s.count}</strong>{s.conversion != null ? <span className="muted"> · {s.conversion}%</span> : null}</span>
            </li>
          ))}
        </ul>
        )}
        <div className="stat-row">
          <div className="stat"><strong>{data.medianDaysToReferral ?? '—'}</strong><span>median days to a referral</span></div>
          {data.closed.filter((c) => c.count > 0).map((c) => <div key={c.outcome} className="stat"><strong>{c.count}</strong><span>{OUTCOME[c.outcome].toLowerCase()}</span></div>)}
        </div>
      </section>
      <section className="card">
        <h2>🤝 What works</h2>
        <p className="muted small">Of the referral asks you made, how many turned into a referral, by how well you knew the person.</p>
        {!data.sources.length ? <p className="muted small">Appears after your first referral asks.</p> : (
          <table className="data-table"><thead><tr><th>Relationship</th><th>Asked</th><th>Referred</th><th>Rate</th></tr></thead>
            <tbody>{data.sources.map((s) => <tr key={s.rel_type}><td>{s.label}</td><td>{s.asked}</td><td>{s.referred}</td><td><strong>{s.rate}%</strong></td></tr>)}</tbody>
          </table>
        )}
      </section>
      <section className="card">
        <h2>🗺️ Coverage</h2>
        <p className="muted small">Target companies where you know at least one person, by category and tier. Grow the low numbers.</p>
        <div className="table-wrap">
          <table className="data-table ref-coverage">
            <thead><tr><th>Category</th><th>Tier 1</th><th>Tier 2</th><th>Tier 3</th></tr></thead>
            <tbody>
              {data.coverage.map((r) => (
                <tr key={r.category}><td>{r.category}</td>
                  {[1, 2, 3].map((t) => { const [have, all] = r.tiers[t]; return <td key={t} className={all ? (have ? 'ref-cov-some' : 'ref-cov-none') : 'muted'}>{all ? (have ? `${have}/${all}` : `${all} to reach`) : '—'}</td>; })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card">
        <h2>📨 Outreach funnel</h2>
        <ul className="ref-funnel">
          {data.outreach.map((o) => (
            <li key={o.key}><span className="ref-funnel-label">{o.label}</span><ProgressBar value={o.count} total={Math.max(1, data.outreach[0].count, ...data.outreach.map((x) => x.count))} /><strong className="small">{o.count}</strong></li>
          ))}
        </ul>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Import (preview first)                                                   */
/* ------------------------------------------------------------------------ */
function Import({ go }) {
  const hist = useLoad(api.refImports);
  return (
    <section className="card">
      <h2>⬆ Import your LinkedIn connections</h2>
      <p className="small muted">Same sync as the <Link to="/linkedin/connector">🔌 Connector</Link> tab (which also has your account and full history). Re-import monthly: the app notices who moved to a target company.</p>
      <ConnectionsSync last={hist.data?.[0]} onDone={() => hist.load()} />
      <button className="btn top-gap" onClick={() => go({ view: 'hub' })}>See who to ask →</button>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* Settings: message templates + preferred cities                           */
/* ------------------------------------------------------------------------ */
function Settings() {
  const { data, error, load } = useLoad(api.refSettings);
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => { if (data) setF({ locations: data.locations.join(', '), skills: data.jobSkills.join(', '), years: String(data.jobYears), ...data.templates }); }, [data]);
  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!f) return <Loading />;
  async function save(e) {
    e.preventDefault();
    try {
      await api.refSaveSettings({
        locations: f.locations.split(',').map((x) => x.trim()).filter(Boolean),
        jobSkills: f.skills.split(',').map((x) => x.trim()).filter(Boolean), jobYears: Number(f.years),
        templates: { ask: f.ask, follow_up: f.follow_up, thanks: f.thanks },
      });
      setMsg('Saved ✓'); setTimeout(() => setMsg(null), 2000);
    } catch (err) { setMsg(err.message); }
  }
  return (
    <section className="card">
      <h2>⚙️ Messages & preferences</h2>
      <p className="muted small">
        Variables: <code>{'{{first_name}}'}</code> <code>{'{{company}}'}</code> <code>{'{{role_title}}'}</code> <code>{'{{job_line}}'}</code> (the job link, if you added one)
        {' '}<code>{'{{my_intro}}'}</code> (from LinkedIn → Settings). Keep them honest and short; you always review and send them yourself.
      </p>
      <form onSubmit={save} className="ref-settings">
        <label className="field"><span className="field-label">Preferred cities (comma-separated, +5 fit)</span><input value={f.locations} onChange={(e) => setF({ ...f, locations: e.target.value })} /></label>
        <label className="field"><span className="field-label">Jobs: your skills (comma-separated, matched in job descriptions)</span><input value={f.skills} onChange={(e) => setF({ ...f, skills: e.target.value })} /></label>
        <label className="field"><span className="field-label">Jobs: your years of experience (roles asking for 3+ more are hidden)</span><input type="number" min="0" max="30" step="0.5" value={f.years} onChange={(e) => setF({ ...f, years: e.target.value })} /></label>
        {[['ask', 'Referral ask'], ['follow_up', 'One follow-up (only if no reply after 5 days)'], ['thanks', 'Thank-you']].map(([k, label]) => (
          <label key={k} className="field"><span className="field-label">{label}</span><textarea rows={4} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} maxLength={1500} /></label>
        ))}
        <div className="row gap center-v"><button className="btn primary">Save</button>{msg && <span className="small">{msg}</span>}</div>
      </form>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* Contact drawer (?contact=<id>, so it can be linked from anywhere)        */
/* ------------------------------------------------------------------------ */
function ContactDrawer({ id, onClose }) {
  const ref = useRef(null);
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(null);
  const load = useCallback(() => api.refContact(id).then(setD).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const el = ref.current; el?.showModal(); return () => el?.close(); }, []);
  const act = (fn) => fn().then(load).catch((e) => setError(e.message));
  async function copy(k, text) {
    try { await navigator.clipboard.writeText(text); setCopied(k); setTimeout(() => setCopied(null), 1500); } catch { setError('Copy failed: select the text and copy it manually'); }
  }
  const c = d?.contact;
  return (
    <dialog ref={ref} className="dialog drawer" onClose={onClose} onCancel={onClose}>
      <div className="dialog-head">
        <div>
          <div className="muted small">👤 Contact</div>
          <h2>{c ? c.name : 'Loading…'}</h2>
          {c && <div className="small muted">{c.role || c.headline} · {c.company} {c.tier && <TierPill tier={c.tier} />}</div>}
        </div>
        <button className="btn icon" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="dialog-body">
        {error && <div className="form-error">{error}</div>}
        {!d ? <Loading /> : (
          <>
            <div className="row gap center-v wrap">
              <Fit fit={c.fit} /><Strength s={c.fit.strength} /><span className="chip">{STATUS[c.status] || c.status}</span>
              {c.profile_url && <a className="small" href={c.profile_url} target="_blank" rel="noreferrer">LinkedIn profile ↗</a>}
            </div>
            {c.next && <div className="ref-next">➡ <strong>{c.next}</strong></div>}

            <h3>Why this score</h3>
            <ul className="small ref-reasons">{c.fit.reasons.map((r, i) => <li key={i}><span className="ref-pts">+{r.points}</span> {r.text}</li>)}</ul>

            <h3>How you know them</h3>
            <div className="row gap wrap center-v">
              <select value={c.rel_type} onChange={(e) => act(() => api.refUpdateContact(c.id, { rel_type: e.target.value }))} aria-label="Relationship">
                {Object.entries(REL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <button className="btn small-btn" onClick={() => act(() => api.refUpdateContact(c.id, { talked_now: true }))}>💬 We talked today</button>
              {['connected', 'messaged', 'replied', 'referral'].includes(c.status) && <button className="btn small-btn" onClick={() => act(() => api.refMessaged(c.id))}>✉️ I messaged them</button>}
              <span className="small muted">{c.last_interaction_ms ? `Last talked ${new Date(c.last_interaction_ms).toLocaleDateString('en-IN')}` : 'No conversation logged'}</span>
            </div>

            <h3>Messages <span className="muted small">· copy, then send on LinkedIn yourself</span></h3>
            {d.pursuit && <div className="small muted">For {d.pursuit.role_title || 'a software engineer role'} at {c.company} · pipeline: {d.pursuit.label}</div>}
            {[['ask', 'Referral ask'], ['follow_up', 'Follow-up (once)'], ['thanks', 'Thank-you']].map(([k, label]) => (
              <div key={k} className="ref-msg">
                <div className="row center-v" style={{ justifyContent: 'space-between' }}>
                  <strong className="small">{label}</strong>
                  <button className="btn small-btn" onClick={() => copy(k, d.messages[k])}>{copied === k ? 'Copied ✓' : 'Copy'}</button>
                </div>
                <p className="small">{d.messages[k]}</p>
              </div>
            ))}

            {d.company && (
              <>
                <h3>More people at {d.company.name}</h3>
                <div className="row gap wrap small">
                  <a href={d.company.links.engineers} target="_blank" rel="noreferrer">Engineers ↗</a>
                  <a href={d.company.links.managers} target="_blank" rel="noreferrer">Managers ↗</a>
                  <a href={d.company.links.recruiters} target="_blank" rel="noreferrer">Recruiters ↗</a>
                  <a href={d.company.links.careers} target="_blank" rel="noreferrer">Careers ↗</a>
                </div>
              </>
            )}

            <h3>Notes</h3>
            <form className="row gap" onSubmit={(e) => { e.preventDefault(); if (note.trim()) act(() => api.refAddNote(c.id, note.trim()).then(() => setNote(''))); }}>
              <input className="search" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Worked together on payments; prefers WhatsApp" maxLength={2000} aria-label="Add a note" />
              <button className="btn">Add</button>
            </form>

            <h3>Timeline</h3>
            {!d.timeline.length ? <p className="small muted">Nothing yet.</p> : (
              <ul className="small ref-timeline">{d.timeline.map((t, i) => <li key={i}><span className="muted">{new Date(t.at_ms).toLocaleDateString('en-IN')}</span> {t.text}</li>)}</ul>
            )}
          </>
        )}
      </div>
    </dialog>
  );
}
