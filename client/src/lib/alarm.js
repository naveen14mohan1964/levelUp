// Focus guard sounds, made in the browser (Web Audio): no audio files.
//   chime()  a soft two-note "back to it?" (after 15 s of distraction)
//   alarm()  a short repeating beep pattern (after 45 s), played until you're focused again
let ctx = null;
const audio = () => {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
};

function tone(freq, start, duration, { type = 'sine', gain = 0.18 } = {}) {
  const a = audio();
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, a.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, a.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + duration);
  osc.connect(g).connect(a.destination);
  osc.start(a.currentTime + start);
  osc.stop(a.currentTime + start + duration + 0.05);
}

export function chime(volume = 1) {
  tone(880, 0, 0.35, { gain: 0.14 * volume });
  tone(1175, 0.18, 0.5, { gain: 0.12 * volume });
}

export function alarm(volume = 1) {
  for (let i = 0; i < 3; i++) tone(988, i * 0.22, 0.16, { type: 'square', gain: 0.09 * volume });
}

/**
 * "FAAAAAHHH": a breathy "F" (filtered noise) into a long voice-like "aaah" (a buzzing tone through the formants of
 * the vowel "a", pitch falling, with vibrato), squashed by a compressor so it's as loud as it can be. ~2.2 s.
 */
export function faah(volume = 1) {
  const a = audio();
  const t0 = a.currentTime + 0.02;
  const comp = a.createDynamicsCompressor();
  comp.threshold.value = -12; comp.ratio.value = 6;
  comp.connect(a.destination);
  const master = a.createGain();
  master.gain.value = 0.72 * volume; // loud but clean (peak ≈ 0.93, measured offline)
  master.connect(comp);

  // "F"
  const len = Math.floor(a.sampleRate * 0.35);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const noise = a.createBufferSource();
  noise.buffer = buf;
  const hiss = a.createBiquadFilter();
  hiss.type = 'bandpass'; hiss.frequency.value = 4500; hiss.Q.value = 0.7;
  const ng = a.createGain();
  ng.gain.setValueAtTime(0.0001, t0);
  ng.gain.exponentialRampToValueAtTime(0.6, t0 + 0.08);
  ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.33);
  noise.connect(hiss).connect(ng).connect(master);
  noise.start(t0); noise.stop(t0 + 0.36);

  // "AAAAAHHH"
  const v0 = t0 + 0.2;
  const dur = 2;
  const voice = a.createOscillator();
  voice.type = 'sawtooth';
  voice.frequency.setValueAtTime(270, v0);
  voice.frequency.exponentialRampToValueAtTime(135, v0 + dur);
  const vib = a.createOscillator();
  vib.frequency.value = 5.5;
  const vibDepth = a.createGain();
  vibDepth.gain.value = 7;
  vib.connect(vibDepth).connect(voice.frequency);
  const vg = a.createGain();
  vg.gain.setValueAtTime(0.0001, v0);
  vg.gain.exponentialRampToValueAtTime(1, v0 + 0.07);
  vg.gain.setValueAtTime(1, v0 + dur - 0.45);
  vg.gain.exponentialRampToValueAtTime(0.0001, v0 + dur);
  for (const [f, q, g] of [[800, 5, 1], [1200, 7, 0.6], [2600, 9, 0.3]]) { // the formants of "a"
    const bp = a.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    const fg = a.createGain();
    fg.gain.value = g * 3.5;
    voice.connect(bp).connect(fg).connect(vg);
  }
  vg.connect(master);
  voice.start(v0); vib.start(v0);
  voice.stop(v0 + dur + 0.05); vib.stop(v0 + dur + 0.05);
}

// ---- the loud alarm's sounds: "faah" (above) · "padi" (spoken) · "mix" (both, alternating) · "file:<name>" (yours) ----

/** "Padi da, Parama!" / "Padi da, <your name> ehh!" through the browser's text-to-speech: a Tamil voice when there is one, else Indian English. */
const PADI = { ta: 'படி டா, பரமா!', en: 'Padi da, Parama!' };
const TA_NAMES = { naveen: 'நவீன்' }; // Tamil spelling for the Tamil voice (other names are read as written)
const padiMe = (name = 'Naveen') => ({ ta: `படி டா, ${TA_NAMES[name.toLowerCase()] || name} ஏ!`, en: `Padi da, ${name} ehh!` });
let voices = [];
const loadVoices = () => { try { voices = window.speechSynthesis?.getVoices() || []; } catch { voices = []; } };
if (typeof window !== 'undefined' && window.speechSynthesis) { loadVoices(); window.speechSynthesis.onvoiceschanged = loadVoices; }
const pickVoice = () => voices.find((v) => v.lang?.toLowerCase().startsWith('ta')) || voices.find((v) => v.lang === 'en-IN') || null;

function sayPadi(done, line = PADI) {
  const s = window.speechSynthesis;
  if (!s) { faah(); setTimeout(done, 2300); return; }
  const v = pickVoice();
  const u = new SpeechSynthesisUtterance(v?.lang?.toLowerCase().startsWith('ta') ? line.ta : line.en);
  if (v) { u.voice = v; u.lang = v.lang; }
  u.rate = 0.95; u.pitch = 1.15; u.volume = 1;
  let finished = false;
  const end = () => { if (!finished) { finished = true; done(); } };
  u.onend = end; u.onerror = end;
  setTimeout(end, 4000); // some voices never fire onend
  s.speak(u);
}

/** A cinematic "mass entry" hit: a falling sub-bass boom with a dusty crack on top (~1.4 s). */
export function boom(volume = 1) {
  const a = audio();
  const t0 = a.currentTime + 0.02;
  const out = a.createGain();
  out.gain.value = 0.85 * volume;
  out.connect(a.destination);
  const sub = a.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(140, t0);
  sub.frequency.exponentialRampToValueAtTime(38, t0 + 1.2);
  const sg = a.createGain();
  sg.gain.setValueAtTime(0.0001, t0);
  sg.gain.exponentialRampToValueAtTime(1, t0 + 0.02);
  sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.4);
  sub.connect(sg).connect(out);
  sub.start(t0); sub.stop(t0 + 1.45);
  const len = Math.floor(a.sampleRate * 0.5);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const crack = a.createBufferSource();
  crack.buffer = buf;
  const lp = a.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 1800;
  const cg = a.createGain();
  cg.gain.value = 0.6;
  crack.connect(lp).connect(cg).connect(out);
  crack.start(t0);
}

// ---- mass-hero punch dialogues (original / parody lines in a deep built-in voice: the style, not anyone's voice) ----

/** "Dhan… dhan… dhaaan": three brass-like stabs (a buzzy chord through a low-pass filter). */
function brass(volume = 1) {
  const a = audio();
  const t0 = a.currentTime + 0.02;
  const out = a.createGain();
  out.gain.value = 0.5 * volume;
  out.connect(a.destination);
  const lp = a.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 1500; lp.Q.value = 2;
  lp.connect(out);
  [[0, 0.18], [0.26, 0.18], [0.52, 1.1]].forEach(([at, dur]) => {
    for (const f of [146.8, 174.6, 220, 293.7]) { // D minor, with the octave
      const o = a.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 12;
      const g = a.createGain();
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + at + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.connect(g).connect(lp);
      o.start(t0 + at); o.stop(t0 + at + dur + 0.05);
    }
  });
}

/** The entry: a rising whoosh, a metallic "ting" (sunglasses-flip energy), then the boom + brass. */
function sting() {
  const a = audio();
  const t0 = a.currentTime + 0.02;
  const len = Math.floor(a.sampleRate * 0.45);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const n = a.createBufferSource();
  n.buffer = buf;
  const bp = a.createBiquadFilter();
  bp.type = 'bandpass'; bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(400, t0);
  bp.frequency.exponentialRampToValueAtTime(5000, t0 + 0.42);
  const ng = a.createGain();
  ng.gain.setValueAtTime(0.0001, t0);
  ng.gain.exponentialRampToValueAtTime(0.5, t0 + 0.35);
  ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
  n.connect(bp).connect(ng).connect(a.destination);
  n.start(t0);
  for (const [f, g] of [[2637, 0.25], [5274, 0.12], [3951, 0.08]]) { // the ting
    const o = a.createOscillator();
    o.frequency.value = f;
    const og = a.createGain();
    og.gain.setValueAtTime(0.0001, t0 + 0.45);
    og.gain.exponentialRampToValueAtTime(g, t0 + 0.46);
    og.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.3);
    o.connect(og).connect(a.destination);
    o.start(t0 + 0.45); o.stop(t0 + 1.35);
  }
  setTimeout(() => { boom(); brass(); }, 520);
}

/** A punch hit: a short thump with a slap on top. */
function punch() {
  const a = audio();
  const t0 = a.currentTime + 0.01;
  const o = a.createOscillator();
  o.frequency.setValueAtTime(180, t0);
  o.frequency.exponentialRampToValueAtTime(50, t0 + 0.18);
  const g = a.createGain();
  g.gain.setValueAtTime(0.9, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
  o.connect(g).connect(a.destination);
  o.start(t0); o.stop(t0 + 0.25);
  const len = Math.floor(a.sampleRate * 0.08);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const n = a.createBufferSource();
  n.buffer = buf;
  const hg = a.createGain();
  hg.gain.value = 0.7;
  n.connect(hg).connect(a.destination);
  n.start(t0);
}

// {name} = your name. echo: the part that gets the slow-motion echo; punch: the part that lands with a hit.
export const MASS_LINES = [
  { ta: ['படி டா', '{name}', 'ஏ!'], en: ['Padi da', '{name}', 'ehh!'], echo: 1, punch: 2 },
  { ta: ['நான் ஒரு தடவ படிச்சா', 'நூறு தடவ படிச்ச மாதிரி!'], en: ['Naan oru thadava padichaa', 'nooru thadava padichaa maadhiri!'], punch: 1 },
  { ta: ['{name}', 'ஃபோன கீழ வை', 'புக்க மேல எடு!'], en: ['{name}', 'phone-a keela vai', 'book-a mela edu!'], echo: 0, punch: 2 },
  { ta: ['என் வழி', 'DSA வழி!'], en: ['En vazhi', 'DSA vazhi!'], punch: 1 },
  { ta: ['கண்ணா', 'ஃபோகஸ் பண்ணு', 'இண்டர்வியூ வருது!'], en: ['Kanna', 'focus pannu', 'interview varudhu!'], punch: 2 },
];
let massTurn = 0;

/**
 * One mass-hero line (they take turns): the sting, then the dialogue deep and slow in parts with dramatic pauses,
 * a slow-motion echo on one part (it repeats, quieter and slower) and a punch hit before the last word.
 */
function sayMass(done, name = 'Naveen') {
  const s = window.speechSynthesis;
  sting();
  if (!s) { setTimeout(done, 2200); return; }
  const v = pickVoice();
  const ta = v?.lang?.toLowerCase().startsWith('ta');
  const line = MASS_LINES[massTurn++ % MASS_LINES.length];
  const who = ta ? TA_NAMES[name.toLowerCase()] || name : name;
  const parts = (ta ? line.ta : line.en).map((p) => p.replace('{name}', who));
  // the queue: each part, plus its echoes
  const queue = [];
  parts.forEach((text, i) => {
    const last = i === parts.length - 1;
    queue.push({ text, pitch: 0.3, rate: last ? 0.85 : 0.68, volume: 1, punch: line.punch === i, gap: last ? 0 : 380 });
    if (line.echo === i) {
      queue.push({ text, pitch: 0.2, rate: 0.55, volume: 0.45, gap: 60 });
      queue.push({ text, pitch: 0.15, rate: 0.5, volume: 0.2, gap: 380 });
    }
  });
  let i = 0;
  const next = () => {
    if (i >= queue.length) { done(); return; }
    const q = queue[i++];
    const speak = () => {
      const u = new SpeechSynthesisUtterance(q.text);
      if (v) { u.voice = v; u.lang = v.lang; }
      u.pitch = q.pitch; u.rate = q.rate; u.volume = q.volume;
      let finished = false;
      const end = () => { if (!finished) { finished = true; setTimeout(next, q.gap); } };
      u.onend = end; u.onerror = end;
      setTimeout(end, 3500);
      s.speak(u);
    };
    if (q.punch) { punch(); setTimeout(speak, 140); } else speak();
  };
  setTimeout(next, 1500); // after the whoosh, ting, boom and the first brass stabs
}

/**
 * One alarm round: repeats the chosen sound for at least `minMs` (12 s by default, it doesn't stop the moment you
 * look back), then ends. Returns { endsAt, stop() }.
 */
export function playAlarm(kind = 'faah', minMs = 12_000, { name = 'Naveen' } = {}) {
  const me = padiMe(name);
  const endsAt = Date.now() + minMs;
  let stopped = false;
  let timer = null;
  let el = null;
  const next = (ms = 0) => { timer = setTimeout(unit, ms); };
  function unit() {
    if (stopped || Date.now() >= endsAt) return;
    if (kind.startsWith('clipmass:')) { // your clip, then a mass-hero line
      const clip = new Audio(`/uploads/sounds/${encodeURIComponent(kind.slice(9))}`);
      clip.volume = 1;
      const after = () => sayMass(() => next(400), name);
      clip.onended = after; clip.onerror = after;
      clip.play().catch(after);
      el = clip;
      return;
    }
    if (kind.startsWith('file:')) {
      if (!el) { el = new Audio(`/uploads/sounds/${encodeURIComponent(kind.slice(5))}`); el.onended = () => next(200); el.onerror = () => { kind = 'faah'; next(); }; }
      el.volume = 1; el.currentTime = 0;
      el.play().catch(() => { kind = 'faah'; next(); });
      return;
    }
    if (kind === 'padi') { sayPadi(() => next(250)); return; }
    if (kind === 'padi-me') { sayPadi(() => next(250), me); return; }
    if (kind === 'padi-mass') { sayMass(() => next(500), name); return; }
    faah();
    if (kind === 'mix') { timer = setTimeout(() => sayPadi(() => next(300)), 2300); return; }
    next(2300);
  }
  unit();
  return { endsAt, stop: () => { stopped = true; clearTimeout(timer); el?.pause(); try { window.speechSynthesis?.cancel(); } catch { /* none */ } } };
}

/** Call from a click (Start / Watch me): browsers only allow sound after a user gesture. */
export function unlockAudio() {
  try { audio(); } catch { /* no Web Audio: the guard falls back to screen flashes */ }
}
