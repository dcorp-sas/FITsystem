'use client';

import { useCallback, useEffect, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { formatDateTime } from '@fitsystem/utils';
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  Spinner,
  StatCard,
  Table,
} from '@/components/ui';
import { Icon } from '@/components/icon';

interface PortalRow {
  memberId: string;
  memberCode: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  hasAccount: boolean;
  isActive: boolean;
  accountId: string | null;
  activationPending: boolean;
  lastLoginAt: string | null;
}

interface Seats {
  used: number;
  total: number;
}

export default function PortalPage() {
  const toast = useToast();
  const [rows, setRows] = useState<PortalRow[]>([]);
  const [seats, setSeats] = useState<Seats>({ used: 0, total: 0 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<PortalRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await http.get<{ items: PortalRow[]; seats: Seats }>('/portal-accounts', {
        search: search || undefined,
      });
      setRows(res.items);
      setSeats(res.seats);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al cargar el portal');
    } finally {
      setLoading(false);
    }
  }, [search, toast]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function disable(row: PortalRow) {
    if (!row.accountId) return;
    if (!confirm(`¿Deshabilitar el acceso a la app de ${row.name}?`)) return;
    try {
      await http.del(`/portal-accounts/${row.accountId}`);
      toast.success('Acceso deshabilitado');
      load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al deshabilitar');
    }
  }

  return (
    <div>
      <PageHeader title="Socios de la app" subtitle="Acceso a la app móvil y asientos habilitados" />

      <div className="mb-5 grid grid-cols-2 gap-4 sm:max-w-md">
        <StatCard label="Asientos usados" value={seats.used} accent="blue" />
        <StatCard label="Asientos totales" value={seats.total || '—'} accent="green" />
      </div>

      <div className="mb-4 max-w-sm">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar socio, documento, legajo..." />
      </div>

      {loading ? (
        <div className="flex justify-center py-20 text-text-muted">
          <Spinner className="h-6 w-6" />
        </div>
      ) : (
        <Table
          head={['Socio', 'Contacto', 'Estado', 'Último acceso', 'App móvil', '']}
          empty="Sin socios"
        >
          {rows.map((r) => (
            <tr key={r.memberId} className="hover:bg-surface-alt/40">
              <td className="px-4 py-3">
                <div className="font-medium text-text">{r.name}</div>
                <div className="text-xs text-text-muted">{r.memberCode || '—'}</div>
              </td>
              <td className="px-4 py-3 text-text-muted">
                <div>{r.email || '—'}</div>
                <div className="text-xs">{r.phone || ''}</div>
              </td>
              <td className="px-4 py-3">
                <Badge color={r.status === 'ACTIVE' ? 'green' : 'gray'}>{r.status}</Badge>
              </td>
              <td className="px-4 py-3 text-xs text-text-muted">
                {r.lastLoginAt ? formatDateTime(r.lastLoginAt) : 'Nunca'}
              </td>
              <td className="px-4 py-3">
                {r.isActive ? (
                  r.activationPending ? (
                    <Badge color="yellow">Pendiente de activación</Badge>
                  ) : (
                    <Badge color="green">Habilitada</Badge>
                  )
                ) : (
                  <Badge color="gray">{r.hasAccount ? 'Deshabilitada' : 'Sin acceso'}</Badge>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setTarget(r)}>
                    <Icon name={r.hasAccount ? 'edit' : 'plus'} size={15} />
                  </Button>
                  {r.isActive && (
                    <Button size="sm" variant="ghost" onClick={() => disable(r)}>
                      <Icon name="close" size={15} />
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <PortalModal row={target} onClose={() => setTarget(null)} onSaved={load} />
    </div>
  );
}

function PortalModal({
  row,
  onClose,
  onSaved,
}: {
  row: PortalRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [generateCode, setGenerateCode] = useState(true);
  const [saving, setSaving] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [invite, setInvite] = useState<{ username: string; password: string; email: string; emailSent: boolean; emailError?: string | null } | null>(null);

  useEffect(() => {
    if (row) {
      setEmail(row.email || '');
      setPassword('');
      setGenerateCode(!row.hasAccount);
      setCode(null);
      setInvite(null);
    }
  }, [row]);

  async function sendInvite() {
    if (!row) return;
    setInviting(true);
    try {
      const res = await http.post<{ username: string; password: string; email: string; emailSent: boolean; emailError?: string | null }>(
        `/members/${row.memberId}/portal/invite`,
        { email: email || null },
      );
      setInvite(res);
      if (res.emailSent) toast.success('Credenciales enviadas por email');
      else toast.error(res.emailError || 'No se pudo enviar el email');
      onSaved();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al enviar');
    } finally {
      setInviting(false);
    }
  }

  async function submit() {
    if (!row) return;
    setSaving(true);
    try {
      const payload = {
        email: email || null,
        password: password || null,
        generateCode,
      };
      const res = row.accountId
        ? await http.post<{ account: { activationCode: string | null } }>(`/portal-accounts/${row.accountId}/reset`, payload)
        : await http.post<{ account: { activationCode: string | null } }>(`/members/${row.memberId}/portal`, payload);
      setCode(res.account.activationCode);
      toast.success('Acceso actualizado');
      onSaved();
      if (!res.account.activationCode) onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={Boolean(row)}
      onClose={onClose}
      title={`Acceso a la app · ${row?.name ?? ''}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
          <Button variant="secondary" onClick={sendInvite} loading={inviting} disabled={!email}>
            <Icon name="mail" size={15} /> Enviar credenciales
          </Button>
          <Button onClick={submit} loading={saving}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Email del socio" hint="Se usa para ingresar a la app">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="socio@mail.com" />
        </Field>

        <Field label="Contraseña" hint="Dejar vacío para generar un código de activación">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" />
        </Field>

        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={generateCode}
            onChange={(e) => setGenerateCode(e.target.checked)}
            disabled={Boolean(password)}
          />
          Generar código de activación para el primer ingreso
        </label>

        {code && (
          <Card title="Código de activación">
            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-surface-alt px-4 py-2 text-xl font-bold tracking-[0.3em] text-primary-light">
                {code}
              </span>
              <span className="text-xs text-text-muted">
                Compartilo con el socio para que active su cuenta en la app.
              </span>
            </div>
          </Card>
        )}

        {invite && (
          <Card title="Credenciales enviadas">
            <div className="space-y-1 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-text-muted">Usuario</span>
                <span className="font-mono text-text">{invite.username}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-text-muted">Clave</span>
                <span className="font-mono text-text">{invite.password}</span>
              </div>
              <p className="pt-1 text-xs text-text-muted">
                {invite.emailSent ? `Enviado a ${invite.email}.` : `No se pudo enviar a ${invite.email}.`} Compartilas manualmente si hace falta.
              </p>
            </div>
          </Card>
        )}
      </div>
    </Modal>
  );
}
