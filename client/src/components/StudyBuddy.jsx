import { useEffect, useRef, useState } from 'react';
import { useGame } from '../game.jsx';

/**
 * The study buddy: an original ninja-style trainee at his desk (spiky golden hair, orange hoodie, headband with our own
 * ⚡ emblem) who mirrors what you're doing:
 *   idle        reading, blinking            studying    writing (a focus timer is running)
 *   focused     15+ min in: lamp glows, tea steams, a little "focus aura"
 *   distracted  looks at you, taps his watch (the camera focus guard, Stage 2)
 *   break       stretches after a session     celebrate   jumps with a fist pump when you earn XP
 *   sleepy      after 22:30 with nothing running: yawns, "z z z"
 * Pure SVG + CSS (styles-buddy.css). Only transform/opacity animate; with "reduce motion" he simply holds the pose.
 */
export const BUDDY_STATES = ['idle', 'studying', 'focused', 'watching', 'distracted', 'break', 'celebrate', 'sleepy'];
export const CAPTION = {
  idle: 'Training time. Ready when you are.',
  studying: 'Scroll by scroll. Keep writing.',
  focused: 'Focus mode: on. Don\'t break the flow.',
  watching: 'I\'m watching 👀 Keep going.',
  distracted: 'Hey! Eyes on the mission.',
  break: 'Stretch, water, back in 5.',
  celebrate: 'Not giving up today! That counts!',
  sleepy: 'Even ninjas sleep. Rest up.',
};

/** Pick the buddy's state from the game (focus timer, XP gained) and the clock. */
export function useBuddyState({ distracted = false, watching = false } = {}) {
  const { game, gained } = useGame();
  const [celebrating, setCelebrating] = useState(false);
  const [onBreak, setOnBreak] = useState(false);
  const [, tick] = useState(0);
  const wasRunning = useRef(false);
  const running = !!game?.focus;

  useEffect(() => {
    if (!gained) return undefined;
    setCelebrating(true);
    const t = setTimeout(() => setCelebrating(false), 4500);
    return () => clearTimeout(t);
  }, [gained]);
  useEffect(() => {
    // a session just ended → 5-minute break pose
    if (wasRunning.current && !running) {
      setOnBreak(true);
      const t = setTimeout(() => setOnBreak(false), 5 * 60 * 1000);
      wasRunning.current = running;
      return () => clearTimeout(t);
    }
    wasRunning.current = running;
    return undefined;
  }, [running]);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 60_000); return () => clearInterval(t); }, []); // clock-based states

  if (running && distracted) return 'distracted'; // the alarm outranks the XP fist pump
  if (celebrating) return 'celebrate';
  if (running && watching) return 'watching'; // the camera focus guard is on and you're focused
  if (running) return (game.focus.elapsedMin ?? 0) >= 15 ? 'focused' : 'studying';
  if (onBreak) return 'break';
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  if (h >= 22.5 || h < 5) return 'sleepy';
  return 'idle';
}

const HAIR = '#F6C945';
const HAIR_DARK = '#E0A82E';
const SKIN = '#F5CBA7';
const HOODIE = '#F97316';
const HOODIE_DARK = '#1F2937';

export default function StudyBuddy({ state = 'idle', size = 260, caption = true, className = '', gaze = { x: 0, y: 0 }, approve = false }) {
  const hour = new Date().getHours();
  const night = hour >= 19 || hour < 6;
  const gx = (gaze?.x || 0) * 1.6; // pupils follow your face (camera focus guard)
  const gy = (gaze?.y || 0) * 1.2;
  const eyes = state === 'distracted' || state === 'watching' ? 'front' : state === 'break' || state === 'sleepy' ? 'closed' : state === 'celebrate' ? 'happy' : 'down';
  return (
    <figure className={`buddy buddy-${state}${night ? ' night' : ''}${approve ? ' approve' : ''} ${className}`} style={{ maxWidth: size }}>
      <svg viewBox="0 0 320 240" role="img" aria-label={`Study buddy: ${state}. ${CAPTION[state]}`}>
        <defs>
          <linearGradient id="buddy-lamp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FDE68A" stopOpacity="0.85" />
            <stop offset="1" stopColor="#FDE68A" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* window */}
        <g className="b-window">
          <rect x="196" y="18" width="96" height="74" rx="6" className="b-sky" />
          {night ? (
            <g className="b-moon"><circle cx="268" cy="40" r="10" fill="#E2E8F0" /><circle cx="273" cy="36" r="9" className="b-sky-fill" /></g>
          ) : (
            <circle cx="266" cy="42" r="10" fill="#FDE68A" className="b-sun" />
          )}
          {night && [[214, 34], [236, 58], [282, 70], [222, 76]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.4" fill="#E2E8F0" className="b-star" />)}
          <path d="M196 55 H292 M244 18 V92" stroke="#334155" strokeWidth="3" />
          <rect x="196" y="18" width="96" height="74" rx="6" fill="none" stroke="#475569" strokeWidth="4" />
        </g>

        {/* lamp */}
        <g className="b-lamp">
          <path d="M34 172 L34 112 L58 92" stroke="#64748B" strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M44 84 L76 76 L80 100 L50 106 Z" fill="#94A3B8" />
          <path className="b-light" d="M54 104 L80 98 L118 176 L36 176 Z" fill="url(#buddy-lamp)" />
          <ellipse cx="34" cy="174" rx="16" ry="4" fill="#475569" />
        </g>

        {/* focus aura (focused) */}
        <ellipse className="b-aura" cx="160" cy="120" rx="70" ry="78" fill="none" stroke="#FDBA74" strokeWidth="3" strokeDasharray="6 10" />

        {/* the ninja trainee */}
        <g className="b-boy">
          {/* chair back */}
          <rect x="112" y="98" width="96" height="70" rx="14" fill="#1E293B" />
          {/* torso: orange hoodie with dark shoulders + zip */}
          <path className="b-torso" d="M126 176 C126 140 136 122 160 122 C184 122 194 140 194 176 Z" fill={HOODIE} />
          <path d="M128 150 C130 134 140 124 160 122 C180 124 190 134 192 150 C182 138 172 134 160 134 C148 134 138 138 128 150 Z" fill={HOODIE_DARK} />
          <path d="M160 134 V176" stroke="#FED7AA" strokeWidth="2" />
          <circle cx="160" cy="140" r="2.4" fill="#FED7AA" />
          {/* head */}
          <g className="b-head">
            {/* spiky hair behind */}
            <path d="M128 92 L118 70 L134 74 L130 50 L146 62 L150 38 L162 58 L172 36 L178 60 L194 46 L190 70 L204 66 L192 90 Z" fill={HAIR} />
            <circle cx="160" cy="92" r="27" fill={SKIN} />
            {/* headband with our own ⚡ emblem */}
            <path d="M132 78 C140 70 180 70 188 78 L188 86 C180 79 140 79 132 86 Z" fill="#1E3A5F" />
            <rect x="148" y="72" width="24" height="12" rx="2.5" fill="#CBD5E1" />
            <path d="M162 74 l-5 5 h4 l-3 4 l6 -6 h-4 z" fill="#475569" />
            <path d="M188 80 l14 6 l-3 3 M188 83 l12 10" stroke="#1E3A5F" strokeWidth="3" strokeLinecap="round" fill="none" className="b-band-tails" />
            {/* front spikes over the headband */}
            <path d="M136 76 L142 62 L148 72 L154 58 L160 70 L166 56 L172 70 L178 60 L184 76 C176 68 144 68 136 76 Z" fill={HAIR} />
            <path d="M150 70 L154 60 M166 66 L168 58" stroke={HAIR_DARK} strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="133" cy="96" r="5" fill="#EDB98F" />
            <circle cx="187" cy="96" r="5" fill="#EDB98F" />
            {/* eyes */}
            {eyes === 'down' && <g className="b-eyes"><path d="M146 97 q5 4 10 0" className="b-eye-line" /><path d="M164 97 q5 4 10 0" className="b-eye-line" /></g>}
            {eyes === 'front' && (
              <g className="b-eyes b-eyes-open">
                <ellipse cx="151" cy="95" rx="4.2" ry="4.6" fill="#fff" /><ellipse cx="169" cy="95" rx="4.2" ry="4.6" fill="#fff" />
                <circle cx={151 + gx} cy={95.5 + gy} r="2.8" fill="#2563EB" /><circle cx={169 + gx} cy={95.5 + gy} r="2.8" fill="#2563EB" />
                <circle cx={151 + gx} cy={95.5 + gy} r="1.2" fill="#0F172A" /><circle cx={169 + gx} cy={95.5 + gy} r="1.2" fill="#0F172A" />
                <path d="M145 87 l10 -2 M165 85 l10 2" stroke="#B7791F" strokeWidth="2.4" strokeLinecap="round" />
              </g>
            )}
            {eyes === 'closed' && <g className="b-eyes"><path d="M146 96 h10" className="b-eye-line" /><path d="M164 96 h10" className="b-eye-line" /></g>}
            {eyes === 'happy' && <g className="b-eyes"><path d="M146 98 q5 -6 10 0" className="b-eye-line" /><path d="M164 98 q5 -6 10 0" className="b-eye-line" /></g>}
            {/* mouth: a big grin is his default */}
            {state === 'celebrate' ? <path d="M150 105 q10 12 20 0 z" fill="#9F3B4B" />
              : state === 'sleepy' ? <ellipse cx="160" cy="108" rx="4" ry="5" fill="#9F3B4B" className="b-yawn" />
                : state === 'distracted' ? <path d="M154 108 h12" stroke="#9F3B4B" strokeWidth="2.4" strokeLinecap="round" />
                  : <path d="M151 105 q9 7 18 0" stroke="#9F3B4B" strokeWidth="2.6" fill="none" strokeLinecap="round" />}
          </g>
          {/* arms: left (book / watch), right (pen); sleeves match the hoodie */}
          <g className="b-arm-left"><path d="M134 138 C118 150 120 170 136 180" stroke={HOODIE} strokeWidth="13" fill="none" strokeLinecap="round" /><circle cx="137" cy="181" r="7" fill={SKIN} /><rect className="b-watch" x="128" y="170" width="11" height="6" rx="2" fill="#22D3EE" /></g>
          <g className="b-arm-right"><path d="M186 138 C202 150 200 170 184 180" stroke={HOODIE} strokeWidth="13" fill="none" strokeLinecap="round" /><circle cx="183" cy="181" r="7" fill={SKIN} /><path className="b-pen" d="M186 176 l14 -14" stroke="#FBBF24" strokeWidth="3.4" strokeLinecap="round" /></g>
        </g>

        {/* desk + things on it */}
        <rect x="8" y="176" width="304" height="12" rx="4" fill="#3B4A6B" />
        <rect x="20" y="188" width="10" height="46" fill="#2C3A57" /><rect x="290" y="188" width="10" height="46" fill="#2C3A57" />
        <g className="b-book">
          <path d="M120 176 L158 168 L160 176 Z" fill="#E2E8F0" /><path d="M200 176 L162 168 L160 176 Z" fill="#CBD5E1" />
          <path className="b-page" d="M160 176 L162 168 L194 172 L196 176 Z" fill="#F8FAFC" />
          <path d="M132 172 l18 -3 M134 175 l16 -2.6" stroke="#94A3B8" strokeWidth="1.2" />
        </g>
        <g className="b-mug">
          <rect x="248" y="156" width="22" height="20" rx="4" fill="#E2E8F0" /><path d="M270 160 q8 0 8 7 q0 6 -8 6" stroke="#E2E8F0" strokeWidth="3" fill="none" />
          <path className="b-steam s1" d="M254 150 q-4 -6 0 -12 q4 -6 0 -12" stroke="#CBD5E1" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path className="b-steam s2" d="M263 150 q-4 -6 0 -12 q4 -6 0 -12" stroke="#CBD5E1" strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>

        {/* effects */}
        <g className="b-zzz" fill="#C4B5FD" fontFamily="Geist Variable, Geist, sans-serif" fontWeight="700">
          <text className="z1" x="196" y="70" fontSize="14">z</text><text className="z2" x="206" y="56" fontSize="17">z</text><text className="z3" x="218" y="40" fontSize="20">z</text>
        </g>
        <g className="b-stars" fill="#FBBF24">
          {[[96, 60], [226, 64], [110, 120], [214, 120]].map(([x, y], i) => <path key={i} className={`st st${i}`} d={`M${x} ${y - 8} l2.4 5.6 6 .6 -4.6 4 1.4 6 -5.2 -3.2 -5.2 3.2 1.4 -6 -4.6 -4 6 -.6 z`} />)}
        </g>
        <g className="b-thumb"><circle cx="112" cy="70" r="15" fill="#1E293B" stroke="#34D399" strokeWidth="2" /><text x="112" y="76" textAnchor="middle" fontSize="16">👍</text></g>
        <g className="b-eye-badge"><circle cx="292" cy="112" r="11" fill="#0F172A" stroke="#22D3EE" strokeWidth="2" /><text x="292" y="117" textAnchor="middle" fontSize="12">👀</text></g>
        <g className="b-alert"><circle cx="208" cy="58" r="11" fill="#FBBF24" /><text x="208" y="63" textAnchor="middle" fontSize="15" fontWeight="800" fill="#1E1B2E">!</text></g>
      </svg>
      {caption && <figcaption className="buddy-caption" aria-live="polite">{CAPTION[state]}</figcaption>}
    </figure>
  );
}
