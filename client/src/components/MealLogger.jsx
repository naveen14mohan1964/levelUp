import { useState } from 'react';
import { api } from '../api.js';

export const MEAL_TYPES = ['breakfast', 'lunch', 'snack', 'dinner'];
const LABEL = { breakfast: '🍳 Breakfast', lunch: '🍛 Lunch', snack: '🥜 Snack', dinner: '🍲 Dinner' };
export const mealLabel = (t) => LABEL[t] || t;

function defaultMealType() {
  const h = new Date().getHours();
  return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 19 ? 'snack' : 'dinner';
}

// Phone photos are 3–8 MB; 1280px JPEG is plenty for the AI and uploads ~10× faster.
async function shrinkImage(file, max = 1280) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file; // e.g. HEIC: send as-is
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
  return new File([blob], 'meal.jpg', { type: 'image/jpeg' });
}

/** 📸 photo or ✍️ description → Gemini estimate → you review/edit → saved to SQL Server. */
export default function MealLogger({ date, onSaved }) {
  const [mode, setMode] = useState(null); // photo | text | manual
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [note, setNote] = useState('');
  const [mealType, setMealType] = useState(defaultMealType);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // { estimate, photo_path, photo_url, source }
  const [form, setForm] = useState(null);

  function reset() {
    setMode(null); setFile(null); setPreview(null); setNote(''); setResult(null); setForm(null); setError(null);
  }

  async function pickFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(await shrinkImage(f).catch(() => f));
    setPreview(URL.createObjectURL(f));
    setMode('photo');
  }

  async function analyze() {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      if (file) fd.append('photo', file);
      fd.append('note', note);
      fd.append('date', date);
      const r = await api.analyzeMeal(fd);
      setResult(r);
      const t = r.estimate.total;
      setForm({ title: r.estimate.title, calories: t.calories, protein_g: t.protein_g, carbs_g: t.carbs_g, fat_g: t.fat_g });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const meal = await api.saveMeal({
        date, meal_type: mealType, ...form,
        items: result?.estimate.items, source: result?.source || 'manual', confidence: result?.estimate.confidence,
        notes: result ? [result.estimate.notes, note && `You said: ${note}`].filter(Boolean).join(' · ') : note || null,
        photo_path: result?.photo_path,
      });
      onSaved(meal);
      reset();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  if (!mode) {
    return (
      <div className="meal-actions">
        <label className="btn primary file-btn">
          📸 Snap / upload a meal
          <input type="file" accept="image/*" capture="environment" onChange={pickFile} hidden />
        </label>
        <button className="btn" onClick={() => setMode('text')}>✍️ Describe it</button>
        <button className="btn" onClick={() => { setMode('manual'); setForm({ title: '', calories: '', protein_g: '', carbs_g: '', fat_g: '' }); }}>➕ Manual</button>
      </div>
    );
  }

  return (
    <div className="meal-logger">
      <div className="row gap wrap center-v">
        <select value={mealType} onChange={(e) => setMealType(e.target.value)}>
          {MEAL_TYPES.map((t) => <option key={t} value={t}>{mealLabel(t)}</option>)}
        </select>
        <button className="link-btn" onClick={reset}>Cancel</button>
      </div>

      {preview && <img src={preview} alt="Your meal" className="meal-preview" />}

      {!result && mode !== 'manual' && (
        <>
          <textarea
            className="notes" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={mode === 'photo' ? 'Optional: help the AI, e.g. "2 rotis, half the rice, 1 tsp ghee"' : 'What did you eat? e.g. "3-egg omelette, 2 brown bread slices, black coffee"'}
          />
          <button className="btn primary" disabled={busy || (mode === 'text' && !note.trim())} onClick={analyze}>
            {busy ? '🤖 Estimating… (10–20 s)' : '🤖 Estimate calories'}
          </button>
        </>
      )}

      {result && (
        <div className="estimate">
          <div className="row gap center-v wrap">
            <strong>{result.estimate.title}</strong>
            <span className={`pill conf-${result.estimate.confidence}`}>{result.estimate.confidence} confidence</span>
          </div>
          {result.estimate.items.length > 0 && (
            <table className="data-table">
              <thead><tr><th>Item</th><th>Portion</th><th>kcal</th><th>P</th><th>C</th><th>F</th></tr></thead>
              <tbody>
                {result.estimate.items.map((it, i) => (
                  <tr key={i}><td>{it.name}</td><td className="muted">{it.portion}</td><td>{it.calories}</td><td>{it.protein_g}</td><td>{it.carbs_g}</td><td>{it.fat_g}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          {result.estimate.notes && <p className="small muted">🔎 {result.estimate.notes}</p>}
          {result.estimate.tip && <p className="small">💡 {result.estimate.tip}</p>}
          <p className="small muted">Estimates are ±20%. Adjust the numbers below if you know better, then save.</p>
        </div>
      )}

      {form && (
        <div className="macro-form">
          <label className="field wide"><span className="field-label">Meal</span><input value={form.title} onChange={set('title')} placeholder="e.g. Chicken curry + 2 rotis" /></label>
          <label className="field"><span className="field-label">kcal</span><input type="number" min="0" value={form.calories} onChange={set('calories')} /></label>
          <label className="field"><span className="field-label">Protein g</span><input type="number" min="0" value={form.protein_g} onChange={set('protein_g')} /></label>
          <label className="field"><span className="field-label">Carbs g</span><input type="number" min="0" value={form.carbs_g} onChange={set('carbs_g')} /></label>
          <label className="field"><span className="field-label">Fat g</span><input type="number" min="0" value={form.fat_g} onChange={set('fat_g')} /></label>
          <button className="btn primary" disabled={busy || !form.title || form.calories === ''} onClick={save}>{busy ? 'Saving…' : 'Save meal'}</button>
        </div>
      )}
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}
