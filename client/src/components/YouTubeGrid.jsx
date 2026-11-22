import { useState } from 'react';
import { ArrowSquareOut, YoutubeLogo } from '@phosphor-icons/react';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'striver', label: 'Striver', test: (v) => v.channel.startsWith('Striver') },
  { key: 'kunal', label: 'Kunal Kushwaha', test: (v) => v.channel.startsWith('Kunal') },
];

/**
 * YouTube reference: the videos for this lesson as a grid of cards (thumbnail, title, channel).
 * Each card opens the video on YouTube inside its playlist, in a new tab, so "next video" keeps you in the series.
 */
export default function YouTubeGrid({ videos }) {
  const [filter, setFilter] = useState('all');
  if (!videos?.length) return null;
  const both = videos.some(FILTERS[1].test) && videos.some(FILTERS[2].test);
  const shown = videos.filter(FILTERS.find((f) => f.key === filter)?.test || (() => true));

  return (
    <section className="card yt" aria-labelledby="yt-title">
      <div className="yt-head">
        <h2 id="yt-title" className="card-title"><YoutubeLogo size={20} weight="fill" className="yt-logo" aria-hidden="true" /> YouTube reference</h2>
        <span className="muted small">{videos.length} video{videos.length === 1 ? '' : 's'} for this lesson</span>
        {both && (
          <div className="yt-filters" role="group" aria-label="Filter by channel">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" className={`chip-btn${filter === f.key ? ' on' : ''}`} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}</button>
            ))}
          </div>
        )}
      </div>
      <ul className="yt-grid">
        {shown.map((v) => (
          <li key={v.id}>
            <a className="yt-card" href={`https://www.youtube.com/watch?v=${v.id}&list=${v.playlist}`} target="_blank" rel="noreferrer">
              <span className="yt-thumb">
                <img src={`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`} alt="" loading="lazy" width="320" height="180" />
              </span>
              <span className="yt-text">
                <span className="yt-title">{v.title}</span>
                <span className="yt-meta">{v.channel} <ArrowSquareOut size={12} aria-hidden="true" /></span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
