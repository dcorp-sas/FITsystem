'use client';

import { useEffect, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import type { Member } from '@/lib/types';
import { Button, Field, Input, Modal, Select, Textarea } from '@/components/ui';

interface Props {
  open: boolean;
  onClose: () => void;
  member?: Member | null;
  onSaved: () => void;
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

export function MemberFormModal({ open, onClose, member, onSaved }: Props) {
  const { branches, activeBranchId } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
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
    };
    try {
      if (member) await http.put(`/members/${member.id}`, payload);
      else await http.post('/members', payload);
      toast.success(member ? 'Socio actualizado' : 'Socio creado');
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
      </form>
    </Modal>
  );
}