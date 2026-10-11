'use client';

import { useCallback, useEffect, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { formatDateTime } from '@fitsystem/utils';
import type { ActivityLog } from '@/lib/types';
import { Badge, PageHeader, Spinner, Table } from '@/components/ui';

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Creó',
  UPDATE: 'Actualizó',
  DELETE: 'Eliminó',
  LOGIN: 'Ingresó',
  LOGOUT: 'Salió',
  CHECKIN: 'Registró acceso',
  SEND: 'Envió',
  CONFIRM: 'Confirmó',
  ISSUE: 'Emitió',
  IMPORT: 'Importó',
  GENERATE: 'Generó',
};

const ACTION_COLOR: Record<string, string> = {
  CREATE: 'green',
  UPDATE: 'blue',
  DELETE: 'red',
  CHECKIN: 'green',
  LOGIN: 'sky',
  IMPORT: 'yellow',
};

export default function ActivityPage() {
  const toast = useToast();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLogs(await http.get<ActivityLog[]>('/org/activity'));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al cargar la actividad');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader title="Actividad" subtitle="Trazabilidad de acciones del sistema" />

      {loading ? (
        <div className="flex justify-center py-20 text-text-muted">
          <Spinner className="h-6 w-6" />
        </div>
      ) : (
        <Table head={['Usuario', 'Acción', 'Entidad', 'Fecha']} empty="Sin registros">
          {logs.map((l) => (
            <tr key={l.id}>
              <td className="px-4 py-3">
                <div className="font-medium text-text">{l.user?.name || 'Sistema'}</div>
                <div className="text-[11px] text-text-muted">{l.user?.email || ''}</div>
              </td>
              <td className="px-4 py-3">
                <Badge color={ACTION_COLOR[l.action] || 'gray'}>{ACTION_LABELS[l.action] ?? l.action}</Badge>
              </td>
              <td className="px-4 py-3 text-text-muted">{l.entity}</td>
              <td className="px-4 py-3 text-xs text-text-muted">{formatDateTime(l.createdAt)}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}