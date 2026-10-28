import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { areaByKey } from '../areas.js';
import { ErrorBox, Loading, ProgressBar, ProgressRing } from '../components/ui.jsx';
import LevelMap, { LessonRow } from '../components/LevelMap.jsx';
import LessonCard from '../components/LessonCard.jsx';
import { EmptyState } from '../components/fx.jsx';

/**
 * System design modules (/lld, /hld): Today (your next lesson) + Roadmap (a level map where lessons unlock one by one).
 * Data: GET /api/learn/:track (content + progress) and GET /api/game/track/:track (unlocks).
 */
const TABS = [['today', '🎯 Today'], ['roadmap', '🗺️ Roadmap']];
const SUBTITLE = {
  lld: 'Object-oriented design + machine coding, from OOP to classic interview problems (Java)',
  hld: 'System design, from how the web works to distributed systems and classic interview designs',
  judge: 'Make better calls under uncertainty, and become the engineer who knows the business',
};

export default function Learn({ track }) {
  const area = areaByKey[track];
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'today';
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api.learn(track).then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message)), [track]);
  useEffect(() => { setData(null); load(); }, [load]);
  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!data) return <Loading />;
  const save = (id, body) => api.learnLesson(track, id, body);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{area.icon} {data.title}</h1>
          {track === 'hld' && <Link className="btn drills-link" to="/hld/drills">🏗️ 35-min design drills</Link>}
          <div className="muted small">{SUBTITLE[track]}</div>
        </div>
        <div className="row gap center-v">
          <span className="streak-chip" title="Days in a row with 5+ minutes of learning">{data.streak ? <>🔥 <strong>{data.streak}</strong> day streak</> : '🌱 Start your streak today'}</span>
          <ProgressRing value={data.progress.done} total={data.progress.total} size={54} />
        </div>
      </div>
      <nav className="tabs ai-tabs">
        {TABS.map(([k, label]) => (
          <button key={k} className={`tab${tab === k ? ' active' : ''}`} onClick={() => setParams({ tab: k })}>{label}</button>
        ))}
      </nav>
      {tab === 'today' && <Today data={data} save={save} onChange={load} go={(t) => setParams({ tab: t })} />}
      {tab === 'roadmap' && <Roadmap track={track} data={data} save={save} onChange={load} />}
    </>
  );
}

function Today({ data, save, onChange, go }) {
  const l = data.next;
  if (!l) return <section className="card"><EmptyState icon="🏆" title="Roadmap complete">All {data.progress.total} lessons done. Keep practising with mock interviews and real architecture write-ups.</EmptyState></section>;
  const level = data.levels.find((x) => x.n === l.level);
  return (
    <>
      <section className="card">
        <div className="stat-row ai-stats">
          <div className="stat">{data.progress.done ? <><strong>{data.progress.done}/{data.progress.total}</strong><span>lessons done</span></> : <><strong>{data.progress.total}</strong><span>lessons · your first one is ready</span></>}</div>
          <div className="stat">{data.thisWeek ? <><strong>{data.thisWeek}</strong><span>this week (aim for 5)</span></> : <><strong>5</strong><span>lessons is a great week</span></>}</div>
          <div className="stat"><strong>Level {l.level}/{data.levels.length}</strong><span>{level.title}</span></div>
        </div>
        <ProgressBar value={level.done} total={level.total} />
        <div className="small muted top-gap-sm">🎯 Level goal: {level.goal}</div>
      </section>
      <LessonCard key={l.id} lesson={l} onSave={save} onChange={onChange} expanded status="current" />
      <section className="card subtle small">
        Builds go into your own practice repo (and some into Level Up itself), so every level leaves something to show in interviews.
        {' '}<button className="link-btn" onClick={() => go('roadmap')}>See the whole roadmap →</button>
      </section>
    </>
  );
}

function Roadmap({ track, data, save, onChange }) {
  const [map, setMap] = useState(null);
  const [error, setError] = useState(null);
  const loadMap = useCallback(() => api.gameTrack(track).then((r) => { setMap(r.track); setError(null); }).catch((e) => setError(e.message)), [track]);
  useEffect(() => { loadMap(); }, [loadMap, data]); // data changes after every save → the map follows
  if (error) return <ErrorBox error={error} onRetry={loadMap} />;
  if (!map) return <Loading />;
  const content = new Map(data.levels.flatMap((lv) => lv.lessons).map((x) => [x.id, x]));
  return (
    <>
      <p className="muted small">{data.about}</p>
      <LevelMap
        track={map}
        renderLesson={(x) => (x.status === 'locked'
          ? <LessonRow lesson={x} meta={`~${x.minutes} min`} />
          : <LessonCard lesson={content.get(x.ref)} onSave={save} onChange={onChange} expanded={x.status === 'current'} status={x.status} />)}
      />
    </>
  );
}
