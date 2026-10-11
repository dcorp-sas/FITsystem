'use client';

import { useCallback, useEffect, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { formatDateTime } from '@fitsystem/utils';
import { NOTIFICATION_CHANNEL_LABELS, NOTIFICATION_EVENT_LABELS } from '@/lib/labels';
import type { AppNotification, NotificationTemplate, Member } from '@/lib/types';
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  StatusBadge,
  Table,
  Textarea,
} from '@/components/ui';
import { Icon } from '@/components/icon';

export default function NotificationsPage() {
  const toast = useToast();
  const [tab, setTab] = useState<'history' | 'templates'>('history');
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [editing, setEditing] = useState<NotificationTemplate | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [n, t, m] = await Promise.all([
        http.get<{ items: AppNotification[] }>('/notifications'),
        http.get<NotificationTemplate[]>('/notification-templates'),
        http.get<{ items: Member[] }>('/members', { pageSize: 300 }),
      ]);
      setNotifications(n.items);
      setTemplates(t);
      setMembers(m.items);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al cargar notificaciones');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function generate() {
    setGenerating(true);
    try {
      const res = await http.post<{ created: number }>('/notifications/generate-reminders', { days: 3 });
      toast.success('Recordatorios generados: ' + res.created);
      load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al generar');
    } finally {
      setGenerating(false);
    }
  }

  async function removeTemplate(id: string) {
    if (!confirm('¿Eliminar esta plantilla?')) return;
    try {
      await http.del(`/notification-templates/${id}`);
      toast.success('Plantilla eliminada');
      load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error');
    }
  }

  return (
    <div>
      <PageHeader
        title="Notificaciones"
        subtitle="Recordatorios y plantillas"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={generate} loading={generating}>
              <Icon name="notifications" size={16} /> Generar recordatorios
            </Button>
            <Button onClick={() => setSendOpen(true)}>
              <Icon name="plus" size={16} /> Enviar
            </Button>
          </div>
        }
      />

      <div className="mb-5 flex gap-1 rounded-lg border border-line bg-surface p-1">
        {(['history', 'templates'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              'flex-1 rounded-md px-4 py-2 text-sm font-medium transition ' +
              (tab === t ? 'bg-primary text-white' : 'text-text-muted hover:text-text')
            }
          >
            {t === 'history' ? 'Historial' : 'Plantillas'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20 text-text-muted">
          <Spinner className="h-6 w-6" />
        </div>
      ) : tab === 'history' ? (
        <Table head={['Socio', 'Evento', 'Canal', 'Mensaje', 'Estado', 'Fecha']} empty="Sin notificaciones">
          {notifications.map((n) => (
            <tr key={n.id}>
              <td className="px-4 py-3 text-text">
                {n.member ? n.member.firstName + ' ' + n.member.lastName : '—'}
                {n.member?.phone && <div className="text-[11px] text-text-muted">{n.member.phone}</div>}
              </td>
              <td className="px-4 py-3 text-text-muted">{NOTIFICATION_EVENT_LABELS[n.event] ?? n.event}</td>
              <td className="px-4 py-3 text-text-muted">{NOTIFICATION_CHANNEL_LABELS[n.channel] ?? n.channel}</td>
              <td className="max-w-xs truncate px-4 py-3 text-text-muted">{n.body}</td>
              <td className="px-4 py-3">
                <StatusBadge status={n.status} />
              </td>
              <td className="px-4 py-3 text-xs text-text-muted">{formatDateTime(n.createdAt)}</td>
            </tr>
          ))}
        </Table>
      ) : (
        <>
          <div className="mb-4 flex justify-end">
            <Button variant="secondary" onClick={() => { setEditing(null); setTemplateOpen(true); }}>
              <Icon name="plus" size={16} /> Nueva plantilla
            </Button>
          </div>
          <Table head={['Nombre', 'Evento', 'Canal', 'Mensaje', 'Estado', '']} empty="Sin plantillas">
            {templates.map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-3 font-medium text-text">{t.name}</td>
                <td className="px-4 py-3 text-text-muted">{NOTIFICATION_EVENT_LABELS[t.event] ?? t.event}</td>
                <td className="px-4 py-3 text-text-muted">{NOTIFICATION_CHANNEL_LABELS[t.channel] ?? t.channel}</td>
                <td className="max-w-xs truncate px-4 py-3 text-text-muted">{t.body}</td>
                <td className="px-4 py-3">
                  <Badge color={t.isActive ? 'green' : 'gray'}>{t.isActive ? 'Activa' : 'Inactiva'}</Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(t); setTemplateOpen(true); }}>
                      <Icon name="edit" size={15} />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => removeTemplate(t.id)}>
                      <Icon name="trash" size={15} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </>
      )}

      <TemplateModal open={templateOpen} onClose={() => setTemplateOpen(false)} template={editing} onSaved={load} />
      <SendModal open={sendOpen} onClose={() => setSendOpen(false)} members={members} onSent={load} />
    </div>
  );
}

const T_EMPTY = {
  name: '',
  channel: 'WHATSAPP',
  event: 'WELCOME',
  subject: '',
  body: '',
  isActive: true,
};

function TemplateModal({
  open,
  onClose,
  template,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  template: NotificationTemplate | null;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({ ...T_EMPTY });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (template) {
      setForm({
        name: template.name,
        channel: template.channel,
        event: template.event,
        subject: template.subject || '',
        body: template.body,
        isActive: template.isActive,
      });
    } else {
      setForm({ ...T_EMPTY });
    }
  }, [open, template]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      channel: form.channel,
      event: form.event,
      subject: form.subject || null,
      body: form.body,
      isActive: form.isActive,
    };
    try {
      if (template) await http.put(`/notification-templates/${template.id}`, payload);
      else await http.post('/notification-templates', payload);
      toast.success(template ? 'Plantilla actualizada' : 'Plantilla creada');
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
      title={template ? 'Editar plantilla' : 'Nueva plantilla'}
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
        <Field label="Canal">
          <Select value={form.channel} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}>
            {Object.entries(NOTIFICATION_CHANNEL_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Evento">
          <Select value={form.event} onChange={(e) => setForm((f) => ({ ...f, event: e.target.value }))}>
            {Object.entries(NOTIFICATION_EVENT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Asunto" className="sm:col-span-2">
          <Input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
        </Field>
        <Field label="Mensaje *" className="sm:col-span-2" hint="Usá {{nombre}}, {{plan}}, etc.">
          <Textarea required value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-text sm:col-span-2">
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="h-4 w-4" />
          Activa
        </label>
      </form>
    </Modal>
  );
}

function SendModal({
  open,
  onClose,
  members,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  members: Member[];
  onSent: () => void;
}) {
  const toast = useToast();
  const [memberId, setMemberId] = useState('');
  const [channel, setChannel] = useState('WHATSAPP');
  const [event, setEvent] = useState('CUSTOM');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setMemberId('');
      setChannel('WHATSAPP');
      setEvent('CUSTOM');
      setBody('');
    }
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await http.post('/notifications/send', { memberId, channel, event, body });
      toast.success('Notificación enviada');
      onSent();
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al enviar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Enviar notificación"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} loading={saving}>
            Enviar
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Socio *">
          <Select value={memberId} onChange={(e) => setMemberId(e.target.value)} required>
            <option value="">Seleccionar...</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.firstName} {m.lastName} — {m.memberCode}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Canal">
            <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
              {Object.entries(NOTIFICATION_CHANNEL_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Evento">
            <Select value={event} onChange={(e) => setEvent(e.target.value)}>
              {Object.entries(NOTIFICATION_EVENT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Mensaje">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}