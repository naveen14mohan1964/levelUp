import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle, Clock, Lightning, Play, Warning, Sparkle, X, ArrowRight, GitPullRequest, Sliders } from '@phosphor-icons/react';
import { api } from '../api.js';
import { burst } from '../lib/celebrate.js';
import { refreshGame } from '../game.jsx';
import Buddy from './Buddy.jsx';
import '../styles-neurosprint.css';

// Web Audio micro-chimes (zero external sound assets needed)
function playTone(freq, type = 'sine', duration = 0.15) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {}
}

const PHASES = ['1. Shock Trap', '2. Concept Tunnel', '3. Interactive Sim', '4. Junior PR', '5. Victory'];

export default function NeuroSprint({ lesson, track = 'general', onComplete, onClose }) {
  const [pack, setPack] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [phase, setPhase] = useState(0); // 0: trap, 1: chunks, 2: sim, 3: pr, 4: win
  const [timeLeft, setTimeLeft] = useState(120); // 120s limbic contract
  const [completed, setCompleted] = useState(false);

  // Phase 1: Trap state
  const [selectedTrap, setSelectedTrap] = useState(null);
  const [trapRevealed, setTrapRevealed] = useState(false);

  // Phase 2: Monochunk state
  const [chunkIndex, setChunkIndex] = useState(0);

  // Phase 3: Sim state
  const [simSlider, setSimSlider] = useState(50);
  const [simToggle, setSimToggle] = useState(false);

  // Phase 4: Junior PR state
  const [selectedPrChoice, setSelectedPrChoice] = useState(null);
  const [prRevealed, setPrRevealed] = useState(false);

  const victoryCardRef = useRef(null);

  // Load sprint pack on mount
  useEffect(() => {
    let active = true;
    api.neurosprint({
      track,
      lessonId: lesson.id || lesson.ref,
      title: lesson.title,
      learn: lesson.learn,
      check: lesson.check,
      build: lesson.build,
    })
      .then((data) => {
        if (!active) return;
        setPack(data);
        if (data.simulation) {
          setSimSlider(data.simulation.initial || 50);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message);
        setLoading(false);
      });
    return () => { active = false; };
  }, [lesson, track]);

  // 120s timer countdown
  useEffect(() => {
    if (phase >= 4) return; // paused on victory
    const timer = setInterval(() => {
      setTimeLeft((t) => (t > 0 ? t - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // Keyboard navigation: Spacebar / ArrowRight advances chunks in Phase 1
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (phase === 1 && (e.code === 'Space' || e.key === 'ArrowRight')) {
        e.preventDefault();
        nextChunk();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, chunkIndex, pack]);

  function nextChunk() {
    playTone(600, 'triangle', 0.08);
    if (!pack || !pack.monochunks) return;
    if (chunkIndex < pack.monochunks.length - 1) {
      setChunkIndex((i) => i + 1);
    } else {
      setPhase(2); // advance to Simulation
    }
  }

  function handleTrapAnswer(idx) {
    if (trapRevealed) return;
    setSelectedTrap(idx);
    setTrapRevealed(true);
    if (idx === pack.trap.correctIndex) {
      playTone(880, 'sine', 0.2);
    } else {
      playTone(220, 'sawtooth', 0.25);
    }
  }

  function handlePrChoice(idx) {
    if (prRevealed) return;
    setSelectedPrChoice(idx);
    setPrRevealed(true);
    if (idx === pack.prReview.correctChoiceIndex) {
      playTone(880, 'sine', 0.25);
    } else {
      playTone(330, 'sawtooth', 0.2);
    }
  }

  async function triggerVictory() {
    setPhase(4);
    setCompleted(true);
    playTone(523.25, 'sine', 0.15);
    setTimeout(() => playTone(659.25, 'sine', 0.15), 120);
    setTimeout(() => playTone(783.99, 'sine', 0.3), 240);
    if (victoryCardRef.current) burst(victoryCardRef.current);
    try {
      refreshGame();
      if (onComplete) await onComplete();
    } catch {}
  }

  const mm = Math.floor(timeLeft / 60);
  const ss = String(timeLeft % 60).padStart(2, '0');

  return (
    <div className="neurosprint-overlay" role="dialog" aria-modal="true">
      <div className="neurosprint-container">
        {/* Header bar: Timer, Phase Tracker, Close */}
        <header className="neurosprint-head">
          <div className="neurosprint-meta">
            <span className="neurosprint-badge">
              <Lightning weight="fill" /> NeuroSprint
            </span>
            <span className="neurosprint-lesson-title">
              {lesson.id ? <span className="muted">{lesson.id} · </span> : null}{lesson.title}
            </span>
          </div>

          <div className="row center-v gap">
            <div className={`neurosprint-timer${timeLeft <= 20 ? ' warning' : ''}`}>
              <Clock weight="bold" />
              <span>{mm}:{ss}</span>
            </div>
            <button className="icon-btn" onClick={onClose} aria-label="Exit sprint">
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Phase progress tracker */}
        <div className="neurosprint-phases">
          {PHASES.map((name, i) => (
            <div key={name} className={`ns-phase-dot${phase === i ? ' active' : phase > i ? ' done' : ''}`}>
              <div className="dot-circle">{phase > i ? '✓' : i + 1}</div>
              <span className="dot-label">{name}</span>
            </div>
          ))}
        </div>

        {/* Content Body */}
        <main className="neurosprint-body">
          {loading && (
            <div className="ns-loading">
              <div className="ns-spinner" />
              <p>Activating neural pathways for <strong>{lesson.title}</strong>...</p>
            </div>
          )}

          {error && (
            <div className="error-box">
              <p>Failed to load sprint pack: {error}</p>
              <button className="btn" onClick={onClose}>Close</button>
            </div>
          )}

          {!loading && pack && (
            <AnimatePresence mode="wait">
              {/* PHASE 0: The Bayesian Prediction Trap */}
              {phase === 0 && (
                <motion.div
                  key="phase-0"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="ns-step ns-trap"
                >
                  <div className="ns-phase-tag">
                    <Warning size={18} /> Phase 1 · Prediction Error Trigger
                  </div>
                  <h2 className="ns-question">{pack.trap.question}</h2>

                  <div className="ns-options">
                    {pack.trap.options.map((opt, idx) => {
                      let cls = 'ns-opt-btn';
                      if (trapRevealed) {
                        if (idx === pack.trap.correctIndex) cls += ' is-correct';
                        else if (selectedTrap === idx) cls += ' is-wrong';
                      }
                      return (
                        <button
                          key={idx}
                          className={cls}
                          disabled={trapRevealed}
                          onClick={() => handleTrapAnswer(idx)}
                        >
                          <span className="opt-letter">{String.fromCharCode(65 + idx)}</span>
                          <span className="opt-text">{opt}</span>
                        </button>
                      );
                    })}
                  </div>

                  {trapRevealed && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="ns-trap-reveal"
                    >
                      <div className="ns-shock-box">
                        <strong>⚡ The Reality:</strong>
                        <p>{pack.trap.shockFact}</p>
                      </div>
                      <button className="btn primary ns-next-btn" onClick={() => { playTone(500); setPhase(1); }}>
                        Enter Concept Tunnel <ArrowRight weight="bold" />
                      </button>
                    </motion.div>
                  )}
                </motion.div>
              )}

              {/* PHASE 1: Monochunk Concept Tunnel (Strict Zero Scroll, <= 35 words) */}
              {phase === 1 && (
                <motion.div
                  key={`phase-1-${chunkIndex}`}
                  initial={{ opacity: 0, x: 25 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -25 }}
                  className="ns-step ns-chunk-tunnel"
                >
                  <div className="ns-phase-tag">
                    <Sparkle size={18} /> Phase 2 · Monochunk Tunnel ({chunkIndex + 1} of {pack.monochunks.length})
                  </div>

                  <div className="ns-chunk-card">
                    <h3 className="ns-chunk-title">{pack.monochunks[chunkIndex].title}</h3>
                    <p className="ns-chunk-text">{pack.monochunks[chunkIndex].text}</p>
                    <div className="ns-chunk-anchor">
                      <code>{pack.monochunks[chunkIndex].anchor}</code>
                    </div>
                  </div>

                  <div className="ns-chunk-actions">
                    <span className="small muted">Tip: Press [Space] or [→] to advance</span>
                    <button className="btn primary" onClick={nextChunk}>
                      {chunkIndex < pack.monochunks.length - 1 ? 'Next Principle →' : 'Launch Live Simulation →'}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* PHASE 2: Enactive Interactive Simulation Sandbox */}
              {phase === 2 && (
                <motion.div
                  key="phase-2"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="ns-step ns-sim"
                >
                  <div className="ns-phase-tag">
                    <Sliders size={18} /> Phase 3 · Enactive Micro-Simulation
                  </div>

                  <h2>{pack.simulation.title}</h2>
                  <p className="muted small">{pack.simulation.description}</p>

                  <div className="ns-sim-board">
                    <div className="ns-control-group">
                      <label className="row wrap center-v" style={{ justifyContent: 'space-between' }}>
                        <span>{pack.simulation.sliderLabel}: <strong>{simSlider}</strong></span>
                        <span className="small muted">min: {pack.simulation.min || 10} · max: {pack.simulation.max || 1000}</span>
                      </label>
                      <input
                        type="range"
                        className="ns-slider"
                        min={pack.simulation.min || 10}
                        max={pack.simulation.max || 1000}
                        value={simSlider}
                        onChange={(e) => {
                          setSimSlider(Number(e.target.value));
                          playTone(200 + Number(e.target.value), 'sine', 0.04);
                        }}
                      />
                    </div>

                    <div className="ns-toggle-group">
                      <label className="row center-v gap">
                        <input
                          type="checkbox"
                          checked={simToggle}
                          onChange={(e) => {
                            setSimToggle(e.target.checked);
                            playTone(e.target.checked ? 750 : 350, 'triangle', 0.1);
                          }}
                        />
                        <strong>{pack.simulation.toggleLabel}</strong>
                      </label>
                    </div>

                    {/* Dynamic reactive gauges */}
                    <div className="ns-metrics-row">
                      <div className="ns-metric">
                        <span className="muted small">Throughput / Health</span>
                        <div className="ns-gauge">
                          <div
                            className="ns-gauge-fill"
                            style={{
                              width: `${simToggle ? Math.max(80, 100 - (simSlider / (pack.simulation.max || 1000)) * 20) : Math.max(5, 100 - (simSlider / (pack.simulation.max || 1000)) * 95)}%`,
                              background: simToggle ? 'var(--success)' : (simSlider > 400 ? 'var(--danger)' : 'var(--warning)'),
                            }}
                          />
                        </div>
                      </div>
                      <div className="ns-metric">
                        <span className="muted small">System State</span>
                        <span className={`status-pill ${simToggle ? 'ok' : (simSlider > 400 ? 'crit' : 'warn')}`}>
                          {simToggle ? 'STABLE & PROTECTED' : (simSlider > 400 ? 'COLLAPSED / SEV-1' : 'DEGRADING')}
                        </span>
                      </div>
                    </div>

                    <div className="ns-causality-box">
                      <strong>Causality Insight:</strong> {pack.simulation.causality}
                    </div>
                  </div>

                  <button className="btn primary ns-next-btn" onClick={() => { playTone(500); setPhase(3); }}>
                    Proceed to Junior PR Review <ArrowRight weight="bold" />
                  </button>
                </motion.div>
              )}

              {/* PHASE 3: Socratic Junior PR Review (Protégé Effect) */}
              {phase === 3 && (
                <motion.div
                  key="phase-3"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="ns-step ns-pr"
                >
                  <div className="ns-phase-tag">
                    <GitPullRequest size={18} /> Phase 4 · Protégé Code Review
                  </div>

                  <div className="ns-buddy-mentor-prompt">
                    <div className="ns-avatar-mini">
                      <Buddy state={prRevealed && selectedPrChoice === pack.prReview.correctChoiceIndex ? 'cheer' : 'study'} />
                    </div>
                    <div className="ns-speech-bubble">
                      <p>"{pack.prReview.juniorComment}"</p>
                    </div>
                  </div>

                  <div className="ns-code-block">
                    <div className="ns-code-header">{pack.prReview.filename}</div>
                    <pre><code>{pack.prReview.code}</code></pre>
                  </div>

                  <h3 className="small muted">Spot the architectural vulnerability:</h3>
                  <div className="ns-options">
                    {pack.prReview.mitigationChoices.map((choice, idx) => {
                      let cls = 'ns-opt-btn';
                      if (prRevealed) {
                        if (idx === pack.prReview.correctChoiceIndex) cls += ' is-correct';
                        else if (selectedPrChoice === idx) cls += ' is-wrong';
                      }
                      return (
                        <button
                          key={idx}
                          className={cls}
                          disabled={prRevealed}
                          onClick={() => handlePrChoice(idx)}
                        >
                          <span className="opt-letter">{idx === 0 ? 'Fix A' : 'Fix B'}</span>
                          <span className="opt-text">{choice}</span>
                        </button>
                      );
                    })}
                  </div>

                  {prRevealed && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="ns-pr-reveal"
                    >
                      <p className="ns-explanation"><strong>Senior Verdict:</strong> {pack.prReview.explanation}</p>
                      <button className="btn primary ns-next-btn" onClick={triggerVictory}>
                        Claim Mastery & Complete Sprint <CheckCircle weight="fill" />
                      </button>
                    </motion.div>
                  )}
                </motion.div>
              )}

              {/* PHASE 4: Victory & 120s Contract Fulfillment */}
              {phase === 4 && (
                <motion.div
                  key="phase-4"
                  ref={victoryCardRef}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="ns-step ns-victory"
                >
                  <div className="ns-victory-icon">🎉</div>
                  <h2>120-Second Contract Fulfilled!</h2>
                  <p className="ns-victory-subtitle">
                    Synaptic long-term potentiation established with zero wall-of-text fatigue.
                  </p>

                  <div className="ns-takeaway-card">
                    <div className="small muted uppercase">Core Takeaway</div>
                    <blockquote>"{pack.takeaway}"</blockquote>
                  </div>

                  <div className="ns-xp-awarded">
                    <Lightning weight="fill" size={24} />
                    <strong>+35 XP Awarded</strong>
                  </div>

                  <div className="row center-v gap wrap justify-center" style={{ marginTop: '1.5rem' }}>
                    <button className="btn primary large" onClick={onClose}>
                      Take the Win & Exit
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </main>
      </div>
    </div>
  );
}
