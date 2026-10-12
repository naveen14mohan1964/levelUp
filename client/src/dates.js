// All plan dates are plain 'YYYY-MM-DD' strings in local time.

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parse(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatLong(iso) {
  return parse(iso).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatShort(iso) {
  return parse(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatRange(a, b) {
  const opts = { day: 'numeric', month: 'short' };
  return `${parse(a).toLocaleDateString('en-IN', opts)} – ${parse(b).toLocaleDateString('en-IN', opts)}`;
}

export function minutesLabel(min) {
  if (!min) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}
