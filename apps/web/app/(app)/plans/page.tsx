'use client';

import { useEffect, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { formatMoney } from '@fitsystem/utils';
import type { Plan } from '@/lib/types';
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Spinner } from '@/components/ui';
import { Icon } from '@/components/icon';

export default function PlansPage() {
  const toast = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);

  async function load() {
    setLoading(true);
    try {
      setPlans(await http.get<Plan[]>('/plans'));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al cargar planes');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <PageHeader
        title="Planes"
        subtitle="Cuotas y beneficios"
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Icon name="plus" size={16} /> Nuevo plan
          </Button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-24 text-text-muted">
          <Spinner className="h-6 w-6" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => (
            <Card key={p.id} className="relative">
              <div className="mb-3 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="h-10 w-10 rounded-lg" style={{ backgroundColor: p.color }} />
                  <div>
                    <div className="font-semibold text-text">{p.name}</div>
                    <div className="text-xs text-text-muted">{p.durationDays} días</div>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setEditing(p); setOpen(true); }}>
                  <Icon name="edit" size={15} />
                </Button>
              </div>
              <div className="text-2xl font-bold text-text">{formatMoney(p.price, p.currency)}</div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge color="blue">{p.type}</Badge>
                {p._count ? <Badge color="green">{p._count.memberships} activos</Badge> : null}
                {p.allowFreeze ? <Badge color="sky">Permite pausa</Badge> : null}
                {!p.isActive ? <Badge color="red">Inactivo</Badge> : null}
              </div>
              {p.description && <p className="mt-3 text-xs text-text-muted">{p.description}</p>}
            </Card>
          ))}
        </div>
      )}

      <PlanFormModal open={open} onClose={() => setOpen(false)} plan={editing} onSaved={load} />
    </div>
  );
}

const EMPTY = {
  name: '',
  description: '',
  type: 'MONTHLY',
  price: '',
  currency: 'ARS',
  durationDays: '30',
  sessionsLimit: '',
  allowFreeze: false,
  maxFreezeDays: '0',
  freezeFee: '0',
  signupFee: '0',
  color: '#2563eb',
  isActive: true,
};

function PlanFormModal({ open, onClose, plan, onSaved }: { open: boolean; onClose: () => void; plan: Plan | null; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (plan) {
      setForm({
        name: plan.name,
        description: plan.description || '',
        type: plan.type,
        price: String(plan.price),
        currency: plan.currency,
        durationDays: String(plan.durationDays),
        sessionsLimit: plan.sessionsLimit ? String(plan.sessionsLimit) : '',
        allowFreeze: plan.allowFreeze,
        maxFreezeDays: String(plan.maxFreezeDays),
        freezeFee: String(plan.freezeFee),
        signupFee: String(plan.signupFee),
        color: plan.color,
        isActive: plan.isActive,
      });
    } else {
      setForm({ ...EMPTY });
    }
  }, [open, plan]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      type: form.type,
      price: Number(form.price),
      currency: form.currency,
      durationDays: Number(form.durationDays),
      sessionsLimit: form.sessionsLimit ? Number(form.sessionsLimit) : null,
      allowFreeze: form.allowFreeze,
      maxFreezeDays: Number(form.maxFreezeDays || 0),
      freezeFee: Number(form.freezeFee || 0),
      signupFee: Number(form.signupFee || 0),
      color: form.color,
      isActive: form.isActive,
    };
    try {
      if (plan) await http.put(`/plans/${plan.id}`, payload);
      else await http.post('/plans', payload);
      toast.success(plan ? 'Plan actualizado' : 'Plan creado');
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={plan ? 'Editar plan' : 'Nuevo plan'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} loading={saving}>
            Guardar
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nombre *">
          <Input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </Field>
        <Field label="Tipo">
          <select
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-text outline-none focus:border-primary"
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
          >
            {Object.entries({ MONTHLY: 'Mensual', WEEKLY: 'Semanal', DAILY_PASS: 'Pase diario', PACKAGE: 'Paquete', ANNUAL: 'Anual' }).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Precio *">
          <Input type="number" step="0.01" min="0" required value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
        </Field>
        <Field label="Duración (días) *">
          <Input type="number" min="1" required value={form.durationDays} onChange={(e) => setForm((f) => ({ ...f, durationDays: e.target.value }))} />
        </Field>
        <Field label="Límite de sesiones" hint="Vacío = ilimitado">
          <Input type="number" min="0" value={form.sessionsLimit} onChange={(e) => setForm((f) => ({ ...f, sessionsLimit: e.target.value }))} />
        </Field>
        <Field label="Matrícula / inscripción">
          <Input type="number" step="0.01" min="0" value={form.signupFee} onChange={(e) => setForm((f) => ({ ...f, signupFee: e.target.value }))} />
        </Field>
        <Field label="Máx. días de pausa">
          <Input type="number" min="0" value={form.maxFreezeDays} onChange={(e) => setForm((f) => ({ ...f, maxFreezeDays: e.target.value }))} />
        </Field>
        <Field label="Cargo por pausa">
          <Input type="number" step="0.01" min="0" value={form.freezeFee} onChange={(e) => setForm((f) => ({ ...f, freezeFee: e.target.value }))} />
        </Field>
        <Field label="Color">
          <input
            type="color"
            value={form.color}
            onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
            className="h-10 w-full cursor-pointer rounded-lg border border-line bg-surface p-1"
          />
        </Field>
        <div className="flex items-end gap-4">
          <label className="flex items-center gap-2 text-sm text-text">
            <input type="checkbox" checked={form.allowFreeze} onChange={(e) => setForm((f) => ({ ...f, allowFreeze: e.target.checked }))} className="h-4 w-4" />
            Permite pausas
          </label>
          <label className="flex items-center gap-2 text-sm text-text">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="h-4 w-4" />
            Activo
          </label>
        </div>
        <Field label="Descripción" className="sm:col-span-2">
          <textarea
            className="min-h-20 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-text outline-none focus:border-primary"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </Field>
      </form>
    </Modal>
  );
}