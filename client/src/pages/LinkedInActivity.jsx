import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ErrorBox, Loading } from '../components/ui.jsx';

const ACTION = {
  draft_generated: '✨ Draft generated', draft_written: '✍️ Draft written', draft_edited: '✏️ Draft edited',
  post_approved: '✅ Approved', post_scheduled: '⏰ Scheduled', post_unscheduled: '↩ Unscheduled', post_publish_now: '🚀 Publish now',
  post_published: '📣 Published', post_deleted: '🗑️ Draft deleted', job_retry_scheduled: '🔁 Retry scheduled', job_failed: '❌ Failed',
  job_missed: '⏭️ Missed slot', job_interrupted: '⚠️ Interrupted', automation_paused: '⏸ Automation paused',
  automation_resumed: '▶ Automation resumed', config_updated: '⚙️ Settings changed',
  request_sent: '🤝 Request sent', request_undone: '↩ Request undone', request_accepted: '✅ Accepted', contacts_added: '➕ People added',
  connections_imported: '📥 Connections imported', list_created: '🗂️ List created', list_updated: '🗂️ List updated', notes_prepared: '✍️ Notes prepared',
  do_not_contact_added: '🚫 Do not contact', do_not_contact_removed: '↩ Contact allowed', outreach_paused_warning: '🧊 Outreach paused (LinkedIn warning)',
  outreach_cooldown_cleared: '▶ Cool-down ended',
};
const when = (ms) => new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** Audit log + job queue: every LinkedIn action by you, the AI or the scheduler. */
export default function LinkedInActivity() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = () => api.liActivity().then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!data) return <Loading />;
  const pending = data.jobs.filter((j) => j.status === 'queued' || j.status === 'running');

  return (
    <>
      <section className="card">
        <div className="row center-v" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>⏳ Queue</h2>
          <button className="link-btn" onClick={load}>Refresh</button>
        </div>
        {pending.length === 0 ? <p className="muted small">Nothing queued.</p> : (
          <table className="data-table top-gap">
            <thead><tr><th>Job</th><th>Due</th><th>Status</th><th>Attempts</th><th>Last error</th></tr></thead>
            <tbody>
              {pending.map((j) => (
                <tr key={j.id}><td>{j.type} #{j.ref_id}</td><td>{when(j.run_ms)}</td><td>{j.status}</td><td>{j.attempts}/{j.max_attempts}</td><td className="muted">{j.last_error || '—'}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2>📜 Activity log</h2>
        {data.audit.length === 0 ? <p className="muted small">No activity yet.</p> : (
          <ul className="li-log">
            {data.audit.map((a) => (
              <li key={a.id}>
                <span className="muted small li-log-time">{when(a.at_ms)}</span>
                <span className={`li-actor li-actor-${a.actor}`}>{a.actor}</span>
                <span>{ACTION[a.action] || a.action}{a.ref_type === 'post' ? ` · post #${a.ref_id}` : ''}</span>
                {a.detail && <span className="muted small li-log-detail">{a.detail}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
