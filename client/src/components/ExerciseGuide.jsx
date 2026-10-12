import { useState } from 'react';
import StickDemo from './StickDemo.jsx';

// "▶ How to" for one exercise: start/end demo frames looping like a GIF (public-domain images from
// free-exercise-db, stored locally), 3 form cues, and a link to video demos.
export default function ExerciseGuide({ name, guide }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="link-btn small ex-guide-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? '▾ Hide how-to' : '▶ How to do it'}
      </button>
      {open && (
        <div className={`ex-guide${guide.demo || guide.anim ? '' : ' no-demo'}`}>
          {guide.demo ? (
            <div className="ex-demo" title={guide.demoName}>
              <img src={guide.demo[0]} alt={`${name}: start position`} />
              <img src={guide.demo[1]} alt={`${name}: end position`} className="frame-2" />
              <span className="ex-demo-label">{guide.similar ? `Similar move: ${guide.demoName}` : guide.demoName}</span>
            </div>
          ) : guide.anim ? <StickDemo move={guide.anim} label={name} /> : null}
          <div>
            <ol className="ex-cues small">
              {guide.cues.map((c, i) => <li key={i}>{c}</li>)}
            </ol>
            {guide.note && <p className="small muted">{guide.note}</p>}
            <a className="small" href={guide.video} target="_blank" rel="noreferrer">▶ Watch video demos</a>
          </div>
        </div>
      )}
    </>
  );
}
