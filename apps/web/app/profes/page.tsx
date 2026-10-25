'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth';
import { http, ApiError } from '@/lib/api';
import { LoginScreen } from '@/components/login-screen';
import { Spinner, Button } from '@/components/ui';

interface GymClass { id: string; name: string; capacity: number; durationMin: number; room?: string | null; instructorId?: string | null }
interface ClassSession {
  id: string; classId: string; startAt: string; endAt: string; capacity: number; room?: string | null; status: string;
  gymClass?: { id: string; name: string; color?: string | null };
  instructor?: { id: string; name: string; color?: string | null } | null;
  _count?: { reservations: number };
}
interface Routine { id: string; name: string; memberName?: string | null; isTemplate: boolean; isActive: boolean; days: { exercises: { id: string }[] }[] }
interface RosterItem { id: string; status: string; member?: { id: string; firstName: string; lastName: string; memberCode: string; phone?: string | null } | null }

function localDateTime(value: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}
function dateInput(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
function dateLabel(value: string) {
  return new Date(value).toLocaleString('es-AR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function TeacherPortalPage() {
  const { user, ready, logout } = useAuth();
  const [classes, setClasses] = useState<GymClass[]>([]);
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showSchedule, setShowSchedule] = useState(false);
  const [classId, setClassId] = useState('');
  const [startAt, setStartAt] = useState(() => localDateTime(new Date(Date.now() + 3600000)));
  const [rosterSession, setRosterSession] = useState<ClassSession | null>(null);
  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user || user.role !== 'INSTRUCTOR') return;
    setLoading(true);
    setError('');
    try {
      const from = dateInput(new Date());
      const toDate = new Date(); toDate.setDate(toDate.getDate() + 14);
      const [cls, ses, routineRes] = await Promise.all([
        http.get<GymClass[]>('/classes'),
        http.get<ClassSession[]>(`/sessions?from=${from}&to=${dateInput(toDate)}`),
        http.get<{ items: Routine[] }>('/routines'),
      ]);
      setClasses(cls);
      setSessions(ses);
      setRoutines(routineRes.items.filter((r) => r.isActive));
      setClassId((current) => current || cls[0]?.id || '');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudieron cargar tus datos.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  async function schedule(event: FormEvent) {
    event.preventDefault();
    if (!classId || !startAt) return;
    setSaving(true); setError('');
    try {
      await http.post('/sessions', { classId, startAt: new Date(startAt).toISOString() });
      setShowSchedule(false);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo programar la clase.');
    } finally { setSaving(false); }
  }

  async function openRoster(session: ClassSession) {
    setRosterSession(session); setRoster([]);
    try { setRoster(await http.get<RosterItem[]>(`/sessions/${session.id}/reservations`)); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'No se pudieron cargar los inscriptos.'); }
  }

  async function removeSession(session: ClassSession) {
    if (!window.confirm('¿Cancelar esta sesión programada?')) return;
    try { await http.del(`/sessions/${session.id}`); await load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'No se pudo cancelar la sesión.'); }
  }

  if (!ready) return <div className="flex min-h-screen items-center justify-center gap-3 text-text-muted"><Spinner className="h-6 w-6" />Cargando portal...</div>;
  if (!user) return <LoginScreen />;
  if (user.role !== 'INSTRUCTOR' && !['OWNER', 'ADMIN', 'MANAGER'].includes(user.role)) {
    return <main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-bold text-text">Acceso exclusivo para profesores</h1><p className="mt-2 text-text-muted">Tu usuario no tiene permisos para este portal. Pedile al administrador del gimnasio que revise tu rol.</p><button className="mt-5 underline" onClick={logout}>Cerrar sesión</button></main>;
  }

  return (
    <main className="min-h-screen bg-base px-4 py-6 text-text sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
          <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-light">FIT SYSTEM</p><h1 className="mt-1 text-3xl font-black">Portal de profesores</h1><p className="mt-1 text-sm text-text-muted">Hola, {user.name}. Tus clases y rutinas conectadas al gimnasio.</p></div>
          <div className="flex gap-2"><a className="rounded-lg border border-line px-4 py-2 text-sm hover:border-primary" href="/routines">Gestionar rutinas</a><a className="rounded-lg border border-line px-4 py-2 text-sm hover:border-primary" href="/classes">Clases</a><Button variant="secondary" onClick={logout}>Salir</Button></div>
        </header>

        {error ? <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</div> : null}
        {loading ? <div className="flex justify-center py-16"><Spinner className="h-7 w-7" /></div> : (
          <>
            <section className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-line bg-surface p-5"><p className="text-sm text-text-muted">Clases asignadas</p><p className="mt-2 text-3xl font-bold">{classes.length}</p></div>
              <div className="rounded-2xl border border-line bg-surface p-5"><p className="text-sm text-text-muted">Sesiones próximas</p><p className="mt-2 text-3xl font-bold">{sessions.length}</p></div>
              <div className="rounded-2xl border border-line bg-surface p-5"><p className="text-sm text-text-muted">Rutinas activas visibles</p><p className="mt-2 text-3xl font-bold">{routines.length}</p></div>
            </section>

            <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Agenda de clases</h2><p className="mt-1 text-sm text-text-muted">Solo se muestran las clases vinculadas a tu usuario.</p></div><Button onClick={() => setShowSchedule((v) => !v)} disabled={!classes.length}>Programar sesión</Button></div>
              {showSchedule ? <form onSubmit={schedule} className="mt-5 grid gap-3 rounded-xl border border-line p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <label className="grid gap-1 text-sm text-text-muted">Clase asignada<select className="rounded-lg border border-line bg-base p-2.5 text-text" value={classId} onChange={(e) => setClassId(e.target.value)} required>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <label className="grid gap-1 text-sm text-text-muted">Fecha y hora<input className="rounded-lg border border-line bg-base p-2.5 text-text" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} required /></label>
                <Button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Confirmar'}</Button>
              </form> : null}
              <div className="mt-4 divide-y divide-line">
                {sessions.length ? sessions.map((session) => <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div><p className="font-semibold">{session.gymClass?.name || 'Clase'}</p><p className="mt-1 text-sm text-text-muted">{dateLabel(session.startAt)}{session.room ? ` · ${session.room}` : ''}</p><p className="mt-1 text-xs text-text-muted">{session._count?.reservations ?? 0} inscriptos · capacidad {session.capacity}</p></div>
                  <div className="flex gap-2"><button className="rounded-lg border border-line px-3 py-2 text-sm hover:border-primary" onClick={() => void openRoster(session)}>Ver inscriptos</button><button className="rounded-lg border border-line px-3 py-2 text-sm text-red-300 hover:border-red-400" onClick={() => void removeSession(session)}>Cancelar</button></div>
                </div>) : <p className="py-8 text-center text-sm text-text-muted">No tenés sesiones programadas en los próximos 14 días.</p>}
              </div>
            </section>

            <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Rutinas de entrenamiento</h2><p className="mt-1 text-sm text-text-muted">Las rutinas que asignás se guardan en el mismo sistema y aparecen en la app del socio.</p></div><a className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white" href="/routines">Crear o editar rutina</a></div>
              <div className="mt-4 divide-y divide-line">{routines.length ? routines.map((routine) => <div key={routine.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold">{routine.name}</p><p className="text-sm text-text-muted">{routine.memberName || (routine.isTemplate ? 'Plantilla reutilizable' : 'Rutina asignada')} · {routine.days?.length || 0} días</p></div><div className="flex items-center gap-2"><span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">Activa</span><button className="rounded-lg border border-line px-3 py-1.5 text-xs hover:border-amber-400" onClick={async () => { if (!window.confirm('¿Cerrar este ciclo y conservar su historial?')) return; try { await http.post(`/routines/${routine.id}/archive`); await load(); } catch (e) { setError(e instanceof ApiError ? e.message : 'No se pudo archivar la rutina.'); } }}>Archivar ciclo</button></div></div>) : <p className="py-6 text-sm text-text-muted">Todavía no hay rutinas disponibles para tu sede.</p>}</div>
            </section>
          </>
        )}
      </div>

      {rosterSession ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setRosterSession(null)}><section className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-surface p-5" onClick={(e) => e.stopPropagation()}><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold">Inscriptos · {rosterSession.gymClass?.name || 'Clase'}</h2><button className="rounded-lg border border-line px-3 py-1" onClick={() => setRosterSession(null)}>Cerrar</button></div>{roster.length ? <div className="mt-4 divide-y divide-line">{roster.map((item) => <div key={item.id} className="py-3"><p className="font-medium">{item.member ? `${item.member.firstName} ${item.member.lastName}` : 'Socio'}</p><p className="text-sm text-text-muted">{item.member?.memberCode || ''} · {item.status}</p></div>)}</div> : <p className="py-8 text-sm text-text-muted">No hay inscriptos o todavía se están cargando.</p>}</section></div> : null}
    </main>
  );
}
