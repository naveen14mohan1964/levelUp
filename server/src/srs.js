// Spaced repetition (STUDY_PLAN.md §0.4): when should you re-solve a problem?

// First interval for each confidence rating (1 = copied the solution ... 5 = could teach it)
const BASE_DAYS = { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 };
const MASTERED_DAYS = 60;

/**
 * Days until the next review.
 *   First solve                -> BASE_DAYS[confidence]
 *   Review, confidence <= 2    -> 1 day (start over)
 *   Review, confidence 3       -> 7 days
 *   Review, confidence >= 4    -> double the previous interval, never less than BASE_DAYS[confidence]
 * e.g. (4, null, false) -> 14 · (4, 14, true) -> 28 · (5, 28, true) -> 56 · (4, 3, true) -> 14 · (2, 56, true) -> 1
 */
function nextInterval(confidence, previousInterval, isReview) {
  if (!isReview) return BASE_DAYS[confidence];
  if (confidence <= 2) return 1;
  if (confidence === 3) return BASE_DAYS[3];
  return Math.max(BASE_DAYS[confidence], (previousInterval || 0) * 2);
}

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Computes the next review for a solve logged on `date`. */
function schedule({ confidence, previousInterval, isReview, date }) {
  const interval = nextInterval(confidence, previousInterval, isReview);
  return {
    interval,
    nextReview: addDays(date, interval),
    mastered: interval >= MASTERED_DAYS,
    status: confidence <= 2 ? 'revision' : 'solved',
  };
}

module.exports = { BASE_DAYS, MASTERED_DAYS, nextInterval, schedule, addDays };
