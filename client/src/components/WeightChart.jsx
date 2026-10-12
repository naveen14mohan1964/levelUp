import { useMemo, useRef, useState } from 'react';
import { formatShort } from '../dates.js';

const W = 640;
const H = 240;
const PAD = { top: 16, right: 56, bottom: 28, left: 40 };

/**
 * Weight over time. Daily weigh-ins are context (muted dots); the 7-day average is the story
 * (orange line, direct-labeled at its end). The next badge milestone is a green reference line.
 * Hover/touch: a crosshair snaps to the nearest day and the tooltip lists both values.
 */
export default function WeightChart({ series, milestone }) {
  const svgRef = useRef(null);
  const [hover, setHover] = useState(null);
  const [showTable, setShowTable] = useState(false);

  const geo = useMemo(() => {
    if (!series.length) return null;
    const t = (d) => Date.parse(d);
    const t0 = t(series[0].date);
    const t1 = Math.max(t(series.at(-1).date), t0 + 6 * 86400000); // at least a week wide
    const values = series.flatMap((s) => [s.weight, s.avg7]).concat(milestone ? [milestone.kg] : []);
    const lo = Math.floor(Math.min(...values) - 1);
    const hi = Math.ceil(Math.max(...values) + 1);
    const x = (d) => PAD.left + ((t(d) - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
    const y = (v) => PAD.top + ((hi - v) / (hi - lo)) * (H - PAD.top - PAD.bottom);
    const step = Math.max(1, Math.ceil((hi - lo) / 5));
    const ticks = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
    return { x, y, ticks, lo, hi };
  }, [series, milestone]);

  if (!geo) {
    return <div className="chart-empty muted small">Log your first morning weight to start the chart. One dot a day is all it takes.</div>;
  }

  const { x, y, ticks } = geo;
  const avgPath = series.map((s, i) => `${i ? 'L' : 'M'}${x(s.date).toFixed(1)},${y(s.avg7).toFixed(1)}`).join(' ');
  const last = series.at(-1);

  function onMove(e) {
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = series[0];
    for (const s of series) if (Math.abs(x(s.date) - px) < Math.abs(x(best.date) - px)) best = s;
    setHover(best);
  }

  return (
    <div className="chart">
      <div className="chart-legend small">
        <span><i className="key-dot" /> Daily weigh-in</span>
        <span><i className="key-line" /> 7-day average</span>
        {milestone && <span><i className="key-ref" /> Next badge: {milestone.kg} kg</span>}
        <button className="link-btn" onClick={() => setShowTable((s) => !s)}>{showTable ? 'Show chart' : 'Show table'}</button>
      </div>

      {showTable ? (
        <table className="data-table">
          <thead><tr><th>Date</th><th>Weight</th><th>7-day avg</th></tr></thead>
          <tbody>
            {[...series].reverse().map((s) => (
              <tr key={s.date}><td>{formatShort(s.date)}</td><td>{s.weight.toFixed(1)} kg</td><td>{s.avg7.toFixed(1)} kg</td></tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="chart-wrap">
          <svg
            ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img"
            aria-label={`Weight chart: latest 7-day average ${last.avg7} kg`}
            onPointerMove={onMove} onPointerLeave={() => setHover(null)}
          >
            {ticks.map((v) => (
              <g key={v}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="grid" />
                <text x={PAD.left - 8} y={y(v)} className="axis" textAnchor="end" dominantBaseline="middle">{v}</text>
              </g>
            ))}
            <text x={PAD.left} y={H - 6} className="axis">{formatShort(series[0].date)}</text>
            {series.length > 1 && <text x={W - PAD.right} y={H - 6} className="axis" textAnchor="end">{formatShort(last.date)}</text>}

            {milestone && (
              <g>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(milestone.kg)} y2={y(milestone.kg)} className="ref-line" />
                <text x={W - PAD.right + 6} y={y(milestone.kg)} className="axis" dominantBaseline="middle">{milestone.kg}</text>
              </g>
            )}

            {series.map((s) => <circle key={s.date} cx={x(s.date)} cy={y(s.weight)} r="4" className="pt-daily" />)}
            <path d={avgPath} className="line-avg" />
            <circle cx={x(last.date)} cy={y(last.avg7)} r="5" className="pt-avg" />
            <text x={x(last.date) + 9} y={y(last.avg7)} className="end-label" dominantBaseline="middle">{last.avg7.toFixed(1)}</text>

            {hover && (
              <g pointerEvents="none">
                <line x1={x(hover.date)} x2={x(hover.date)} y1={PAD.top} y2={H - PAD.bottom} className="crosshair" />
                <circle cx={x(hover.date)} cy={y(hover.avg7)} r="5" className="pt-avg" />
              </g>
            )}
          </svg>
          {hover && (
            <div className="chart-tip" style={{ left: `${(x(hover.date) / W) * 100}%` }}>
              <div className="small muted">{formatShort(hover.date)}</div>
              <div><i className="key-line" /> <strong>{hover.avg7.toFixed(1)} kg</strong> <span className="muted small">7-day avg</span></div>
              <div><i className="key-dot" /> <strong>{hover.weight.toFixed(1)} kg</strong> <span className="muted small">weigh-in</span></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
