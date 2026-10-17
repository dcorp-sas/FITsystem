#!/usr/bin/env node
// release.mjs - Sube la version de FIT System, commitea, pushea y crea el tag.
//
// Uso:
//   node scripts/release.mjs [patch|minor|major|X.Y.Z] [opciones]
//
// Opciones:
//   --notes "texto"     Novedades que se muestran en el aviso de actualizacion
//                       (van a updates/latest.json y al cuerpo del commit).
//   --notes-file RUTA   Igual que --notes, pero lee el texto de un archivo UTF-8
//                       (recomendado en Windows para evitar problemas de acentos).
//   --message "texto"   Asunto del commit (por defecto: "release: vX.Y.Z").
//   --skip-push         Sube version y commitea, pero NO pushea ni crea el tag.
//   --dry-run           Muestra lo que haria sin escribir ni tocar git.
//
// Actualiza la version en los 3 lugares:
//   - apps/desktop/package.json
//   - apps/desktop/src/preload.ts
//   - updates/latest.json   (version + notes)
// Luego: git add -A, commit, push, tag vX.Y.Z y push del tag. El push del tag
// dispara .github/workflows/release.yml, que compila y publica la release.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);

function readFlag(name) {
  const i = argv.indexOf(name);
  if (i === -1) return undefined;
  const value = argv[i + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`Falta el valor de ${name}`);
  }
  return value;
}

const hasFlag = (name) => argv.includes(name);

const bumpArg = argv.find((a) => !a.startsWith('--')) || 'patch';
const notesFile = readFlag('--notes-file');
const notes = notesFile ? fs.readFileSync(path.resolve(root, notesFile), 'utf8').trim() : readFlag('--notes') ?? '';
const messageArg = readFlag('--message');
const skipPush = hasFlag('--skip-push');
const dryRun = hasFlag('--dry-run');

const desktopPkgPath = path.join(root, 'apps', 'desktop', 'package.json');
const preloadPath = path.join(root, 'apps', 'desktop', 'src', 'preload.ts');
const manifestPath = path.join(root, 'updates', 'latest.json');
const setupUrl =
  'https://github.com/dcorp-sas/FITsystem/releases/latest/download/FIT-System-Setup.exe';

function parseVersion(v) {
  const m = String(v).trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) throw new Error(`Version invalida: ${v}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function nextVersion(current, bump) {
  const [maj, min, pat] = parseVersion(current);
  if (/^\d+\.\d+\.\d+$/.test(bump)) return bump;
  if (bump === 'major') return `${maj + 1}.0.0`;
  if (bump === 'minor') return `${maj}.${min + 1}.0`;
  if (bump === 'patch') return `${maj}.${min}.${pat + 1}`;
  throw new Error(`Bump invalido: ${bump} (usar patch|minor|major|X.Y.Z)`);
}

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: root, stdio: 'inherit', ...opts });
}

function gitQuiet(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function updateDesktopPkg(version) {
  const raw = fs.readFileSync(desktopPkgPath, 'utf8');
  const out = raw.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`);
  if (out === raw) throw new Error('No se pudo actualizar la version en apps/desktop/package.json');
  fs.writeFileSync(desktopPkgPath, out);
}

function updatePreload(version) {
  const raw = fs.readFileSync(preloadPath, 'utf8');
  const out = raw.replace(/(version:\s*')[^']*(')/, `$1${version}$2`);
  if (out === raw) throw new Error('No se pudo actualizar la version en apps/desktop/src/preload.ts');
  fs.writeFileSync(preloadPath, out);
}

function updateManifest(version) {
  const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  data.version = version;
  data.url = setupUrl;
  if (notes) data.notes = notes;
  data.mandatory = Boolean(data.mandatory);
  fs.writeFileSync(manifestPath, `${JSON.stringify(data, null, 2)}\n`);
}

function main() {
  const current = JSON.parse(fs.readFileSync(desktopPkgPath, 'utf8')).version;
  const version = nextVersion(current, bumpArg);
  const tag = `v${version}`;

  console.log('== Release FIT System ==');
  console.log(`Version actual: ${current}`);
  console.log(`Version nueva:  ${version}  (tag ${tag})`);
  if (skipPush) console.log('Modo: --skip-push (no se pushea ni se crea el tag)');
  if (dryRun) console.log('Modo: --dry-run (no se escribe nada)');

  if (!dryRun) {
    try {
      gitQuiet(['rev-parse', '-q', '--verify', `refs/tags/${tag}`]);
      throw new Error(`El tag ${tag} ya existe. Elegi otra version.`);
    } catch (err) {
      if (String(err.message).includes('ya existe')) throw err;
    }
  }

  const subject = messageArg || `release: ${tag}`;

  if (dryRun) {
    console.log('\n(dry-run) Archivos a modificar:');
    console.log(' -', path.relative(root, desktopPkgPath));
    console.log(' -', path.relative(root, preloadPath));
    console.log(' -', path.relative(root, manifestPath));
    console.log('Commit:', subject);
    return;
  }

  console.log('\n[1/6] Actualizando version en los 3 archivos...');
  updateDesktopPkg(version);
  updatePreload(version);
  updateManifest(version);

  console.log('\n[2/6] git add -A...');
  git(['add', '-A']);

  console.log('\n[3/6] git commit...');
  if (notes) git(['commit', '-m', subject, '-m', notes]);
  else git(['commit', '-m', subject]);

  if (skipPush) {
    console.log('\nListo (sin push). Para publicar:');
    console.log(`  git push && git tag ${tag} && git push origin ${tag}`);
    return;
  }

  console.log('\n[4/6] git push...');
  git(['push']);

  console.log(`\n[5/6] Creando tag ${tag}...`);
  git(['tag', tag]);

  console.log(`\n[6/6] Publicando tag ${tag}...`);
  git(['push', 'origin', tag]);

  console.log('\n== Release publicado ==');
  console.log('El workflow de GitHub Actions compilara los instaladores.');
  console.log('Revisar: https://github.com/dcorp-sas/FITsystem/actions');
}

main();
