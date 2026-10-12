// Helpers for the daily timeline on the Home page.

/** "05:35" -> 335 (minutes since midnight) */
export function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Minutes since midnight right now, in your local time. */
export function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** true when every checkable item in the block is done (the problems item counts as done when solved === total). */
export function isBlockDone(block) {
  const checkable = block.items;
  if (!checkable.length) return false;
  return checkable.every((i) => (i.kind === 'problems' ? i.solved >= i.total : i.done));
}

/**
 * 'done' | 'now' | 'past' | 'upcoming' for a block like { start: '06:10', end: '07:55', items }.
 * nowMin = minutes since midnight, or null when previewing another day (nothing is "now" then).
 * Blocks that wrap past midnight (Sleep 22:30 → 05:30) are "now" on both sides of midnight and never "past".
 */
export function blockStatus(block, nowMin) {
  if (isBlockDone(block)) return 'done';
  if (nowMin == null) return 'upcoming';
  const start = toMinutes(block.start);
  const end = toMinutes(block.end);
  if (end < start) return nowMin >= start || nowMin < end ? 'now' : 'upcoming';
  if (nowMin >= start && nowMin < end) return 'now';
  if (nowMin >= end) return 'past';
  return 'upcoming';
}
