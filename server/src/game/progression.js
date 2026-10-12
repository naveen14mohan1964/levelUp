// Game-style level progression, derived from real progress (so it survives reloads and can't drift).
//
// Lesson i is unlocked when:
//   • it's the very first lesson, or
//   • the lesson before it is done, or
//   • you've already made progress on it or on anything after it ("catch-up": real progress, e.g. a LeetCode sync,
//     is never locked away; the unfinished lessons behind it stay open).
// A level is unlocked when any of its lessons is; the level holding your next lesson is the current one.

/**
 * @param track { key, label, levels: [{ n, title, goal?, lessons: [{ ref, title, minutes, done, touched, doneMs }] }] }
 * @returns the track with lesson status (done | current | open | locked), level status (complete | current | open | locked),
 *          counts, completion times and the next lesson.
 */
function progress(track) {
  const flat = track.levels.flatMap((lv) => lv.lessons);
  let frontier = -1;
  flat.forEach((x, i) => { if (x.done || x.touched) frontier = i; });

  let i = 0;
  let next = null;
  const levels = track.levels.map((lv) => {
    const lessons = lv.lessons.map((x) => {
      const idx = i++;
      const unlocked = idx === 0 || idx <= frontier || flat[idx - 1].done;
      let status = x.done ? 'done' : unlocked ? 'open' : 'locked';
      if (status === 'open' && !next) {
        status = 'current';
        next = { ...x, status, level: lv.n, levelTitle: lv.title };
      }
      return { ...x, status };
    });
    const done = lessons.filter((x) => x.done).length;
    const complete = lessons.length > 0 && done === lessons.length;
    const status = complete ? 'complete'
      : next && next.level === lv.n ? 'current'
        : lessons.some((x) => x.status !== 'locked') ? 'open' : 'locked';
    const completedMs = complete ? Math.max(0, ...lessons.map((x) => x.doneMs || 0)) || null : null;
    return { ...lv, lessons, done, total: lessons.length, complete, completedMs, status };
  });

  const done = flat.filter((x) => x.done).length;
  return {
    key: track.key,
    label: track.label,
    levels,
    done,
    total: flat.length,
    pct: flat.length ? Math.round((done / flat.length) * 100) : 0,
    levelsComplete: levels.filter((lv) => lv.complete).length,
    currentLevel: next ? next.level : null,
    next,
  };
}

module.exports = { progress };
