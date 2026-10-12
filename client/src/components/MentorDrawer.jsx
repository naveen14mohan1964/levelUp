import { useEffect, useRef, useState } from 'react';
import MentorChat from './MentorChat.jsx';

const HINTS = [
  { level: 1, label: '1 · Nudge', title: 'One guiding question, no algorithm named' },
  { level: 2, label: '2 · Pattern', title: 'Which pattern/data structure and why, no code' },
  { level: 3, label: '3 · Plan', title: 'Step-by-step pseudocode, no Java' },
  { level: 4, label: '4 · Solution', title: 'Full Java solution + dry run (try 1–3 first!)' },
];

/** Code review box shared by problems (Java) and lessons (C#/TS/JS). */
function ReviewBox({ send, busy, defaultLanguage, body }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState(defaultLanguage);
  if (!open) return <button className="btn" onClick={() => setOpen(true)} disabled={busy}>🔍 Review my code</button>;
  return (
    <div className="review-box">
      <div className="row gap center-v">
        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
          {['Java', 'C#', 'TypeScript', 'JavaScript', 'SQL'].map((l) => <option key={l}>{l}</option>)}
        </select>
        <button className="link-btn" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <textarea className="code-input" rows={8} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste your solution here…" spellCheck={false} />
      <button
        className="btn primary" disabled={busy || code.trim().length < 10}
        onClick={() => { send({ mode: 'review', code, language, ...body }, `🔍 Review my ${language} code`); setOpen(false); setCode(''); }}
      >
        Review it
      </button>
    </div>
  );
}

/**
 * Side drawer with a mentor thread for one problem or one lesson.
 *  kind="problem": hint ladder + code review + free questions
 *  kind="lesson":  explain the concept (auto-starts) + code review
 */
export default function MentorDrawer({ kind, item, onClose }) {
  const ref = useRef(null);
  const [stuck, setStuck] = useState('');
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);

  const isProblem = kind === 'problem';
  const thread = isProblem ? `problem:${item.id}` : `lesson:${item.id}`;
  const title = isProblem ? `${item.lc_number ? `${item.lc_number}. ` : ''}${item.title}` : item.learn || item.title;
  const language = isProblem ? 'Java' : { dotnet: 'C#', react: 'TypeScript', node: 'JavaScript' }[item.area] || 'JavaScript';

  return (
    <dialog ref={ref} className="dialog drawer" onClose={onClose} onCancel={onClose}>
      <div className="dialog-head">
        <div>
          <div className="muted small">🤖 Mentor · {isProblem ? 'stuck on a problem' : 'lesson help'}</div>
          <h2>{title}</h2>
        </div>
        <button className="btn icon" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="dialog-body">
        <MentorChat
          thread={thread}
          autoStart={!isProblem ? { body: { mode: 'explain', taskId: item.id }, display: `📖 Explain: ${title}` } : null}
          placeholder={isProblem ? 'Ask about this problem…' : 'Ask a follow-up about this concept…'}
          actions={(send, busy) => (
            <>
              {isProblem ? (
                <>
                  <div className="muted small">Take the smallest hint that gets you moving again, then close this and code.</div>
                  <input className="search" placeholder="Optional: what did you try / where are you stuck?" value={stuck} onChange={(e) => setStuck(e.target.value)} />
                  <div className="hint-ladder">
                    {HINTS.map((h) => (
                      <button
                        key={h.level} className={`btn${h.level === 4 ? ' warn-btn' : ''}`} title={h.title} disabled={busy}
                        onClick={() => {
                          if (h.level === 4 && !confirm('Show the full solution? Interviews reward the struggle, so try hints 1–3 first.')) return;
                          send({ mode: 'hint', problemId: item.id, level: h.level, message: stuck || undefined }, `💡 Hint ${h.level}/4`);
                        }}
                      >
                        💡 {h.label}
                      </button>
                    ))}
                  </div>
                  <ReviewBox send={send} busy={busy} defaultLanguage="Java" body={{ problemId: item.id }} />
                </>
              ) : (
                <div className="row gap wrap">
                  <button className="btn" disabled={busy} onClick={() => send({ mode: 'explain', taskId: item.id }, `📖 Explain: ${title}`)}>📖 Explain again</button>
                  <ReviewBox send={send} busy={busy} defaultLanguage={language} body={{ taskId: item.id }} />
                </div>
              )}
            </>
          )}
        />
      </div>
    </dialog>
  );
}
