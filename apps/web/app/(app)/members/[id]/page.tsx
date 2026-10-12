'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import { formatMoney, formatDate, formatDateTime } from '@fitsystem/utils';
import {
  MEMBER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_CONCEPT_LABELS,
  MEMBERSHIP_STATUS_LABELS,
  RISK_LABELS,
} from '@/lib/labels';
import type { Member, Membership, Payment, Attendance } from '@/lib/types';
import { MemberFormModal } from '@/components/member-form';
import { MembershipFormModal } from '@/components/membership-form';
import { PaymentFormModal } from '@/components/payment-form';
import { FaceCaptureModal, type FaceCaptureMode } from '@/components/face-capture';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Spinner,
  StatusBadge,
} from '@/components/ui';
import { Icon } from '@/components/icon';

type Tab = 'memberships' | 'payments' | 'attendance' | 'sales';

export default function MemberDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const [member, setMember] = useState<Member | null>(null);
  const [risk, setRisk] = useState<{ score: number; level: string } | null>(null);
  const [face, setFace] = useState<{ enrolled: boolean; samples: number; updatedAt?: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('memberships');
  const [editOpen, setEditOpen] = useState(false);
  const [membershipOpen, setMembershipOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [freezeFor, setFreezeFor] = useState<Membership | null>(null);
  const [faceOpen, setFaceOpen] = useState<FaceCaptureMode | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, faceRes] = await Promise.all([
        http.get<{ member: Member; risk: { score: number; level: string } }>(`/members/${id}`),
        http.get<{ enrolled: boolean; samples: number; updatedAt?: string | null }>(`/members/${id}/face`).catch(() => null),
      ]);
      setMember(res.member);
      setRisk(res.risk);
      setFace(faceRes);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al cargar el socio');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function membershipAction(path: string, body?: unknown, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    try {
      await http.post(path, body);
      toast.success('Operación realizada');
      load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo completar');
    }
  }

  async function onDelete() {
    if (!window.confirm('¿Dar de baja a este socio? Quedará inactivo.')) return;
    try {
      await http.del(`/members/${id}`);
      toast.success('Socio dado de baja');
      router.push('/members');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error');
    }
  }

  async function removeFace() {
    if (!window.confirm('¿Eliminar el rostro registrado del socio?')) return;
    try {
      await http.del(`/members/${id}/face`);
      toast.success('Rostro eliminado');
      load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo eliminar');
    }
  }

  if (loading && !member) {
    return (
      <div className="flex justify-center py-24 text-text-muted">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }
  if (!member) return null;

  const memberships = member.memberships ?? [];
  const active = memberships.find((m) => m.status === 'ACTIVE' || m.status === 'FROZEN');
  const payments = member.payments ?? [];
  const attendance = member.attendance ?? [];
  const sales = member.sales ?? [];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-xl font-bold text-primary-light">
            {member.firstName.charAt(0)}
            {member.lastName.charAt(0)}
          </div>
          <div>
            <h1 className="text-xl font-bold text-text">
              {member.firstName} {member.lastName}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
              <span className="font-mono">#{member.memberCode}</span>
              <StatusBadge status={member.status} label={MEMBER_STATUS_LABELS[member.status]} />
              {risk && risk.level !== 'LOW' && (
                <Badge color={risk.level === 'HIGH' ? 'red' : 'yellow'}>
                  Riesgo {RISK_LABELS[risk.level]} · {risk.score}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setEditOpen(true)}>
            <Icon name="edit" size={15} /> Editar
          </Button>
          <Button variant="secondary" onClick={() => setPaymentOpen(true)}>
            <Icon name="payments" size={15} /> Registrar pago
          </Button>
          <Button onClick={() => setMembershipOpen(true)}>
            <Icon name="plus" size={15} /> Membresía
          </Button>
          <Button variant="danger" onClick={onDelete}>
            <Icon name="trash" size={15} />
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5">
          <Card title="Datos del socio">
            <dl className="space-y-2 text-sm">
              <Row label="Documento" value={member.documentNumber ? `${member.documentType ?? ''} ${member.documentNumber}` : '-'} />
              <Row label="Teléfono" value={member.phone || '-'} />
              <Row label="Email" value={member.email || '-'} />
              <Row label="Nacimiento" value={formatDate(member.birthDate)} />
              <Row label="Dirección" value={[member.address, member.city].filter(Boolean).join(', ') || '-'} />
              <Row label="Sede" value={member.branch?.name || '-'} />
              <Row label="Emergencia" value={[member.emergencyName, member.emergencyPhone].filter(Boolean).join(' · ') || '-'} />
              <Row label="Visitas" value={String(member.totalVisits)} />
              <Row label="Última visita" value={formatDate(member.lastVisitAt)} />
              <Row label="Alta" value={formatDate(member.createdAt)} />
            </dl>
            {member.notes && <p className="mt-3 rounded-lg bg-surface-alt/50 p-3 text-xs text-text-muted">{member.notes}</p>}
          </Card>

          <Card title="Membresía actual">
            {active ? (
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-text">{active.plan?.name}</div>
                    <div className="text-xs text-text-muted">
                      {formatDate(active.startDate)} → {formatDate(active.endDate)}
                    </div>
                  </div>
                  <StatusBadge status={active.status} label={MEMBERSHIP_STATUS_LABELS[active.status]} />
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-lg font-bold text-text">{formatMoney(active.price - active.discount)}</span>
                  <span className="text-xs text-text-muted">días restantes: {Math.max(0, active.daysLeft ?? 0)}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => membershipAction(`/memberships/${active.id}/renew`)}>
                    Renovar
                  </Button>
                  {active.status === 'FROZEN' ? (
                    <Button size="sm" variant="success" onClick={() => membershipAction(`/memberships/${active.id}/unfreeze`)}>
                      Reactivar
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => setFreezeFor(active)}>
                      Congelar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => membershipAction(`/memberships/${active.id}/cancel`, undefined, '¿Cancelar esta membresía?')}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <EmptyState icon="📋" message="Sin membresía activa" action={<Button size="sm" onClick={() => setMembershipOpen(true)}>Crear membresía</Button>} />
            )}
          </Card>

          <Card title="Reconocimiento facial">
            {face ? (
              <div>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-text-muted">
                    {face.enrolled ? (
                      <span className="text-text">
                        Rostro registrado · <span className="font-medium">{face.samples} muestra(s)</span>
                      </span>
                    ) : (
                      'Este socio todavía no registró su rostro'
                    )}
                  </div>
                  <Badge color={face.enrolled ? 'green' : 'gray'}>
                    {face.enrolled ? 'Enrolado' : 'No enrolado'}
                  </Badge>
                </div>
                {face.updatedAt && face.enrolled && (
                  <div className="mt-1 text-xs text-text-muted">Actualizado: {formatDateTime(face.updatedAt)}</div>
                )}
                {['OWNER', 'ADMIN', 'MANAGER', 'RECEPTIONIST'].includes(user?.role ?? '') && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" variant={face.enrolled ? 'secondary' : undefined} onClick={() => setFaceOpen('enroll')}>
                      {face.enrolled ? 'Registrar nuevamente' : 'Registrar rostro'}
                    </Button>
                    {face.enrolled && (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => setFaceOpen('verify')}>
                          Probar
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={removeFace}
                        >
                          Quitar
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-text-muted">Verificando…</div>
            )}
          </Card>
        </div>

        <div className="lg:col-span-2">
          <div className="mb-4 flex gap-1 rounded-lg border border-line bg-surface p-1">
            {(
              [
                ['memberships', `Membresías (${memberships.length})`],
                ['payments', `Pagos (${payments.length})`],
                ['attendance', `Asistencia (${attendance.length})`],
                ['sales', `Compras (${sales.length})`],
              ] as [Tab, string][]
            ).map(([key, lbl]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition ${
                  tab === key ? 'bg-primary text-white' : 'text-text-muted hover:bg-surface-alt'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          <Card padded={false}>
            {tab === 'memberships' && (
              <SimpleList
                empty="Sin membresías"
                items={memberships.map((m) => ({
                  id: m.id,
                  left: (
                    <div>
                      <div className="font-medium text-text">{m.plan?.name}</div>
                      <div className="text-xs text-text-muted">
                        {formatDate(m.startDate)} → {formatDate(m.endDate)}
                      </div>
                    </div>
                  ),
                  right: (
                    <div className="text-right">
                      <StatusBadge status={m.status} label={MEMBERSHIP_STATUS_LABELS[m.status]} />
                      <div className="mt-1 text-xs text-text-muted">{formatMoney(m.price - m.discount)}</div>
                    </div>
                  ),
                }))}
              />
            )}
            {tab === 'payments' && (
              <SimpleList
                empty="Sin pagos"
                items={payments.map((p: Payment) => ({
                  id: p.id,
                  left: (
                    <div>
                      <div className="font-medium text-text">{PAYMENT_CONCEPT_LABELS[p.concept] ?? p.concept}</div>
                      <div className="text-xs text-text-muted">
                        {formatDateTime(p.paidAt)} · {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
                      </div>
                    </div>
                  ),
                  right: (
                    <div className="text-right">
                      <div className="font-semibold text-text">{formatMoney(p.amount)}</div>
                      <StatusBadge status={p.status} />
                    </div>
                  ),
                }))}
              />
            )}
            {tab === 'attendance' && (
              <SimpleList
                empty="Sin registros de asistencia"
                items={attendance.map((a: Attendance) => ({
                  id: a.id,
                  left: (
                    <div>
                      <div className="font-medium text-text">{formatDateTime(a.checkedInAt)}</div>
                      <div className="text-xs text-text-muted">Método: {a.method}</div>
                    </div>
                  ),
                  right: <StatusBadge status={a.status} />,
                }))}
              />
            )}
            {tab === 'sales' && (
              <SimpleList
                empty="Sin compras"
                items={sales.map((s) => ({
                  id: s.id,
                  left: (
                    <div>
                      <div className="font-medium text-text">{s.number}</div>
                      <div className="text-xs text-text-muted">{s.items.map((i) => `${i.name} x${i.quantity}`).join(', ')}</div>
                    </div>
                  ),
                  right: <div className="font-medium text-text">{formatMoney(s.total)}</div>,
                }))}
              />
            )}
          </Card>
        </div>
      </div>

      <MemberFormModal open={editOpen} onClose={() => setEditOpen(false)} member={member} onSaved={load} />
      <MembershipFormModal open={membershipOpen} onClose={() => setMembershipOpen(false)} onSaved={load} memberId={member.id} />
      <PaymentFormModal open={paymentOpen} onClose={() => setPaymentOpen(false)} onSaved={load} memberId={member.id} />
      <FreezeModal membership={freezeFor} onClose={() => setFreezeFor(null)} onSaved={load} />
      <FaceCaptureModal
        open={!!faceOpen}
        onClose={() => setFaceOpen(null)}
        mode={faceOpen ?? 'enroll'}
        memberId={faceOpen === 'enroll' ? member.id : undefined}
        branchId={member.branchId}
        onDone={load}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-right font-medium text-text">{value}</dd>
    </div>
  );
}

function SimpleList({
  items,
  empty,
}: {
  items: { id: string; left: React.ReactNode; right: React.ReactNode }[];
  empty: string;
}) {
  if (!items.length) return <EmptyState message={empty} />;
  return (
    <ul className="divide-y divide-line">
      {items.map((it) => (
        <li key={it.id} className="flex items-center justify-between gap-3 px-4 py-3">
          {it.left}
          {it.right}
        </li>
      ))}
    </ul>
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
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Viaje, lesión, etc." />
        </Field>
        <Field label="Cargo por pausa">
          <Input type="number" step="0.01" min="0" value={fee} onChange={(e) => setFee(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}