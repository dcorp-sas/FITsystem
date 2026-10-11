'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { formatMoney, formatDate } from '@fitsystem/utils';
import { MEMBERSHIP_STATUS_LABELS } from '@/lib/labels';
import type { Membership } from '@/lib/types';
import { MembershipFormModal } from '@/components/membership-form';
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  Spinner,
  StatusBadge,
  Table,
} from '@/components/ui';
import { Icon } from '@/components/icon';

export default function MembershipsPage() {
  const toast = useToast();
  const [items, setItems] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [expiringDays, setExpiringDays] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [freezeFor, setFreezeFor] = useState<Membership | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await http.get<Membership[]>('/memberships', { search, status, expiringDays }));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al cargar membresías');
    } finally {
      setLoading(false);
    }
  }, [search, status, expiringDays, toast]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function action(path: string, body?: unknown, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    try {
      await http.post(path, body);
      toast.success('Operación realizada');
      load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo completar');
    }
  }

  return (
    <div>
      <PageHeader
        title="Membresías"
        subtitle={`${items.length} membresías`}
        action={
          <Button onClick={() => setFormOpen(true)}>
            <Icon name="plus" size={16} /> Nueva membresía
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar socio por nombre o código..." />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-44">
          <option value="">Todos los estados</option>
          {Object.entries(MEMBERSHIP_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select value={expiringDays} onChange={(e) => setExpiringDays(e.target.value)} className="sm:w-48">
          <option value="">Sin filtro de vencimiento</option>
          <option value="7">Vencen en 7 días</option>
          <option value="15">Vencen en 15 días</option>
          <option value="30">Vencen en 30 días</option>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-24 text-text-muted">
          <Spinner className="h-6 w-6" />
        </div>
      ) : (
        <Table head={['Socio', 'Plan', 'Vigencia', 'Estado', 'Saldo', '']} empty="Sin membresías">
          {items.map((m) => (
            <tr key={m.id} className="hover:bg-surface-alt/40">
              <td className="px-4 py-3">
                <div className="font-medium text-text">{m.member?.name}</div>
                <div className="text-[11px] text-text-muted">
                  #{m.member?.memberCode} {m.member?.phone ? `· ${m.member.phone}` : ''}
                </div>
              </td>
              <td className="px-4 py-3">
                <Badge color="blue">{m.planName}</Badge>
              </td>
              <td className="px-4 py-3 text-xs text-text-muted">
                {formatDate(m.startDate)} → {formatDate(m.endDate)}
                {typeof m.daysLeft === 'number' && (
                  <div className={m.daysLeft < 0 ? 'text-danger' : m.daysLeft <= 3 ? 'text-warning' : ''}>
                    {m.daysLeft < 0 ? `vencida hace ${Math.abs(m.daysLeft)} días` : `${m.daysLeft} días restantes`}
                  </div>
                )}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={m.status} label={MEMBERSHIP_STATUS_LABELS[m.status]} />
              </td>
              <td className="px-4 py-3 font-medium text-text">{formatMoney(m.price - m.discount)}</td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => action(`/memberships/${m.id}/renew`)}>
                    Renovar
                  </Button>
                  {m.status === 'FROZEN' ? (
                    <Button size="sm" variant="ghost" onClick={() => action(`/memberships/${m.id}/unfreeze`)}>
                      Reactivar
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setFreezeFor(m)}>
                      Congelar
                    </Button>
                  )}
                  <Link href={`/members/${m.memberId}`}>
                    <Button size="sm" variant="ghost">
                      Ver
                    </Button>
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <MembershipFormModal open={formOpen} onClose={() => setFormOpen(false)} onSaved={load} />
      <FreezeModal membership={freezeFor} onClose={() => setFreezeFor(null)} onSaved={load} />
    </div>
  );
}

function FreezeModal({ membership, onClose, onSaved }: { membership: Membership | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [fee, setFee] = useState('0');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (membership) {
      setStartDate(new Date().toISOString().slice(0, 10));
      setEndDate('');
      setReason('');
      setFee('0');
    }
  }, [membership]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await http.post(`/memberships/${membership?.id}/freeze`, {
        startDate,
        endDate,
        reason: reason || null,
        fee: fee ? Number(fee) : 0,
      });
      toast.success('Membresía congelada');
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo congelar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={!!membership}
      onClose={onClose}
      title="Congelar membresía"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} loading={saving}>
            Congelar
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Desde *">
          <Input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="Hasta *">
          <Input type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
        <Field label="Motivo">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Field label="Cargo por pausa">
          <Input type="number" step="0.01" min="0" value={fee} onChange={(e) => setFee(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}