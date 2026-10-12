import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { todayISO } from '../dates.js';

const TABS = [
  { to: '/dsa', label: 'Today', match: (p) => p === '/dsa' || p.startsWith('/dsa/day/') },
  { to: '/dsa/problems', label: 'Problems', match: (p) => p.startsWith('/dsa/problems') },
  { to: '/dsa/review', label: 'Review', match: (p) => p.startsWith('/dsa/review'), badge: true },
  { to: '/dsa/plan', label: 'Roadmap', match: (p) => p.startsWith('/dsa/plan') },
];

export default function DsaLayout() {
  const { pathname } = useLocation();
  const [due, setDue] = useState(0);

  // Refresh the "due" badge whenever you switch tabs (cheap query).
  useEffect(() => {
    api.reviewQueue(todayISO()).then((r) => setDue(r.due.length)).catch(() => {});
  }, [pathname]);

  return (
    <>
      <div className="page-head">
        <h1>🧠 DSA</h1>
        <nav className="tabs">
          {TABS.map((t) => (
            <Link key={t.to} to={t.to} className={`tab${t.match(pathname) ? ' active' : ''}`}>
              {t.label}
              {t.badge && due > 0 && <span className="tab-badge">{due}</span>}
            </Link>
          ))}
        </nav>
      </div>
      <Outlet />
    </>
  );
}
