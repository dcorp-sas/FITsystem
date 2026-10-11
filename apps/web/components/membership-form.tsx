'use client';

import { useEffect, useMemo, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import { addDays, formatDate, formatMoney } from '@fitsystem/utils';
import type { Member, Plan } from '@/lib/types';
import { Button, Field, Input, Modal, Select } from '@/components/ui';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  memberId?: string | null;
}

export function MembershipFormModal({ open, onClose, onSaved, memberId }: Props) {
  const toast = useToast();
  const { branches, activeBranchId } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    memberId: memberId || '',
    planId: '',
    branchId: activeBranchId || '',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: '',
    price: '',
    discount: '0',
    autoRenew: false,
    status: 'ACTIVE',
  });

  useEffect(() => {
    if (!open) return;
    setForm((f) => ({
      ...f,
      memberId: memberId || '',
      branchId: activeBranchId || branches[0]?.id || '',
      startDate: new Date().toISOString().slice(0, 10),
      endDate: '',
      planId: '',
      price: '',
      discount: '0',
    }));
    Promise.all([
      http.get<Plan[]>('/plans'),
      http.get<{ items: Member[] }>('/members', { pageSize: 200 }),
    ])
      .then(([p, m]) => {
        setPlans(p);
        setMembers(m.items);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectedPlan = plans.find((p) => p.id === form.planId);

  function setPlan(planId: string) {
    const plan = plans.find((p) => p.id === planId);
    setForm((f) => ({
      ...f,
      planId,
      price: plan ? String(plan.price) : f.price,
      endDate: '',
    }));
  }

  const computedEnd = useMemo(() => {
    if (!selectedPlan || !form.startDate) return form.endDate;
    return addDays(new Date(form.startDate), selectedPlan.durationDays - 1).toISOString().slice(0, 10);
  }, [selectedPlan, form.startDate, form.endDate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await http.post('/memberships', {
        memberId: form.memberId,
        planId: form.planId,
        branchId: form.branchId,
        startDate: form.startDate,
        endDate: form.endDate || undefined,
        price: form.price ? Number(form.price) : undefined,
        discount: form.discount ? Number(form.discount) : 0,
        autoRenew: form.autoRenew,
        status: form.status,
      });
      toast.success('Membresía creada');
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al crear la membresía');
    } finally {
      setSaving(false);
    }
  }

  const finalPrice = Number(form.price || selectedPlan?.price || 0) - Number(form.discount || 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nueva membresía"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} loading={saving}>
            Crear membresía
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Socio *" className="sm:col-span-2">
          <Select required value={form.memberId} onChange={(e) => setForm((f) => ({ ...f, memberId: e.target.value }))}>
            <option value="">Seleccionar socio...</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.firstName} {m.lastName} · {m.memberCode}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Plan *">
          <Select required value={form.planId} onChange={(e) => setPlan(e.target.value)}>
            <option value="">Seleccionar plan...</option>
            {plans
              .filter((p) => p.isActive)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {formatMoney(p.price, p.currency)} · {p.durationDays} días
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Sede *">
          <Select required value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Inicio *">
          <Input type="date" required value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
        </Field>
        <Field label="Vencimiento" hint={computedEnd ? `Sugerido: ${formatDate(computedEnd)}` : undefined}>
          <Input type="date" value={form.endDate || computedEnd} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
        </Field>
        <Field label="Precio">
          <Input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder={selectedPlan ? String(selectedPlan.price) : '0'} />
        </Field>
        <Field label="Descuento">
          <Input type="number" step="0.01" min="0" value={form.discount} onChange={(e) => setForm((f) => ({ ...f, discount: e.target.value }))} />
        </Field>
        <Field label="Estado">
          <Select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
            <option value="ACTIVE">Activa</option>
            <option value="PENDING">Pendiente</option>
            <option value="FROZEN">Congelada</option>
          </Select>
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-text">
          <input
            type="checkbox"
            checked={form.autoRenew}
            onChange={(e) => setForm((f) => ({ ...f, autoRenew: e.target.checked }))}
            className="h-4 w-4 rounded border-line bg-surface"
          />
          Renovación automática
        </label>
        <div className="sm:col-span-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
          <span className="text-text-muted">Total a cobrar: </span>
          <span className="font-bold text-primary-light">{formatMoney(finalPrice)}</span>
        </div>
      </form>
    </Modal>
  );
}