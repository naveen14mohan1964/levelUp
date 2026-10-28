// Puts the camera focus guard's files where the browser can load them, from this app (no CDN):
//   public/mediapipe/wasm    MediaPipe's WebAssembly engine, copied from node_modules
//   public/mediapipe/models  face landmarker (face, head pose, blinks) + EfficientDet-Lite0 (spots a phone), downloaded once
// Runs before every build (npm run build / dev). Everything stays on this machine; no video ever leaves the browser.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public', 'mediapipe');
const wasmSrc = path.join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const MODELS = {
  'face_landmarker.task': 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  'efficientdet_lite0.tflite': 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite',
};

fs.mkdirSync(path.join(out, 'wasm'), { recursive: true });
fs.mkdirSync(path.join(out, 'models'), { recursive: true });
for (const f of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm']) {
  const dst = path.join(out, 'wasm', f);
  const src = path.join(wasmSrc, f);
  if (!fs.existsSync(dst) || fs.statSync(dst).size !== fs.statSync(src).size) fs.copyFileSync(src, dst);
}
for (const [name, url] of Object.entries(MODELS)) {
  const dst = path.join(out, 'models', name);
  if (fs.existsSync(dst) && fs.statSync(dst).size > 100_000) continue;
  const res = await fetch(url);
  if (!res.ok) { console.warn(`focus guard: couldn't download ${name} (${res.status}); the camera guard will be unavailable until it is.`); continue; }
  fs.writeFileSync(dst, Buffer.from(await res.arrayBuffer()));
  console.log(`focus guard: downloaded ${name}`);
}
