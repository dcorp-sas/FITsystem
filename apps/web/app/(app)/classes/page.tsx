'use client';

import { useCallback, useEffect, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatDate } from '@fitsystem/utils';
import type { GymClass, ClassSession, Instructor } from '@/lib/types';
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
  Table,
  Textarea,
} from '@/components/ui';
import { Icon } from '@/components/icon';

export default function ClassesPage() {
  const toast = useToast();
  const { branches, activeBranchId } = useAuth();
  const branchId = activeBranchId || branches[0]?.id || '';

  const [tab, setTab] = useState<'classes' | 'agenda'>('classes');
  const [classes, setClasses] = useState<GymClass[]>([]);
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [classOpen, setClassOpen] = useState(false);
  const [editing, setEditing] = useState<GymClass | null>(null);
  const [sessionOpen, setSessionOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cls, ses, ins] = await Promise.all([
        http.get<GymClass[]>('/classes'),
        http.get<ClassSession[]>('/sessions'),
        http.get<Instructor[]>('/instructors'),
      ]);
      setClasses(cls);
      setSessions(ses);
      setInstructors(ins.filter((i) => i.isActive));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al cargar clases');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function removeSession(id: string) {
    if (!confirm('¿Eliminar esta clase programada?')) return;
    try {
      await http.del(`/sessions/${id}`);
      toast.success('Sesión eliminada');
      load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error');
    }
  }

  return (
    <div>
      <PageHeader
        title="Clases"
        subtitle="Grilla y agenda de clases"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setSessionOpen(true)}>
              <Icon name="plus" size={16} /> Programar
            </Button>
            <Button onClick={() => { setEditing(null); setClassOpen(true); }}>
              <Icon name="plus" size={16} /> Nueva clase
            </Button>
          </div>
        }
      />

      <div className="mb-5 flex gap-1 rounded-lg border border-line bg-surface p-1">
        {(['classes', 'agenda'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              'flex-1 rounded-md px-4 py-2 text-sm font-medium transition ' +
              (tab === t ? 'bg-primary text-white' : 'text-text-muted hover:text-text')
            }
          >
            {t === 'classes' ? 'Clases' : 'Agenda'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20 text-text-muted">
          <Spinner className="h-6 w-6" />
        </div>
      ) : tab === 'classes' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            <Card key={c.id}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: c.color }} />
                  <div className="font-semibold text-text">{c.name}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => { setEditing(c); setClassOpen(true); }}>
                  <Icon name="edit" size={15} />
                </Button>
              </div>
              {c.description && <p className="mt-2 text-xs text-text-muted">{c.description}</p>}
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <Badge color="blue">{c.durationMin} min</Badge>
                <Badge color="gray">Cap. {c.capacity}</Badge>
                {c.room && <Badge color="gray">{c.room}</Badge>}
                <Badge color={c.isActive ? 'green' : 'gray'}>{c.isActive ? 'Activa' : 'Inactiva'}</Badge>
              </div>
              <div className="mt-3 text-xs text-text-muted">
                Profesor: {c.instructor?.name || 'Sin asignar'} · {c._count?.sessions ?? 0} sesiones
              </div>
            </Card>
          ))}
          {!classes.length && (
            <div className="col-span-full">
              <Card>
                <div className="py-8 text-center text-sm text-text-muted">Sin clases creadas</div>
              </Card>
            </div>
          )}
        </div>
      ) : (
        <Card padded={false}>
          {loading ? (
            <div className="flex justify-center py-16 text-text-muted">
              <Spinner className="h-6 w-6" />
            </div>
          ) : (
            <Table head={['Clase', 'Profesor', 'Sala', 'Inicio', 'Reservas', '']} empty="Sin clases programadas">
              {sessions.map((s) => (
                <tr key={s.id} className="hover:bg-surface-alt/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ background: s.gymClass?.color || '#2563eb' }} />
                      <span className="font-medium text-text">{s.gymClass?.name ?? '—'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-muted">{s.instructor?.name || '—'}</td>
                  <td className="px-4 py-3 text-text-muted">{s.room || '—'}</td>
                  <td className="px-4 py-3 text-text-muted">{formatDateTime(s.startAt)}</td>
                  <td className="px-4 py-3 text-text-muted">{s._count?.reservations ?? 0} / {s.capacity}</td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => removeSession(s.id)}>
                      <Icon name="trash" size={15} />
                    </Button>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      <ClassModal open={classOpen} onClose={() => setClassOpen(false)} gymClass={editing} branchId={branchId} instructors={instructors} onSaved={load} />
      <SessionModal open={sessionOpen} onClose={() => setSessionOpen(false)} classes={classes} instructors={instructors} onSaved={load} />
    </div>
  );
}

const CLASS_EMPTY = {
  name: '',
  instructorId: '',
  description: '',
  capacity: '20',
  durationMin: '60',
  room: '',
  color: '#2563eb',
  isActive: true,
};

function ClassModal({
  open,
  onClose,
  gymClass,
  branchId,
  instructors,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  gymClass: GymClass | null;
  branchId: string;
  instructors: Instructor[];
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({ ...CLASS_EMPTY });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (gymClass) {
      setForm({
        name: gymClass.name,
        instructorId: gymClass.instructorId || '',
        description: gymClass.description || '',
        capacity: String(gymClass.capacity),
        durationMin: String(gymClass.durationMin),
        room: gymClass.room || '',
        color: gymClass.color,
        isActive: gymClass.isActive,
      });
    } else {
      setForm({ ...CLASS_EMPTY });
    }
  }, [open, gymClass]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      branchId,
      instructorId: form.instructorId || null,
      description: form.description || null,
      capacity: Number(form.capacity || 20),
      durationMin: Number(form.durationMin || 60),
      room: form.room || null,
      color: form.color,
      isActive: form.isActive,
    };
    try {
      if (gymClass) await http.put(`/classes/${gymClass.id}`, payload);
      else await http.post('/classes', payload);
      toast.success(gymClass ? 'Clase actualizada' : 'Clase creada');
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
      title={gymClass ? 'Editar clase' : 'Nueva clase'}
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
        <Field label="Profesor">
          <Select value={form.instructorId} onChange={(e) => setForm((f) => ({ ...f, instructorId: e.target.value }))}>
            <option value="">Sin asignar</option>
            {instructors.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Sala">
          <Input value={form.room} onChange={(e) => setForm((f) => ({ ...f, room: e.target.value }))} />
        </Field>
        <Field label="Duración (min)">
          <Input type="number" min="1" value={form.durationMin} onChange={(e) => setForm((f) => ({ ...f, durationMin: e.target.value }))} />
        </Field>
        <Field label="Capacidad">
          <Input type="number" min="1" value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} />
        </Field>
        <Field label="Color">
          <Input type="color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} className="h-10 p-1" />
        </Field>
        <label className="flex items-center gap-2 text-sm text-text">
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="h-4 w-4" />
          Activa
        </label>
        <Field label="Descripción" className="sm:col-span-2">
          <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </Field>
      </form>
    </Modal>
  );
}

function SessionModal({
  open,
  onClose,
  classes,
  instructors,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  classes: GymClass[];
  instructors: Instructor[];
  onSaved: () => void;
}) {
  const toast = useToast();
  const [classId, setClassId] = useState('');
  const [instructorId, setInstructorId] = useState('');
  const [startAt, setStartAt] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setClassId('');
      setInstructorId('');
      setStartAt('');
    }
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!classId || !startAt) return;
    setSaving(true);
    try {
      await http.post('/sessions', {
        classId,
        instructorId: instructorId || null,
        startAt: new Date(startAt).toISOString(),
      });
      toast.success('Clase programada');
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al programar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Programar clase"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} loading={saving}>
            Programar
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Clase *">
          <Select value={classId} onChange={(e) => setClassId(e.target.value)} required>
            <option value="">Seleccionar...</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Profesor">
          <Select value={instructorId} onChange={(e) => setInstructorId(e.target.value)}>
            <option value="">Según la clase</option>
            {instructors.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fecha y hora *">
          <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} required />
        </Field>
      </form>
    </Modal>
  );
}