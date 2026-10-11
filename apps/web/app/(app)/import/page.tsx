'use client';

import { useCallback, useEffect, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import type { Plan } from '@/lib/types';
import {
  Button,
  Card,
  Field,
  PageHeader,
  Select,
  StatCard,
  Textarea,
} from '@/components/ui';
import { Icon } from '@/components/icon';

interface ImportResult {
  total: number;
  success: number;
  errors: { row: number; error?: string }[];
  batchId: string;
}

const TEMPLATE = 'Nombre,Apellido,Documento,Email,Telefono\nJuan,Pérez,30123456,juan@mail.com,1122334455';

export default function ImportPage() {
  const toast = useToast();
  const { branches, activeBranchId } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [csv, setCsv] = useState('');
  const [planId, setPlanId] = useState('');
  const [branchId, setBranchId] = useState(activeBranchId || branches[0]?.id || '');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const loadPlans = useCallback(async () => {
    try {
      const res = await http.get<Plan[]>('/plans');
      setPlans(res);
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsv(await file.text());
  }

  async function onImport() {
    if (!csv.trim()) {
      toast.error('Pegá o subí un archivo CSV');
      return;
    }
    setImporting(true);
    setResult(null);
    try {
      const res = await http.post<ImportResult>('/members/import-csv', {
        csv,
        branchId: branchId || undefined,
        defaultPlanId: planId || undefined,
      });
      setResult(res);
      toast.success('Importación completada: ' + res.success + ' socios');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al importar');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div>
      <PageHeader title="Importación masiva de socios" subtitle="Cargá socios desde un CSV" />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Datos CSV">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text hover:bg-surface-alt">
                  <Icon name="import" size={16} /> Subir archivo .csv
                  <input type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
                </label>
                <Button variant="ghost" size="sm" onClick={() => setCsv(TEMPLATE)}>
                  Usar ejemplo
                </Button>
              </div>
              <Field label="Contenido" hint="Columnas: Nombre, Apellido, Documento, Email, Teléfono">
                <Textarea
                  value={csv}
                  onChange={(e) => setCsv(e.target.value)}
                  className="min-h-52 font-mono text-xs"
                  placeholder={TEMPLATE}
                />
              </Field>
            </div>
          </Card>
        </div>

        <div>
          <Card title="Opciones">
            <div className="space-y-4">
              <Field label="Sede destino">
                <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Plan por defecto (opcional)">
                <Select value={planId} onChange={(e) => setPlanId(e.target.value)}>
                  <option value="">No asignar plan</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button className="w-full" onClick={onImport} loading={importing}>
                <Icon name="import" size={16} /> Importar socios
              </Button>
            </div>
          </Card>

          {result && (
            <Card title="Resultado" className="mt-5">
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Procesados" value={result.total} accent="blue" />
                <StatCard label="Importados" value={result.success} accent="green" />
              </div>
              {result.errors.length > 0 && (
                <div className="mt-4">
                  <div className="mb-2 text-xs font-semibold text-danger">
                    {result.errors.length} filas con error
                  </div>
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg bg-surface-alt/50 p-2 text-xs text-text-muted">
                    {result.errors.map((e, i) => (
                      <div key={i}>
                        Fila {e.row}: {e.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}