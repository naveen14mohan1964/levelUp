import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * The study buddy as a humanoid: Quaternius "Universal Base Characters" body + "Universal Animation Library"
 * clips (both CC0, files in public/models/buddy, see LICENSE.txt there). Everything that makes him OUR ninja is
 * added here: the outfit is painted in the shader from the bind-pose position (so it bends with the body),
 * and the headband with our ⚡ emblem and the spiky hair are meshes attached to the head bone.
 * Same props as Buddy3D: state, gaze, approve, wave, size, still.
 */
const BASE = '/models/buddy/';
const C = { hair: '#F2C230', jacket: '#F97316', dark: '#1F2937', pants: '#1E293B', wrap: '#E5E7EB', metal: '#CBD5E1', gold: '#F59E0B' };

// state → clip (names from scripts that exported clips.json); loops unless listed in ONCE
const CLIP = { idle: 'ready', studying: 'studying', focused: 'ready', watching: 'idle', distracted: 'distracted', break: 'break', celebrate: 'celebrate', sleepy: 'sleepy' };
const FADE = 0.45;

let assets = null;
function loadAssets() {
  if (!assets) {
    const loader = new GLTFLoader();
    assets = Promise.all([
      loader.loadAsync(BASE + 'body.gltf'),
      loader.loadAsync(BASE + 'hair.gltf'),
      fetch(BASE + 'clips.json').then((r) => { if (!r.ok) throw new Error('clips'); return r.json(); }),
    ]).then(([body, hair, clips]) => ({ body, hair, clips: clips.map((c) => THREE.AnimationClip.parse(c)) }));
    assets.catch(() => { assets = null; });
  }
  return assets;
}

/** Paint the ninja outfit onto the body material from bind-pose position (metres, Y up, facing +Z, T-pose). */
function dressBody(material) {
  const m = material.clone();
  m.metalness = 0; // the greyscale roughness map would otherwise also read as metalness
  m.roughness = 1; // the map carries the real per-pixel roughness (skin, lips, cloth)
  m.envMapIntensity = 0.7;
  m.onBeforeCompile = (shader) => {
    Object.entries({ uJacket: C.jacket, uDark: C.dark, uPants: C.pants, uWrap: C.wrap }).forEach(([k, v]) => { shader.uniforms[k] = { value: new THREE.Color(v) }; });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRest;\nuniform vec3 uJacket; uniform vec3 uDark; uniform vec3 uPants; uniform vec3 uWrap;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float clothMask = 0.0;
        {
          float y = vRest.y; float ax = abs(vRest.x); float z = vRest.z;
          vec3 cloth = vec3(-1.0);
          bool arm = ax > 0.2;
          if (y < 0.085) cloth = uDark;                                   // sandals
          else if (y > 0.13 && y < 0.24 && !arm) cloth = uWrap;           // shin wraps
          else if (y < 0.955 && !arm) cloth = uPants;                     // trousers
          else if (y < 0.995 && !arm) cloth = uDark;                      // belt
          else if (!arm && y < 1.5 && !(y > 1.44 && ax < 0.03 && z > 0.0)) cloth = uJacket; // jacket body, small V at the throat
          else if (!arm && y < 1.56 && !(ax < 0.035 && z > 0.0)) cloth = uDark;  // standing collar around the neck
          else if (arm && ax < 0.66) cloth = (ax > 0.62 ? uDark : uJacket); // sleeves + dark cuffs
          if (!arm && y > 1.36 && y < 1.5 && ax > 0.13) cloth = uDark;    // dark shoulder panels
          if (!arm && y > 0.995 && y < 1.44 && ax < 0.007 && z > 0.0) cloth = uDark; // zip
          if (cloth.x >= 0.0) {
            float shade = 0.82 + 0.18 * clamp(length(diffuseColor.rgb) / 1.2, 0.0, 1.0); // keep the sculpt's shading
            diffuseColor.rgb = cloth * shade;
            clothMask = 1.0;
          }
        }`)
      // fabric: matte, and most of the muscle sculpt under it smoothed away (the face keeps every detail)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n if (clothMask > 0.5) roughnessFactor = 0.82;')
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n vec3 geoNormal = normal;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n if (clothMask > 0.5) normal = normalize(mix(normal, geoNormal, 0.8));');
  };
  m.customProgramCacheKey = () => 'ninja-outfit';
  return m;
}

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra });

/** Headband (cloth ring, metal plate, ⚡, tails) + spiky hair, built around the head in model space. */
function headGear() {
  const g = new THREE.Group();
  const cx = 0; const cy = 1.715; const cz = -0.008; // head centre (bind pose)
  // headband: an open ring around the forehead, slightly tilted like the skull
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.032, 40, 1, true), std(C.dark, { side: THREE.DoubleSide }));
  band.scale.set(0.088, 1, 0.106); band.position.set(cx, 1.758, cz + 0.004); band.rotation.x = -0.12;
  g.add(band);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.034, 0.008), std(C.metal, { metalness: 0.8, roughness: 0.3 }));
  plate.position.set(0, 1.762, 0.104); plate.rotation.x = -0.12;
  g.add(plate);
  const s = new THREE.Shape();
  s.moveTo(0.1, 1); s.lineTo(-0.45, -0.05); s.lineTo(-0.05, -0.05); s.lineTo(-0.2, -1); s.lineTo(0.45, 0.15); s.lineTo(0.05, 0.15); s.closePath();
  const bolt = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: false }), std(C.gold, { metalness: 0.6, roughness: 0.35 }));
  bolt.scale.set(0.012, 0.012, 0.012); bolt.position.set(0, 1.762, 0.108); bolt.rotation.x = -0.12;
  g.add(bolt);
  for (const [x, rz, len] of [[0.012, 0.15, 0.13], [-0.014, -0.2, 0.11]]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.022, len, 0.004), std(C.dark));
    tail.position.set(x, 1.735 - len / 2, -0.112); tail.rotation.set(0.25, 0, rz);
    g.add(tail);
  }
  // spikes: cones on the scalp pointing away from the head centre (crown, back, sides) + short bangs
  const hairMat = std(C.hair, { roughness: 0.7 });
  const spike = (theta, phi, len, r) => {
    const dir = new THREE.Vector3(Math.sin(phi) * Math.sin(theta), Math.cos(phi), Math.sin(phi) * Math.cos(theta)).normalize();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, len, 7), hairMat);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const base = new THREE.Vector3(cx + dir.x * 0.075, cy + dir.y * 0.085, cz + dir.z * 0.088);
    cone.position.copy(base.addScaledVector(dir, len * 0.42));
    g.add(cone);
  };
  spike(0, 0.12, 0.12, 0.032);
  for (let k = 0; k < 7; k++) spike((k / 7) * Math.PI * 2 + 0.4, 0.62, 0.115, 0.03);
  for (let deg = 70; deg <= 290; deg += 30) spike((deg * Math.PI) / 180, 1.12, 0.1, 0.028);
  for (let deg = 100; deg <= 260; deg += 40) spike((deg * Math.PI) / 180, 1.5, 0.075, 0.024);
  for (const x of [-0.045, -0.015, 0.015, 0.045]) { // bangs over the headband
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.06, 6), hairMat);
    cone.position.set(x, 1.79, 0.096); cone.rotation.set(Math.PI - 0.5, 0, x * 4);
    g.add(cone);
  }
  return g;
}

function Ninja({ state, gaze, approve, wave, lookRef, still, onReady }) {
  const [rig, setRig] = useState(null);
  const lastState = useRef(null);
  const aura = useRef();

  useEffect(() => {
    let alive = true;
    loadAssets().then(({ body, hair, clips }) => {
      if (!alive) return;
      const scene = body.scene.clone(true);
      // clone() keeps skinned meshes bound to the ORIGINAL bones; rebind them to this copy's bones
      const bones = {};
      scene.traverse((o) => { if (o.isBone) bones[o.name] = o; });
      scene.traverse((o) => {
        if (!o.isSkinnedMesh) return;
        o.skeleton = new THREE.Skeleton(o.skeleton.bones.map((b) => bones[b.name]), o.skeleton.boneInverses);
        o.bind(o.skeleton, o.bindMatrix);
        o.frustumCulled = false;
        if (o.material.name === 'MI_Superhero_Male') o.material = dressBody(o.material);
        if (o.material.name === 'MI_Hair_1') { o.material = o.material.clone(); o.material.color.set('#E0B43A'); o.material.metalness = 0; } // brows: strand texture tinted gold
        if (o.material.name === 'MI_Eyes') { o.material = o.material.clone(); o.material.metalness = 0; o.material.roughness = 0.08; o.material.envMapIntensity = 1.4; } // wet, glossy eyes catch the light
      });
      // the buzzed hair, recoloured blond and bound to our skeleton
      hair.scene.traverse((o) => {
        if (!o.isSkinnedMesh) return;
        const h = o.clone();
        h.material = o.material.clone(); h.material.map = null; h.material.color.set(C.hair); h.material.roughness = 0.75;
        h.bind(new THREE.Skeleton(o.skeleton.bones.map((b) => bones[b.name]), o.skeleton.boneInverses), o.bindMatrix);
        h.frustumCulled = false;
        scene.getObjectByName('SuperHero_Male').parent.add(h);
      });
      // headband + spikes follow the head bone
      scene.updateMatrixWorld(true);
      const gear = headGear();
      scene.add(gear);
      gear.updateMatrixWorld(true);
      bones.Head.attach(gear);

      const mixer = new THREE.AnimationMixer(scene);
      const actions = Object.fromEntries(clips.map((c) => {
        // the clip's pelvis position is in the FBX's units: keep rotations only (no drifting)
        c.tracks = c.tracks.filter((t) => t.name !== 'pelvis.position' && t.name !== 'root.quaternion');
        return [c.name, mixer.clipAction(c)];
      }));
      for (const k of ['charge', 'cast']) { actions[k].setLoop(THREE.LoopOnce, 1); actions[k].clampWhenFinished = true; }
      setRig({ scene, mixer, actions, bones, current: null });
      onReady?.();
    }).catch(() => {});
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const play = (r, name) => {
    const next = r.actions[name];
    if (!next || r.current === next) return;
    next.reset().setEffectiveWeight(1).fadeIn(FADE).play();
    if (r.current) r.current.fadeOut(FADE);
    r.current = next;
  };

  // state changes: Start pressed = charge-up first; then the state's loop
  useEffect(() => {
    if (!rig) return;
    const prev = lastState.current;
    lastState.current = state;
    const target = CLIP[state] || 'ready';
    const starting = (state === 'studying' || state === 'focused') && prev && prev !== 'studying' && prev !== 'focused';
    if (starting && !still) {
      play(rig, 'charge');
      const done = (e) => { if (e.action === rig.actions.charge) { rig.mixer.removeEventListener('finished', done); if (lastState.current === state) play(rig, target); } };
      rig.mixer.addEventListener('finished', done);
    } else play(rig, target);
    if (still) rig.mixer.update(0.8);
  }, [rig, state]); // eslint-disable-line react-hooks/exhaustive-deps

  // a click (wave counter) = a quick cast, then back to the loop
  useEffect(() => {
    if (!rig || !wave || still) return;
    play(rig, 'cast');
    const done = (e) => { if (e.action === rig.actions.cast) { rig.mixer.removeEventListener('finished', done); play(rig, CLIP[lastState.current] || 'ready'); } };
    rig.mixer.addEventListener('finished', done);
  }, [rig, wave]); // eslint-disable-line react-hooks/exhaustive-deps

  const aim = useRef({ x: 0, y: 0 }); // smoothed look target
  const tmp = useRef({ q: new THREE.Quaternion(), p: new THREE.Quaternion(), r: new THREE.Quaternion(), e: new THREE.Euler() });
  const posed = useRef(null); // the animated neck/head rotation from the last frame, before our look-at turn
  useFrame((s, dt) => {
    if (!rig) return;
    const look = [[rig.bones.neck_01, 0.4], [rig.bones.Head, 0.6]];
    // The mixer only writes a bone when its animated value CHANGES, so a turn added last frame can survive
    // into this one and pile up (the head spun). Put the animated pose back first, then let the mixer run.
    if (posed.current) look.forEach(([bone], i) => bone.quaternion.copy(posed.current[i]));
    if (!still) rig.mixer.update(Math.min(dt, 0.1));
    posed.current = look.map(([bone]) => bone.quaternion.clone());
    // head follows your face (camera guard) or the mouse, on top of the animation
    const g = gaze && (gaze.x || gaze.y) ? gaze : lookRef.current;
    const k = still ? 1 : 1 - Math.exp(-6 * Math.min(dt, 0.1));
    aim.current.x += ((THREE.MathUtils.clamp(g.x || 0, -1, 1)) - aim.current.x) * k;
    aim.current.y += ((THREE.MathUtils.clamp(g.y || 0, -1, 1)) - aim.current.y) * k;
    const lookWeight = state === 'celebrate' || state === 'break' || state === 'sleepy' ? 0.3 : 1;
    const nod = approve && state !== 'distracted' ? Math.abs(Math.sin(s.clock.elapsedTime * 6)) * 0.18 : 0;
    const { q, p, r, e } = tmp.current;
    rig.scene.updateMatrixWorld(true); // parents' world rotations for THIS frame's pose
    rig.scene.getWorldQuaternion(r).invert();
    for (const [bone, w] of look) {
      e.set((aim.current.y * 0.35 + nod) * w * lookWeight, aim.current.x * 0.6 * w * lookWeight, 0);
      q.setFromEuler(e); // the turn in model space…
      bone.parent.getWorldQuaternion(p).premultiply(r); // …expressed relative to the bone's parent
      bone.quaternion.premultiply(p.clone().invert().multiply(q).multiply(p));
      bone.updateMatrixWorld(true);
    }
    // focus aura: a soft pulsing ring at his feet
    if (aura.current) {
      const on = state === 'focused' || state === 'celebrate' ? 1 : state === 'idle' ? 0.45 : 0;
      aura.current.visible = on > 0;
      aura.current.material.opacity = on * (0.35 + Math.sin(s.clock.elapsedTime * 2.4) * 0.12);
    }
  });

  if (!rig) return null;
  return (
    <group>
      <primitive object={rig.scene} />
      <mesh ref={aura} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[0.32, 0.5, 48]} />
        <meshBasicMaterial color={C.gold} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <circleGeometry args={[0.38, 32]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.35} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Soft studio lighting from a generated room environment (no HDR file to download). */
function Env() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    return () => { env.dispose(); pm.dispose(); };
  }, [gl, scene]);
  return null;
}

/** ~30 fps instead of the display's full rate; stops while the tab is hidden; one frame with reduce-motion. */
function Pacer({ still, ready }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidate();
    if (still) { const t = setTimeout(invalidate, 50); return () => clearTimeout(t); }
    const t = setInterval(() => { if (!document.hidden) invalidate(); }, 33);
    return () => clearInterval(t);
  }, [invalidate, still, ready]);
  return null;
}

export default function BuddyHuman({ state = 'idle', gaze, approve = false, wave = 0, size = 230, still = false, onError }) {
  const wrap = useRef(null);
  const lookRef = useRef({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);
  useEffect(() => {
    loadAssets().catch((e) => onError?.(e));
    const onMove = (e) => {
      const r = wrap.current?.getBoundingClientRect();
      if (!r) return;
      lookRef.current = { x: (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2), y: (e.clientY - (r.top + r.height * 0.25)) / (window.innerHeight / 2) };
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [onError]);
  return (
    <div ref={wrap} className={`b3-canvas bh${ready ? ' ready' : ''}`} style={{ width: size, height: size * 1.1 }}>
      <Canvas frameloop="demand" dpr={[1, 2]} shadows={false} gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        camera={{ position: [0, 1.6, 1.85], fov: 30 }} onCreated={({ camera, gl }) => { camera.lookAt(0, 1.5, 0); /* chest-up portrait: the face reads */ gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05; }}>
        <Pacer still={still} ready={ready} />
        <Env />
        {/* portrait lighting: a high key from the front-left sculpts the face, a soft fill, a warm rim from the fire behind */}
        <hemisphereLight args={['#FFF7ED', '#1F2937', 0.35]} />
        <directionalLight position={[-1.2, 2.6, 2.4]} intensity={2.1} />
        <directionalLight position={[1.8, 1.4, 1.6]} intensity={0.55} color="#E0E7FF" />
        <directionalLight position={[1.2, 2.2, -2.2]} intensity={1.6} color="#FB923C" />
        <directionalLight position={[-2.2, 1.2, -1.5]} intensity={1.0} color="#F97316" />
        <Ninja state={state} gaze={gaze} approve={approve} wave={wave} lookRef={lookRef} still={still} onReady={() => setReady(true)} />
      </Canvas>
    </div>
  );
}
