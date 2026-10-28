import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { AREAS } from '../areas.js';
import { api } from '../api.js';
import { useGame } from '../game.jsx';
import { SOUNDS, choose } from '../lib/soundscape.js';
import { useFocus } from '../focus.jsx';

export const OPEN_EVENT = 'levelup:palette';
/** Open the command palette from anywhere (e.g. the sidebar's search button). */
export const openPalette = () => window.dispatchEvent(new Event(OPEN_EVENT));

/** Fuzzy match: every typed character in order; earlier, consecutive and word-start hits score higher. */
export function score(text, q) {
  if (!q) return 1;
  const t = text.toLowerCase();
  const s = q.toLowerCase().trim();
  // a match at the start of a word wins ("rain" → "Rain", before "Train")
  for (let i = t.indexOf(s); i >= 0; i = t.indexOf(s, i + 1)) if (i === 0 || !/[a-z0-9]/.test(t[i - 1])) return 1500 - i;
  if (t.includes(s)) return 1000 - t.indexOf(s);
  let at = -1; let total = 0; let run = 0;
  for (const ch of s) {
    if (ch === ' ') continue;
    const i = t.indexOf(ch, at + 1);
    if (i < 0) return 0;
    run = i === at + 1 ? run + 1 : 0;
    total += 10 + run * 5 + (i === 0 || t[i - 1] === ' ' ? 8 : 0) - Math.min(i - at, 10);
    at = i;
  }
  return total;
}

/**
 * Ctrl+K (⌘K on a Mac): jump anywhere, start or stop a focus session, switch the focus sound, find a lesson.
 * ↑ ↓ to move, Enter to run, Esc to close.
 */
export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [lessons, setLessons] = useState([]);
  const [msg, setMsg] = useState(null);
  const input = useRef(null);
  const listRef = useRef(null);
  const lastFocus = useRef(null);
  const navigate = useNavigate();
  const { game } = useGame();
  const session = useFocus();
  const stopRef = useRef(null);
  stopRef.current = session.stopSession; // read at run time: the guard updates often, the list needn't rebuild

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener(OPEN_EVENT, onOpen); };
  }, []);

  useEffect(() => {
    if (!open) { lastFocus.current?.focus?.(); return; }
    lastFocus.current = document.activeElement;
    setQ(''); setSel(0); setMsg(null);
    setTimeout(() => input.current?.focus(), 0);
    // the lesson index for search, loaded once per opening (small: AI + LLD + HLD titles)
    Promise.allSettled(['ai', 'lld', 'hld', 'judge'].map((k) => api.gameTrack(k))).then((rs) => setLessons(rs.flatMap((r) => (r.status === 'fulfilled'
      ? r.value.track.levels.flatMap((lv) => lv.lessons.map((x) => ({ track: r.value.track.key, label: r.value.track.label, ref: x.ref, title: x.title, done: x.status === 'done' || x.done, level: lv.n })))
      : []))));
  }, [open]);

  const close = useCallback(() => setOpen(false), []);
  const run = useCallback(async (item) => {
    try {
      const r = await item.run();
      if (typeof r === 'string') { setMsg(r); setTimeout(close, 900); } else close();
    } catch (e) { setMsg(`⚠ ${e.message}`); }
  }, [close]);

  const items = useMemo(() => {
    const focus = game?.focus;
    const list = [];
    if (focus) list.push({ id: 'stop', group: 'Focus', icon: '⏹', label: 'Stop the focus timer', run: async () => { const r = await stopRef.current(); return `Stopped: ${r.minutes} minutes logged`; } });
    else {
      list.push({ id: 'start25', group: 'Focus', icon: '▶', label: 'Start a 25-minute focus session', hint: 'next lesson', run: () => navigate('/?start=25') });
      list.push({ id: 'start5', group: 'Focus', icon: '⚡', label: 'Just 5 minutes', hint: 'keeps the streak', run: () => navigate('/?start=5') });
    }
    if (game?.cards?.due) list.push({ id: 'cards', group: 'Focus', icon: '🃏', label: `Review ${game.cards.due} due flashcard${game.cards.due === 1 ? '' : 's'}`, run: () => navigate('/cards') });
    for (const s of SOUNDS) list.push({ id: `sound-${s.key}`, group: 'Sound', icon: s.icon, label: s.key === 'off' ? 'Sound off' : `Focus sound: ${s.label}`, run: () => { choose(s.key, { now: !!focus }); return focus || s.key === 'off' ? `${s.label}` : `${s.label}: plays with your next session`; } });
    for (const a of AREAS) list.push({ id: `go-${a.key}`, group: 'Go to', icon: a.icon, label: a.label, run: () => navigate(a.to) });
    list.push(
      { id: 'go-problems', group: 'Go to', icon: '🔎', label: 'DSA problems', run: () => navigate('/dsa/problems') },
      { id: 'go-review', group: 'Go to', icon: '🔁', label: 'DSA review queue', run: () => navigate('/dsa/review') },
      { id: 'go-plan', group: 'Go to', icon: '🗓', label: 'DSA plan', run: () => navigate('/dsa/plan') },
      { id: 'go-patterns', group: 'Go to', icon: '🧭', label: 'DSA pattern mastery', run: () => navigate('/dsa/patterns') },
      { id: 'go-companies', group: 'Go to', icon: '🏢', label: 'Company readiness', run: () => navigate('/dsa/companies') },
      { id: 'go-drills', group: 'Go to', icon: '🏗️', label: 'System design drill (35 min)', run: () => navigate('/hld/drills') },
      { id: 'go-patterns-lab', group: 'Go to', icon: '📘', label: '.NET Patterns Lab (explained)', run: () => navigate('/assignments') },
      { id: 'go-settings', group: 'Go to', icon: '⚙️', label: 'Settings', run: () => navigate('/settings') },
    );
    for (const l of lessons) list.push({ id: `l-${l.track}-${l.ref}`, group: 'Lessons', icon: l.done ? '✅' : '📘', label: `${l.title}`, hint: `${l.label} · level ${l.level}`, run: () => navigate(l.track === 'ai' ? '/ai?tab=roadmap' : `/${l.track}`) });
    return list;
  }, [game, lessons, navigate]);

  // Results stay grouped: groups ordered by their best match, items by score; the label counts more than the hint;
  // commands get a small edge over lessons with the same score.
  const shown = useMemo(() => {
    if (!q.trim()) return items.filter((x) => x.group !== 'Lessons');
    const scored = items.map((x) => ({ x, s: Math.max(score(x.label, q) + (x.group === 'Lessons' ? 0 : 50), score(`${x.hint || ''} ${x.group}`, q) * 0.6) }))
      .filter((r) => r.s > 0).sort((a, b) => b.s - a.s).slice(0, 40);
    const order = [...new Set(scored.map((r) => r.x.group))];
    return order.flatMap((g) => scored.filter((r) => r.x.group === g).map((r) => r.x));
  }, [items, q]);

  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => { listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [sel]);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((i) => Math.min(shown.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && shown[sel]) { e.preventDefault(); run(shown[sel]); }
    else if (e.key === 'Tab') e.preventDefault(); // keep focus in the dialog
  };

  let lastGroup = null;
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="palette-backdrop" onMouseDown={close} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
          <motion.div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: -12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }} transition={{ duration: 0.14 }}>
            <input ref={input} className="palette-input" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown}
              placeholder="Type a command, a page or a lesson…" aria-label="Search commands" role="combobox" aria-expanded="true" aria-controls="palette-list"
              aria-activedescendant={shown[sel] ? `pal-${shown[sel].id}` : undefined} />
            {msg && <div className="palette-msg" role="status">{msg}</div>}
            <ul id="palette-list" ref={listRef} className="palette-list" role="listbox">
              {shown.length === 0 && <li className="palette-empty muted">No match. Try “start”, “rain”, “cards” or a lesson name.</li>}
              {shown.map((x, i) => {
                const head = x.group !== lastGroup ? x.group : null;
                lastGroup = x.group;
                return (
                  <li key={x.id} role="presentation">
                    {head && <div className="palette-group" aria-hidden="true">{head}</div>}
                    <div id={`pal-${x.id}`} role="option" aria-selected={i === sel} className={`palette-item${i === sel ? ' sel' : ''}`}
                      onMouseMove={() => setSel(i)} onClick={() => run(x)}>
                      <span className="palette-icon" aria-hidden="true">{x.icon}</span>
                      <span className="palette-label">{x.label}</span>
                      {x.hint && <span className="palette-hint small muted">{x.hint}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="palette-foot small muted"><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>Enter</kbd> run · <kbd>Esc</kbd> close · <kbd>Ctrl</kbd>+<kbd>K</kbd> anywhere</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
