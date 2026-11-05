import { prisma } from '../db.js';
import { getObservabilityConfig } from './observability.js';

const DAY_MS = 86_400_000;
const DIAGNOSTIC_DETAIL_RETENTION_DAYS = 90;

/** Conserva la telemetría según la retención de observabilidad de cada cliente.
 * El JSON del paquete diagnóstico se elimina a los 90 días; el evento del caso
 * permanece como constancia de que el archivo se revisó.
 */
export async function pruneProviderSupportData() {
  const organizations = await prisma.organization.findMany({ select: { id: true } });
  let telemetryRemoved = 0;
  for (const organization of organizations) {
    const config = await getObservabilityConfig(organization.id).catch(() => ({ retentionDays: 90 }));
    const cutoff = new Date(Date.now() - Math.max(1, config.retentionDays) * DAY_MS);
    const result = await prisma.clientTelemetryEvent.deleteMany({ where: { organizationId: organization.id, createdAt: { lt: cutoff } } });
    telemetryRemoved += result.count;
  }
  const diagnosticsCutoff = new Date(Date.now() - DIAGNOSTIC_DETAIL_RETENTION_DAYS * DAY_MS);
  const diagnostics = await prisma.providerSupportCaseEvent.updateMany({
    where: { kind: 'DIAGNOSTIC', details: { not: null }, createdAt: { lt: diagnosticsCutoff } },
    data: { details: null },
  });
  return { telemetryRemoved, diagnosticDetailsRemoved: diagnostics.count };
}
