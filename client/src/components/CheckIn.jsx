import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Smiley, SmileyMeh, SmileySad } from '@phosphor-icons/react';
import { api } from '../api.js';
import { todayISO } from '../dates.js';
import { refreshGame } from '../game.jsx';

export const MOODS = [
  { value: 3, label: 'Great', Icon: Smiley, reply: 'Love that. Enjoy the momentum.' },
  { value: 2, label: 'Okay', Icon: SmileyMeh, reply: 'Steady days build the habit.' },
  { value: 1, label: 'Tough', Icon: SmileySad, reply: 'Tough days count too. One small step is enough today.' },
];

/** The three mood buttons (shared by the Today check-in and the Journal page). */
export function MoodPicker({ value, disabled, onChange }) {
  return (
    <div className="checkin-moods" role="group" aria-label="How is today going?">
      {MOODS.map(({ value: v, label, Icon }) => (
        <button key={v} type="button" className={`checkin-mood${value === v ? ' on' : ''}`} aria-pressed={value === v} disabled={disabled} onClick={() => onChange(value === v ? null : v)}>
          <Icon size={22} weight={value === v ? 'fill' : 'regular'} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * The quick daily check-in: one tap for how the day feels, plus an optional line. Entirely optional:
 * skipping it changes nothing. Saved to the journal (PUT /api/journal/:date); the Journal page has the longer reflection.
 */
export default function CheckIn() {
  const date = todayISO();
  const [entry, setEntry] = useState(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    api.journal(date).then((e) => { setEntry(e); setNote(e.note || ''); }).catch((e) => setError(e.message));
  }, [date]);

  async function save(changes) {
    try {
      setError(null);
      setEntry(await api.saveJournal(date, changes));
      refreshGame(); // a recorded reflection earns a little Discipline XP
    } catch (err) {
      setError(err.message);
    }
  }
  const saveNote = () => { if (note.trim() !== (entry?.note || '')) save({ note }); };
  const mood = MOODS.find((m) => m.value === entry?.mood);

  return (
    <section className="card checkin" aria-labelledby="checkin-title">
      <h2 id="checkin-title" className="card-title">How is today going?</h2>
      <MoodPicker value={entry?.mood} disabled={!entry} onChange={(v) => save({ mood: v })} />
      {mood && <p className="checkin-reply" role="status">{mood.reply}</p>}
      <input
        className="checkin-note" type="text" maxLength={500} value={note} disabled={!entry}
        placeholder="One line about today (optional)" aria-label="One line about today (optional)"
        onChange={(e) => setNote(e.target.value)} onBlur={saveNote}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      />
      <Link to="/journal" className="checkin-more">Reflect in your journal <ArrowRight size={14} aria-hidden="true" /></Link>
      {error && <div className="form-error top-gap">{error}</div>}
    </section>
  );
}
