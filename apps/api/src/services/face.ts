import type { MemberFace } from '@prisma/client';

// Distancia euclidiana entre dos descriptores de 128-d.
export function euclidean(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const len = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < len; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

export function parseDescriptors(face: { descriptors: string }): number[][] {
  try {
    const parsed = JSON.parse(face.descriptors) as unknown;
    if (!Array.isArray(parsed)) return [];
    const rows = parsed.filter((r): r is ArrayLike<number> => Array.isArray(r) && r.length > 0);
    return rows.map((r) => Array.from(r, (n) => Number(n)).filter((n) => Number.isFinite(n)));
  } catch {
    return [];
  }
}

export interface FaceMatch {
  memberFaceId: string;
  memberId: string;
  distance: number;
  samples: number;
}

// Busca el socio cuya distancia minima al descriptor sea <= threshold.
// Devuelve null si no hay enrolamiento o ninguna coincidencia aceptable.
export function matchFace(
  faces: Array<MemberFace & { descriptors: string }>,
  probe: ArrayLike<number>,
  threshold: number,
): FaceMatch | null {
  let best: FaceMatch | null = null;
  for (const face of faces) {
    const descriptors = parseDescriptors(face);
    for (const stored of descriptors) {
      const distance = euclidean(stored, probe);
      if (!best || distance < best.distance) {
        best = { memberFaceId: face.id, memberId: face.memberId, distance, samples: descriptors.length };
      }
    }
  }
  if (!best) return null;
  if (best.distance > threshold) return null;
  return best;
}

// Umbral por defecto para descriptores de 128-d de face-api.
export const DEFAULT_MATCH_THRESHOLD = 0.55;

export function parseThreshold(raw: string | null | undefined): number {
  const n = Number(raw ?? '');
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MATCH_THRESHOLD;
  return Math.min(n, 10);
}