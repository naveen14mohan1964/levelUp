// Which roadmap the Today hero card shows, and where each lesson lives.
import { blockStatus, nowMinutes } from './timeline.js';

const FALLBACK = ['ai', 'dsa', 'lld', 'hld', 'judge', 'node', 'dotnet', 'react'];

/**
 * The hero follows your timeline: an unfinished DSA or project block happening right now picks that roadmap.
 * Otherwise it's AI + FDE (then the next roadmap that still has a lesson).
 * @returns { key, reason }
 */
export function pickHeroTrack(tracks, schedule, nowMin = nowMinutes()) {
  const hasNext = (key) => tracks.some((t) => t.key === key && t.next);
  const block = (schedule?.blocks || []).find((b) => (b.area === 'dsa' || b.area === 'project') && blockStatus(b, nowMin) === 'now');
  if (block) {
    const key = block.area === 'dsa' ? 'dsa' : block.items?.find((i) => i.area)?.area;
    if (key && hasNext(key)) return { key, reason: `Your ${block.title.split(' (')[0]} block is on now` };
  }
  const key = FALLBACK.find(hasNext);
  return key ? { key, reason: key === 'ai' ? 'Nothing else is scheduled right now: a good time to learn AI' : 'Next on your roadmap' } : null;
}

/** Where to open a lesson. */
export function lessonLink(trackKey, lesson) {
  if (trackKey === 'ai' || trackKey === 'lld' || trackKey === 'hld' || trackKey === 'judge') return `/${trackKey}`;
  if (trackKey === 'dsa') return lesson?.planDate ? `/dsa/day/${lesson.planDate}` : '/dsa';
  return `/${trackKey}`;
}

/** 125 -> "2h 5m", 45 -> "45 min" */
export function minutesText(min) {
  if (!min) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m} min`;
}
