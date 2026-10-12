import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorBox, Loading, ProgressBar } from '../components/ui.jsx';

/**
 * Phase 3 · assisted outreach. LinkedIn doesn't allow apps to send connection requests (and bans bots),
 * so YOU press "Connect" on LinkedIn; the app finds, organises, writes, paces and tracks.
 */
const VIEWS = [
  { key: 'session', label: "🎯 Today's session" },
  { key: 'lists', label: '🗂️ Target lists' },
  { key: 'people', label: '👥 People' },
];
const STATUS_LABEL = {
  not_contacted: 'Not contacted', requested: 'Requested', connected: 'Connected', messaged: 'Messaged',
  replied: 'Replied', referral: 'Referral / interview', skipped: 'Skipped', do_not_contact: 'Do not contact',
};
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function LinkedInOutreach() {
  const [params, setParams] = useSearchParams();
  const view = VIEWS.some((v) => v.key === params.get('view')) ? params.get('view') : 'session';
  return (
    <>
      <div className="li-subtabs">
        {VIEWS.map((v) => (
          <button key={v.key} className={`chip-btn${view === v.key ? ' on' : ''}`} onClick={() => setParams({ view: v.key })}>{v.label}</button>
        ))}
      </div>
      {view === 'session' && <Session />}
      {view === 'lists' && <Lists />}
      {view === 'people' && <People />}
    </>
  );
}

/* ---------------------------------------------------------------------------------- */
/* Today's session: open profile → send on LinkedIn → "I sent it" (caps + pacing enforced) */
/* ---------------------------------------------------------------------------------- */
function Session() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(Date.now());
  const load = useCallback(() => api.liOutreach().then(setData).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  // When the pacing pause ends, refresh so "I sent it" unlocks.
  useEffect(() => {
    if (data?.limits.reason !== 'pacing' || !data.limits.retryAt) return undefined;
    const t = setTimeout(load, Math.max(0, data.limits.retryAt - Date.now()) + 300);
    return () => clearTimeout(t);
  }, [data, load]);

  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!data) return <Loading />;
  const { limits, queue, counts } = data;
  const waitS = limits.reason === 'pacing' && limits.retryAt ? Math.max(0, Math.ceil((limits.retryAt - tick) / 1000)) : 0;

  async function warning() {
    const detail = prompt('What did LinkedIn show? (e.g. "weekly invitation limit", "CAPTCHA", "account restricted warning")');
    if (detail === null) return;
    await api.liWarning(detail);
    load();
  }

  return (
    <>
      <section className="card li-limits">
        <div className="li-limit"><span className="muted small">Today</span><strong>{limits.sentToday ? `${limits.sentToday}/${limits.dailyCap}` : `${limits.dailyCap} available`}</strong><ProgressBar value={limits.sentToday} total={limits.dailyCap} /></div>
        <div className="li-limit"><span className="muted small">Last 7 days</span><strong>{limits.sentThisWeek ? `${limits.sentThisWeek}/${limits.weeklyCap}` : `${limits.weeklyCap} available`}</strong><ProgressBar value={limits.sentThisWeek} total={limits.weeklyCap} /></div>
        <div className="li-limit">
          <span className="muted small">Personal notes this month</span>
          <strong>{limits.premium ? '∞ (Premium)' : `${limits.notesLeft} left`}</strong>
          <span className="muted small">max {limits.noteMax} characters</span>
        </div>
        <div className="li-limit">
          <span className="muted small">Outreach hours</span>
          <strong>{limits.hours.start}–{limits.hours.end}</strong>
          <span className="muted small">{limits.hours.days.map((d) => DAYS[d]).join(' ')}</span>
        </div>
      </section>

      {limits.cooldownUntil ? (
        <div className="card notice li-paused">
          <span>🧊 <strong>Outreach is cooling down</strong> after a LinkedIn warning, until {new Date(limits.cooldownUntil).toLocaleString('en-IN')}. Posting continues. Use this week to post and reply to comments.</span>
          <button className="link-btn" onClick={async () => { if (confirm('End the cool-down early? Only do this if the warning is gone.')) { await api.liClearCooldown(); load(); } }}>End cool-down</button>
        </div>
      ) : !limits.ok ? (
        <div className={`card notice${limits.reason === 'pacing' ? '' : ' li-paused'}`}>
          <span>{limits.reason === 'pacing' ? `⏳ Next one in ${waitS}s. Use it to read their profile.` : `⏸ ${limits.message}`}</span>
        </div>
      ) : (
        <p className="muted small">
          For each person: <strong>Open profile</strong> → press <em>Connect</em> on LinkedIn (paste the note if you're using one) → come back and press <strong>I sent it</strong>.
          Free accounts get {limits.premium ? 'unlimited' : 'only ~5'} personal notes a month, so most requests go without one. Personalise after they accept.
        </p>
      )}

      {queue.length === 0 ? (
        <section className="card center">
          <p>No one in the queue.</p>
          <p className="muted small">Create a target list, open its search links, and paste the profiles you like into Quick-add.</p>
        </section>
      ) : (
        queue.map((c) => <QueueCard key={c.id} c={c} limits={limits} disabled={!limits.ok} onDone={load} />)
      )}

      <div className="row gap wrap center-v top-gap">
        <span className="muted small">Pipeline: {Object.entries(STATUS_LABEL).map(([k, l]) => `${l} ${counts[k] || 0}`).join(' · ')}</span>
      </div>
      <div className="top-gap">
        <button className="btn li-warn-btn" onClick={warning}>⚠️ LinkedIn showed me a warning / limit / CAPTCHA</button>
        <span className="muted small"> Pauses outreach for 7 days (posting continues).</span>
      </div>
    </>
  );
}

function QueueCard({ c, limits, disabled, onDone }) {
  const [useNote, setUseNote] = useState(!!c.use_note);
  const [note, setNote] = useState(c.note || c.suggested_note);
  const [opened, setOpened] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const noNotesLeft = !limits.premium && limits.notesLeft <= 0;

  async function act(fn) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      await onDone();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function openProfile() {
    if (useNote) {
      await api.liUpdateContact(c.id, { note, use_note: true });
      try { await navigator.clipboard.writeText(note); } catch { /* clipboard may be blocked; the note is still visible */ }
    }
    window.open(c.profile_url || `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${c.name} ${c.company || ''}`)}`, '_blank', 'noopener');
    setOpened(true);
  }

  return (
    <section className="card li-person">
      <div className="li-person-head">
        <div>
          <strong>{c.name}</strong>
          <div className="muted small">{c.headline || [c.role, c.company].filter(Boolean).join(' at ') || 'No headline yet'}{c.location ? ` · ${c.location}` : ''}</div>
          {c.list_name && <span className="chip">{c.list_name}</span>}
        </div>
      </div>
      <label className="li-check small">
        <input type="checkbox" checked={useNote} disabled={noNotesLeft && !useNote} onChange={(e) => setUseNote(e.target.checked)} />
        <span>Use a personalised note {noNotesLeft ? '(none left this month)' : `(${limits.premium ? 'unlimited' : `${limits.notesLeft} left`})`}</span>
      </label>
      {useNote && (
        <>
          <textarea className="notes" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={limits.noteMax} />
          <div className="row center-v wrap" style={{ justifyContent: 'space-between' }}>
            <span className={`small ${note.length > limits.noteMax ? 'warn-text' : 'muted'}`}>{note.length}/{limits.noteMax}</span>
            {c.missing?.length > 0 && !c.note && <span className="small warn-text">Template needs: {c.missing.join(', ')}. Edit the note</span>}
            <button className="link-btn" disabled={busy} onClick={() => act(async () => { const r = await api.liPrepareNotes([c.id], 'ai'); if (r.notes[0]) setNote(r.notes[0].note); })}>✨ AI note</button>
          </div>
        </>
      )}
      <div className="row gap wrap top-gap">
        <button className="btn" onClick={openProfile}>{useNote ? '📋 Copy note & open profile ↗' : 'Open profile ↗'}</button>
        <button
          className="btn primary" disabled={busy || disabled || !opened} title={!opened ? 'Open their profile first' : ''}
          onClick={() => act(() => api.liSent(c.id, useNote))}
        >
          ✓ I sent it
        </button>
        <button className="link-btn" disabled={busy} onClick={() => act(() => api.liUpdateContact(c.id, { status: 'skipped' }))}>Skip</button>
        <button className="link-btn" disabled={busy} onClick={() => confirm(`Never contact ${c.name}?`) && act(() => api.liUpdateContact(c.id, { do_not_contact: true }))}>Do not contact</button>
      </div>
      {msg && <div className="form-error">{msg}</div>}
    </section>
  );
}

/* ---------------------------------------------------------------------------------- */
/* Target lists: filters → search links you open yourself → quick-add what you find     */
/* ---------------------------------------------------------------------------------- */
const EMPTY_LIST = { name: '', roles: '', companies: '', locations: '', keywords: '', note_template: '' };

function Lists() {
  const [lists, setLists] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const load = () => api.liLists().then(setLists).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!lists) return <Loading />;

  return (
    <>
      <p className="muted small">
        A list is a search you'd run on LinkedIn (e.g. <em>Engineering Managers at Razorpay, Swiggy in Bengaluru</em>). The app turns it into ready-to-click
        searches. Open them, and paste the people you like into Quick-add. Duplicates and do-not-contact people are skipped automatically.
      </p>
      {editing ? (
        <ListForm initial={editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      ) : (
        <button className="btn primary" onClick={() => setEditing(EMPTY_LIST)}>+ New target list</button>
      )}
      {lists.map((l) => <ListCard key={l.id} list={l} onEdit={() => setEditing({ ...l, roles: l.roles.join(', '), companies: l.companies.join(', '), locations: l.locations.join(', ') })} onChange={load} />)}
    </>
  );
}

function ListForm({ initial, onSaved, onCancel }) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function submit(e) {
    e.preventDefault();
    try {
      await api.liSaveList(f);
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <form className="card li-form" onSubmit={submit}>
      <label className="field wide"><span className="field-label">List name</span><input value={f.name} onChange={set('name')} placeholder="EMs at target product companies" required /></label>
      <label className="field wide"><span className="field-label">Roles (comma-separated)</span><input value={f.roles} onChange={set('roles')} placeholder="Engineering Manager, Technical Recruiter, Senior Software Engineer" /></label>
      <label className="field wide"><span className="field-label">Companies</span><input value={f.companies} onChange={set('companies')} placeholder="Razorpay, Swiggy, Atlassian, Flipkart" /></label>
      <label className="field"><span className="field-label">Locations</span><input value={f.locations} onChange={set('locations')} placeholder="Bengaluru" /></label>
      <label className="field"><span className="field-label">Keywords</span><input value={f.keywords} onChange={set('keywords')} placeholder="Java, hiring" /></label>
      <label className="field wide"><span className="field-label">Note template for this list (optional; variables: {'{{first_name}} {{company}} {{role}}'})</span><textarea className="notes" rows={2} value={f.note_template || ''} onChange={set('note_template')} maxLength={400} /></label>
      {error && <div className="form-error wide">{error}</div>}
      <div className="row gap"><button className="btn primary">Save list</button><button type="button" className="btn" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

function ListCard({ list, onEdit, onChange }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  async function add() {
    setError(null);
    try {
      setResult(await api.liQuickAdd(text, list.id));
      setText('');
      onChange();
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <section className="card">
      <div className="row center-v wrap" style={{ justifyContent: 'space-between', gap: '0.5rem' }}>
        <div><h2 style={{ margin: 0 }}>{list.name}</h2><span className="muted small">{list.people} people · {list.contacted} contacted</span></div>
        <div className="row gap">
          <button className="link-btn" onClick={onEdit}>Edit</button>
          <button className="link-btn" onClick={async () => { if (confirm(`Delete the list "${list.name}"? People stay in People.`)) { await api.liDeleteList(list.id); onChange(); } }}>Delete</button>
        </div>
      </div>
      <div className="li-searches">
        {list.links.map((s) => (
          <div key={s.label} className="li-search">
            <span className="small">{s.label}</span>
            <a href={s.linkedin} target="_blank" rel="noreferrer" className="doc-link">LinkedIn search ↗</a>
            <a href={s.google} target="_blank" rel="noreferrer" className="doc-link">Google ↗</a>
          </div>
        ))}
      </div>
      <label className="field top-gap">
        <span className="field-label">Quick-add: paste profile URLs or "Name / headline / URL" blocks (blank line between people)</span>
        <textarea className="notes" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={'https://www.linkedin.com/in/priya-sharma/\n\nRahul Verma\nEngineering Manager at Swiggy\nhttps://www.linkedin.com/in/rahulverma/'} />
      </label>
      <button className="btn top-gap" disabled={!text.trim()} onClick={add}>Add to this list</button>
      {error && <div className="form-error">{error}</div>}
      {result && (
        <div className="small top-gap">
          ✅ {result.added.length} added
          {result.duplicates.length > 0 && ` · ${result.duplicates.length} already in your list (${result.duplicates.map((d) => d.name).join(', ')})`}
          {result.doNotContact.length > 0 && ` · ${result.doNotContact.length} skipped (do not contact)`}
          {result.errors.length > 0 && <div className="warn-text">{result.errors.join(' · ')}</div>}
        </div>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------------------------- */
/* People: pipeline per contact + LinkedIn's official Connections.csv import            */
/* ---------------------------------------------------------------------------------- */
function People() {
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [importMsg, setImportMsg] = useState(null);
  const load = useCallback(() => api.liContacts({ status, q }).then(setRows).catch((e) => setError(e.message)), [status, q]);
  useEffect(() => { load(); }, [load]);

  async function importCsv(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const r = await api.liImportCsv(await file.text());
      setImportMsg({ ok: true, text: `Read ${r.rows} connections: ${r.accepted.length} of your requests were accepted${r.accepted.length ? ` (${r.accepted.slice(0, 5).join(', ')}${r.accepted.length > 5 ? '…' : ''})` : ''}, ${r.added} other connections added.` });
      load();
    } catch (err) {
      setImportMsg({ ok: false, text: err.message });
    }
  }

  async function act(fn) {
    try {
      await fn();
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  if (error) return <ErrorBox error={error} />;
  return (
    <>
      <section className="card">
        <h2>📥 Mark accepted requests automatically</h2>
        <p className="muted small">
          On LinkedIn: <em>Me → Settings &amp; Privacy → Data privacy → Get a copy of your data → Connections</em>. LinkedIn emails you a file within minutes.
          Import <code>Connections.csv</code> here: requests you sent that appear in it become <strong>Connected</strong>, and your existing network is added (handy for referrals).
        </p>
        <label className="btn file-btn">⬆ Import Connections.csv<input type="file" accept=".csv,text/csv" onChange={importCsv} hidden /></label>
        {importMsg && <div className={`small top-gap ${importMsg.ok ? 'ok-text' : 'form-error'}`}>{importMsg.text}</div>}
      </section>

      <section className="card">
        <div className="filters">
          <input className="search" placeholder="Search name, company, headline…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Everyone</option>
            {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        {!rows ? <Loading /> : rows.length === 0 ? <p className="muted small top-gap">No one here yet.</p> : (
          <ul className="plist">
            {rows.map((c) => (
              <li key={c.id} className="prow">
                <div className="prow-main static">
                  {c.profile_url ? <a className="prow-title" href={c.profile_url} target="_blank" rel="noreferrer">{c.name} ↗</a> : <span className="prow-title">{c.name}</span>}
                  <span className="prow-meta">
                    <span className="muted small">{c.headline || [c.role, c.company].filter(Boolean).join(' at ')}</span>
                    {c.list_name && <span className="chip">{c.list_name}</span>}
                    {c.do_not_contact && <span className="chip warn-text">do not contact</span>}
                  </span>
                </div>
                <select value={c.status} onChange={(e) => act(() => api.liUpdateContact(c.id, { status: e.target.value }))}>
                  {Object.entries(STATUS_LABEL).filter(([k]) => k !== 'do_not_contact').map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <span className="row gap">
                  {c.status === 'requested' && <button className="link-btn" onClick={() => act(() => api.liAccepted(c.id))}>Accepted ✓</button>}
                  {c.status === 'requested' && Date.now() - c.requested_ms < 10 * 60_000 && <button className="link-btn" onClick={() => act(() => api.liUndoSent(c.id))}>Undo</button>}
                  <button className="link-btn" onClick={() => act(() => api.liUpdateContact(c.id, { do_not_contact: !c.do_not_contact }))}>{c.do_not_contact ? 'Allow contact' : 'Do not contact'}</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
