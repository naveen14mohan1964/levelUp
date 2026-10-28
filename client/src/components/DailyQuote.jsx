import { Quotes } from '@phosphor-icons/react';
import { todayISO } from '../dates.js';
import { quoteFor } from '../lib/quotes.js';

/** Today's motivation quote: a new one every day (same all day). */
export default function DailyQuote() {
  const q = quoteFor(todayISO());
  return (
    <figure className="card daily-quote">
      <div className="daily-quote-label"><Quotes size={16} weight="fill" aria-hidden="true" /> Today's quote</div>
      <blockquote>“{q.text}”</blockquote>
      <figcaption>{q.author}</figcaption>
    </figure>
  );
}
