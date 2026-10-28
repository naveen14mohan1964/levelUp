import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { DISTRACTED, useFocus } from '../focus.jsx';
import { STATUS_TEXT } from '../lib/focusRules.js';
import StudyBuddy from './StudyBuddy.jsx';
import { clock, useNow } from './TodayHero.jsx';

const pipSupported = () => typeof window !== 'undefined' && 'documentPictureInPicture' in window;

/**
 * The camera guard on every page: a small floating card (mirrored preview, status, focus %, time left) while the
 * camera is on, plus the distraction flash. "Pop out" opens an always-on-top mini window with the buddy, so it keeps
 * watching while you learn from YouTube or the lesson links in another tab.
 */
export default function FocusDock() {
  const f = useFocus();
  const { pathname } = useLocation();
  const now = useNow(!!f.running);
  const [pip, setPip] = useState(null); // the Picture-in-Picture window
  const [mini, setMini] = useState(false);
  const show = f.camOn && f.running;

  useEffect(() => { if (!show && pip) pip.close(); }, [show, pip]);

  if (!show) return null;
  const v = f.view;
  const distracted = DISTRACTED.includes(v.status);
  const left = Math.max(0, f.running.plannedMin * 60 - (now - f.running.startedMs) / 1000);
  const status = `${STATUS_TEXT[v.status] || v.status}${v.status !== 'starting' && v.status !== 'calibrating' && v.status !== 'error' ? ` · ${v.pct}%` : ''}`;

  const popOut = async () => {
    try {
      const w = await window.documentPictureInPicture.requestWindow({ width: 240, height: 300 });
      // copy the app's styles into the mini window
      for (const n of document.querySelectorAll('link[rel="stylesheet"], style')) w.document.head.appendChild(n.cloneNode(true));
      w.document.body.className = 'pip-body';
      w.document.title = 'Level Up · watching';
      w.addEventListener('pagehide', () => setPip(null));
      setPip(w);
    } catch { /* blocked or unsupported: the dock stays */ }
  };

  return (
    <>
      <aside className={`focus-dock${distracted ? ' alert' : ''}${mini ? ' mini' : ''}`} aria-label="Camera focus guard">
        <video ref={f.guard.videoRef} className="dock-video" muted playsInline aria-label="Your camera (stays on this laptop)" />
        {!mini && (
          <div className="dock-info">
            <div className="dock-status" role="status"><span className="guard-dot" aria-hidden="true" /> {status}</div>
            <div className="small muted">⏱ {left ? clock(left) : "Time's up"} left{f.readingNotes ? ' · 📖 reading' : ''}{f.officeMode ? ' · 🔇' : ''}</div>
            <div className="dock-actions">
              {pathname !== '/' && <Link className="link-btn small" to="/">Today</Link>}
              {pipSupported() && !pip && <button className="link-btn small" onClick={popOut} title="Keep the buddy on top while you study in another tab">⧉ Pop out</button>}
              <button className="link-btn small" onClick={f.stopCam}>Stop camera</button>
            </div>
            {v.error && <div className="form-error small">{v.error}{v.stale && <> <button className="link-btn small" onClick={() => window.location.reload()}>Reload</button></>}</div>}
          </div>
        )}
        <button className="dock-min" onClick={() => setMini((m) => !m)} aria-label={mini ? 'Expand' : 'Minimise'}>{mini ? '▢' : '–'}</button>
      </aside>
      {f.view.level >= 1 && <div className={`focus-flash level-${f.view.level}`} aria-hidden="true" />}
      {pip && createPortal(<PipView f={f} left={left} status={status} distracted={distracted} />, pip.document.body)}
    </>
  );
}

/** The always-on-top mini window: the buddy looking at you, the status and the time left. */
function PipView({ f, left, status, distracted }) {
  const buddy = distracted ? 'distracted' : f.watching ? 'watching' : 'studying';
  const approve = f.watching && f.view.focusStreakMs >= 120_000 && f.view.focusStreakMs % 120_000 < 5000;
  return (
    <div className={`pip-view${distracted && f.view.level >= 1 ? ' alert' : ''}`}>
      <StudyBuddy state={buddy} size={200} caption={false} gaze={f.view.gaze} approve={approve} />
      <div className="pip-status">{status}</div>
      <div className="pip-clock">{left ? clock(left) : "Time's up"}</div>
    </div>
  );
}
