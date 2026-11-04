import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/* Contenido de la landing (content/site-content.json en la raíz del repo). */

export interface SiteHero {
  kicker: string;
  title: string;
  titleAccent: string;
  subtitle: string;
  chips: string[];
  ctaPrimary: string;
  ctaSecondary: string;
}

export interface SiteStat {
  value: string;
  label: string;
}

export interface SitePlan {
  tag: string;
  name: string;
  seats: number;
  monthly: number;
  annual: number;
  popular: boolean;
  features: string[];
}

export interface SiteContent {
  hero: SiteHero;
  stats: SiteStat[];
  trialDays: number;
  contact: { email: string; salesEmail: string; supportEmail: string };
  plans: SitePlan[];
}

const PLAN_TAGS = ['BASIC', 'PRO', 'ENTERPRISE'];

/** Sube desde el directorio del panel hasta la raíz del repo (package.json name: fitsystem). */
export function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 12; i++) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name?: string };
        if (pkg.name === 'fitsystem') return dir;
      } catch {
        /* seguimos subiendo */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`No se encontró la raíz del repositorio FITsystem desde ${startDir}`);
}

export function contentFile(repoRoot: string): string {
  return path.join(repoRoot, 'content', 'site-content.json');
}

export function loadContent(repoRoot: string): SiteContent | null {
  try {
    const raw = fs.readFileSync(contentFile(repoRoot), 'utf8');
    return JSON.parse(raw) as SiteContent;
  } catch {
    return null;
  }
}

export function saveContent(repoRoot: string, content: SiteContent) {
  const file = contentFile(repoRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
}

function isEmail(value: unknown): boolean {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isFilled(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/** Devuelve la lista de problemas (vacía si el contenido es publicable). */
export function validateContent(content: SiteContent): string[] {
  const errors: string[] = [];
  const hero = content?.hero;
  if (!hero) {
    errors.push('Falta la sección hero');
  } else {
    if (!isFilled(hero.kicker)) errors.push('El kicker del hero no puede quedar vacío');
    if (!isFilled(hero.title)) errors.push('El título del hero no puede quedar vacío');
    if (!isFilled(hero.subtitle)) errors.push('La bajada del hero no puede quedar vacía');
    if (!isFilled(hero.ctaPrimary)) errors.push('El botón principal no puede quedar vacío');
    if (!isFilled(hero.ctaSecondary)) errors.push('El botón secundario no puede quedar vacío');
    if (!Array.isArray(hero.chips) || !hero.chips.length || !hero.chips.every(isFilled)) {
      errors.push('El hero necesita al menos un ítem en la lista de checks');
    }
  }

  const stats = content?.stats;
  if (!Array.isArray(stats) || !stats.length) {
    errors.push('Necesitás al menos una estadística');
  } else {
    stats.forEach((stat, index) => {
      if (!isFilled(stat?.value) || !isFilled(stat?.label)) errors.push(`La estadística ${index + 1} necesita valor y etiqueta`);
    });
  }

  if (!isPositiveInt(content?.trialDays) || content.trialDays > 365) {
    errors.push('Los días de prueba deben ser un número entre 1 y 365');
  }

  const contact = content?.contact;
  if (!contact) errors.push('Falta la sección de contacto');
  else {
    if (!isEmail(contact.email)) errors.push('El email de contacto general no es válido');
    if (!isEmail(contact.salesEmail)) errors.push('El email de ventas no es válido');
    if (!isEmail(contact.supportEmail)) errors.push('El email de soporte no es válido');
  }

  const plans = content?.plans;
  if (!Array.isArray(plans)) {
    errors.push('Faltan los planes');
    return errors;
  }
  for (const tag of PLAN_TAGS) {
    const plan = plans.find((p) => p?.tag === tag);
    if (!plan) {
      errors.push(`Falta el plan ${tag}`);
      continue;
    }
    if (!isFilled(plan.name)) errors.push(`El plan ${tag} necesita nombre`);
    if (!isPositiveInt(plan.seats)) errors.push(`El plan ${tag}: los asientos deben ser mayores a cero`);
    if (!isPositiveInt(plan.monthly)) errors.push(`El plan ${tag}: el precio mensual debe ser mayor a cero`);
    if (!isPositiveInt(plan.annual)) errors.push(`El plan ${tag}: el precio anual debe ser mayor a cero`);
    if (isPositiveInt(plan.monthly) && isPositiveInt(plan.annual) && plan.annual < plan.monthly) {
      errors.push(`El plan ${tag}: el anual no puede ser menor que el mensual`);
    }
    if (!Array.isArray(plan.features) || !plan.features.length || !plan.features.every(isFilled)) {
      errors.push(`El plan ${tag}: necesita al menos un beneficio`);
    }
  }
  return errors;
}

export interface PublishResult {
  repoRoot: string;
  committed: string;
  output: string;
}

/**
 * Guarda el contenido y lo publica: git add del archivo, commit y push a main.
 * El push dispara el workflow `deploy`, que entra por SSH al VPS y reconstruye
 * web + API (tarda varios minutos). No toca el resto de cambios locales.
 */
export async function publishContent(repoRoot: string, content: SiteContent, message: string): Promise<PublishResult> {
  saveContent(repoRoot, content);

  const opts = { cwd: repoRoot, encoding: 'utf8' as BufferEncoding, maxBuffer: 8 * 1024 * 1024 };
  const relPath = path.relative(repoRoot, contentFile(repoRoot)).split(path.sep).join('/');

  await execFileAsync('git', ['add', '--', relPath], opts);

  const staged = await execFileAsync('git', ['diff', '--cached', '--name-only'], opts);
  if (!staged.stdout.trim()) {
    return { repoRoot, committed: '', output: 'No hay cambios nuevos para publicar (el archivo ya estaba publicado).' };
  }

  await execFileAsync('git', ['commit', '-m', message, '--', relPath], opts);
  const push = await execFileAsync('git', ['push', 'origin', 'HEAD'], opts);

  return { repoRoot, committed: relPath, output: (push.stdout + push.stderr).trim() || 'push ok' };
}
