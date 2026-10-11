'use client';

import { useCallback, useEffect, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import type { Branch } from '@/lib/types';
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  PageHeader,
  Spinner,
} from '@/components/ui';
import { Icon } from '@/components/icon';

export default function BranchesPage() {
  const toast = useToast();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBranches(await http.get<Branch[]>('/branches'));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al cargar sedes');
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
        title="Sedes"
        subtitle="Sucursales del gimnasio"
        action={
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Icon name="plus" size={16} /> Nueva sede
          </Button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-20 text-text-muted">
          <Spinner className="h-6 w-6" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {branches.map((b) => (
            <Card key={b.id}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-text">{b.name}</div>
                  {b.code && <div className="text-xs text-text-muted">Código: {b.code}</div>}
                </div>
                <Badge color={b.isActive ? 'green' : 'gray'}>{b.isActive ? 'Activa' : 'Inactiva'}</Badge>
              </div>
              <div className="mt-3 space-y-1 text-xs text-text-muted">
                <div>{b.address || 'Sin dirección'}</div>
                <div>{b.phone || ''}</div>
                <div>
                  Horario: {b.openingTime || '—'} a {b.closingTime || '—'}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="text-xs text-text-muted">
                  {b._count?.members ?? 0} socios · {b._count?.memberships ?? 0} membresías
                </div>
                <Button size="sm" variant="ghost" onClick={() => { setEditing(b); setOpen(true); }}>
                  <Icon name="edit" size={15} />
                </Button>
              </div>
            </Card>
          ))}
          {!branches.length && (
            <div className="col-span-full">
              <Card>
                <div className="py-8 text-center text-sm text-text-muted">Sin sedes cargadas</div>
              </Card>
            </div>
          )}
        </div>
      )}

      <BranchModal open={open} onClose={() => setOpen(false)} branch={editing} onSaved={load} />
    </div>
  );
}

const EMPTY = {
  name: '',
  code: '',
  address: '',
  phone: '',
  email: '',
  openingTime: '',
  closingTime: '',
  isActive: true,
};

function BranchModal({
  open,
  onClose,
  branch,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  branch: Branch | null;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (branch) {
      setForm({
        name: branch.name,
        code: branch.code || '',
        address: branch.address || '',
        phone: branch.phone || '',
        email: branch.email || '',
        openingTime: branch.openingTime || '',
        closingTime: branch.closingTime || '',
        isActive: branch.isActive,
      });
    } else {
      setForm({ ...EMPTY });
    }
  }, [open, branch]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      code: form.code || null,
      address: form.address || null,
      phone: form.phone || null,
      email: form.email || null,
      openingTime: form.openingTime || undefined,
      closingTime: form.closingTime || undefined,
      isActive: form.isActive,
    };
    try {
      if (branch) await http.put(`/branches/${branch.id}`, payload);
      else await http.post('/branches', payload);
      toast.success(branch ? 'Sede actualizada' : 'Sede creada');
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
      title={branch ? 'Editar sede' : 'Nueva sede'}
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
        <Field label="Código">
          <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
        </Field>
        <Field label="Dirección" className="sm:col-span-2">
          <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
        </Field>
        <Field label="Teléfono">
          <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </Field>
        <Field label="Hora apertura">
          <Input type="time" value={form.openingTime} onChange={(e) => setForm((f) => ({ ...f, openingTime: e.target.value }))} />
        </Field>
        <Field label="Hora cierre">
          <Input type="time" value={form.closingTime} onChange={(e) => setForm((f) => ({ ...f, closingTime: e.target.value }))} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-text sm:col-span-2">
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="h-4 w-4" />
          Activa
        </label>
      </form>
    </Modal>
  );
}