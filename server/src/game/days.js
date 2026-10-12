// Local-calendar day helpers. A "day" is a YYYY-MM-DD string in the laptop's time zone (local midnight to midnight);
// day maths happens on those strings in UTC so it never drifts.
const pad = (n) => String(n).padStart(2, '0');

const localDay = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const addDays = (day, n) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
/** Monday of the day's week (weeks run Mon–Sun). */
const weekStart = (day) => addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));

module.exports = { localDay, addDays, daysBetween, weekStart };
