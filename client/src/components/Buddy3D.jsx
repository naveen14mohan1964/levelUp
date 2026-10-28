import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * The study buddy in 3D: an ORIGINAL ninja-style trainee (spiky golden hair, orange hoodie with dark shoulders,
 * a headband with our own ⚡ emblem) built from primitives in code: no model files, no third-party character.
 * Anime look = cel shading (3-step toon ramp) + an inverted-hull outline. States match StudyBuddy.jsx:
 *   idle · studying · focused · watching · distracted · break · celebrate · sleepy
 * He looks at your face (camera guard gaze) or else your mouse, blinks, waves when clicked (`wave` counter).
 * Light on a busy laptop: ~30 fps, paused when the tab is hidden, a single still frame with "reduce motion".
 * Loaded lazily (components/Buddy.jsx), so three.js only downloads when a buddy is on screen.
 */

const C = { hair: '#F6C945', skin: '#F5CBA7', hoodie: '#F97316', dark: '#1F2937', pants: '#1E293B', metal: '#D1D5DB', gold: '#F59E0B', iris: '#2563EB', line: '#111827', book: '#A16207', page: '#FEF3C7', wrap: '#E5E7EB', pouch: '#A8A29E' };

/**
 * Arm poses: [shoulderX, shoulderZ, elbowX, elbowZ] per arm (l = his left, on the viewer's right) + a hand shape.
 * Negative X swings forward/up; Z swings sideways (positive = outward for l, inward for r).
 * `seal` = his signature "ready" stance: right hand upright with two fingers raised, left hand across it.
 */
const POSE = {
  rest: { l: [0, 0.12, -0.15, 0], r: [0, -0.12, -0.15, 0], hl: 'open', hr: 'open' },
  seal: { l: [-1.2, -0.6, -0.6, -1.2], r: [-0.5, 0.6, -2.2, 0.5], hl: 'grip', hr: 'seal' }, // tuned from screenshots
};
// finger curl per hand shape: [index, middle, ring, pinky, thumb] (0 straight, 1 fully curled)
const SHAPES = { open: [0.15, 0.15, 0.2, 0.25, 0.2], fist: [1, 1, 1, 1, 0.8], seal: [0, 0, 1, 1, 0.9], grip: [0.75, 0.75, 0.8, 0.85, 0.5] };

/** A small cartoon hand: palm, four fingers and a thumb, each finger curls toward the palm. */
function Hand({ side, fingers }) {
  // fingers hang along -y; the palm faces the body (x toward the centre line), so curling rotates about z
  const curl = -side * 1.7;
  const zs = [0.042, 0.014, -0.014, -0.04];
  return (
    <group>
      <Part geo={<sphereGeometry args={[1, 16, 12]} />} color={C.skin} scale={[0.05, 0.075, 0.075]} outline={0.08} />
      {zs.map((z, i) => (
        <group key={i} ref={fingers[i]} position={[0, -0.06, z]} userData={{ curl }}>
          <Part geo={<capsuleGeometry args={[0.019, i === 3 ? 0.04 : 0.055, 4, 8]} />} color={C.skin} position={[0, -0.038, 0]} outline={0.1} />
        </group>
      ))}
      <group ref={fingers[4]} position={[-side * 0.03, -0.02, 0.06]} rotation={[0.9, 0, -side * 0.5]} userData={{ curl: -side * 1.2 }}>
        <Part geo={<capsuleGeometry args={[0.02, 0.04, 4, 8]} />} color={C.skin} position={[0, -0.03, 0]} outline={0.1} />
      </group>
    </group>
  );
}

let GRADIENT = null;
const gradient = () => {
  if (!GRADIENT) {
    GRADIENT = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
    GRADIENT.minFilter = THREE.NearestFilter;
    GRADIENT.magFilter = THREE.NearestFilter;
    GRADIENT.needsUpdate = true;
  }
  return GRADIENT;
};

/** One toon-shaded part with an anime outline (the same geometry, slightly bigger, drawn back-faces only, in ink). */
function Part({ geo, color, outline = 0.06, ...props }) {
  return (
    <group {...props}>
      <mesh>{geo}<meshToonMaterial color={color} gradientMap={gradient()} /></mesh>
      {outline > 0 && <mesh scale={1 + outline}>{geo}<meshBasicMaterial color={C.line} side={THREE.BackSide} /></mesh>}
    </group>
  );
}

const UP = new THREE.Vector3(0, 1, 0);
const quat = (dir) => new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()).toArray();

/** Spiky hair: a crown, two rings of spikes (open at the face) and three bangs over the headband. */
function useSpikes() {
  return useMemo(() => {
    const out = [];
    const add = (phi, theta, len = 0.42, r = 0.15) => {
      const d = new THREE.Vector3(Math.sin(phi) * Math.sin(theta), Math.cos(phi), Math.sin(phi) * Math.cos(theta));
      out.push({ pos: d.clone().multiplyScalar(0.42 + len * 0.35).toArray(), q: quat(d), len, r });
    };
    add(0.08, 0, 0.5, 0.17);
    for (let k = 0; k < 6; k++) add(0.62, (k / 6) * Math.PI * 2 + 0.3, 0.46, 0.16);
    for (let deg = 50; deg <= 310; deg += 37) add(1.12, (deg * Math.PI) / 180, 0.4, 0.15);
    for (const x of [-0.3, 0, 0.3]) {
      const d = new THREE.Vector3(x, 0.55, 1);
      out.push({ pos: [x * 0.55, 0.36, 0.33], q: quat(d), len: 0.3, r: 0.11 });
    }
    return out;
  }, []);
}

/** Our own emblem: a lightning bolt, extruded. */
function useBolt() {
  return useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0.1, 1); s.lineTo(-0.45, -0.05); s.lineTo(-0.05, -0.05); s.lineTo(-0.2, -1); s.lineTo(0.45, 0.15); s.lineTo(0.05, 0.15); s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 0.25, bevelEnabled: false });
  }, []);
}

const damp = THREE.MathUtils.damp;

function Ninja({ state, gaze, approve, wave, lookRef, still }) {
  const root = useRef(); const head = useRef(); const body = useRef();
  const arms = { l: useRef(), r: useRef() };
  const elbows = { l: useRef(), r: useRef() };
  const fingers = { l: [useRef(), useRef(), useRef(), useRef(), useRef()], r: [useRef(), useRef(), useRef(), useRef(), useRef()] };
  const flash = useRef();
  const lastState = useRef(state);
  const chargeAt = useRef(-10);
  useEffect(() => {
    // starting a session = a charge-up burst (aura flares, then settles)
    if ((state === 'studying' || state === 'focused') && lastState.current !== 'studying' && lastState.current !== 'focused') chargeAt.current = performance.now() / 1000;
    lastState.current = state;
  }, [state]);
  const eyes = useRef(); const pupils = useRef(); const mouthSmile = useRef(); const mouthOpen = useRef();
  const browL = useRef(); const browR = useRef(); const aura = useRef(); const sparks = useRef(); const book = useRef(); const tails = useRef();
  const spikes = useSpikes();
  const bolt = useBolt();
  const waveAt = useRef(-10);
  const blinkAt = useRef(2);
  useEffect(() => { if (wave) waveAt.current = performance.now() / 1000; }, [wave]);

  useFrame((s, dtRaw) => {
    const dt = still ? 1 : Math.min(dtRaw, 0.1);
    const t = s.clock.elapsedTime;
    const now = performance.now() / 1000;
    const k = still ? 1 : 8; // damping speed (instant in a still frame)
    const d = (obj, key, target, speed = k) => { obj[key] = still ? target : damp(obj[key], target, speed, dt); };

    // where to look: your face (camera guard), else the mouse
    const g = gaze && (gaze.x || gaze.y) ? gaze : lookRef.current;
    const lookX = THREE.MathUtils.clamp(g.x || 0, -1, 1);
    const lookY = THREE.MathUtils.clamp(g.y || 0, -1, 1);

    // defaults
    let yaw = lookX * 0.45; let pitch = lookY * 0.25; let roll = 0;
    let [lx, lz, lex, lez] = POSE.rest.l; let [rx, rz, rex, rez] = POSE.rest.r; // l = viewer's right side (+x), r = viewer's left (−x)
    let hl = 'open'; let hr = 'open';
    let y = 0; let spin = 0; let lean = 0; let open = 1; let mouth = 'smile'; let brow = 0; let auraOn = 0; let bookOn = 0;
    const breathe = Math.sin(t * 2) * 0.015;

    switch (state) {
      case 'studying':
      case 'focused':
        pitch = 0.32; yaw *= 0.2; bookOn = 1;
        lx = -0.7 + Math.sin(t * (state === 'focused' ? 5 : 8)) * 0.07; lz = -0.35 + Math.cos(t * 8) * 0.05; lex = -0.7; // writing hand
        rx = -0.65; rz = 0.35; rex = -0.6; hl = 'fist'; // holding the book
        auraOn = state === 'focused' ? 1 : 0; mouth = 'flat';
        break;
      case 'watching':
        lx = -0.45; lz = -0.5; lex = -1.5; lez = -0.6; rx = -0.4; rz = 0.5; rex = -1.5; rez = 0.6; hl = hr = 'fist'; // arms crossed
        if (Math.sin(t * 1.05) > 0.97) pitch += 0.18; // a slow nod now and then
        brow = 0.3;
        break;
      case 'distracted':
        yaw = Math.sin(t * 9) * 0.28; brow = 1; mouth = 'open'; open = 1.18;
        lx = -2.5; lz = 0.25 + Math.sin(t * 10) * 0.1; lex = 0; hl = 'seal'; // pointing up: "hey!"
        rx = -0.7; rz = 0.5; rex = -1.2; // tapping the watch
        y = Math.abs(Math.sin(t * 6)) * 0.05;
        break;
      case 'break':
        lz = 2.7; rz = -2.7; lex = -0.8; rex = -0.8; lean = Math.sin(t * 1.2) * 0.14; open = 0; pitch = -0.1;
        break;
      case 'celebrate':
        y = Math.abs(Math.sin(t * 7)) * 0.32; spin = Math.sin(t * 3) * 0.35; open = 0; mouth = 'open'; auraOn = 0.7;
        lz = 2.85 + Math.sin(t * 14) * 0.18; lx = -0.2; lex = 0; hl = 'fist'; rz = -0.55;
        break;
      case 'sleepy':
        pitch = 0.42 + Math.sin(t * 1.4) * 0.07; roll = 0.18; open = 0; mouth = 'flat'; yaw = 0;
        break;
      default: { // idle / ready: the hand seal, with a chakra pulse every ~6 s
        [lx, lz, lex, lez] = POSE.seal.l; [rx, rz, rex, rez] = POSE.seal.r; hl = POSE.seal.hl; hr = POSE.seal.hr;
        yaw *= 0.6; pitch = pitch * 0.6 + 0.05; brow = 0.45; mouth = 'flat';
        const pulse = (t % 6) / 6;
        auraOn = pulse > 0.82 ? Math.sin(((pulse - 0.82) / 0.18) * Math.PI) * 0.9 : 0;
        break;
      }
    }
    // charge-up after Start: a big flash that settles into the focus aura
    const charge = now - chargeAt.current;
    if (charge < 1.2) auraOn = Math.max(auraOn, 1.6 * (1 - charge / 1.2));
    if (approve && state !== 'distracted') { pitch += Math.abs(Math.sin(t * 6)) * 0.15; mouth = 'smile'; }
    // a wave: on click, or every ~9 s when idle
    const since = now - waveAt.current;
    const idleWave = state === 'idle' && t % 9 < 1.6 && t > 3;
    if (since < 1.8 || idleWave) { rz = -2.55 + Math.sin(t * 13) * 0.3; rx = -0.15; rex = -0.3; rez = 0; hr = 'open'; mouth = 'smile'; }

    // blink
    if (!still && t > blinkAt.current) blinkAt.current = t + 2.5 + Math.random() * 3;
    const blinking = !still && blinkAt.current - t < 0.12; // eyes shut for the last 0.12 s before each scheduled blink
    const eyeY = blinking ? 0.08 : open === 0 ? 0.08 : open;

    d(root.current.position, 'y', y + breathe * 2, 14);
    d(root.current.rotation, 'y', spin);
    d(root.current.rotation, 'z', lean, 4);
    d(head.current.rotation, 'y', yaw);
    d(head.current.rotation, 'x', pitch);
    d(head.current.rotation, 'z', roll, 4);
    body.current.scale.y = 1 + breathe;
    d(arms.l.current.rotation, 'x', lx); d(arms.l.current.rotation, 'z', lz);
    d(arms.r.current.rotation, 'x', rx); d(arms.r.current.rotation, 'z', rz);
    d(elbows.l.current.rotation, 'x', lex); d(elbows.l.current.rotation, 'z', lez);
    d(elbows.r.current.rotation, 'x', rex); d(elbows.r.current.rotation, 'z', rez);
    for (const [side, shape] of [['l', hl], ['r', hr]]) {
      SHAPES[shape].forEach((c, i) => { const f = fingers[side][i].current; d(f.rotation, i === 4 ? 'x' : 'z', (i === 4 ? 0.9 : 0) + c * f.userData.curl, 12); });
    }
    if (flash.current) { flash.current.visible = auraOn > 1; flash.current.scale.setScalar(0.6 + (auraOn - 1) * 1.6); flash.current.material.opacity = Math.max(0, (auraOn - 1) * 0.9); }
    d(eyes.current.scale, 'y', eyeY, 30);
    d(eyes.current.scale, 'x', open > 1 ? open : 1, 10);
    d(pupils.current.position, 'x', lookX * 0.035, 10);
    d(pupils.current.position, 'y', -lookY * 0.03, 10);
    mouthSmile.current.visible = mouth === 'smile';
    mouthOpen.current.visible = mouth === 'open';
    d(browL.current.position, 'y', 0.2 + brow * 0.05, 10); d(browR.current.position, 'y', 0.2 + brow * 0.05, 10);
    d(browL.current.rotation, 'z', -brow * 0.25, 10); d(browR.current.rotation, 'z', brow * 0.25, 10);
    const a = aura.current;
    a.visible = auraOn > 0;
    if (a.visible) { a.scale.setScalar(Math.min(auraOn, 1.3) * (1 + Math.sin(t * 2.4) * 0.05)); sparks.current.rotation.y = t * 1.2; }
    book.current.visible = bookOn > 0;
    tails.current.rotation.x = 0.35 + Math.sin(t * 4) * 0.12;
    tails.current.rotation.z = Math.sin(t * 2.6) * 0.15;
  });

  const sphere = <sphereGeometry args={[1, 24, 18]} />;
  return (
    <group ref={root}>
      {/* focus aura: a soft glow behind him + sparks circling */}
      <group ref={aura} position={[0, -0.75, 0]}>
        <mesh position={[0, 0, -0.6]}>
          <circleGeometry args={[1.25, 40]} />
          <meshBasicMaterial color={C.hoodie} transparent opacity={0.18} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
        <mesh ref={flash} position={[0, 0, -0.5]} visible={false}>
          <ringGeometry args={[0.9, 1.25, 48]} />
          <meshBasicMaterial color={C.gold} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
        <group ref={sparks}>
        {Array.from({ length: 9 }, (_, i) => {
          const a = (i / 9) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 0.95, ((i % 3) - 1) * 0.45, Math.sin(a) * 0.95]} scale={0.045 + (i % 3) * 0.015}>
              <sphereGeometry args={[1, 8, 6]} /><meshBasicMaterial color={i % 2 ? C.gold : C.hoodie} transparent opacity={0.9} />
            </mesh>
          );
        })}
        </group>
      </group>

      <group ref={body}>
        {/* torso: orange hoodie, dark shoulders, zipper */}
        <Part geo={<capsuleGeometry args={[0.36, 0.42, 6, 16]} />} color={C.hoodie} position={[0, -0.98, 0]} />
        <Part geo={sphere} color={C.dark} position={[0.3, -0.68, 0]} scale={[0.17, 0.12, 0.2]} outline={0.04} />
        <Part geo={sphere} color={C.dark} position={[-0.3, -0.68, 0]} scale={[0.17, 0.12, 0.2]} outline={0.04} />
        <Part geo={<cylinderGeometry args={[0.12, 0.13, 0.22, 12]} />} color={C.skin} position={[0, -0.5, 0]} outline={0.04} />
        {/* standing collar (open at the front), zipper with a pull, a belt */}
        <Part geo={<cylinderGeometry args={[0.2, 0.27, 0.17, 20, 1, true, 0.35, Math.PI * 2 - 0.7]} />} color={C.dark} position={[0, -0.58, 0]} outline={0.03} />
        <mesh position={[0, -1.0, 0.36]}><boxGeometry args={[0.035, 0.5, 0.02]} /><meshBasicMaterial color={C.dark} /></mesh>
        <mesh position={[0.05, -0.76, 0.375]}><boxGeometry args={[0.04, 0.07, 0.02]} /><meshBasicMaterial color={C.metal} /></mesh>
        <Part geo={<cylinderGeometry args={[0.365, 0.37, 0.07, 24]} />} color={C.dark} position={[0, -1.3, 0]} outline={0.02} />
        {/* legs: thigh, knee, shin with a cloth wrap, sandals with toes; a pouch on the right thigh */}
        {[1, -1].map((s) => (
          <group key={s}>
            <Part geo={<capsuleGeometry args={[0.14, 0.16, 4, 12]} />} color={C.pants} position={[s * 0.16, -1.47, 0]} />
            <Part geo={<capsuleGeometry args={[0.12, 0.12, 4, 12]} />} color={C.pants} position={[s * 0.165, -1.7, 0.01]} />
            <Part geo={<cylinderGeometry args={[0.125, 0.12, 0.11, 14]} />} color={C.wrap} position={[s * 0.165, -1.76, 0.01]} outline={0.04} />
            <Part geo={<boxGeometry args={[0.2, 0.05, 0.32]} />} color={C.dark} position={[s * 0.17, -1.9, 0.06]} outline={0.05} />
            <Part geo={sphere} color={C.skin} position={[s * 0.17, -1.86, 0.17]} scale={[0.09, 0.04, 0.06]} outline={0.06} />
          </group>
        ))}
        <Part geo={<boxGeometry args={[0.12, 0.13, 0.1]} />} color={C.pouch} position={[-0.3, -1.48, 0.05]} outline={0.05} />
      </group>

      {/* arms (pivot at the shoulder) */}
      {[['l', 1], ['r', -1]].map(([key, s]) => (
        <group key={key} ref={arms[key]} position={[s * 0.42, -0.68, 0]}>
          <Part geo={<capsuleGeometry args={[0.105, 0.17, 4, 12]} />} color={C.hoodie} position={[0, -0.15, 0]} />
          <Part geo={<cylinderGeometry args={[0.112, 0.112, 0.05, 12]} />} color={C.dark} position={[0, -0.09, 0]} outline={0.03} />
          {/* elbow pivot → forearm, cuff, hand */}
          <group ref={elbows[key]} position={[0, -0.31, 0]}>
            <Part geo={sphere} color={C.hoodie} scale={0.1} outline={0.04} />
            <Part geo={<capsuleGeometry args={[0.095, 0.14, 4, 12]} />} color={C.hoodie} position={[0, -0.13, 0]} />
            <Part geo={<cylinderGeometry args={[0.105, 0.1, 0.06, 12]} />} color={C.dark} position={[0, -0.25, 0]} outline={0.03} />
            <group position={[0, -0.3, 0]}><Hand side={s} fingers={fingers[key]} /></group>
          </group>
        </group>
      ))}

      {/* the book while studying */}
      <group ref={book} position={[0, -1.02, 0.5]} rotation={[-0.9, 0, 0]}>
        <Part geo={<boxGeometry args={[0.56, 0.06, 0.38]} />} color={C.book} outline={0.04} />
        <mesh position={[0, 0.035, 0]}><boxGeometry args={[0.52, 0.02, 0.34]} /><meshToonMaterial color={C.page} gradientMap={gradient()} /></mesh>
      </group>

      {/* head (pivot at the neck) */}
      <group ref={head} position={[0, -0.5, 0]}>
        <group position={[0, 0.5, 0]}>
          <Part geo={sphere} color={C.skin} scale={[0.5, 0.48, 0.47]} outline={0.05} />
          {/* ears */}
          <Part geo={sphere} color={C.skin} position={[0.48, -0.02, 0]} scale={[0.07, 0.11, 0.07]} />
          <Part geo={sphere} color={C.skin} position={[-0.48, -0.02, 0]} scale={[0.07, 0.11, 0.07]} />
          {/* hair */}
          {spikes.map((sp, i) => (
            <Part key={i} geo={<coneGeometry args={[sp.r, sp.len, 8]} />} color={C.hair} position={sp.pos} quaternion={sp.q} outline={0.08} />
          ))}
          <Part geo={sphere} color={C.hair} position={[0, 0.12, -0.04]} scale={[0.5, 0.42, 0.47]} outline={0.04} />
          {/* headband: cloth, metal plate, our ⚡ emblem, tails at the back */}
          <Part geo={<cylinderGeometry args={[0.51, 0.51, 0.13, 32, 1, true]} />} color={C.dark} position={[0, 0.17, 0]} outline={0.02} />
          <Part geo={<boxGeometry args={[0.36, 0.16, 0.05]} />} color={C.metal} position={[0, 0.17, 0.49]} outline={0.05} />
          <mesh geometry={bolt} position={[0, 0.17, 0.51]} scale={[0.07, 0.065, 0.06]}><meshToonMaterial color={C.gold} gradientMap={gradient()} /></mesh>
          <group ref={tails} position={[0, 0.17, -0.5]}>
            <Part geo={<boxGeometry args={[0.07, 0.34, 0.02]} />} color={C.dark} position={[0.05, -0.17, 0]} rotation={[0, 0, 0.12]} outline={0.04} />
            <Part geo={<boxGeometry args={[0.07, 0.3, 0.02]} />} color={C.dark} position={[-0.06, -0.15, 0]} rotation={[0, 0, -0.18]} outline={0.04} />
          </group>
          {/* eyes: whites, blue irises that follow you, pupils, a highlight */}
          <group ref={eyes} position={[0, -0.03, 0]}>
            {[0.17, -0.17].map((x) => (
              <group key={x} position={[x, 0, 0.43]}>
                <Part geo={sphere} color="#FFFFFF" scale={[0.1, 0.13, 0.04]} outline={0.12} />
              </group>
            ))}
            <group ref={pupils}>
              {[0.17, -0.17].map((x) => (
                <group key={x} position={[x, -0.01, 0.465]}>
                  <mesh scale={[0.065, 0.085, 0.02]}>{sphere}<meshBasicMaterial color={C.iris} /></mesh>
                  <mesh position={[0, 0, 0.012]} scale={[0.032, 0.042, 0.01]}>{sphere}<meshBasicMaterial color={C.line} /></mesh>
                  <mesh position={[-0.02, 0.03, 0.02]} scale={0.017}>{sphere}<meshBasicMaterial color="#FFFFFF" /></mesh>
                </group>
              ))}
            </group>
          </group>
          {/* brows */}
          <mesh ref={browL} position={[0.17, 0.2, 0.44]}><boxGeometry args={[0.13, 0.025, 0.02]} /><meshBasicMaterial color={C.hair} /></mesh>
          <mesh ref={browR} position={[-0.17, 0.2, 0.44]}><boxGeometry args={[0.13, 0.025, 0.02]} /><meshBasicMaterial color={C.hair} /></mesh>
          {/* mouth: a smile, or open */}
          <mesh ref={mouthSmile} position={[0, -0.22, 0.43]} rotation={[0, 0, Math.PI]}><torusGeometry args={[0.07, 0.014, 6, 16, Math.PI]} /><meshBasicMaterial color={C.line} /></mesh>
          <mesh ref={mouthOpen} position={[0, -0.23, 0.43]} scale={[0.07, 0.05, 0.03]}>{sphere}<meshBasicMaterial color="#7F1D1D" /></mesh>
          {/* cheeks */}
          <mesh position={[0.28, -0.14, 0.38]} scale={[0.06, 0.035, 0.01]}>{sphere}<meshBasicMaterial color="#F9A8D4" transparent opacity={0.55} /></mesh>
          <mesh position={[-0.28, -0.14, 0.38]} scale={[0.06, 0.035, 0.01]}>{sphere}<meshBasicMaterial color="#F9A8D4" transparent opacity={0.55} /></mesh>
        </group>
      </group>

      {/* soft ground shadow */}
      <mesh position={[0, -1.97, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.55, 32]} /><meshBasicMaterial color="#000000" transparent opacity={0.28} depthWrite={false} /></mesh>
    </group>
  );
}

/** ~30 fps instead of the display's full rate; stops while the tab is hidden; one frame with reduce-motion. */
function Pacer({ still }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidate();
    if (still) return undefined;
    const t = setInterval(() => { if (!document.hidden) invalidate(); }, 33);
    return () => clearInterval(t);
  }, [invalidate, still]);
  return null;
}

export default function Buddy3D({ state = 'idle', gaze, approve = false, wave = 0, size = 230, still = false }) {
  const wrap = useRef(null);
  const lookRef = useRef({ x: 0, y: 0 });
  // follow the mouse anywhere on the page, relative to where the buddy stands
  useEffect(() => {
    const onMove = (e) => {
      const r = wrap.current?.getBoundingClientRect();
      if (!r) return;
      lookRef.current = { x: (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2), y: (e.clientY - (r.top + r.height * 0.3)) / (window.innerHeight / 2) };
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);
  return (
    <div ref={wrap} className="b3-canvas" style={{ width: size, height: size * 1.1 }}>
      <Canvas frameloop="demand" dpr={[1, 1.5]} gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        camera={{ position: [0, -0.35, 6.4], fov: 30 }} onCreated={({ camera }) => camera.lookAt(0, -0.62, 0)}>
        <Pacer still={still} />
        <hemisphereLight args={['#FFFFFF', '#334155', 1.1]} />
        <directionalLight position={[2.5, 3, 4]} intensity={2.2} />
        <Ninja state={state} gaze={gaze} approve={approve} wave={wave} lookRef={lookRef} still={still} />
      </Canvas>
    </div>
  );
}
