import fs from 'node:fs';
import path from 'node:path';

// Contenido editable de la landing (lo administra el Panel de control FS).
// La fuente de verdad es content/site-content.json en la RAIZ del monorepo:
//   - la web lo lee en cada build con fs (con fallback a estos defaults),
//   - la API importa el mismo archivo para armar PLAN_CATALOG (precios de cobro),
// asi el precio que ve el cliente y el que cobra MercadoPago nunca se separan.

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

export const DEFAULT_SITE_CONTENT: SiteContent = {
  hero: {
    kicker: 'Software de gestión para gimnasios',
    title: 'Software para',
    titleAccent: 'gimnasios',
    subtitle:
      'Administrá socios, cuotas, cobros, caja y asistencia desde tu PC con Windows. La app móvil permite a tus socios consultar su información y usar funciones online cuando tienen conexión.',
    chips: ['Escritorio con operación local', 'App para socios según plan', 'Prueba gratis por 7 días'],
    ctaPrimary: 'Probar gratis',
    ctaSecondary: 'Ver planes',
  },
  stats: [
    { value: '+10', label: 'Módulos integrados' },
  ],
  trialDays: 7,
  contact: {
    email: 'contacto@fitsystem.com.ar',
    salesEmail: 'ventas@fitsystem.com.ar',
    supportEmail: 'soporte@fitsystem.com.ar',
  },
  plans: [
    {
      tag: 'BASIC',
      name: 'Básico',
      seats: 100,
      monthly: 39900,
      popular: false,
      features: ['Módulos de gestión incluidos', 'App del socio (cupo según plan)', 'Registro de cobros; funciones online según configuración', 'Soporte por email'],
    },
    {
      tag: 'PRO',
      name: 'Pro',
      seats: 300,
      monthly: 64900,
      popular: true,
      features: ['Módulos de gestión incluidos', 'App del socio (cupo según plan)', 'Registro de cobros; funciones online según configuración', 'Reportes del gimnasio', 'Soporte prioritario'],
    },
    {
      tag: 'ENTERPRISE',
      name: 'Empresa',
      seats: 500,
      monthly: 109900,
      popular: false,
      features: ['Módulos de gestión incluidos', 'App del socio (cupo según plan)', 'Registro de cobros; funciones online según configuración', 'Reportes avanzados', 'Soporte prioritario'],
    },
  ],
};

export function siteContentPath(): string {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'content', 'site-content.json'),
    path.join(cwd, '..', '..', 'content', 'site-content.json'),
    path.join(cwd, 'apps', 'web', '..', '..', 'content', 'site-content.json'),
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) return file;
    } catch {
      /* seguimos con el siguiente candidato */
    }
  }
  return candidates[0] as string;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function asNumber(value: unknown, fallback: number, min = 1): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= min ? n : fallback;
}

function asChips(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string')
    ? (value as string[])
    : fallback;
}

function normalizeStats(value: unknown, fallback: SiteStat[]): SiteStat[] {
  if (!Array.isArray(value)) return fallback;
  const stats = value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({ value: asString(item.value, ''), label: asString(item.label, '') }))
    .filter((stat) => stat.value && stat.label);
  return stats.length ? stats : fallback;
}

function normalizePlans(value: unknown, fallback: SitePlan[]): SitePlan[] {
  if (!Array.isArray(value)) return fallback;
  const byTag = new Map<string, Record<string, unknown>>();
  for (const item of value) {
    if (item && typeof item === 'object' && typeof (item as Record<string, unknown>).tag === 'string') {
      byTag.set(String((item as Record<string, unknown>).tag), item as Record<string, unknown>);
    }
  }
  const plans = fallback.map((plan) => {
    const raw = byTag.get(plan.tag);
    if (!raw) return plan;
    return {
      ...plan,
      name: asString(raw.name, plan.name),
      seats: asNumber(raw.seats, plan.seats, 1),
      monthly: asNumber(raw.monthly, plan.monthly, 1),
      popular: raw.popular !== undefined ? Boolean(raw.popular) : plan.popular,
      features: asChips(raw.features, plan.features),
    };
  });
  return plans.length ? plans : fallback;
}

function normalize(raw: Partial<SiteContent> | null | undefined): SiteContent {
  const source = (raw ?? {}) as Partial<SiteContent>;
  const defaults = DEFAULT_SITE_CONTENT;
  const hero = (source.hero ?? {}) as Partial<SiteHero>;
  const contact = (source.contact ?? {}) as Partial<SiteContent['contact']>;
  return {
    hero: {
      kicker: asString(hero.kicker, defaults.hero.kicker),
      title: asString(hero.title, defaults.hero.title),
      titleAccent: asString(hero.titleAccent, defaults.hero.titleAccent),
      subtitle: asString(hero.subtitle, defaults.hero.subtitle),
      chips: asChips(hero.chips, defaults.hero.chips),
      ctaPrimary: asString(hero.ctaPrimary, defaults.hero.ctaPrimary),
      ctaSecondary: asString(hero.ctaSecondary, defaults.hero.ctaSecondary),
    },
    stats: normalizeStats(source.stats, defaults.stats),
    trialDays: asNumber(source.trialDays, defaults.trialDays, 1),
    contact: {
      email: asString(contact.email, defaults.contact.email),
      salesEmail: asString(contact.salesEmail, defaults.contact.salesEmail),
      supportEmail: asString(contact.supportEmail, defaults.contact.supportEmail),
    },
    plans: normalizePlans(source.plans, defaults.plans),
  };
}

// Lee content/site-content.json de la raiz del repo. Si no existe o esta roto,
// devuelve los defaults: la landing nunca se cae por culpa de este archivo.
export function getSiteContent(): SiteContent {
  try {
    const raw = fs.readFileSync(siteContentPath(), 'utf8');
    return normalize(JSON.parse(raw) as Partial<SiteContent>);
  } catch {
    return DEFAULT_SITE_CONTENT;
  }
}
