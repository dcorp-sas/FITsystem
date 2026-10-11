'use client';

import { useCallback, useEffect, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@fitsystem/utils';
import { ROLE_LABELS } from '@/lib/labels';
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  Table,
} from '@/components/ui';
import { Icon } from '@/components/icon';

interface UserInfo {
  id: string;
  name: string;
  email: string;
  role: string;
  branchId?: string | null;
  phone?: string | null;
  isActive: boolean;
  lastLoginAt?: string | null;
}

export default function UsersPage() {
  const toast = useToast();
  const { branches } = useAuth();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserInfo | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await http.get<UserInfo[]>('/users'));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Usuarios"
        subtitle="Accesos al sistema"
        action={
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Icon name="plus" size={16} /> Nuevo usuario
          </Button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-20 text-text-muted">
          <Spinner className="h-6 w-6" />
        </div>
      ) : (
        <Table head={['Usuario', 'Email', 'Rol', 'Sede', 'Último acceso', 'Estado', '']} empty="Sin usuarios">
          {users.map((u) => (
            <tr key={u.id} className="hover:bg-surface-alt/40">
              <td className="px-4 py-3 font-medium text-text">{u.name}</td>
              <td className="px-4 py-3 text-text-muted">{u.email}</td>
              <td className="px-4 py-3">
                <Badge color="blue">{ROLE_LABELS[u.role] ?? u.role}</Badge>
              </td>
              <td className="px-4 py-3 text-text-muted">
                {branches.find((b) => b.id === u.branchId)?.name || 'Todas'}
              </td>
              <td className="px-4 py-3 text-xs text-text-muted">
                {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Nunca'}
              </td>
              <td className="px-4 py-3">
                <Badge color={u.isActive ? 'green' : 'gray'}>{u.isActive ? 'Activo' : 'Inactivo'}</Badge>
              </td>
              <td className="px-4 py-3 text-right">
                <Button size="sm" variant="ghost" onClick={() => { setEditing(u); setOpen(true); }}>
                  <Icon name="edit" size={15} />
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <UserModal open={open} onClose={() => setOpen(false)} user={editing} onSaved={load} />
    </div>
  );
}

const EMPTY = {
  name: '',
  email: '',
  password: '',
  role: 'RECEPTIONIST',
  branchId: '',
  phone: '',
  isActive: true,
};

function UserModal({
  open,
  onClose,
  user,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  user: UserInfo | null;
  onSaved: () => void;
}) {
  const toast = useToast();
  const { branches } = useAuth();
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (user) {
      setForm({
        name: user.name,
        email: user.email,
        password: '',
        role: user.role,
        branchId: user.branchId || '',
        phone: user.phone || '',
        isActive: user.isActive,
      });
    } else {
      setForm({ ...EMPTY });
    }
  }, [open, user]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password || undefined,
      role: form.role,
      branchId: form.branchId || null,
      phone: form.phone || null,
      isActive: form.isActive,
    };
    try {
      if (user) await http.put(`/users/${user.id}`, payload);
      else await http.post('/users', payload);
      toast.success(user ? 'Usuario actualizado' : 'Usuario creado');
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
      title={user ? 'Editar usuario' : 'Nuevo usuario'}
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
        <Field label="Email *">
          <Input type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </Field>
        <Field label="Teléfono">
          <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
        </Field>
        <Field label="Rol">
          <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
            {Object.entries(ROLE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Sede">
          <Select value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}>
            <option value="">Todas las sedes</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={user ? 'Contraseña (dejar vacío para no cambiar)' : 'Contraseña *'} className="sm:col-span-2">
          <Input type="password" required={!user} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-text sm:col-span-2">
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="h-4 w-4" />
          Activo
        </label>
      </form>
    </Modal>
  );
}