'use client';

import { useEffect, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { PAYMENT_CONCEPT_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from '@/lib/labels';
import type { Member, Membership } from '@/lib/types';
import { Button, Field, Input, Modal, Select, Textarea } from '@/components/ui';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  memberId?: string | null;
  membershipId?: string | null;
  defaultAmount?: number;
  defaultConcept?: string;
}

const EMPTY = {
  memberId: '',
  membershipId: '',
  concept: 'MEMBERSHIP',
  method: 'CASH',
  amount: '',
  reference: '',
  status: 'COMPLETED',
  notes: '',
};

export function PaymentFormModal({ open, onClose, onSaved, memberId, membershipId, defaultAmount, defaultConcept }: Props) {
  const toast = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });

  useEffect(() => {
    if (!open) return;
    setForm({
      ...EMPTY,
      memberId: memberId || '',
      membershipId: membershipId || '',
      concept: defaultConcept || 'MEMBERSHIP',
      amount: defaultAmount ? String(defaultAmount) : '',
    });
    http
      .get<{ items: Member[] }>('/members', { pageSize: 200 })
      .then((res) => setMembers(res.items))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!form.memberId) {
      setMemberships([]);
      return;
    }
    http
      .get<{ member: Member }>(`/members/${form.memberId}`)
      .then((res) => setMemberships(res.member.memberships ?? []))
      .catch(() => setMemberships([]));
  }, [form.memberId]);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onSelectMembership(id: string) {
    const membership = memberships.find((m) => m.id === id);
    setForm((f) => ({
      ...f,
      membershipId: id,
      amount: membership ? String(Math.max(0, membership.price - membership.discount)) : f.amount,
    }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await http.post('/payments', {
        memberId: form.memberId || null,
        membershipId: form.membershipId || null,
        concept: form.concept,
        method: form.method,
        amount: Number(form.amount),
        reference: form.reference || null,
        status: form.status,
        notes: form.notes || null,
      });
      toast.success('Pago registrado');
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al registrar el pago');
    } finally {
      setSaving(false);
    }
  }

  const selected = members.find((m) => m.id === form.memberId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Registrar pago"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} loading={saving}>
            Registrar
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Socio" className="sm:col-span-2">
          <Select
            value={form.memberId}
            onChange={(e) => {
              set('memberId', e.target.value);
              set('membershipId', '');
            }}
          >
            <option value="">Sin socio (venta directa)</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.firstName} {m.lastName} · {m.memberCode}
              </option>
            ))}
          </Select>
        </Field>

        {selected && memberships.length > 0 && (
          <Field label="Membresía asociada" className="sm:col-span-2">
            <Select value={form.membershipId} onChange={(e) => onSelectMembership(e.target.value)}>
              <option value="">Ninguna</option>
              {memberships.map((ms) => (
                <option key={ms.id} value={ms.id}>
                  {ms.plan?.name ?? 'Plan'} · vence {String(ms.endDate).slice(0, 10)} · {ms.status}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Concepto">
          <Select value={form.concept} onChange={(e) => set('concept', e.target.value)}>
            {Object.entries(PAYMENT_CONCEPT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Medio de pago">
          <Select value={form.method} onChange={(e) => set('method', e.target.value)}>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Monto *">
          <Input type="number" step="0.01" min="0" required value={form.amount} onChange={(e) => set('amount', e.target.value)} />
        </Field>
        <Field label="Estado">
          <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
            {Object.entries(PAYMENT_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Referencia" hint="Vacío = automática" className="sm:col-span-2">
          <Input value={form.reference} onChange={(e) => set('reference', e.target.value)} />
        </Field>
        <Field label="Notas" className="sm:col-span-2">
          <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}