import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

const STATUS_TEXT = { done: '✓ logged', pending: '⏳ waiting for AI', failed: '✗ failed', undone: '↩ undone' };

// Settings → Telegram meal bot: setup steps, pairing link, health and the last few meals it received.
export default function TelegramCard() {
  const [t, setT] = useState(null);
  const [pair, setPair] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => api.telegram().then(setT).catch((e) => setError(e.message)), []);
  useEffect(() => {
    load();
  }, [load]);
  // While waiting for you to tap the pairing link, check every few seconds so the card flips to "linked".
  useEffect(() => {
    if (!pair || t?.linked) return undefined;
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [pair, t?.linked, load]);

  async function act(fn) {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  if (!t) return <section className="card"><h2>📲 Telegram meal bot</h2>{error ? <div className="form-error">{error}</div> : <p className="muted small">Loading…</p>}</section>;

  const pending = t.counts.pending || 0;
  return (
    <section className="card">
      <h2>📲 Telegram meal bot</h2>
      <p className="muted small">
        Send a meal photo (or type "2 eggs + toast") to your own Telegram bot from anywhere. The laptop picks it up whenever it is
        online, estimates the calories with Gemini, saves it here and replies with today's totals. The meal counts for the day you
        sent it (midnight to midnight). Telegram keeps unread messages for 24 hours, so open the laptop at least once a day.
        Progress photos too: caption them <code>progress front</code> (or side / back).
      </p>

      {!t.configured ? (
        <ol className="small setup-steps">
          <li>In Telegram, open <strong>@BotFather</strong> → <code>/newbot</code> → pick a name and a username ending in "bot".</li>
          <li>Copy the token it gives you into <code>tracker/server/.env</code> as <code>TELEGRAM_BOT_TOKEN=…</code> (keep it secret; don't paste it in chats).</li>
          <li>Run <code>npm run app:update</code> in the <code>tracker</code> folder, then reload this page.</li>
        </ol>
      ) : (
        <>
          <p className="small">
            Bot: {t.botUsername ? <a href={`https://t.me/${t.botUsername}`} target="_blank" rel="noreferrer">@{t.botUsername}</a> : '(offline: name unknown)'} ·{' '}
            {t.running ? <span className="ok-text">listening</span> : <span className="warn-text">not running in this server (the always-on app on :4000 runs it)</span>}
            {t.lastPollAt && <span className="muted"> · last check {new Date(t.lastPollAt).toLocaleTimeString('en-IN')}</span>}
          </p>
          {t.lastError && <p className="small warn-text">Last problem: {t.lastError}</p>}

          {t.linked ? (
            <div className="row gap wrap center-v">
              <span className="ok-text small">✅ Linked to your Telegram</span>
              <button className="link-btn" disabled={busy} onClick={() => act(async () => { setPair(null); setT(await api.telegramUnlink()); })}>Unlink</button>
              {pending > 0 && (
                <button className="btn" disabled={busy} onClick={() => act(async () => setT(await api.telegramRetry()))}>
                  Estimate {pending} waiting meal{pending > 1 ? 's' : ''} now
                </button>
              )}
            </div>
          ) : (
            <div className="top-gap">
              <button className="btn primary" disabled={busy} onClick={() => act(async () => setPair(await api.telegramPair()))}>
                {pair ? 'New pairing code' : 'Link my Telegram'}
              </button>
              {pair && (
                <p className="small top-gap">
                  {pair.link ? (
                    <>On your phone, open <a href={pair.link} target="_blank" rel="noreferrer">{pair.link}</a> and tap <strong>Start</strong>. </>
                  ) : null}
                  Or send <code>/start {pair.code}</code> to your bot. The code works once.
                </p>
              )}
            </div>
          )}

          {t.recent.length > 0 && (
            <>
              <h3 className="top-gap">Recently received</h3>
              <ul className="tg-recent small">
                {t.recent.map((r) => (
                  <li key={r.id}>
                    <span className="muted nowrap">{r.log_date} · {r.meal_type}</span>{' '}
                    <span>{r.title ? `${r.title} (${r.calories} kcal)` : r.note || (r.photo_url ? 'photo' : '')}</span>{' '}
                    <span className={r.status === 'failed' ? 'warn-text' : 'muted'}>{STATUS_TEXT[r.status] || r.status}</span>
                    {r.status !== 'done' && r.error && <span className="muted"> · {r.error}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {error && <div className="form-error">{error}</div>}
    </section>
  );
}
