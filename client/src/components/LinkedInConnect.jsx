import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

/**
 * LinkedIn connector: guided setup of your (free) LinkedIn developer app, keys saved on this computer only,
 * then one click to approve. LinkedIn only lets apps post for you through your own developer app.
 */
export default function LinkedInConnect({ compact = false, onChange }) {
  const [s, setS] = useState(null);
  const [error, setError] = useState(null);
  const [keys, setKeys] = useState({ id: '', secret: '' });
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const poll = useRef(null);
  const changed = useRef(onChange); // a ref, so a new callback from the parent doesn't reload (and loop)
  changed.current = onChange;

  const load = useCallback(() => api.liConnection().then((x) => { setS(x); changed.current?.(x); return x; }).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); return () => clearInterval(poll.current); }, [load]);

  async function saveKeys(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      setS(await api.liSaveKeys(keys.id.trim(), keys.secret.trim()));
      setKeys({ id: '', secret: '' });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function connect() {
    setBusy(true); setError(null);
    // Open the tab first (in the click), then point it at LinkedIn: browsers block pop-ups opened later.
    const tab = window.open('about:blank', '_blank');
    try {
      const { url } = await api.liConnect();
      if (tab) tab.location.href = url; else window.location.href = url;
      clearInterval(poll.current);
      const started = Date.now();
      poll.current = setInterval(async () => {
        const x = await load();
        if (x?.connected || (x && !x.login.running) || Date.now() - started > 5 * 60 * 1000) { clearInterval(poll.current); setBusy(false); }
      }, 2000);
    } catch (err) {
      tab?.close();
      setError(err.message); setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm('Disconnect LinkedIn? Scheduled posts will fail until you connect again.')) return;
    try { setS(await api.liDisconnect()); } catch (err) { setError(err.message); }
  }

  async function copyRedirect() {
    try { await navigator.clipboard.writeText(s.redirectUri); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* select manually */ }
  }

  if (!s) return <section className="card"><h2>🔌 LinkedIn connection</h2><p className="muted small">{error || 'Checking…'}</p></section>;

  const expiring = s.connected && s.daysLeft != null && s.daysLeft <= 7;
  const head = (
    <div className="row center-v wrap" style={{ justifyContent: 'space-between', gap: '0.5rem' }}>
      <h2 style={{ margin: 0 }}>🔌 LinkedIn connection</h2>
      {s.connected
        ? <span className={`pill ${expiring ? 'warn' : 'li-conn-ok'}`}>✅ {s.name} · {s.daysLeft} days left</span>
        : <span className="pill warn">{s.expired ? 'Login expired' : 'Not connected'}</span>}
    </div>
  );

  if (s.connected && compact) return null;

  return (
    <section className="card li-connect">
      {head}
      {s.connected ? (
        <>
          <div className="li-account">
            {s.picture ? <img src={s.picture} alt="" className="li-avatar" referrerPolicy="no-referrer" /> : <span className="li-avatar li-avatar-initials">{(s.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>}
            <div>
              <strong>{s.name}</strong>
              <div className="small muted">{s.connectedAt ? `Connected on ${new Date(s.connectedAt).toLocaleDateString('en-IN')} · ` : ''}LinkedIn sign-in · can post for you</div>
            </div>
          </div>
          <p className="small">Your approved posts publish to LinkedIn as <strong>{s.name}</strong>. LinkedIn logins last 60 days; reconnect takes one click.</p>
          {expiring && <p className="small warn-text">Your login expires in {s.daysLeft} days: reconnect now so scheduled posts don't fail.</p>}
          <div className="row gap wrap">
            {s.local && <button className="btn" disabled={busy} onClick={connect}>{busy ? 'Waiting for LinkedIn…' : '↻ Reconnect'}</button>}
            {s.local && <button className="link-btn" onClick={disconnect}>Disconnect</button>}
          </div>
        </>
      ) : (
        <>
          <p className="small muted">
            LinkedIn only lets apps post for you through <strong>your own developer app</strong> (free, about 10 minutes, once).
            Nothing is shared: your keys and login stay on this computer.
          </p>
          {!s.local && <p className="small warn-text">Open this page on the laptop (http://localhost:4000) to connect: for safety, keys can't be set from another device.</p>}
          <ol className="li-steps">
            <li className={s.keysSet ? 'done' : ''}>
              <strong>Create a LinkedIn Page</strong> (any small page you admin, e.g. "&lt;Your name&gt; Builds"). LinkedIn requires every developer app to belong to a Page.
              {' '}<a href="https://www.linkedin.com/company/setup/new/" target="_blank" rel="noreferrer">Create a Page ↗</a>
            </li>
            <li className={s.keysSet ? 'done' : ''}>
              <strong>Create a developer app</strong>: name it "Level Up", pick your Page, upload any logo, accept the terms.
              {' '}<a href="https://www.linkedin.com/developers/apps/new" target="_blank" rel="noreferrer">Create app ↗</a>
            </li>
            <li className={s.keysSet ? 'done' : ''}>
              In the app's <strong>Products</strong> tab, request <strong>"Share on LinkedIn"</strong> and <strong>"Sign In with LinkedIn using OpenID Connect"</strong> (both free and instant).
            </li>
            <li className={s.keysSet ? 'done' : ''}>
              In the <strong>Auth</strong> tab, add this <strong>Authorized redirect URL</strong>:
              <div className="row gap center-v wrap top-gap-sm">
                <code className="li-redirect">{s.redirectUri}</code>
                <button type="button" className="btn small-btn" onClick={copyRedirect}>{copied ? 'Copied ✓' : 'Copy'}</button>
              </div>
              then copy the <strong>Client ID</strong> and <strong>Primary Client Secret</strong> here:
              {s.keysSet && <div className="small ok-text top-gap-sm">✓ Keys saved (Client ID {s.clientIdHint}). Paste new ones only if you created a new app.</div>}
              {s.local && (
                <form className="li-keys" onSubmit={saveKeys} autoComplete="off">
                  <input className="search" placeholder="Client ID" value={keys.id} onChange={(e) => setKeys({ ...keys, id: e.target.value })} aria-label="Client ID" spellCheck={false} />
                  <input className="search" type="password" placeholder="Primary Client Secret" value={keys.secret} onChange={(e) => setKeys({ ...keys, secret: e.target.value })} aria-label="Client Secret" spellCheck={false} />
                  <button className="btn" disabled={busy || !keys.id || !keys.secret}>Save keys</button>
                </form>
              )}
              <div className="small muted">Saved only in <code>linkedin-mcp/.env</code> on this laptop (never shown again, never sent anywhere except LinkedIn).</div>
            </li>
            <li>
              <strong>Connect</strong>: approve on LinkedIn's page, then come back here.
              <div className="top-gap-sm">
                <button className="btn primary" disabled={!s.keysSet || !s.local || busy} onClick={connect}>{busy ? 'Waiting for you to approve on LinkedIn…' : '🔗 Connect LinkedIn'}</button>
              </div>
            </li>
          </ol>
          {s.login.error && <div className="form-error">Last attempt: {s.login.error}</div>}
        </>
      )}
      {error && <div className="form-error">{error}</div>}
    </section>
  );
}
