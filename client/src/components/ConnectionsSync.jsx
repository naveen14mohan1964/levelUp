import { useState } from 'react';
import { api } from '../api.js';

/**
 * Connections sync (adapted from a relationship-intelligence tool's "Integrations → Connections sync"):
 * LinkedIn's API never shares your connection list, so you drop in LinkedIn's official Connections.csv export.
 * Preview first, then import: dedupe by URL → email → name + company, fill only empty fields, detect company moves.
 */
export default function ConnectionsSync({ last, onDone, compact = false }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [over, setOver] = useState(false);

  async function read(f) {
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) { setError('Pick the Connections.csv file from your LinkedIn export (a .csv file).'); return; }
    setBusy(true); setDone(null); setError(null);
    try {
      const csv = await f.text();
      setFile({ name: f.name, csv });
      setPreview(await api.refImport(csv, { dryRun: true }));
    } catch (err) { setError(err.message); setPreview(null); } finally { setBusy(false); }
  }
  async function run() {
    setBusy(true);
    try {
      const r = await api.refImport(file.csv, { fileName: file.name });
      setDone(r); setPreview(null); setFile(null);
      onDone?.(r);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  const shown = done || preview;
  const tiles = shown
    ? [['Fetched', shown.rows], ['New', shown.added], ['Merged', shown.merged], ['Moved company', shown.moved.length], ['Accepted you', shown.accepted], ['Skipped', shown.skipped]]
    : last ? [['Fetched', last.rows_read], ['New', last.added], ['Merged', last.merged], ['Moved company', last.moved], ['Accepted you', last.accepted], ['Skipped', last.skipped]] : null;

  return (
    <div className="conn-sync">
      {tiles && (
        <>
          <div className="small muted">{done ? '✅ Just imported' : preview ? `👀 Preview of ${file?.name}: nothing changes until you press Import` : `Last sync ${new Date(last.at_ms).toLocaleString('en-IN')}${last.file_name ? ` · ${last.file_name}` : ''}`}</div>
          <div className="conn-tiles">{tiles.map(([k, v]) => <div key={k} className="conn-tile"><span>{k}</span><strong>{v}</strong></div>)}</div>
        </>
      )}
      {shown?.moved?.length > 0 && (
        <ul className="small conn-moved">
          {shown.moved.slice(0, 8).map((m) => <li key={m.id}>🔀 <strong>{m.name}</strong>: {m.from} → {m.to}{m.target ? ` · Tier ${m.tier} target` : ''}</li>)}
        </ul>
      )}
      {preview && (
        <div className="row gap wrap top-gap-sm">
          <button className="btn primary" disabled={busy} onClick={run}>Import {preview.rows} connections</button>
          <button className="btn" onClick={() => { setPreview(null); setFile(null); }}>Cancel</button>
          {preview.newAtTargets > 0 && <span className="small ok-text">{preview.newAtTargets} new people at your target companies</span>}
        </div>
      )}
      {!preview && (
        <label className={`conn-drop${over ? ' over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); read(e.dataTransfer.files?.[0]); }}>
          <input type="file" accept=".csv,text/csv" hidden disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; read(f); }} />
          <strong>{busy ? 'Reading…' : '⬆ Drop Connections.csv here, or click to choose'}</strong>
          {!compact && <span className="small muted">LinkedIn → Me → Settings &amp; Privacy → Data privacy → Get a copy of your data → <strong>Connections</strong> → Request archive (~10 min)</span>}
        </label>
      )}
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}
