// Utilidades compartidas: dinero, fechas, textos, validaciones.

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatMoney(value: number, currency = 'ARS', locale = 'es-AR'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(round2(value));
}

export function formatNumber(value: number, locale = 'es-AR'): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatDate(date: Date | string | null | undefined, locale = 'es-AR'): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(date: Date | string | null | undefined, locale = 'es-AR'): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function addDays(date: Date | string, days: number): Date {
  const d = typeof date === 'string' ? new Date(date) : new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

export function daysBetween(from: Date | string, to: Date | string): number {
  const a = typeof from === 'string' ? new Date(from) : from;
  const b = typeof to === 'string' ? new Date(to) : to;
  return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export function startOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function startOfMonth(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function initials(firstName = '', lastName = ''): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export function fullName(firstName = '', lastName = ''): string {
  return `${firstName} ${lastName}`.trim();
}

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Valida un CUIT/CUIL argentino (11 digitos + digito verificador). */
export function isValidCuit(cuit: string): boolean {
  const clean = cuit.replace(/[-\s]/g, '');
  if (!/^\d{11}$/.test(clean)) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(clean[i]) * (weights[i] ?? 0);
  const mod = 11 - (sum % 11);
  const check = mod === 11 ? 0 : mod === 10 ? 9 : mod;
  return check === Number(clean[10]);
}

/** Reemplaza variables tipo {{nombre}} en una plantilla. */
export function renderTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => String(vars[key] ?? ''));
}

/** Genera un codigo de socio legible a partir de un numero. */
export function memberCode(seq: number, prefix = ''): string {
  return `${prefix}${String(seq).padStart(5, '0')}`;
}

/**
 * Calcula el nivel de riesgo de abandono de un socio.
 * 0-100 (mas alto = mas riesgo).
 */
export function churnRiskScore(input: {
  lastVisitDays: number | null;
  membershipEndDays: number | null;
  totalVisits: number;
}): { score: number; level: 'LOW' | 'MEDIUM' | 'HIGH' } {
  let score = 0;
  const { lastVisitDays, membershipEndDays, totalVisits } = input;

  if (lastVisitDays === null) score += 45;
  else if (lastVisitDays > 30) score += 40;
  else if (lastVisitDays > 14) score += 25;
  else if (lastVisitDays > 7) score += 10;

  if (membershipEndDays !== null && membershipEndDays <= 0) score += 30;
  else if (membershipEndDays !== null && membershipEndDays <= 3) score += 20;
  else if (membershipEndDays !== null && membershipEndDays <= 7) score += 10;

  if (totalVisits <= 2) score += 20;
  else if (totalVisits <= 8) score += 10;

  score = Math.min(100, score);
  const level = score >= 60 ? 'HIGH' : score >= 30 ? 'MEDIUM' : 'LOW';
  return { score, level };
}
