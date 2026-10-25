'use client';

import { useCallback, useEffect, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatDate, addDays } from '@fitsystem/utils';
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
  StatusBadge,
  Table,
  Textarea,
} from '@/components/ui';
import { Icon } from '@/components/icon';

interface ReservationWithMember {
  id: string;
  status: string;
  createdAt: string;
  member: { id: string; firstName: string; lastName: string; memberCode: string; phone: string | null } | null;
}

// Fecha local en formato YYYY-MM-DD para los <input type="date">.
function toInputDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function ClassesPage() {
  const toast = useToast();
  const { user, branches, activeBranchId } = useAuth();
  const branchId = activeBranchId || branches[0]?.id || '';

  const [tab, setTab] = useState<'classes' | 'agenda'>('classes');
  const [classes, setClasses] = useState<GymClass[]>([]);
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [classOpen, setClassOpen] = useState(false);
  const [editing, setEditing] = useState<GymClass | null>(null);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [rosterSession, setRosterSession] = useState<ClassSession | null>(null);
  const [roster, setRoster] = useState<ReservationWithMember[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  // Rango de la agenda: por defecto, la semana actual (hoy → +7 días). La app del
  // socio muestra todas las clases futuras, así que el panel permite navegar para
  // ver reservas de cualquier semana.
  const [from, setFrom] = useState(() => toInputDate(new Date()));
  const [to, setTo] = useState(() => toInputDate(addDays(new Date(), 7)));

  function shiftWeek(delta: number) {
    setFrom((f) => toInputDate(addDays(new Date(`${f}T00:00:00`), delta * 7)));
    setTo((t) => toInputDate(addDays(new Date(`${t}T00:00:00`), delta * 7)));
  }

  function goToday() {
    const now = new Date();
    setFrom(toInputDate(now));
    setTo(toInputDate(addDays(now, 7)));
  }

  const openRoster = useCallback(
    async (session: ClassSession) => {
      setRosterSession(session);
      setRosterOpen(true);
      setRosterLoading(true);
      setRoster([]);
      try {
        const res = await http.get<ReservationWithMember[]>(`/sessions/${session.id}/reservations`);
        setRoster(res);
      } catch (error) {
        toast.error(error instanceof ApiError ? error.message : 'Error al cargar inscriptos');
      } finally {
        setRosterLoading(false);
      }
    },
    [toast],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cls, ses, ins] = await Promise.all([
        http.get<GymClass[]>('/classes'),
        http.get<ClassSession[]>(`/sessions?from=${from}&to=${to}`),
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
  }, [toast, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  // Acceso directo desde el portal docente: abre el módulo real y su formulario de programación.
  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('action') === 'schedule') {
      setTab('agenda');
      setSessionOpen(true);
    }
  }, []);

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
                {user?.role !== 'INSTRUCTOR' ? <Button size="sm" variant="ghost" onClick={() => { setEditing(c); setClassOpen(true); }}>
                  <Icon name="edit" size={15} />
                </Button> : null}
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
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => shiftWeek(-1)}>
              ‹ Semana
            </Button>
            <Button size="sm" variant="ghost" onClick={goToday}>
              Hoy
            </Button>
            <Button size="sm" variant="secondary" onClick={() => shiftWeek(1)}>
              Semana ›
            </Button>
            <span className="ml-2 text-xs text-text-muted">Desde</span>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-40 py-0 text-xs" />
            <span className="text-xs text-text-muted">hasta</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-40 py-0 text-xs" />
          </div>
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
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openRoster(s)}
                          title="Ver inscriptos"
                          aria-label="Ver inscriptos"
                        >
                          <Icon name="users" size={15} />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => removeSession(s.id)}>
                          <Icon name="trash" size={15} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
      )}

      <ClassModal open={classOpen} onClose={() => setClassOpen(false)} gymClass={editing} branchId={branchId} instructors={instructors} isInstructor={user?.role === 'INSTRUCTOR'} onSaved={load} />
      <SessionModal open={sessionOpen} onClose={() => setSessionOpen(false)} classes={classes} instructors={instructors} isInstructor={user?.role === 'INSTRUCTOR'} onSaved={load} />

      <Modal
        open={rosterOpen}
        onClose={() => setRosterOpen(false)}
        title={rosterSession ? `Inscriptos · ${rosterSession.gymClass?.name ?? 'Clase'}` : 'Inscriptos'}
        footer={
          <Button variant="ghost" onClick={() => setRosterOpen(false)}>
            Cerrar
          </Button>
        }
      >
        {rosterLoading ? (
          <div className="flex justify-center py-10 text-text-muted">
            <Spinner className="h-5 w-5" />
          </div>
        ) : roster.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-muted">Todavía no hay inscriptos.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-text-muted">
              {rosterSession ? `${formatDateTime(rosterSession.startAt)} · ` : ''}
              {roster.filter((r) => r.status === 'RESERVED').length} confirmados de {rosterSession?.capacity ?? 0}
            </p>
            <Table head={['Socio', 'Código', 'Teléfono', 'Estado']}>
              {roster.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 text-text">{r.member ? `${r.member.firstName} ${r.member.lastName}` : '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs text-text-muted">{r.member?.memberCode ?? '—'}</td>
                  <td className="px-3 py-2 text-text-muted">{r.member?.phone ?? '—'}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </Modal>
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
  isInstructor,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  gymClass: GymClass | null;
  branchId: string;
  instructors: Instructor[];
  isInstructor: boolean;
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
        {!isInstructor ? <Field label="Profesor">
          <Select value={form.instructorId} onChange={(e) => setForm((f) => ({ ...f, instructorId: e.target.value }))}>
            <option value="">Sin asignar</option>
            {instructors.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
        </Field> : null}
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
  isInstructor,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  classes: GymClass[];
  instructors: Instructor[];
  isInstructor: boolean;
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
        {!isInstructor ? <Field label="Profesor">
          <Select value={instructorId} onChange={(e) => setInstructorId(e.target.value)}>
            <option value="">Según la clase</option>
            {instructors.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
        </Field> : null}
        <Field label="Fecha y hora *">
          <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} required />
        </Field>
      </form>
    </Modal>
  );
}