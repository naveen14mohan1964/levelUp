import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { todayISO } from '../dates.js';
import { ErrorBox, Loading } from '../components/ui.jsx';
import { DateNav, Goal, SaveError } from '../components/tracking.jsx';
import MealLogger, { MEAL_TYPES, mealLabel } from '../components/MealLogger.jsx';

const GLASS_ML = 250;

// Meal tracker: calories, protein and water for one day, the food log, and photo/AI logging.
export default function Meals() {
  const params = useParams();
  const navigate = useNavigate();
  const date = params.date || todayISO();
  const goTo = (d) => navigate(d === todayISO() ? '/meals' : `/meals/day/${d}`);

  const [state, setState] = useState(null);
  const [telegram, setTelegram] = useState(null);
  const [error, setError] = useState(null);
  const [saveError, setSaveError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [goals, meals] = await Promise.all([api.goals(date), api.meals(date)]);
      setState({ goals, meals });
    } catch (e) {
      setError(e.message);
    }
  }, [date]);
  useEffect(() => { setState(null); load(); }, [load]);
  useEffect(() => { api.telegram().then(setTelegram).catch(() => {}); }, []);

  async function act(fn) {
    try {
      await fn();
      setSaveError(null);
      await load();
    } catch (e) {
      setSaveError(e.message);
    }
  }

  if (error) return <ErrorBox error={error} />;
  if (!state) return <Loading />;
  const { goals, meals } = state;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>🍽️ Meals</h1>
          <div className="muted small">Calories, protein and water · targets are on <Link to="/settings">Settings</Link></div>
        </div>
        <TelegramChip t={telegram} />
      </div>

      <DateNav date={date} goTo={goTo} />
      <SaveError error={saveError} onDismiss={() => setSaveError(null)} />

      <NutritionGoals date={date} goals={goals} act={act} />
      <FoodLog date={date} goals={goals} meals={meals} act={act} onSaved={load} />
    </>
  );
}

function TelegramChip({ t }) {
  if (!t) return null;
  if (t.configured && t.linked) {
    return <span className="streak-chip" title={`Send meal photos to @${t.botUsername} from your phone`}>📲 Telegram on</span>;
  }
  return <Link className="streak-chip" to="/settings" title="Log meals from your phone with a Telegram bot">📲 Set up phone logging</Link>;
}

function NutritionGoals({ date, goals, act }) {
  const { body, eaten, targets } = goals;
  const water = body.water_ml || 0;
  const glasses = Math.ceil(targets.water_ml / GLASS_ML);
  const remaining = targets.calories - eaten.calories;

  return (
    <section className="card">
      <h2>🎯 Today's nutrition</h2>
      <div className="goals">
        <Goal label="Calories" value={eaten.calories} target={targets.calories} unit="kcal" color="var(--meals)"
          sub={!eaten.calories ? "Log your first meal below" : remaining >= 0 ? `${remaining} left` : `${-remaining} over: no stress, just aim for tomorrow`} />
        <Goal label="Protein" value={Math.round(eaten.protein_g)} target={targets.protein_g} unit="g" color="var(--node)"
          sub={!eaten.protein_g ? "~35 g per meal gets you there" : eaten.protein_g >= targets.protein_g ? 'Target hit 💪' : `${Math.round(targets.protein_g - eaten.protein_g)} g to go`} />
        <Goal label="Water" value={water} target={targets.water_ml} unit="ml" color="var(--dsa)"
          sub={water >= GLASS_ML ? `${Math.floor(water / GLASS_ML)} of ${glasses} glasses` : `${glasses} glasses · start with one`} />
      </div>
      <p className="small muted">
        {eaten.meals
          ? `${eaten.meals} meal${eaten.meals === 1 ? '' : 's'} · carbs ${Math.round(eaten.carbs_g)} g · fat ${Math.round(eaten.fat_g)} g`
          : 'No meals logged yet: snap a photo below, or send one to your Telegram bot.'}
      </p>

      <div className="water-row">
        <div className="glasses" role="img" aria-label={`${Math.floor(water / GLASS_ML)} of ${glasses} glasses`}>
          {Array.from({ length: glasses }, (_, i) => <span key={i} aria-hidden="true" className={i < Math.floor(water / GLASS_ML) ? 'full' : ''}>💧</span>)}
        </div>
        <div className="row gap">
          <button className="btn" onClick={() => act(() => api.addWater(date, -GLASS_ML))} aria-label="Remove a glass">−</button>
          <button className="btn primary" onClick={() => act(() => api.addWater(date, GLASS_ML))}>+ Glass (250 ml)</button>
          <button className="btn" onClick={() => act(() => api.addWater(date, 500))}>+ Bottle (500 ml)</button>
        </div>
      </div>
    </section>
  );
}

function FoodLog({ date, goals, meals, act, onSaved }) {
  const { eaten, targets } = goals;
  return (
    <section className="card">
      <div className="row center-v wrap" style={{ justifyContent: 'space-between', gap: '0.5rem' }}>
        <h2 style={{ margin: 0 }}>🍽️ Food log</h2>
        <span className="small muted">{eaten.meals ? `${eaten.calories} / ${targets.calories} kcal · ${Math.round(eaten.protein_g)} / ${targets.protein_g} g protein` : `Goals today: ${targets.calories} kcal · ${targets.protein_g} g protein`}</span>
      </div>
      <p className="muted small">Snap a photo and the AI estimates calories and macros. You review the numbers before anything is saved.</p>
      <MealLogger date={date} onSaved={onSaved} />

      {meals.length > 0 && (
        <ul className="meals">
          {MEAL_TYPES.flatMap((t) => meals.filter((m) => m.meal_type === t)).map((m) => (
            <li key={m.id} className="meal">
              {m.photo_url ? <img src={m.photo_url} alt="" className="meal-thumb" loading="lazy" /> : <div className="meal-thumb placeholder">{mealLabel(m.meal_type).split(' ')[0]}</div>}
              <div className="meal-main">
                <div className="small muted">{mealLabel(m.meal_type)}{m.source !== 'manual' && ` · 🤖 AI (${m.confidence || 'n/a'})`}</div>
                <div className="meal-title">{m.title}</div>
                <div className="small">{m.calories} kcal · P {m.protein_g} g · C {m.carbs_g} g · F {m.fat_g} g</div>
              </div>
              <button className="btn icon" title="Delete meal" aria-label="Delete meal" onClick={() => confirm(`Delete "${m.title}"?`) && act(() => api.deleteMeal(m.id))}>×</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
