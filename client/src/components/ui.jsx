import { CountUp, SkeletonPage } from './motion.jsx';

export const DIFF = { E: 'Easy', M: 'Medium', H: 'Hard' };

export function DiffPill({ d }) {
  return <span className={`pill diff-${d}`}>{DIFF[d]}</span>;
}

export function ProgressBar({ value, total }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  // scaleX, not width: the fill wipes in like a progress bar and only transform animates
  return (
    <div className={`progress${total && value >= total ? ' complete' : ''}`} title={`${value}/${total} (${pct}%)`}>
      <div className="progress-fill scaled" style={{ '--p': pct / 100 }} />
    </div>
  );
}

export function Loading() {
  return <SkeletonPage />;
}

export function ErrorBox({ error, onRetry }) {
  return (
    <div className="card error">
      <strong>Something went wrong:</strong> {error}
      <div className="muted small">Is the API running? (npm run dev in the tracker folder)</div>
      {onRetry && <button className="btn" onClick={onRetry}>Retry</button>}
    </div>
  );
}

// Renders `code` spans from the plan's markdown.
export function Md({ text }) {
  return text.split('`').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : <span key={i}>{part}</span>));
}

// Circular progress — a ring "fills up", which makes the remaining gap feel small (goal-gradient effect).
// Default colour follows the design system: cyan while in progress, green when complete.
export function ProgressRing({ value, total, size = 84, stroke = 8, label, color }) {
  const pct = total ? value / total : 0;
  const ringColor = color || (pct >= 1 ? 'var(--success)' : 'var(--focus)');
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={pct ? `${Math.round(pct * 100)}%` : 'Not started yet'}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255, 255, 255, 0.1)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ringColor} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="ring-arc" style={{ '--c': c }}
        />
      </svg>
      <div className="ring-label">
        {/* never a bare "0%": an empty ring invites you to start */}
        <strong style={size < 80 ? { fontSize: `${Math.round(size * (pct ? 0.22 : 0.2))}px` } : undefined}>{pct ? <CountUp value={Math.round(pct * 100)} format={(n) => `${n}%`} /> : 'Start'}</strong>
        {label && <span>{label}</span>}
      </div>
    </div>
  );
}

// Verified documentation links (see scripts/doc-links.js + `npm run check:links`).
export function DocLinks({ links, title = '📚 Read / watch', compact }) {
  const list = typeof links === 'string' ? JSON.parse(links || '[]') : links || [];
  if (!list.length) return null;
  return (
    <div className={`doc-links${compact ? ' compact' : ''}`}>
      {!compact && <span className="doc-links-title">{title}</span>}
      {list.map((x) => (
        <a key={x.url} href={x.url} target="_blank" rel="noreferrer" className="doc-link" title={x.url}>
          {x.label} <span aria-hidden="true">↗</span>
        </a>
      ))}
    </div>
  );
}
