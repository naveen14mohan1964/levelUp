import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Free image tools you can paste the prompt into (you generate, download, then attach here).
const TOOLS = [
  ['Microsoft Designer (free)', 'https://designer.microsoft.com/image-creator'],
  ['Gemini', 'https://gemini.google.com/app'],
  ['ChatGPT', 'https://chatgpt.com/'],
];

/**
 * Post image: the AI suggests an image prompt for this post; you generate the image in any tool and attach it here
 * (choose, drag-and-drop, or paste with Ctrl+V). It's published with the post through the LinkedIn MCP server.
 */
export default function PostImage({ post, onChange }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [alt, setAlt] = useState(post.image_alt || '');
  const [over, setOver] = useState(false);
  const locked = post.status === 'posted';
  useEffect(() => setAlt(post.image_alt || ''), [post.id, post.image_alt]);

  async function act(label, fn) {
    setBusy(label); setError(null);
    try { await fn(); await onChange(); } catch (e) { setError(e.message); } finally { setBusy(null); }
  }
  function attach(file) {
    if (!file) return;
    if (!/^image\/(jpeg|png|gif)$/.test(file.type)) { setError('LinkedIn accepts JPG, PNG or GIF images. Save your image in one of those formats.'); return; }
    if (file.size > 8 * 1024 * 1024) { setError('That image is over 8 MB: export it smaller (1080×1080 is plenty).'); return; }
    const fd = new FormData();
    fd.append('image', file, file.name || 'image.png');
    fd.append('alt', alt);
    act('attach', () => api.liAttachImage(post.id, fd));
  }
  // Paste an image straight from the clipboard (e.g. right-click → Copy image in Designer/Gemini, then Ctrl+V here).
  function onPaste(e) {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (item) { e.preventDefault(); attach(item.getAsFile()); }
  }
  async function copyPrompt() {
    try { await navigator.clipboard.writeText(post.image_prompt); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { setError('Copy failed: select the prompt text and copy it manually.'); }
  }

  return (
    <div className="post-image" onPaste={locked ? undefined : onPaste}>
      <div className="row center-v wrap" style={{ justifyContent: 'space-between', gap: '0.4rem' }}>
        <strong className="small">🖼️ Image</strong>
        {!locked && <span className="small muted">An image helps your post stand out in the feed</span>}
      </div>

      {post.image_url ? (
        <div className="post-image-attached">
          <a href={post.image_url} target="_blank" rel="noreferrer"><img src={post.image_url} alt={post.image_alt || ''} /></a>
          <div className="post-image-side">
            <label className="field">
              <span className="field-label">Alt text (describes the image for screen-reader users)</span>
              <input className="search" value={alt} maxLength={300} disabled={locked} onChange={(e) => setAlt(e.target.value)}
                onBlur={() => alt !== (post.image_alt || '') && act('alt', () => api.liImageAlt(post.id, alt))} />
            </label>
            {!locked && (
              <div className="row gap wrap">
                <label className="btn small-btn file-btn">↻ Replace<input type="file" accept="image/jpeg,image/png,image/gif" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; attach(f); }} /></label>
                <button className="link-btn small" disabled={!!busy} onClick={() => confirm('Remove this image from the post?') && act('remove', () => api.liRemoveImage(post.id))}>Remove</button>
              </div>
            )}
            {['approved', 'scheduled'].includes(post.status) && <div className="small muted">Changing the image sends the post back to draft, so you re-approve exactly what's published.</div>}
          </div>
        </div>
      ) : locked ? <div className="small muted">Published without an image.</div> : (
        <>
          {post.image_prompt ? (
            <div className="post-image-prompt">
              <div className="row center-v wrap" style={{ justifyContent: 'space-between', gap: '0.4rem' }}>
                <span className="small"><strong>1.</strong> Copy this prompt into an image tool:</span>
                <span className="row gap">
                  <button className="btn small-btn" onClick={copyPrompt}>{copied ? 'Copied ✓' : 'Copy prompt'}</button>
                  <button className="link-btn small" disabled={!!busy} onClick={() => act('prompt', () => api.liImagePrompt(post.id))}>{busy === 'prompt' ? 'Writing…' : '↻ New prompt'}</button>
                </span>
              </div>
              <p className="small">{post.image_prompt}</p>
              <div className="row gap wrap small">{TOOLS.map(([label, url]) => <a key={url} href={url} target="_blank" rel="noreferrer">{label} ↗</a>)}</div>
            </div>
          ) : (
            <button className="btn small-btn" disabled={!!busy} onClick={() => act('prompt', () => api.liImagePrompt(post.id))}>
              {busy === 'prompt' ? '🎨 Writing a prompt…' : '🎨 Suggest an image prompt for this post'}
            </button>
          )}
          <label className={`post-image-drop${over ? ' over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); attach(e.dataTransfer.files?.[0]); }}>
            <input type="file" accept="image/jpeg,image/png,image/gif" hidden disabled={!!busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; attach(f); }} />
            <span className="small"><strong>{post.image_prompt ? '2. ' : ''}{busy === 'attach' ? 'Uploading…' : '⬆ Attach your image'}</strong>: click, drag it here, or copy the image and press Ctrl+V on this card</span>
          </label>
        </>
      )}
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}
