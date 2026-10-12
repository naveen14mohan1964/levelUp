import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../api.js';

// Links in replies open in a new tab. react-markdown never renders raw HTML, so replies can't inject markup.
const MD_COMPONENTS = {
  a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
};

export function MentorMarkdown({ text }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>{text}</ReactMarkdown>;
}

/**
 * One mentor conversation (a "thread"), stored in SQL Server so you can come back to it.
 * - `actions`: render-prop for mode-specific buttons, called with send(body, displayText)
 * - `autoStart`: a request to send automatically when the thread is empty (e.g. "explain this lesson")
 * - `chatMode`: which mode free-text messages use (chat for most threads, mock for the interview)
 */
export default function MentorChat({ thread, actions, autoStart, chatMode = 'chat', placeholder = 'Ask your mentor anything…', extraBody }) {
  const [messages, setMessages] = useState(null);
  const [pending, setPending] = useState(null); // display text of the message being answered
  const [input, setInput] = useState('');
  const [error, setError] = useState(null);
  const endRef = useRef(null);
  const started = useRef(false);

  async function send(body, display) {
    setPending(display || body.message || '…');
    setError(null);
    try {
      const r = await api.mentorAsk({ thread, mode: chatMode, ...extraBody, ...body });
      setMessages(r.messages);
      if (r.removedLinks) setError(`Removed ${r.removedLinks} link(s) the AI made up. Only verified links are shown.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setPending(null);
    }
  }

  useEffect(() => {
    setMessages(null);
    started.current = false;
    api.mentorThread(thread).then(setMessages).catch((e) => setError(e.message));
  }, [thread]);

  useEffect(() => {
    if (messages && messages.length === 0 && autoStart && !started.current) {
      started.current = true;
      send(autoStart.body, autoStart.display);
    }
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, pending]);

  function submit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending) return;
    setInput('');
    send({ mode: chatMode, message: text }, text);
  }

  async function clear() {
    if (!confirm('Clear this conversation?')) return;
    await api.mentorClear(thread);
    started.current = true; // don't auto-start again after an explicit clear
    setMessages([]);
  }

  return (
    <div className="mentor-chat">
      {actions && <div className="mentor-actions">{actions(send, !!pending)}</div>}

      <div className="mentor-messages" aria-live="polite">
        {messages === null && <div className="muted small">Loading conversation…</div>}
        {messages?.length === 0 && !pending && <div className="muted small mentor-empty">No messages yet. Pick an action above or ask a question.</div>}
        {messages?.map((m) => (
          <div key={m.id} className={`bubble ${m.role === 'user' ? 'me' : 'ai'}`}>
            {m.role === 'user' ? <div className="bubble-text">{m.content}</div> : <MentorMarkdown text={m.content} />}
          </div>
        ))}
        {pending && (
          <>
            <div className="bubble me"><div className="bubble-text">{pending}</div></div>
            <div className="bubble ai thinking"><span /><span /><span /> <span className="muted small">Mentor is thinking (5–20 s)…</span></div>
          </>
        )}
        <div ref={endRef} />
      </div>

      {error && <div className="form-error">{error}</div>}

      <form className="mentor-input" onSubmit={submit}>
        <textarea
          rows={2} value={input} placeholder={placeholder} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) submit(e); }}
        />
        <div className="mentor-input-actions">
          <button className="btn primary" disabled={!input.trim() || !!pending}>Send</button>
          {messages?.length > 0 && <button type="button" className="link-btn" onClick={clear}>Clear</button>}
        </div>
      </form>
    </div>
  );
}
