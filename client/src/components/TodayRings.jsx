import { Link } from 'react-router-dom';
import { areaByKey } from '../areas.js';
import { useGame } from '../game.jsx';
import { sectionProgress } from './Sidebar.jsx';
import { ProgressRing } from './ui.jsx';

/**
 * "Today at a glance": one ring per goal that has something to show today (level XP, workout, protein,
 * flashcards, active days this week). Rings sweep in and their numbers count up as the strip scrolls
 * into view (styles-motion.css). Never a bare zero: an empty ring says "Start" and the line names the first step.
 */
export default function TodayRings() {
  const { game, today } = useGame();
  if (!game) return null;
  const { player, week } = game;
  const days = week?.activeDays || 0;
  const items = [
    {
      key: 'xp', to: '/report', title: `Level ${player.level}`, value: player.xpInLevel, total: player.xpForNext,
      sub: player.total ? `${player.xpForNext - player.xpInLevel} XP to level ${player.level + 1}` : 'Earn your first XP today',
    },
    ...['workout', 'meals', 'cards'].map((k) => {
      const p = sectionProgress(k, game, today);
      return p && { key: k, to: `/${k}`, title: areaByKey[k].label, value: p.value, total: p.total, sub: p.label };
    }).filter(Boolean),
    { key: 'week', to: '/report', title: 'This week', value: days, total: 7, sub: days ? `${days} of 7 days active` : 'Day one starts today' },
  ];
  return (
    <section className="rings-strip" aria-label="Today at a glance">
      {items.map((it) => (
        <Link key={it.key} to={it.to} className="card ring-tile" style={it.key in areaByKey ? { '--area': areaByKey[it.key].color } : undefined}>
          <ProgressRing value={it.value} total={it.total} size={56} stroke={5} />
          <div className="ring-tile-text">
            <div className="ring-tile-title">{it.title}</div>
            <div className="ring-tile-sub">{it.sub}</div>
          </div>
        </Link>
      ))}
    </section>
  );
}
