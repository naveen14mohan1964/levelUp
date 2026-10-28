import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { formatShort } from '../dates.js';
import { refreshGame, useGame } from '../game.jsx';
import { burst } from '../lib/celebrate.js';
import { ErrorBox, Loading } from '../components/ui.jsx';
import { clock, useNow } from '../components/TodayHero.jsx';

const LEVEL = { starter: '🟢 starter', core: '🟡 core', advanced: '🔴 advanced' };

/**
 * System design drills: a 35-minute prompt answered step by step (requirements → estimates → API → data → scaling →
 * trade-offs), then a self-review against each step's key points. The score feeds company readiness and your answers
 * become HLD flashcards. Starting a drill also starts a 35-minute focus session (streak + camera guard).
 */
export default function Drills() {
  const [params, setParams] = useSearchParams();
  const id = Number(params.get('id')) || null;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api.drills().then(setData).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load, id]);
  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!data) return <Loading />;
  const openId = id || data.running?.id || null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>🏗️ System design drills</h1>
          <div className="muted small">35 minutes, six steps, then grade yourself against the key points. <Link to="/hld">← HLD roadmap</Link></div>
        </div>
        {openId && <button className="btn" onClick={() => { setParams({}); load(); }}>All prompts</button>}
      </div>
      {openId ? <DrillRun key={openId} id={openId} onExit={() => { setParams({}); load(); }} />
        : <Overview data={data} onOpen={(drillId) => setParams({ id: String(drillId) })} />}
    </>
  );
}

function Overview({ data, onOpen }) {
  const { game } = useGame();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const start = async (key) => {
    setBusy(true); setError(null);
    try {
      const r = await api.drillStart(key);
      // a 35-minute focus session on your HLD roadmap, unless one is already running
      const next = game?.tracks?.find((t) => t.key === 'hld')?.next?.ref;
      if (!game?.focus && next) await api.focusStart({ track: 'hld', ref: next, minutes: 35 }).then(refreshGame).catch(() => {});
      onOpen(r.drill.id);
    } catch (e) { setError(e.message); setBusy(false); }
  };
  const sug = data.prompts.find((p) => p.key === data.suggested);
  return (
    <>
      {sug && (
        <section className="card drill-suggest">
          <div className="small muted">Suggested next</div>
          <h2>{sug.title} <span className="chip">{LEVEL[sug.level]}</span></h2>
          <p>{sug.brief} <span className="muted">Scale: {sug.scale}.</span></p>
          <button className="btn primary btn-lg" disabled={busy} onClick={() => start(sug.key)}>▶ Start the 35-minute drill</button>
          {error && <div className="form-error">{error}</div>}
        </section>
      )}
      <section className="card">
        <h2>All prompts</h2>
        <ul className="drill-list">
          {data.prompts.map((p) => (
            <li key={p.key}>
              <div>
                <strong>{p.title}</strong> <span className="chip">{LEVEL[p.level]}</span>
                <div className="small muted">{p.brief}</div>
              </div>
              <div className="drill-meta small">{p.times ? <>best <strong>{p.best}%</strong> · {p.times}×</> : <span className="muted">not tried</span>}</div>
              <button className="btn" disabled={busy} onClick={() => start(p.key)}>Start</button>
            </li>
          ))}
        </ul>
      </section>
      {data.history.length > 0 && (
        <section className="card">
          <h2>History {data.avg != null && <span className="muted small">· last 5 average {data.avg}%</span>}</h2>
          <ul className="drill-history">
            {data.history.map((h) => (
              <li key={h.id}><button className="link-btn" onClick={() => onOpen(h.id)}>{h.title}</button> <span className="small muted">{formatShort(new Date(h.finishedMs).toISOString().slice(0, 10))}</span> <strong>{h.score}%</strong></li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function DrillRun({ id, onExit }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [answers, setAnswers] = useState({});
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState('write'); // write | review | done
  const [checked, setChecked] = useState({});
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState(null);
  const dirty = useRef(false);
  const resultRef = useRef(null);
  const now = useNow(mode === 'write');

  useEffect(() => {
    api.drill(id).then((r) => {
      setD(r); setAnswers(r.drill.answers || {}); setChecked(r.drill.checked || {});
      setMode(r.drill.finishedMs ? 'done' : 'write');
    }).catch((e) => setError(e.message));
  }, [id]);
  // autosave every 5 s while writing
  useEffect(() => {
    if (mode !== 'write') return undefined;
    const t = setInterval(() => { if (dirty.current) { dirty.current = false; api.drillSave(id, answers).catch(() => {}); } }, 5000);
    return () => clearInterval(t);
  }, [id, mode, answers]);

  if (error) return <ErrorBox error={error} />;
  if (!d) return <Loading />;
  const { prompt, steps, drill } = d;
  const total = steps.reduce((n, s) => n + s.minutes, 0) * 60;
  const elapsed = (now - drill.startedMs) / 1000;
  const left = Math.max(0, total - elapsed);
  // which step the clock says you should be on
  let acc = 0;
  const onTrack = steps.findIndex((s) => (acc += s.minutes * 60) > elapsed);
  const s = steps[step];
  const setAnswer = (v) => { dirty.current = true; setAnswers((a) => ({ ...a, [s.key]: v })); };
  const toggle = (k, i) => setChecked((c) => { const set = new Set(c[k] || []); set.has(i) ? set.delete(i) : set.add(i); return { ...c, [k]: [...set] }; });
  const liveScore = Math.round((steps.reduce((n, st) => n + ((checked[st.key] || []).length / (prompt.points[st.key] || [1]).length), 0) / steps.length) * 100);

  const finish = async () => {
    setBusy(true);
    try {
      const r = await api.drillFinish(id, { answers, checked });
      setD((x) => ({ ...x, drill: r.drill })); setMade(r.cardsMade); setMode('done');
      setTimeout(() => burst(resultRef.current), 50);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const feedback = async () => {
    setBusy(true);
    try { const r = await api.drillFeedback(id); setD((x) => ({ ...x, drill: r.drill })); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <section className="card drill-brief">
        <div className="drill-brief-head">
          <div>
            <h2>{prompt.title}</h2>
            <p>{prompt.brief} <span className="muted">Scale: {prompt.scale}.</span></p>
          </div>
          {mode === 'write' && <div className={`drill-clock${left < 300 ? ' low' : ''}`} role="timer" aria-label={`${clock(left)} left`}>{left ? clock(left) : "Time's up"}</div>}
        </div>
      </section>

      {mode === 'write' && (
        <section className="card">
          <nav className="drill-steps" aria-label="Steps">
            {steps.map((st, i) => (
              <button key={st.key} className={`drill-step${i === step ? ' active' : ''}${i === onTrack ? ' now' : ''}${(answers[st.key] || '').trim() ? ' filled' : ''}`} onClick={() => setStep(i)}>
                <span>{i + 1}. {st.label}</span><span className="small muted">{st.minutes} min</span>
              </button>
            ))}
          </nav>
          <p className="muted small">{s.ask}{onTrack >= 0 && onTrack !== step ? ` · The clock says: step ${onTrack + 1} (${steps[onTrack].label}).` : ''}</p>
          <textarea className="drill-answer" rows={12} value={answers[s.key] || ''} onChange={(e) => setAnswer(e.target.value)} placeholder={`${s.label}: write it like you'd say it to the interviewer…`} aria-label={`${s.label} answer`} />
          <div className="row-gap">
            {step > 0 && <button className="btn" onClick={() => setStep(step - 1)}>← {steps[step - 1].label}</button>}
            {step < steps.length - 1 && <button className="btn" onClick={() => setStep(step + 1)}>{steps[step + 1].label} →</button>}
            <button className="btn primary" onClick={() => { api.drillSave(id, answers).catch(() => {}); setMode('review'); }}>Finish → grade myself</button>
            <span className="small muted">Autosaves every few seconds.</span>
          </div>
        </section>
      )}

      {mode === 'review' && (
        <section className="card">
          <h2>Grade yourself <span className="muted small">· tick what you actually covered · {liveScore}%</span></h2>
          {steps.map((st) => (
            <div key={st.key} className="review-step">
              <h3>{st.label}</h3>
              <pre className="review-answer">{(answers[st.key] || '').trim() || '(blank)'}</pre>
              <ul className="review-points">
                {(prompt.points[st.key] || []).map((p, i) => (
                  <li key={i}><label className="check"><input type="checkbox" checked={(checked[st.key] || []).includes(i)} onChange={() => toggle(st.key, i)} /> {p}</label></li>
                ))}
              </ul>
            </div>
          ))}
          <div className="row-gap">
            <button className="btn" onClick={() => setMode('write')}>← Keep writing</button>
            <button className="btn primary" disabled={busy} onClick={finish}>Save · make flashcards</button>
          </div>
        </section>
      )}

      {mode === 'done' && (
        <section className="card" ref={resultRef}>
          <h2>Result: {d.drill.score}%</h2>
          <p className="muted">{made != null ? `${made} flashcard${made === 1 ? '' : 's'} added to HLD (due tomorrow). ` : ''}Your average of the last 5 drills feeds company readiness.</p>
          {steps.map((st) => (
            <details key={st.key} className="review-step">
              <summary><strong>{st.label}</strong> · {(d.drill.checked[st.key] || []).length}/{(prompt.points[st.key] || []).length} key points</summary>
              <pre className="review-answer">{(d.drill.answers[st.key] || '').trim() || '(blank)'}</pre>
              <ul className="review-points">
                {(prompt.points[st.key] || []).map((p, i) => <li key={i}>{(d.drill.checked[st.key] || []).includes(i) ? '✓' : '✗'} {p}</li>)}
              </ul>
            </details>
          ))}
          {d.drill.aiFeedback ? (
            <div className="ai-feedback"><h3>🤖 Interviewer feedback</h3><p style={{ whiteSpace: 'pre-line' }}>{d.drill.aiFeedback}</p></div>
          ) : (
            <button className="btn" disabled={busy} onClick={feedback}>{busy ? 'Asking…' : '🤖 Get interviewer feedback (1 Gemini call)'}</button>
          )}
          <div className="row-gap top-gap"><button className="btn" onClick={onExit}>All prompts</button><Link className="btn" to="/cards">Review flashcards</Link></div>
        </section>
      )}
      {error && <div className="form-error">{error}</div>}
    </>
  );
}
