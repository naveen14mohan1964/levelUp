import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { burst } from '../lib/celebrate.js';
import { ErrorBox, Loading, ProgressRing } from '../components/ui.jsx';

/** A tiny Markdown renderer for the walkthrough text: paragraphs, - lists, 1. lists, **bold**, `code`, ``` blocks. */
function inline(text) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('`') && p.endsWith('`')) return <code key={i}>{p.slice(1, -1)}</code>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}
export function MdText({ text }) {
  const blocks = [];
  const parts = String(text || '').split(/```(?:\w+)?\n?/);
  parts.forEach((part, i) => {
    if (i % 2) { blocks.push(<pre key={`c${i}`} className="as-code">{part.replace(/\n$/, '')}</pre>); return; }
    part.split(/\n\n+/).forEach((para, j) => {
      const lines = para.split('\n').filter(Boolean);
      if (!lines.length) return;
      if (lines.every((l) => /^- /.test(l))) blocks.push(<ul key={`${i}-${j}`}>{lines.map((l, k) => <li key={k}>{inline(l.slice(2))}</li>)}</ul>);
      else if (lines.every((l) => /^\d+\. /.test(l))) blocks.push(<ol key={`${i}-${j}`}>{lines.map((l, k) => <li key={k}>{inline(l.replace(/^\d+\. /, ''))}</li>)}</ol>);
      else blocks.push(<p key={`${i}-${j}`}>{lines.map((l, k) => <Fragment key={k}>{k > 0 && <br />}{inline(l)}</Fragment>)}</p>);
    });
  });
  return <div className="as-md">{blocks}</div>;
}

/** /assignments: your course assignments. With only one, it opens straight away. */
export default function Assignments() {
  const { key } = useParams();
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { if (!key) api.assignments().then(setList).catch((e) => setError(e.message)); }, [key]);
  if (key) return <Assignment assignmentKey={key} />;
  if (error) return <ErrorBox error={error} />;
  if (!list) return <Loading />;
  if (list.length === 1) return <Assignment assignmentKey={list[0].key} />;
  return (
    <>
      <div className="page-head"><div><h1>📘 Assignments</h1><div className="muted small">Course assignments, explained from the basics.</div></div></div>
      {list.length === 0 ? <p className="muted">No assignments yet.</p> : list.map((a) => (
        <Link key={a.key} to={`/assignments/${a.key}`} className="card as-list-item">
          <strong>{a.title}</strong><span className="small muted">{a.course} · {a.modules} · {a.understood}/{a.tasks} understood</span>
        </Link>
      ))}
    </>
  );
}

function Assignment({ assignmentKey }) {
  const [a, setA] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(() => new Set(['1.1']));
  const [code, setCode] = useState(null); // { path, text, vscode } | { error }
  const load = useCallback(() => api.assignment(assignmentKey).then(setA).catch((e) => setError(e.message)), [assignmentKey]);
  useEffect(() => { load(); }, [load]);
  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!a) return <Loading />;

  const tasks = a.sections.flatMap((s) => s.tasks);
  const understood = tasks.filter((t) => a.progress[t.id]?.understood).length;
  const toggle = (id) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const mark = async (t, value, el) => {
    setA((x) => ({ ...x, progress: { ...x.progress, [t.id]: { understood: value } } }));
    await api.assignmentTask(a.key, t.id, value).catch(() => load());
    if (value) burst(el);
  };
  const showCode = (p) => api.assignmentCode(a.key, p).then(setCode).catch((e) => setCode({ path: p, error: e.message }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>📘 {a.title}</h1>
          <div className="muted small">{a.course} · {a.modules} · assigned {a.assigned}</div>
        </div>
        <ProgressRing value={understood} total={tasks.length} size={64} label="understood" />
      </div>

      <section className="card">
        <h2>🎯 The goal</h2>
        <p>{a.objective}</p>
        <div className="as-grid">
          <div>
            <h3>Deliverables</h3>
            <ul className="as-checks">{a.deliverables.map((d) => <li key={d.id} className={d.done ? 'done' : ''}>{d.done ? '✅' : '⬜'} {d.label}</li>)}</ul>
          </div>
          <div>
            <h3>How the solution is laid out</h3>
            <ul className="as-layout">{a.layout.map((l) => <li key={l.path}><code>{l.path}</code> <span className="small muted">{l.what}</span></li>)}</ul>
            <h3>Run it</h3>
            <pre className="as-code">{a.howToRun.join('\n')}</pre>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>🧱 The basics first</h2>
        <p className="muted small">Everything in this assignment builds on these ideas. Read them once; each task below links back to them.</p>
        <div className="as-basics">
          {a.basics.map((b) => (
            <details key={b.title} className="as-basic">
              <summary>{b.title}</summary>
              <MdText text={b.body} />
            </details>
          ))}
        </div>
      </section>

      {a.sections.map((s) => (
        <section key={s.title} className="card">
          <h2>{s.title} <span className="chip">{s.module}</span></h2>
          {s.tasks.map((t) => {
            const isOpen = open.has(t.id);
            const ok = !!a.progress[t.id]?.understood;
            return (
              <article key={t.id} className={`as-task${ok ? ' understood' : ''}`}>
                <button className="as-task-head" onClick={() => toggle(t.id)} aria-expanded={isOpen}>
                  <span className="as-task-id">{t.id}</span>
                  <span className="as-task-title">{t.title}</span>
                  <span className="as-task-state">{ok ? '✅ understood' : isOpen ? '▾' : '▸'}</span>
                </button>
                {isOpen && (
                  <div className="as-task-body">
                    <div className="as-brief">
                      <div><span className="as-label">📋 What was asked</span><p>{t.brief}</p></div>
                      <div><span className="as-label">✓ Done when</span><p>{t.doneWhen}</p></div>
                    </div>
                    <div className="as-block"><h3>🧠 The concept, from the basics</h3><MdText text={t.concept} /></div>
                    <div className="as-block"><h3>🛠 How we built it</h3><MdText text={t.how} /></div>
                    {(t.files?.length > 0 || t.run) && (
                      <div className="as-files">
                        {t.files?.map((f) => <button key={f} className="chip-btn" onClick={() => showCode(f)}>📄 {f.split('/').pop()}</button>)}
                        {t.run && <code className="as-run">{t.run}</code>}
                      </div>
                    )}
                    {code && t.files?.includes(code.path) && <CodeView code={code} onClose={() => setCode(null)} />}
                    {t.mistakes?.length > 0 && (
                      <div className="as-block"><h3>⚠️ Common mistakes</h3><ul>{t.mistakes.map((m, i) => <li key={i}><MdText text={m} /></li>)}</ul></div>
                    )}
                    <div className="as-block">
                      <h3>❓ Check yourself</h3>
                      {t.questions.map((q, i) => (
                        <details key={i} className="as-q"><summary>{inline(q.q)}</summary><p>{inline(q.a)}</p></details>
                      ))}
                    </div>
                    <label className="check as-understood">
                      <input type="checkbox" checked={ok} onChange={(e) => mark(t, e.target.checked, e.target)} /> I understand this and can explain it
                    </label>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      ))}

      <section className="card">
        <h2>🧪 Tests and coverage</h2>
        <p><strong>{a.testing.summary}</strong></p>
        <MdText text={a.testing.concept} />
        <div className="as-files">{a.testing.files.map((f) => <button key={f} className="chip-btn" onClick={() => showCode(f)}>📄 {f.split('/').pop()}</button>)}</div>
        {code && a.testing.files.includes(code.path) && <CodeView code={code} onClose={() => setCode(null)} />}
      </section>
    </>
  );
}

function CodeView({ code, onClose }) {
  return (
    <div className="as-codeview">
      <div className="as-codeview-head">
        <code>{code.path}</code>
        <span className="row-gap">
          {code.vscode && <a href={code.vscode} className="small">Open in VS Code</a>}
          <button className="link-btn" onClick={onClose}>Close</button>
        </span>
      </div>
      {code.error ? <div className="form-error">{code.error}</div> : <pre className="as-code as-code-file">{code.text}</pre>}
    </div>
  );
}
