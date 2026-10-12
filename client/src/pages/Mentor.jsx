import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { todayISO } from '../dates.js';
import MentorChat from '../components/MentorChat.jsx';

const TABS = [
  { key: 'chat', label: '💬 Ask', hint: 'Anything: concepts, career, "why is my solution slow?", interview strategy.' },
  { key: 'plan', label: '🗓️ Plan my day', hint: 'Re-plans today around what you missed and your energy, using your real timetable.' },
  { key: 'mock', label: '🎤 Mock interview', hint: 'A 45-minute FAANG-style coding round on topics you have covered. Say "end interview" for your scorecard.' },
  { key: 'review', label: '🔍 Code review', hint: 'Paste any code (DSA in Java, C#, TypeScript…) for a senior-engineer review.' },
];

const STARTERS = [
  'How should I approach a problem I have never seen before?',
  'Explain time complexity of recursion with an example in Java.',
  'What do FAANG interviewers look for beyond a correct answer?',
  'I feel behind and demotivated. What should I do this week?',
];

export default function Mentor() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'chat';
  const [ctx, setCtx] = useState(null);
  const today = todayISO();

  useEffect(() => { api.mentorContext().then(setCtx).catch(() => {}); }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>🤖 Mentor</h1>
          <div className="muted small">A senior engineer + coach who knows your plan and your progress</div>
        </div>
      </div>

      {ctx && (
        <div className="card context-card small">
          <strong>What your mentor knows right now:</strong>{' '}
          {ctx.week ? `Week ${ctx.week}` : 'Plan starts Mon 5 Oct'} · {ctx.focus || 'no DSA today'} · {ctx.reviewsDue} review{ctx.reviewsDue === 1 ? '' : 's'} due ·
          solved {ctx.solved.E}E/{ctx.solved.M}M/{ctx.solved.H}H
          {ctx.weakTopics.length > 0 && ` · weak: ${ctx.weakTopics.map((w) => w.topic).join(', ')}`}
          {(ctx.behind.tasks > 0 || ctx.behind.problems > 0) && ` · behind: ${ctx.behind.tasks} blocks, ${ctx.behind.problems} problems`}
          {ctx.lesson && ` · lesson: ${ctx.lesson.project}`}
          {` · workout: ${ctx.workout.session}`}
        </div>
      )}

      <nav className="tabs mentor-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`tab${tab === t.key ? ' active' : ''}`} onClick={() => setParams({ tab: t.key })}>{t.label}</button>
        ))}
      </nav>
      <p className="muted small">{TABS.find((t) => t.key === tab).hint}</p>

      <section className="card">
        {tab === 'chat' && (
          <MentorChat
            thread="general"
            actions={(send, busy) => STARTERS.map((q) => (
              <button key={q} className="chip-btn" disabled={busy} onClick={() => send({ mode: 'chat', message: q }, q)}>{q}</button>
            ))}
          />
        )}
        {tab === 'plan' && <PlanTab today={today} />}
        {tab === 'mock' && (
          <MentorChat
            thread="mock"
            chatMode="mock"
            placeholder='Talk to your interviewer… (say "end interview" for the scorecard)'
            actions={(send, busy) => (
              <button className="btn primary" disabled={busy} onClick={() => send({ mode: 'mock', message: "Let's start the mock interview." }, 'Start a new mock interview')}>
                🎤 Start a mock interview
              </button>
            )}
          />
        )}
        {tab === 'review' && <ReviewTab />}
      </section>
    </>
  );
}

function PlanTab({ today }) {
  const [energy, setEnergy] = useState('normal');
  const [hours, setHours] = useState('');
  return (
    <MentorChat
      thread={`plan:${today}`}
      placeholder="Anything else? e.g. “office meeting till 8 PM”"
      actions={(send, busy) => (
        <div className="row gap wrap center-v">
          <label className="field">
            <span className="field-label">Energy today</span>
            <select value={energy} onChange={(e) => setEnergy(e.target.value)}>
              <option value="low">😴 Low</option><option value="normal">🙂 Normal</option><option value="high">⚡ High</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Study hours available (optional)</span>
            <input type="number" min="0.5" max="12" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="5" />
          </label>
          <button
            className="btn primary" disabled={busy} style={{ alignSelf: 'flex-end' }}
            onClick={() => send({ mode: 'plan', energy, hours: hours || undefined, date: today }, `🗓️ Plan my day (energy: ${energy}${hours ? `, ${hours} h` : ''})`)}
          >
            Plan my day
          </button>
        </div>
      )}
    />
  );
}

function ReviewTab() {
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('Java');
  const [about, setAbout] = useState('');
  return (
    <MentorChat
      thread="review"
      placeholder="Follow-up question about the review…"
      actions={(send, busy) => (
        <div className="review-box">
          <div className="row gap wrap">
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              {['Java', 'C#', 'TypeScript', 'JavaScript', 'SQL'].map((l) => <option key={l}>{l}</option>)}
            </select>
            <input className="search" placeholder="What is it? e.g. LeetCode 3 / JWT middleware" value={about} onChange={(e) => setAbout(e.target.value)} />
          </div>
          <textarea className="code-input" rows={10} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste your code…" spellCheck={false} />
          <button
            className="btn primary" disabled={busy || code.trim().length < 10}
            onClick={() => { send({ mode: 'review', code, language, about }, `🔍 Review my ${language} code${about ? ` (${about})` : ''}`); setCode(''); }}
          >
            Review it
          </button>
        </div>
      )}
    />
  );
}
