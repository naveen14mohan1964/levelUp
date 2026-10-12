import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorBox, Loading } from '../components/ui.jsx';
import LinkedInConnect from '../components/LinkedInConnect.jsx';
import ConnectionsSync from '../components/ConnectionsSync.jsx';

/**
 * 🔌 Connector: one place for everything LinkedIn gives this app (adapted from ASTRA's Integrations page):
 * 1. your account (sign-in + permission to post), 2. your network (Connections.csv sync), 3. sync history.
 */
export default function LinkedInConnector() {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api.liConnector().then((x) => { setD(x); setError(null); }).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!d) return <Loading />;
  const n = d.network;
  return (
    <>
      <div className="card notice conn-banner">
        <span>ℹ️ LinkedIn's API only shares <strong>your own profile</strong> and lets you <strong>post</strong>. It never shares your connections,
          so your network comes from LinkedIn's official data export. Nothing is scraped and messages are always sent by you.</span>
      </div>

      <div className="conn-grid">
        <div className="conn-col">
          <h3 className="conn-step">1 · Your account</h3>
          <LinkedInConnect onChange={(c) => setD((x) => (x ? { ...x, connection: c } : x))} />
        </div>

        <div className="conn-col">
          <h3 className="conn-step">2 · Your network</h3>
          <section className="card">
            <div className="row center-v wrap" style={{ justifyContent: 'space-between', gap: '0.5rem' }}>
              <h2 style={{ margin: 0 }}>🤝 Connections sync</h2>
              {n.lastImport
                ? <span className={`pill ${n.stale ? 'warn' : 'li-conn-ok'}`}>{n.daysSinceImport === 0 ? 'Synced today' : `Synced ${n.daysSinceImport} days ago`}</span>
                : <span className="pill warn">Never synced</span>}
            </div>
            <div className="conn-net small">
              <span><strong>{n.contacts}</strong> people</span>
              <span><strong>{n.connected}</strong> connected</span>
              <span><strong>{n.atTargets}</strong> at target companies</span>
              <span><strong>{n.companiesCovered}</strong> target companies covered</span>
            </div>
            {n.stale && n.lastImport && <p className="small warn-text">Your export is over {n.staleAfterDays} days old. Re-import monthly to catch people who changed jobs.</p>}
            <ConnectionsSync last={n.lastImport} onDone={load} />
            <p className="small muted top-gap-sm">Then see who to ask on <Link to="/linkedin/referrals">Referrals → Hub</Link>.</p>
          </section>
        </div>
      </div>

      <h3 className="conn-step">3 · Sync history</h3>
      <section className="card">
        {!d.history.length ? <p className="muted small">No imports yet.</p> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>When</th><th>File</th><th>Fetched</th><th>New</th><th>Merged</th><th>Moved</th><th>Accepted</th><th>Skipped</th></tr></thead>
              <tbody>
                {d.history.map((h) => (
                  <tr key={h.id}>
                    <td className="small">{new Date(h.at_ms).toLocaleString('en-IN')}</td><td className="small">{h.file_name || '—'}</td>
                    <td>{h.rows_read}</td><td>{h.added}</td><td>{h.merged}</td><td>{h.moved}</td><td>{h.accepted}</td><td>{h.skipped}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
