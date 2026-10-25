'use client';

import { useCallback, useEffect, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Field, Input, Modal, PageHeader, Select, Spinner, Table, Textarea } from '@/components/ui';
import { Icon } from '@/components/icon';

const GOAL_LABELS: Record<string, string> = {
  STRENGTH: 'Fuerza',
  CARDIO: 'Cardio',
  LOSS: 'Descenso de peso',
  HYPERTROPHY: 'Hipertrofia',
  MOBILITY: 'Movilidad',
  OTHER: 'Otro',
};

const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: 'Principiante',
  INTERMEDIATE: 'Intermedio',
  ADVANCED: 'Avanzado',
};

interface Exercise {
  name: string;
  sets: number;
  reps: string;
  restSec: number;
  weight?: string | null;
  notes?: string | null;
}

interface RoutineDay {
  dayIndex: number;
  label?: string | null;
  notes?: string | null;
  exercises: Exercise[];
}

interface Routine {
  id: string;
  name: string;
  description?: string | null;
  goal: string;
  level: string;
  isTemplate: boolean;
  isActive: boolean;
  memberId?: string | null;
  memberName?: string | null;
  memberCode?: string | null;
  days: RoutineDay[];
}

interface MemberOption {
  id: string;
  name: string;
}

export default function RoutinesPage() {
  const toast = useToast();
  const { user } = useAuth();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Routine | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await http.get<{ items: Routine[] }>('/routines');
      setRoutines(res.items);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al cargar rutinas');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(r: Routine) {
    if (!confirm(`¿Eliminar la rutina "${r.name}"?`)) return;
    try {
      await http.del(`/routines/${r.id}`);
      toast.success('Rutina eliminada');
      load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al eliminar');
    }
  }

  return (
    <div>
      <PageHeader
        title="Rutinas"
        subtitle={user?.role === 'INSTRUCTOR' ? 'Rutinas de tus socios: asigná y modificá planes de entrenamiento' : 'Planes de entrenamiento para la app móvil'}
        action={
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Icon name="plus" size={16} /> Nueva rutina
          </Button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-20 text-text-muted">
          <Spinner className="h-6 w-6" />
        </div>
      ) : (
        <Table head={['Rutina', 'Asignada a', 'Objetivo', 'Nivel', 'Días', 'Estado', '']} empty="Sin rutinas">
          {routines.map((r) => (
            <tr key={r.id} className="hover:bg-surface-alt/40">
              <td className="px-4 py-3">
                <div className="font-medium text-text">{r.name}</div>
                {r.description && <div className="text-xs text-text-muted">{r.description}</div>}
              </td>
              <td className="px-4 py-3 text-text-muted">
                {r.memberName ? (
                  <span>
                    {r.memberName} <span className="text-xs">({r.memberCode})</span>
                  </span>
                ) : (
                  <Badge color="blue">Plantilla</Badge>
                )}
              </td>
              <td className="px-4 py-3 text-text-muted">{GOAL_LABELS[r.goal] ?? r.goal}</td>
              <td className="px-4 py-3 text-text-muted">{LEVEL_LABELS[r.level] ?? r.level}</td>
              <td className="px-4 py-3 text-text-muted">{r.days?.length ?? 0}</td>
              <td className="px-4 py-3">
                <Badge color={r.isActive ? 'green' : 'gray'}>{r.isActive ? 'Activa' : 'Inactiva'}</Badge>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}>
                    <Icon name="edit" size={15} />
                  </Button>
                  {user?.role !== 'INSTRUCTOR' ? <Button size="sm" variant="ghost" onClick={() => remove(r)}>
                    <Icon name="trash" size={15} />
                  </Button> : null}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <RoutineModal open={open} onClose={() => setOpen(false)} routine={editing} onSaved={load} />
    </div>
  );
}

function emptyDay(index: number): RoutineDay {
  return { dayIndex: index, label: '', notes: '', exercises: [{ name: '', sets: 3, reps: '10', restSec: 60 }] };
}

function RoutineModal({
  open,
  onClose,
  routine,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  routine: Routine | null;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [goal, setGoal] = useState('OTHER');
  const [level, setLevel] = useState('BEGINNER');
  const [memberId, setMemberId] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [days, setDays] = useState<RoutineDay[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // /members aplica el alcance por sede del rol INSTRUCTOR; no usar el listado
    // administrativo de cuentas del portal, que incluye socios de toda la organización.
    http
      .get<{ items: { id: string; firstName: string; lastName: string; memberCode: string }[] }>('/members?pageSize=100')
      .then((res) => setMembers(res.items.map((member) => ({
        id: member.id,
        name: `${member.firstName} ${member.lastName} (${member.memberCode})`.trim(),
      }))))
      .catch(() => undefined);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (routine) {
      setName(routine.name);
      setDescription(routine.description || '');
      setGoal(routine.goal);
      setLevel(routine.level);
      setMemberId(routine.memberId || '');
      setIsActive(routine.isActive);
      setDays(routine.days?.length ? routine.days : [emptyDay(1)]);
    } else {
      setName('');
      setDescription('');
      setGoal('OTHER');
      setLevel('BEGINNER');
      setMemberId('');
      setIsActive(true);
      setDays([emptyDay(1)]);
    }
  }, [open, routine]);

  function updateDay(index: number, patch: Partial<RoutineDay>) {
    setDays((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  function updateExercise(dayIndex: number, exIndex: number, patch: Partial<Exercise>) {
    setDays((prev) =>
      prev.map((d, i) =>
        i === dayIndex ? { ...d, exercises: d.exercises.map((ex, j) => (j === exIndex ? { ...ex, ...patch } : ex)) } : d,
      ),
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      goal,
      level,
      memberId: memberId || null,
      isTemplate: !memberId,
      isActive,
      days: days.map((d, di) => ({
        dayIndex: di + 1,
        label: d.label || null,
        notes: d.notes || null,
        exercises: d.exercises
          .filter((ex) => ex.name.trim())
          .map((ex, ei) => ({
            name: ex.name.trim(),
            sets: Number(ex.sets) || 1,
            reps: String(ex.reps || '10'),
            restSec: Number(ex.restSec) || 0,
            weight: ex.weight || null,
            notes: ex.notes || null,
            orderIndex: ei,
          })),
      })),
    };
    try {
      if (routine) await http.put(`/routines/${routine.id}`, payload);
      else await http.post('/routines', payload);
      toast.success(routine ? 'Rutina actualizada' : 'Rutina creada');
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
      size="xl"
      title={routine ? 'Editar rutina' : 'Nueva rutina'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={saving}>
            Guardar
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nombre *">
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Asignada a">
            <Select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
              <option value="">Plantilla (sin socio)</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Objetivo">
            <Select value={goal} onChange={(e) => setGoal(e.target.value)}>
              {Object.entries(GOAL_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nivel">
            <Select value={level} onChange={(e) => setLevel(e.target.value)}>
              {Object.entries(LEVEL_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Descripción" className="sm:col-span-2">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-text">
          <input type="checkbox" className="h-4 w-4" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Activa
        </label>

        <div className="space-y-3">
          {days.map((day, di) => (
            <div key={di} className="rounded-xl border border-line bg-surface-alt/30 p-3">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-xs font-semibold text-text-muted">Día {di + 1}</span>
                <Input
                  className="max-w-xs"
                  placeholder="Etiqueta (ej. Pecho y tríceps)"
                  value={day.label || ''}
                  onChange={(e) => updateDay(di, { label: e.target.value })}
                />
                {days.length > 1 && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setDays((p) => p.filter((_, i) => i !== di))}>
                    <Icon name="trash" size={14} />
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                {day.exercises.map((ex, ei) => (
                  <div key={ei} className="grid grid-cols-12 gap-2">
                    <Input
                      className="col-span-5"
                      placeholder="Ejercicio"
                      value={ex.name}
                      onChange={(e) => updateExercise(di, ei, { name: e.target.value })}
                    />
                    <Input
                      className="col-span-2"
                      type="number"
                      min={1}
                      placeholder="Series"
                      value={ex.sets}
                      onChange={(e) => updateExercise(di, ei, { sets: Number(e.target.value) })}
                    />
                    <Input
                      className="col-span-2"
                      placeholder="Reps"
                      value={ex.reps}
                      onChange={(e) => updateExercise(di, ei, { reps: e.target.value })}
                    />
                    <Input
                      className="col-span-2"
                      type="number"
                      min={0}
                      placeholder="Desc."
                      value={ex.restSec}
                      onChange={(e) => updateExercise(di, ei, { restSec: Number(e.target.value) })}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="col-span-1"
                      onClick={() =>
                        updateDay(di, { exercises: day.exercises.filter((_, j) => j !== ei) })
                      }
                    >
                      <Icon name="close" size={14} />
                    </Button>
                  </div>
                ))}
              </div>

              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="mt-2"
                onClick={() => updateDay(di, { exercises: [...day.exercises, { name: '', sets: 3, reps: '10', restSec: 60 }] })}
              >
                <Icon name="plus" size={14} /> Agregar ejercicio
              </Button>
            </div>
          ))}

          <Button type="button" size="sm" variant="secondary" onClick={() => setDays((p) => [...p, emptyDay(p.length + 1)])}>
            <Icon name="plus" size={14} /> Agregar día
          </Button>
        </div>
      </form>
    </Modal>
  );
}
