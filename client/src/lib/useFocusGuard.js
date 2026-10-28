import { useCallback, useEffect, useRef, useState } from 'react';
import { RULES, headPose, initialState, step, recalibrate as recal, focusPct } from './focusRules.js';
import { alarm, chime } from './alarm.js';

/**
 * The camera focus guard. While `active`, it watches through the webcam with MediaPipe running entirely in this browser
 * (models served by this app from /mediapipe): face + head pose + blinks ~5×/s, a phone check ~1×/s.
 * No frame is stored or sent anywhere; the camera turns off as soon as `active` is false or the page closes.
 * Escalation: a soft chime after 15 s of distraction, a repeating alarm after 45 s (office mode: screen flash, no sound).
 * @returns { videoRef, view: { status, level, pct, gaze, focusStreakMs, distractedSec, error }, recalibrate(), stats() }
 */
export function useFocusGuard({ active, readingNotes = false, officeMode = false, onHeartbeat }) {
  const videoRef = useRef(null);
  const stateRef = useRef(initialState());
  const opts = useRef({ readingNotes, officeMode, onHeartbeat });
  opts.current = { readingNotes, officeMode, onHeartbeat };
  const [view, setView] = useState({ status: 'off', level: 0, pct: 100, gaze: { x: 0, y: 0 }, focusStreakMs: 0, distractedSec: 0, error: null });

  useEffect(() => {
    if (!active) { setView((v) => ({ ...v, status: 'off', level: 0, error: null })); return undefined; }
    let cancelled = false;
    let stream = null;
    let face = null;
    let detector = null;
    let timer = null;
    let beat = null;
    stateRef.current = initialState();
    setView((v) => ({ ...v, status: 'starting', error: null }));

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' }, audio: false });
        if (cancelled) return;
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();
        const mp = await import('@mediapipe/tasks-vision'); // loaded only when the camera is switched on
        const vision = await mp.FilesetResolver.forVisionTasks('/mediapipe/wasm');
        const make = async (Task, o) => {
          try { return await Task.createFromOptions(vision, { ...o, baseOptions: { ...o.baseOptions, delegate: 'GPU' } }); } catch { return Task.createFromOptions(vision, { ...o, baseOptions: { ...o.baseOptions, delegate: 'CPU' } }); }
        };
        face = await make(mp.FaceLandmarker, {
          baseOptions: { modelAssetPath: '/mediapipe/models/face_landmarker.task' },
          runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
        });
        detector = await make(mp.ObjectDetector, {
          baseOptions: { modelAssetPath: '/mediapipe/models/efficientdet_lite0.tflite' },
          runningMode: 'VIDEO', scoreThreshold: RULES.phoneScore, categoryAllowlist: ['cell phone'], maxResults: 1,
        }).catch(() => null); // without it, the guard still works (no phone check)
        if (cancelled) return;

        let phone = false;
        let lastLevel = 0;
        let lastAlarm = 0;
        let lastTs = 0;
        // Load control: detection runs on the main thread (on the CPU on many laptops), so never queue it up.
        // A beat is skipped while the last detection is still running, the pace adapts so detection takes at most
        // ~25% of the time (200 ms on a fast machine, up to 1 s on a busy one), and the costly phone check runs
        // on its own beat every 3 s.
        let busy = false;
        let lastRun = 0;
        let lastPhone = 0;
        let avgMs = 40;
        let lastViewKey = '';
        const pace = () => Math.min(1000, Math.max(200, avgMs * 4));
        const timed = (fn) => { const t0 = performance.now(); const out = fn(); avgMs = avgMs * 0.8 + (performance.now() - t0) * 0.2; return out; };
        timer = ticker(() => {
          const t = performance.now();
          if (busy || !video.videoWidth || t - lastRun < pace() - 20) return; // keeps watching in another tab too
          busy = true;
          lastRun = t;
          try { tickOnce(); } finally { busy = false; }
          if (typeof window !== 'undefined') window.__levelupGuard = { avgMs: Math.round(avgMs), paceMs: Math.round(pace()) };
        });
        function tickOnce() {
          const ts = Math.max(performance.now(), lastTs + 1);
          lastTs = ts;
          if (detector && ts - lastPhone > 3000) { // the phone check takes this whole beat
            lastPhone = ts;
            phone = timed(() => detector.detectForVideo(video, ts)).detections.length > 0;
            return;
          }
          const r = timed(() => face.detectForVideo(video, ts));
          const lm = r.faceLandmarks?.[0];
          const cats = r.faceBlendshapes?.[0]?.categories || [];
          const score = (name) => cats.find((c) => c.categoryName === name)?.score || 0;
          const pose = headPose(r.facialTransformationMatrixes?.[0]?.data);
          const sig = { face: !!lm, yaw: pose?.yaw, pitch: pose?.pitch, phone, eyesClosed: score('eyeBlinkLeft') > RULES.eyesClosedScore && score('eyeBlinkRight') > RULES.eyesClosedScore };
          const now = Date.now();
          const s = step(stateRef.current, sig, now, { readingNotes: opts.current.readingNotes });
          stateRef.current = s;

          // escalate: chime once at level 1; at level 2 an alarm every 4 s until you're back
          if (!opts.current.officeMode) {
            if (s.level >= 1 && lastLevel < 1) chime();
            if (s.level === 2 && now - lastAlarm > 4000) { alarm(); lastAlarm = now; }
          }
          lastLevel = s.level;

          // where the buddy should look: toward your face (nose tip), mirrored like a mirror
          const nose = lm?.[1];
          const gaze = nose ? { x: round1(clamp((0.5 - nose.x) * 2.2)), y: round1(clamp((nose.y - 0.5) * 2)) } : { x: 0, y: 0 };
          // re-render only when something you can see changed (not on every frame)
          const next = { status: s.status, level: s.level, pct: focusPct(s), gaze, focusStreakMs: s.focusedSince ? now - s.focusedSince : 0, distractedSec: Math.round(s.distractedMs / 1000), error: null };
          const key = `${next.status}|${next.level}|${next.pct}|${gaze.x}|${gaze.y}|${next.distractedSec}|${Math.floor(next.focusStreakMs / 5000)}`;
          if (key !== lastViewKey) { lastViewKey = key; setView(next); }
        }
        // tell the server how much was distracted, so a closed tab still counts honestly
        beat = setInterval(() => opts.current.onHeartbeat?.(Math.round(stateRef.current.distractedMs / 1000)), 30_000);
      } catch (e) {
        // never leave the camera on when the guard can't run
        stream?.getTracks().forEach((t) => t.stop());
        const stale = /dynamically imported module|Importing a module script failed|error loading dynamically imported/i.test(e?.message || '');
        const msg = e?.name === 'NotAllowedError' ? 'Camera permission was denied. Allow it in the address bar to use the focus guard.'
          : e?.name === 'NotFoundError' ? 'No camera found on this device.'
            : stale ? 'The app was updated since this page opened. Reload the page (your timer keeps running), then turn the camera on again.'
              : `The focus guard couldn't start (${e?.message || e}).`;
        if (!cancelled) setView((v) => ({ ...v, status: 'error', error: msg, stale }));
      }
    })();

    return () => {
      cancelled = true;
      timer?.stop();
      clearInterval(beat);
      stream?.getTracks().forEach((t) => t.stop());
      try { face?.close(); detector?.close(); } catch { /* already closed */ }
    };
  }, [active]);

  const recalibrate = useCallback(() => { stateRef.current = recal(stateRef.current); }, []);
  const stats = useCallback(() => ({ distractedSec: Math.round(stateRef.current.distractedMs / 1000), pct: focusPct(stateRef.current) }), []);
  return { videoRef, view, recalibrate, stats };
}

/**
 * Calls fn every 200 ms. The beat comes from a tiny Web Worker: a hidden tab's own timers are throttled to once a
 * second (or once a minute after 5 minutes), a worker's are not, so the guard keeps its pace while you're on YouTube.
 */
function ticker(fn, ms = 200) {
  try {
    const url = URL.createObjectURL(new Blob([`const t = setInterval(() => postMessage(0), ${ms}); onmessage = () => clearInterval(t);`], { type: 'text/javascript' }));
    const w = new Worker(url);
    w.onmessage = fn;
    return { stop: () => { w.postMessage('stop'); w.terminate(); URL.revokeObjectURL(url); } };
  } catch {
    const t = setInterval(fn, ms);
    return { stop: () => clearInterval(t) };
  }
}

const clamp = (v) => Math.max(-1, Math.min(1, v));
const round1 = (v) => Math.round(v * 10) / 10;
