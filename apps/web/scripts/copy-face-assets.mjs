// Copia el bundle de face-api (browser esm + modelos) a:
//   - apps/web/public/face-api            (servido por Next.js en /face-api)
//   - apps/access-gate-desktop/renderer/vendor/face-api  (kiosco, servido por su http local)
// Modelos: detector tiny + landmarks 68 + reconocimiento (128-d).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const webRoot = path.resolve(import.meta.dirname, '..');
const pkgDir = path.dirname(require.resolve('@vladmandic/face-api/package.json'));

const distFile = path.join(pkgDir, 'dist', 'face-api.esm.js');
const modelDir = path.join(pkgDir, 'model');

const wantedModels = [
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model.bin',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model.bin',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model.bin',
];

const targets = [
  path.join(webRoot, 'public', 'face-api'),
  path.join(webRoot, '..', 'access-gate-desktop', 'renderer', 'vendor', 'face-api'),
];

let copied = 0;
for (const target of targets) {
  const modelOut = path.join(target, 'model');
  fs.mkdirSync(modelOut, { recursive: true });
  fs.copyFileSync(distFile, path.join(target, 'face-api.esm.js'));
  copied += 1;
  for (const name of wantedModels) {
    const src = path.join(modelDir, name);
    if (!fs.existsSync(src)) throw new Error(`Modelo faltante: ${name}`);
    fs.copyFileSync(src, path.join(modelOut, name));
    copied += 1;
  }
  if (fs.existsSync(path.join(modelDir, 'LICENSE'))) {
    fs.copyFileSync(path.join(modelDir, 'LICENSE'), path.join(target, 'model', 'LICENSE'));
  }
  console.log(`OK ${path.relative(webRoot, target)} (+${wantedModels.length + 1} archivos)`);
}
console.log(`Copiados ${copied} archivos. Bundle: ${distFile}`);