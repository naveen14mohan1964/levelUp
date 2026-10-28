// Focus soundscapes, generated in the browser (Web Audio): no audio files, nothing streamed.
//   rain   pink noise through a soft band-pass + random droplets
//   brown  deep brown noise (masks office chatter best)
//   ocean  noise swelling and fading like waves (~9 s)
//   lofi   a slow, soft chord pad (Cmaj7 → Am7 → Fmaj7 → G6, 8 s each)
// One shared player: play(kind) cross-fades, setVolume() ramps, duck() lowers it while the focus guard says you're away.

export const SOUNDS = [
  { key: 'off', label: 'Off', icon: '🔇' },
  { key: 'rain', label: 'Rain', icon: '🌧️' },
  { key: 'brown', label: 'Brown noise', icon: '🟤' },
  { key: 'ocean', label: 'Ocean', icon: '🌊' },
  { key: 'lofi', label: 'Lo-fi pad', icon: '🎹' },
];

let ctx = null;
let master = null;
let current = null; // { kind, gain, stop() }
let volume = 0.5;
let ducked = false;

function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noiseBuffer(type) {
  const a = audio();
  const len = a.sampleRate * 4;
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0; let b1 = 0; let b2 = 0; let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (type === 'pink') { // Paul Kellet's economy pink filter
      b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
    } else if (type === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return buf;
}

function loop(buf, dest) {
  const src = audio().createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.connect(dest);
  src.start();
  return src;
}

const BUILD = {
  rain(out) {
    const a = audio();
    const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.4;
    bp.connect(out);
    const src = loop(noiseBuffer('pink'), bp);
    // droplets: tiny filtered clicks at random
    const drop = noiseBuffer('white');
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const s = a.createBufferSource(); s.buffer = drop;
      const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500 + Math.random() * 3000;
      const g = a.createGain(); const t = a.currentTime;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25 * Math.random() + 0.05, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      s.connect(f).connect(g).connect(out); s.start(t, Math.random() * 3, 0.06);
      setTimeout(tick, 40 + Math.random() * 220);
    };
    tick();
    return () => { alive = false; src.stop(); };
  },
  brown(out) {
    const lp = audio().createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    lp.connect(out);
    const src = loop(noiseBuffer('brown'), lp);
    return () => src.stop();
  },
  ocean(out) {
    const a = audio();
    const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const swell = a.createGain(); swell.gain.value = 0.55;
    const lfo = a.createOscillator(); lfo.frequency.value = 1 / 9;
    const depth = a.createGain(); depth.gain.value = 0.45;
    lfo.connect(depth).connect(swell.gain);
    const lfo2 = a.createOscillator(); lfo2.frequency.value = 1 / 9; // the filter opens as the wave breaks
    const fdepth = a.createGain(); fdepth.gain.value = 500;
    lfo2.connect(fdepth).connect(lp.frequency);
    lp.connect(swell).connect(out);
    const src = loop(noiseBuffer('pink'), lp);
    lfo.start(); lfo2.start();
    return () => { src.stop(); lfo.stop(); lfo2.stop(); };
  },
  lofi(out) {
    const a = audio();
    const CHORDS = [[261.63, 329.63, 392.0, 493.88], [220.0, 261.63, 329.63, 392.0], [174.61, 220.0, 261.63, 329.63], [196.0, 246.94, 293.66, 329.63]];
    const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200;
    lp.connect(out);
    const hum = a.createGain(); hum.gain.value = 0.25; hum.connect(lp);
    const vinyl = loop(noiseBuffer('brown'), hum); // a warm hiss under the chords
    let i = 0;
    let alive = true;
    const play = () => {
      if (!alive) return;
      const t = a.currentTime;
      CHORDS[i % CHORDS.length].forEach((f, k) => {
        const o = a.createOscillator(); o.type = k === 0 ? 'triangle' : 'sine'; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 8;
        const g = a.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09, t + 1.5); g.gain.setValueAtTime(0.09, t + 6.5); g.gain.linearRampToValueAtTime(0.0001, t + 8.4);
        o.connect(g).connect(lp); o.start(t); o.stop(t + 8.5);
      });
      i++;
      setTimeout(play, 8000);
    };
    play();
    return () => { alive = false; vinyl.stop(); };
  },
};

const level = () => (ducked ? volume * 0.12 : volume);

/** Start (or switch to) a soundscape; 'off' fades out. Call from a click the first time (browser sound rules). */
export function play(kind) {
  if (current?.kind === kind) return;
  stop();
  if (!kind || kind === 'off' || !BUILD[kind]) return;
  try {
    const a = audio();
    const gain = a.createGain(); gain.gain.value = 1; gain.connect(master);
    const end = BUILD[kind](gain);
    current = { kind, gain, end };
    master.gain.cancelScheduledValues(a.currentTime);
    master.gain.setTargetAtTime(level(), a.currentTime, 0.6);
  } catch { current = null; /* no Web Audio */ }
}

export function stop() {
  if (!current) return;
  const { gain, end } = current;
  current = null;
  const a = audio();
  gain.gain.setTargetAtTime(0, a.currentTime, 0.25);
  setTimeout(() => { try { end(); gain.disconnect(); } catch { /* already stopped */ } }, 1200);
}

export function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  if (ctx && current) master.gain.setTargetAtTime(level(), ctx.currentTime, 0.2);
}

/** While the focus guard sees you away the sound drops almost to silence: the quiet is the cue. */
export function duck(on) {
  if (ducked === on) return;
  ducked = on;
  if (ctx && current) master.gain.setTargetAtTime(level(), ctx.currentTime, 0.4);
}

export const playing = () => current?.kind || 'off';

// The Today hero and the command palette both switch sounds: one shared choice, saved in this browser.
const listeners = new Set();
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const read = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* ignore */ } };
export const prefs = () => ({ kind: read('levelup:sound', 'off'), volume: Number(read('levelup:soundVol', '0.5')) });
/** Remember a choice (and play it now if a session is running). */
export function choose(kind, { now = true } = {}) {
  save('levelup:sound', kind);
  if (now) play(kind);
  listeners.forEach((fn) => fn(prefs()));
}
export function chooseVolume(v) {
  save('levelup:soundVol', v);
  setVolume(v);
  listeners.forEach((fn) => fn(prefs()));
}
