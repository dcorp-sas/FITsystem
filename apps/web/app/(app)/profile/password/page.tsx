'use client';

import { useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { Button, Card, Field, Input, PageHeader } from '@/components/ui';

export default function ChangePasswordPage() {
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.newPassword !== form.confirm) {
      toast.error('Las contraseñas no coinciden');
      return;
    }
    if (form.newPassword.length < 6) {
      toast.error('La nueva contraseña debe tener al menos 6 caracteres');
      return;
    }
    setSaving(true);
    try {
      await http.post('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      toast.success('Contraseña actualizada');
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al cambiar contraseña');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Cambiar contraseña" subtitle="Actualiza tu contraseña de acceso" />
      <Card title="Datos de seguridad" className="max-w-md">
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Contraseña actual">
            <Input type="password" required value={form.currentPassword} onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))} />
          </Field>
          <Field label="Nueva contraseña">
            <Input type="password" required value={form.newPassword} onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))} />
          </Field>
          <Field label="Confirmar nueva contraseña">
            <Input type="password" required value={form.confirm} onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))} />
          </Field>
          <Button type="submit" loading={saving}>Guardar cambios</Button>
        </form>
      </Card>
    </div>
  );
}