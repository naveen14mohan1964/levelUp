import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { formatLong, formatShort, todayISO } from '../dates.js';
import { refreshGame } from '../game.jsx';
import { ErrorBox, Loading } from '../components/ui.jsx';
import { EmptyState } from '../components/fx.jsx';
import { MOODS, MoodPicker } from '../components/CheckIn.jsx';

// Four short questions. Each one is optional; one sentence is a complete answer.
const QUESTIONS = [
  { key: 'accomplished', label: 'What did I accomplish today?', hint: 'Even one small thing counts.' },
  { key: 'learned', label: 'What did I learn?', hint: 'Putting it in your own words helps you keep it.' },
  { key: 'improve', label: 'What could I improve tomorrow?', hint: 'One thing, small enough to actually do.' },
  { key: 'grateful', label: 'What am I grateful for?', hint: 'Anything, big or small.' },
];
const FIELDS = ['note', ...QUESTIONS.map((q) => q.key)];
const hasText = (e) => FIELDS.some((k) => e[k]);

/** Journal: today's reflection (saves as you go) and your earlier entries. Nothing here is required. */
export default function Journal() {
  const date = todayISO();
  const [entry, setEntry] = useState(null);
  const [draft, setDraft] = useState({});
  const [past, setPast] = useState([]);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null);

  const load = useCallback(async () => {
    try {
      const [e, list] = await Promise.all([api.journal(date), api.journalList(60)]);
      setEntry(e);
      setDraft(Object.fromEntries(FIELDS.map((k) => [k, e[k] || ''])));
      setPast(list.entries.filter((x) => x.date !== date));
    } catch (err) {
      setError(err.message);
    }
  }, [date]);
  useEffect(() => { load(); }, [load]);

  async function save(changes, label) {
    try {
      setEntry(await api.saveJournal(date, changes));
      setSaved(label);
      setTimeout(() => setSaved((s) => (s === label ? null : s)), 2000);
      refreshGame();
    } catch (err) {
      setSaved(null);
      setError(err.message);
    }
  }
  const saveField = (k) => { if ((draft[k] || '').trim() !== (entry[k] || '')) save({ [k]: draft[k] }, k); };

  if (error) return <ErrorBox error={error} onRetry={() => { setError(null); load(); }} />;
  if (!entry) return <Loading />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Journal</h1>
          <div className="muted small">{formatLong(date)} · two minutes is plenty, and every question is optional</div>
        </div>
      </div>

      <div className="journal-cols">
        <section className="card journal-today" aria-label="Today's reflection">
          <h2 className="card-title">How is today going?</h2>
          <MoodPicker value={entry.mood} onChange={(v) => save({ mood: v }, 'mood')} />

          {QUESTIONS.map((q) => (
            <label key={q.key} className="journal-q">
              <span className="journal-q-label">{q.label} {saved === q.key && <span className="journal-saved" role="status">Saved</span>}</span>
              <textarea
                rows={2} maxLength={1000} value={draft[q.key]} placeholder={q.hint}
                onChange={(e) => setDraft((d) => ({ ...d, [q.key]: e.target.value }))} onBlur={() => saveField(q.key)}
              />
            </label>
          ))}
          <p className="muted small journal-foot">Saves when you leave a box. A day with a reflection earns a little Discipline XP, once.</p>
        </section>

        <section aria-labelledby="journal-past">
          <h2 id="journal-past" className="section-label journal-past-label">Earlier entries</h2>
          {past.length ? past.map((e) => {
            const mood = MOODS.find((m) => m.value === e.mood);
            return (
              <article key={e.date} className="card journal-entry">
                <header>
                  <strong>{formatShort(e.date)}</strong>
                  {mood && <span className="journal-mood"><mood.Icon size={16} weight="fill" aria-hidden="true" /> {mood.label}</span>}
                </header>
                {e.note && <p>{e.note}</p>}
                {hasText(e) && (
                  <dl>
                    {QUESTIONS.filter((q) => e[q.key]).map((q) => (
                      <div key={q.key}><dt>{q.label}</dt><dd>{e[q.key]}</dd></div>
                    ))}
                  </dl>
                )}
              </article>
            );
          }) : (
            <section className="card"><EmptyState icon="📓" title="Your story starts here">Each day you reflect appears here, so you can look back and see how far you have come.</EmptyState></section>
          )}
        </section>
      </div>
    </>
  );
}
