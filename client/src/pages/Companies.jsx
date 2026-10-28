import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorBox, Loading } from '../components/ui.jsx';

const AREA = { dsa: 'DSA', hld: 'HLD', lld: 'LLD', ai: 'AI' };

/**
 * Company readiness: every target company gets a readiness % from its type's typical interview focus (an estimate,
 * see server/data/interview-profiles.json) and your progress, plus the 3 gaps that would raise it most.
 */
export default function Companies() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [tier, setTier] = useState('all');
  const [open, setOpen] = useState(null);
  const load = useCallback(() => api.readiness().then(setData).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const list = useMemo(() => (data?.companies || []).filter((c) => (tier === 'all' || String(c.tier) === tier) && (!q || `${c.name} ${c.category}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => b.score - a.score || a.tier - b.tier || a.name.localeCompare(b.name)), [data, q, tier]);
  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!data) return <Loading />;
  const prof = (k) => data.profiles.find((p) => p.key === k);
  const ready = data.companies.filter((c) => c.ready).length;

  return (
    <>
      <div className="stat-row">
        <div className="stat"><strong>{ready}</strong><span>of {data.companies.length} companies at their “ready to apply” bar</span></div>
        <div className="stat"><strong>{data.drillAvg == null ? '–' : `${data.drillAvg}%`}</strong><span>system design drill average (<Link to="/hld/drills">drills</Link>)</span></div>
        <div className="stat"><strong>T1 {data.readyAt[1]} · T2 {data.readyAt[2]} · T3 {data.readyAt[3]}</strong><span>ready bar by tier (%)</span></div>
      </div>

      <section className="card">
        <h2>🏢 By interview type</h2>
        <p className="muted small">{data.about}</p>
        <div className="profile-grid">
          {data.profiles.map((p) => (
            <article key={p.key} className="profile-card">
              <div className="profile-head"><strong>{p.label}</strong><Gauge value={p.score} /></div>
              <div className="small muted">{p.rounds}</div>
              <div className="area-bars">
                {Object.entries(p.areas).map(([k, v]) => (
                  <div key={k} className="area-bar"><span>{AREA[k]} <span className="muted">{Math.round((p.weights[k] || 0) * 100)}%</span></span><div className="bar-track"><div className="bar-fill" style={{ width: `${v}%` }} /></div><span>{v}%</span></div>
                ))}
              </div>
              <Gaps gaps={p.gaps} />
            </article>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Companies</h2>
        <div className="cards-toolbar">
          <input type="search" placeholder="Search company or category…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search companies" />
          <select value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Tier">
            <option value="all">All tiers</option><option value="1">Tier 1</option><option value="2">Tier 2</option><option value="3">Tier 3</option>
          </select>
        </div>
        <ul className="company-list">
          {list.map((c) => (
            <li key={c.id}>
              <button className="company-row" onClick={() => setOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id}>
                <span className="company-name"><strong>{c.name}</strong> <span className="small muted">T{c.tier} · {c.category}</span></span>
                <span className="company-meter"><span className="bar-track"><span className="bar-fill" style={{ width: `${c.score}%` }} /><span className="bar-mark" style={{ left: `${c.readyAt}%` }} /></span></span>
                <span className={`company-score${c.ready ? ' ok-text' : ''}`}>{c.score}%{c.ready ? ' ✓' : ''}</span>
              </button>
              {open === c.id && (
                <div className="company-detail">
                  <div className="small muted">{prof(c.profile)?.label}: {prof(c.profile)?.rounds}. Ready bar for tier {c.tier}: {c.readyAt}%.</div>
                  <Gaps gaps={prof(c.profile)?.gaps || []} title="3 gaps to close before applying" />
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Gaps({ gaps, title = 'Top 3 gaps' }) {
  return (
    <div className="gaps">
      <div className="small"><strong>{title}</strong></div>
      <ol>
        {gaps.map((g) => <li key={g.key}><Link to={g.to}>{g.action}</Link> <span className="small muted">· {g.label} · +{g.points} pts possible</span></li>)}
      </ol>
    </div>
  );
}

function Gauge({ value }) {
  const r = 18; const c = 2 * Math.PI * r;
  return (
    <svg className="gauge" width="48" height="48" viewBox="0 0 48 48" role="img" aria-label={`${value}% ready`}>
      <circle cx="24" cy="24" r={r} fill="none" stroke="var(--glass-border)" strokeWidth="5" />
      <circle cx="24" cy="24" r={r} fill="none" stroke="var(--focus)" strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} transform="rotate(-90 24 24)" />
      <text x="24" y="28" textAnchor="middle" fontSize="11" fill="currentColor">{value}%</text>
    </svg>
  );
}
