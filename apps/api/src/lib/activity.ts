import { prisma } from '../db.js';
import type { AuthedRequest } from './http.js';

export async function logActivity(
  request: AuthedRequest,
  action: string,
  entity: string,
  entityId?: string | null,
  before?: unknown,
  after?: unknown,
) {
  try {
    await prisma.activityLog.create({
      data: {
        organizationId: request.user.organizationId,
        branchId: request.user.branchId,
        userId: request.user.id,
        action,
        entity,
        entityId: entityId ?? null,
        before: before ? JSON.stringify(before) : null,
        after: after ? JSON.stringify(after) : null,
        ip: request.ip ?? null,
        userAgent: request.headers?.['user-agent'] ?? null,
      },
    });
  } catch (err) {
    console.error('[activity] no se pudo registrar', err);
  }
}