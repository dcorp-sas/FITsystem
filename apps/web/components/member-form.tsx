'use client';

import { useEffect, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import type { Member } from '@/lib/types';
import { Button, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import { Icon } from '@/components/icon';

interface Props {
  open: boolean;
  onClose: () => void;
  member?: Member | null;
  onSaved: () => void;
}

interface PortalInfo {
  created: boolean;
  reason?: 'already' | 'seat_limit';
  username: string;
  password?: string;
}

const EMPTY = {
  branchId: '',
  firstName: '',
  lastName: '',
  documentType: 'DNI',
  documentNumber: '',
  email: '',
  phone: '',
  birthDate: '',
  gender: 'UNDISCLOSED',
  address: '',
  city: '',
  emergencyName: '',
  emergencyPhone: '',
  notes: '',
  status: 'ACTIVE',
  memberCode: '',
};

const SOCIOS_URL = process.env.NEXT_PUBLIC_SOCIOS_URL || '';

export function MemberFormModal({ open, onClose, member, onSaved }: Props) {
  const { branches, activeBranchId } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [notify, setNotify] = useState(false);
  const [creds, setCreds] = useState<{ memberId: string; username: string; password: string; email: string | null; emailSent: boolean } | null>(null);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCreds(null);
    setNotify(false);
    if (member) {
      setForm({
        branchId: member.branchId,
        firstName: member.firstName,
        lastName: member.lastName,
        documentType: member.documentType || 'DNI',
        documentNumber: member.documentNumber || '',
        email: member.email || '',
        phone: member.phone || '',
        birthDate: member.birthDate ? String(member.birthDate).slice(0, 10) : '',
        gender: member.gender || 'UNDISCLOSED',
        address: member.address || '',
        city: member.city || '',
        emergencyName: member.emergencyName || '',
        emergencyPhone: member.emergencyPhone || '',
        notes: member.notes || '',
        status: member.status,
        memberCode: member.memberCode,
      });
    } else {
      setForm({ ...EMPTY, branchId: activeBranchId || branches[0]?.id || '' });
    }
  }, [open, member, activeBranchId, branches]);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      branchId: form.branchId,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      documentType: form.documentType || null,
      documentNumber: form.documentNumber.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      birthDate: form.birthDate || null,
      gender: form.gender || null,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      emergencyName: form.emergencyName.trim() || null,
      emergencyPhone: form.emergencyPhone.trim() || null,
      notes: form.notes.trim() || null,
      status: form.status,
      memberCode: form.memberCode.trim() || undefined,
      notify,
    };
    try {
      if (member) {
        const updated = await http.put<{ id: string; email?: string | null; portal?: PortalInfo; emailSent?: boolean }>(`/members/${member.id}`, payload);
        onSaved();
        if (updated.portal?.created && updated.portal.password) {
          setCreds({
            memberId: member.id,
            username: updated.portal.username,
            password: updated.portal.password,
            email: updated.email ?? null,
            emailSent: Boolean(updated.emailSent),
          });
          toast.success('Socio actualizado');
        } else {
          toast.success('Socio actualizado');
          onClose();
        }
        return;
      }

      const created = await http.post<{ id: string; email?: string | null; portal?: PortalInfo; emailSent?: boolean }>('/members', payload);
      onSaved();
      if (created.portal?.created && created.portal.password) {
        setCreds({
          memberId: created.id,
          username: created.portal.username,
          password: created.portal.password,
          email: created.email ?? null,
          emailSent: Boolean(created.emailSent),
        });
        toast.success('Socio creado');
      } else {
        toast.success('Socio creado');
        onClose();
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function resend() {
    if (!creds) return;
    setResending(true);
    try {
      const res = await http.post<{ username: string; password: string; email: string; emailSent: boolean; emailError?: string | null }>(
        `/members/${creds.memberId}/portal/invite`,
        {},
      );
      setCreds((c) => (c ? { ...c, username: res.username, password: res.password, email: res.email, emailSent: res.emailSent } : c));
      if (res.emailSent) toast.success('Credenciales enviadas por WhatsApp');
      else toast.error(res.emailError || 'No se pudo enviar por WhatsApp');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo enviar');
    } finally {
      setResending(false);
    }
  }

  function copy(text: string, label: string) {
    void navigator.clipboard?.writeText(text).then(
      () => toast.success(`${label} copiado`),
      () => toast.error('No se pudo copiar'),
    );
  }

  if (creds) {
    const loginLabel = SOCIOS_URL || 'la app de socios';
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Acceso del socio creado"
        size="lg"
        footer={
          <Button onClick={onClose} type="button">
            Listo
          </Button>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            Compartí estas credenciales con el socio para que ingrese a {loginLabel}. Por seguridad, la clave no se vuelve a mostrar.
          </p>
          <div className="rounded-lg border border-line bg-surface-alt/40 p-4 text-sm">
            <div className="flex items-center justify-between gap-3 py-1">
              <span className="text-text-muted">Usuario</span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-text">{creds.username}</span>
                <button type="button" className="text-text-muted hover:text-text" onClick={() => copy(creds.username, 'Usuario')}>
                  <Icon name="copy" size={15} />
                </button>
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 py-1">
              <span className="text-text-muted">Clave</span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-text">{creds.password}</span>
                <button type="button" className="text-text-muted hover:text-text" onClick={() => copy(creds.password, 'Clave')}>
                  <Icon name="copy" size={15} />
                </button>
              </span>
            </div>
            {SOCIOS_URL && (
              <div className="flex items-center justify-between gap-3 py-1">
                <span className="text-text-muted">Ingresar</span>
                <a href={SOCIOS_URL} target="_blank" rel="noreferrer" className="text-primary-light hover:underline">
                  {SOCIOS_URL}
                </a>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-text-muted">
              {creds.emailSent ? 'Enviadas por WhatsApp al socio.' : 'No se pudieron enviar por WhatsApp (revisá el WhatsApp vinculado).'}
            </span>
            <Button variant="secondary" size="sm" onClick={resend} loading={resending} type="button">
              <Icon name="whatsapp" size={15} /> Reenviar por WhatsApp
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={member ? 'Editar socio' : 'Nuevo socio'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} type="button">
            Cancelar
          </Button>
          <Button onClick={onSubmit} loading={saving} type="submit" form="member-form">
            Guardar
          </Button>
        </>
      }
    >
      <form id="member-form" onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Sede *">
          <Select required value={form.branchId} onChange={(e) => set('branchId', e.target.value)}>
            <option value="">Seleccionar...</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Estado">
          <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
            <option value="ACTIVE">Activo</option>
            <option value="PENDING">Pendiente</option>
            <option value="SUSPENDED">Suspendido</option>
            <option value="FROZEN">Congelado</option>
            <option value="INACTIVE">Inactivo</option>
          </Select>
        </Field>
        <Field label="Nombre *">
          <Input required value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />
        </Field>
        <Field label="Apellido *">
          <Input required value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
        </Field>
        <Field label="Tipo de documento">
          <Select value={form.documentType} onChange={(e) => set('documentType', e.target.value)}>
            <option value="DNI">DNI</option>
            <option value="CUIT">CUIT</option>
            <option value="PASSPORT">Pasaporte</option>
            <option value="OTHER">Otro</option>
          </Select>
        </Field>
        <Field label="N° de documento">
          <Input value={form.documentNumber} onChange={(e) => set('documentNumber', e.target.value)} />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Teléfono">
          <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Fecha de nacimiento">
          <Input type="date" value={form.birthDate} onChange={(e) => set('birthDate', e.target.value)} />
        </Field>
        <Field label="Género">
          <Select value={form.gender} onChange={(e) => set('gender', e.target.value)}>
            <option value="UNDISCLOSED">Prefiero no decir</option>
            <option value="MALE">Masculino</option>
            <option value="FEMALE">Femenino</option>
            <option value="OTHER">Otro</option>
          </Select>
        </Field>
        <Field label="Dirección">
          <Input value={form.address} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <Field label="Ciudad">
          <Input value={form.city} onChange={(e) => set('city', e.target.value)} />
        </Field>
        <Field label="Contacto de emergencia">
          <Input value={form.emergencyName} onChange={(e) => set('emergencyName', e.target.value)} />
        </Field>
        <Field label="Teléfono de emergencia">
          <Input value={form.emergencyPhone} onChange={(e) => set('emergencyPhone', e.target.value)} />
        </Field>
        <Field label="Código de socio" hint="Vacío = automático" className="sm:col-span-2">
          <Input value={form.memberCode} onChange={(e) => set('memberCode', e.target.value)} />
        </Field>
        <Field label="Notas" className="sm:col-span-2">
          <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        {!member && (
          <label className="flex items-center gap-2 text-sm text-text sm:col-span-2">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="h-4 w-4" />
            Enviar credenciales de acceso a la app por WhatsApp
          </label>
        )}
      </form>
    </Modal>
  );
}
