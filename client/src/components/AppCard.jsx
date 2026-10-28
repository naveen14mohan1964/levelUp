import { useEffect, useState } from 'react';
import { canInstall, disableNotify, enableNotify, install, installed, notify, notifyEnabled, notifySupported, onPwaChange } from '../lib/pwa.js';

/** Settings → App: install Level Up as a desktop app and turn on desktop notifications. */
export default function AppCard() {
  const [, tick] = useState(0);
  useEffect(() => onPwaChange(() => tick((n) => n + 1)), []);
  const on = notifyEnabled();
  const denied = notifySupported() && Notification.permission === 'denied';

  return (
    <section className="card">
      <h2>💻 App &amp; notifications</h2>
      <div className="app-rows">
        <div>
          <strong>Install</strong>
          <p className="small muted">Its own window and taskbar icon, opens instantly, and right-click the icon for Start focus / Flashcards / Weekly report.</p>
          {installed() ? <span className="ok-text small">✓ Running as an installed app</span>
            : canInstall() ? <button className="btn primary" onClick={install}>⬇ Install Level Up</button>
              : <span className="small muted">Use the browser menu → Apps → Install Level Up (shown once the app has loaded over http://localhost).</span>}
        </div>
        <div>
          <strong>Desktop notifications</strong>
          <p className="small muted">When a focus session ends, a 9 pm “streak at risk” nudge if today has no focus yet, and a morning “flashcards due”. Only while the app or its window is open; nothing is pushed from a server.</p>
          {!notifySupported() ? <span className="small muted">Not supported in this browser.</span>
            : denied ? <span className="warn-text small">Blocked for this site: allow notifications from the address bar, then come back.</span>
              : on ? (
                <div className="row-gap">
                  <span className="ok-text small">✓ On</span>
                  <button className="btn" onClick={() => notify('Level Up', 'Notifications work. 🔥', { tag: 'test' })}>Send a test</button>
                  <button className="link-btn" onClick={disableNotify}>Turn off</button>
                </div>
              ) : <button className="btn" onClick={enableNotify}>🔔 Turn on notifications</button>}
        </div>
      </div>
    </section>
  );
}
