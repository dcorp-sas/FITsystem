'use client';

import { useCallback, useEffect, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import { formatMoney } from '@fitsystem/utils';
import type { Instructor } from '@/lib/types';
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
  Table,
} from '@/components/ui';
import { Icon } from '@/components/icon';

export default function InstructorsPage() {
  const toast = useToast();
  const { organization, branches } = useAuth();
  const currency = organization?.currency || 'ARS';
  const [items, setItems] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Instructor | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await http.get<Instructor[]>('/instructors'));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al cargar profesores');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <PageHeader
        title="Profesores"
        subtitle="Equipo de instructores"
        action={
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Icon name="plus" size={16} /> Nuevo profesor
          </Button>
        }
      />

      <div className="mb-4 max-w-md">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar profesor..." />
      </div>

      {loading ? (
        <div className="flex justify-center py-20 text-text-muted">
          <Spinner className="h-6 w-6" />
        </div>
      ) : (
        <Table head={['Profesor', 'Especialidad', 'Contacto', 'Tarifas', 'Clases', 'Estado', '']} empty="Sin profesores">
          {filtered.map((i) => (
            <tr key={i.id} className="hover:bg-surface-alt/40">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: i.color }} />
                  <span className="font-medium text-text">{i.name}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-text-muted">{i.specialty || '—'}</td>
              <td className="px-4 py-3 text-text-muted">
                <div>{i.phone || '—'}</div>
                <div className="text-[11px]">{i.email || ''}</div>
              </td>
              <td className="px-4 py-3 text-xs text-text-muted">
                Hora: {formatMoney(i.hourlyRate, currency)}
                <br />
                Clase: {formatMoney(i.classRate, currency)} · {i.commissionPct}%
              </td>
              <td className="px-4 py-3 text-text-muted">{i._count?.classes ?? 0}</td>
              <td className="px-4 py-3">
                <Badge color={i.isActive ? 'green' : 'gray'}>{i.isActive ? 'Activo' : 'Inactivo'}</Badge>
              </td>
              <td className="px-4 py-3 text-right">
                <Button size="sm" variant="ghost" onClick={() => { setEditing(i); setOpen(true); }}>
                  <Icon name="edit" size={15} />
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <InstructorModal open={open} onClose={() => setOpen(false)} instructor={editing} onSaved={load} />
    </div>
  );
}

const EMPTY = {
  name: '',
  email: '',
  phone: '',
  specialty: '',
  hourlyRate: '0',
  classRate: '0',
  commissionPct: '0',
  color: '#0ea5e9',
  isActive: true,
  createPortalAccess: true,
  password: '',
};

function InstructorModal({
  open,
  onClose,
  instructor,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  instructor: Instructor | null;
  onSaved: () => void;
}) {
  const toast = useToast();
  const { branches } = useAuth();
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (instructor) {
      setForm({
        name: instructor.name,
        email: instructor.email || '',
        phone: instructor.phone || '',
        specialty: instructor.specialty || '',
        hourlyRate: String(instructor.hourlyRate),
        classRate: String(instructor.classRate),
        commissionPct: String(instructor.commissionPct),
        color: instructor.color,
        isActive: instructor.isActive,
        createPortalAccess: Boolean((instructor as Instructor & { userId?: string | null }).userId),
        password: '',
      });
    } else {
      setForm({ ...EMPTY });
    }
  }, [open, instructor]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      email: form.email || null,
      phone: form.phone || null,
      specialty: form.specialty || null,
      hourlyRate: Number(form.hourlyRate || 0),
      classRate: Number(form.classRate || 0),
      commissionPct: Number(form.commissionPct || 0),
      color: form.color,
      isActive: form.isActive,
      branchId: branches[0]?.id || null,
    };
    try {
      let userId = (instructor as (Instructor & { userId?: string | null }) | null)?.userId || null;
      if (form.createPortalAccess) {
        if (!form.email.trim()) throw new Error('Ingresá un email para el acceso al portal.');
        if (!instructor && form.password.trim().length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
        if (!instructor) {
          const account = await http.post<{ id: string }>('/users', {
            name: form.name.trim(), email: form.email.trim(), password: form.password,
            role: 'INSTRUCTOR', phone: form.phone || null, isActive: form.isActive,
          });
          userId = account.id;
        } else if (userId && form.password.trim()) {
          await http.put(`/users/${userId}`, {
            name: form.name.trim(), email: form.email.trim(), password: form.password,
            role: 'INSTRUCTOR', phone: form.phone || null, isActive: form.isActive,
          });
        } else if (!userId) {
          if (form.password.trim().length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
          const account = await http.post<{ id: string }>('/users', {
            name: form.name.trim(), email: form.email.trim(), password: form.password,
            role: 'INSTRUCTOR', phone: form.phone || null, isActive: form.isActive,
          });
          userId = account.id;
        }
      }
      const linkedPayload = { ...payload, userId: form.createPortalAccess ? userId : null };
      if (instructor) await http.put(`/instructors/${instructor.id}`, linkedPayload);
      else await http.post('/instructors', linkedPayload);
      toast.success(form.createPortalAccess ? 'Profesor guardado con acceso al portal' : (instructor ? 'Profesor actualizado' : 'Profesor creado'));
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
      title={instructor ? 'Editar profesor' : 'Nuevo profesor'}
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
        <Field label="Nombre *" className="sm:col-span-2">
          <Input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </Field>
        <Field label="Teléfono">
          <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
        </Field>
        <Field label="Especialidad" className="sm:col-span-2">
          <Input value={form.specialty} onChange={(e) => setForm((f) => ({ ...f, specialty: e.target.value }))} />
        </Field>
        <Field label="Valor hora">
          <Input type="number" step="0.01" min="0" value={form.hourlyRate} onChange={(e) => setForm((f) => ({ ...f, hourlyRate: e.target.value }))} />
        </Field>
        <Field label="Valor por clase">
          <Input type="number" step="0.01" min="0" value={form.classRate} onChange={(e) => setForm((f) => ({ ...f, classRate: e.target.value }))} />
        </Field>
        <Field label="Comisión (%)">
          <Input type="number" step="0.1" min="0" max="100" value={form.commissionPct} onChange={(e) => setForm((f) => ({ ...f, commissionPct: e.target.value }))} />
        </Field>
        <Field label="Color">
          <Input type="color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} className="h-10 p-1" />
        </Field>
        <div className="sm:col-span-2 rounded-xl border border-line p-4">
          <label className="flex items-center gap-2 text-sm font-semibold text-text">
            <input type="checkbox" checked={form.createPortalAccess} onChange={(e) => setForm((f) => ({ ...f, createPortalAccess: e.target.checked, password: '' }))} className="h-4 w-4" />
            Crear acceso al portal de profesores
          </label>
          {form.createPortalAccess ? <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Usuario (email)">
              <Input type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </Field>
            <Field label={instructor && (instructor as Instructor & { userId?: string | null }).userId ? 'Nueva contraseña (opcional)' : 'Contraseña inicial *'}>
              <Input type="password" autoComplete="new-password" required={!(instructor && (instructor as Instructor & { userId?: string | null }).userId)} minLength={6} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder={instructor ? 'Dejar vacía para mantenerla' : 'Mínimo 6 caracteres'} />
            </Field>
            <p className="text-xs text-text-muted sm:col-span-2">El profesor ingresará en profes.fitsystem.com.ar con este email y contraseña. El usuario queda vinculado al profesor y al gimnasio.</p>
          </div> : null}
        </div>
        <label className="flex items-center gap-2 text-sm text-text sm:col-span-2">
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="h-4 w-4" />
          Activo
        </label>
      </form>
    </Modal>
  );
}
