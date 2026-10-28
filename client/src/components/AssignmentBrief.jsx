import { ClipboardText } from '@phosphor-icons/react';
import { MentorMarkdown } from './MentorChat.jsx';

/**
 * The full written assignment for a roadmap day (project_tasks.brief, Markdown from server/data/briefs/):
 * why it matters, what to build, steps, acceptance criteria, hints, pitfalls, stretch and self-check questions.
 * Open by default on the day's lesson; collapsed in roadmap rows.
 */
export default function AssignmentBrief({ md, title = 'Full assignment', open = false }) {
  if (!md) return null;
  return (
    <details className="brief" open={open}>
      <summary><ClipboardText size={16} aria-hidden="true" /> {title}</summary>
      <div className="brief-body"><MentorMarkdown text={md} /></div>
    </details>
  );
}
