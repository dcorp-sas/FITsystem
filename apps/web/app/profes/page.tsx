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
interface RoutineLogEntry { id: string; exerciseName: string; weight?: string | null; sets?: number | null; reps?: string | null; completedAt: string; member?: { firstName: string; lastName: string; memberCode: string } | null }
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
  const [archivedRoutines, setArchivedRoutines] = useState<Routine[]>([]);
  const [comparison, setComparison] = useState<{ routine: Routine; logs: RoutineLogEntry[] } | null>(null);
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
      setArchivedRoutines(routineRes.items.filter((r) => !r.isActive && !r.isTemplate));
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

  async function compareRoutine(routine: Routine) {
    setError('');
    try {
      const result = await http.get<{ items: RoutineLogEntry[] }>(`/routines/${routine.id}/logs`);
      setComparison({ routine, logs: result.items });
    } catch (e) { setError(e instanceof ApiError ? e.message : 'No se pudo cargar el historial de esta rutina.'); }
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
    <main className="min-h-screen bg-[#080d18] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-white/10 bg-[#0b1220] p-5 lg:flex">
          <a href="/profes" className="flex items-center gap-3 px-2 py-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 text-lg font-black text-white shadow-lg shadow-blue-900/40">F</span>
            <span><span className="block text-sm font-extrabold tracking-wide">FIT SYSTEM</span><span className="block text-xs text-slate-500">Área de profesores</span></span>
          </a>
          <p className="mb-3 mt-10 px-3 text-[10px] font-bold uppercase tracking-[.22em] text-slate-500">Espacio de trabajo</p>
          <nav className="space-y-1">
            <a href="/profes" className="flex items-center gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-3 text-sm font-semibold text-cyan-200"><span>▦</span> Espacio docente</a>
            <a href="/classes" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-400 transition hover:bg-white/5 hover:text-white"><span>▤</span> Clases y agenda</a>
            <a href="/routines" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-400 transition hover:bg-white/5 hover:text-white"><span>↗</span> Rutinas de socios</a>
          </nav>
          <div className="mt-auto rounded-2xl border border-white/10 bg-gradient-to-br from-slate-800/70 to-slate-900/40 p-4">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300">✓</div>
            <p className="text-sm font-semibold">Todo conectado</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">Las clases y rutinas se gestionan desde FIT System y se reflejan en la app de los socios.</p>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-8">
            <div className="flex items-center gap-3 lg:hidden"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 font-black">F</span><span className="text-sm font-extrabold">FIT SYSTEM</span></div>
            <div className="hidden text-sm text-slate-400 sm:block">Portal de profesores <span className="mx-2 text-slate-700">/</span> <span className="text-slate-200">Espacio docente</span></div>
            <div className="ml-auto flex items-center gap-3">
              <div className="hidden text-right sm:block"><p className="text-sm font-semibold">{user.name}</p><p className="text-xs text-slate-500">Profesor</p></div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-300/10 font-bold text-cyan-200">{user.name?.trim()?.charAt(0)?.toUpperCase() || 'P'}</div>
              <Button variant="secondary" onClick={logout}>Cerrar sesión</Button>
            </div>
          </header>

          <div className="space-y-7 p-5 sm:p-8">
            <section className="relative overflow-hidden rounded-3xl border border-cyan-300/15 bg-gradient-to-r from-[#10253c] via-[#102039] to-[#111827] p-6 sm:p-9">
              <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
              <div className="relative max-w-3xl">
                <p className="text-xs font-bold uppercase tracking-[.24em] text-cyan-300">TU ESPACIO DE ENTRENAMIENTO</p>
                <h1 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">Hola, {user.name} <span aria-hidden="true">👋</span></h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">Organizá tus clases, consultá los inscriptos y seguí la evolución de tus alumnos desde un solo lugar.</p>
                <div className="mt-6 flex flex-wrap gap-3"><Button onClick={() => setShowSchedule((v) => !v)} disabled={!classes.length}>{showSchedule ? 'Cerrar formulario' : '+ Programar una clase'}</Button><a href="/routines" className="inline-flex h-10 items-center rounded-lg border border-white/15 bg-white/5 px-4 text-sm font-semibold text-slate-100 transition hover:bg-white/10">Ir a rutinas <span className="ml-2">↗</span></a></div>
              </div>
            </section>

            {error ? <div role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{error}</div> : null}
            {loading ? <div className="flex justify-center py-20"><Spinner className="h-7 w-7" /></div> : (
              <>
                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-[#0d1524] p-5 transition hover:border-cyan-300/30"><div className="flex items-center justify-between"><span className="text-sm text-slate-400">Clases asignadas</span><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-400/10 text-lg text-blue-300">▤</span></div><p className="mt-4 text-4xl font-black tracking-tight">{classes.length}</p><p className="mt-2 text-xs text-slate-500">Clases vinculadas a tu usuario</p></div>
                  <div className="rounded-2xl border border-white/10 bg-[#0d1524] p-5 transition hover:border-cyan-300/30"><div className="flex items-center justify-between"><span className="text-sm text-slate-400">Próximas sesiones</span><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-400/10 text-lg text-violet-300">◷</span></div><p className="mt-4 text-4xl font-black tracking-tight">{sessions.length}</p><p className="mt-2 text-xs text-slate-500">Agenda de los próximos 14 días</p></div>
                  <div className="rounded-2xl border border-white/10 bg-[#0d1524] p-5 transition hover:border-cyan-300/30"><div className="flex items-center justify-between"><span className="text-sm text-slate-400">Rutinas activas</span><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10 text-lg text-emerald-300">↗</span></div><p className="mt-4 text-4xl font-black tracking-tight">{routines.length}</p><p className="mt-2 text-xs text-slate-500">Rutinas disponibles en el sistema</p></div>
                </section>

                <section id="clases" className="scroll-mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0d1524]">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-5 sm:px-6"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-300">CLASES Y AGENDA</p><h2 className="mt-1 text-xl font-bold">Agenda de clases</h2><p className="mt-1 text-sm text-slate-400">Revisá horarios y gestioná los participantes.</p></div><Button onClick={() => setShowSchedule((v) => !v)} disabled={!classes.length}>{showSchedule ? 'Cancelar' : '+ Programar sesión'}</Button></div>
                  {showSchedule ? <form onSubmit={schedule} className="m-5 grid gap-3 rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><label className="grid gap-2 text-xs font-medium text-slate-400">Clase asignada<select className="rounded-lg border border-white/10 bg-[#080d18] p-3 text-sm text-white" value={classId} onChange={(e) => setClassId(e.target.value)} required>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="grid gap-2 text-xs font-medium text-slate-400">Fecha y hora<input className="rounded-lg border border-white/10 bg-[#080d18] p-3 text-sm text-white" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} required /></label><Button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Confirmar sesión'}</Button></form> : null}
                  <div className="divide-y divide-white/[.07] px-5 sm:px-6">
                    {sessions.length ? sessions.map((session) => <div key={session.id} className="flex flex-wrap items-center justify-between gap-4 py-5"><div className="flex min-w-0 items-start gap-4"><div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/5 text-cyan-200"><span className="text-[10px] uppercase">{new Date(session.startAt).toLocaleDateString('es-AR',{month:'short'})}</span><span className="text-lg font-bold leading-5">{new Date(session.startAt).getDate()}</span></div><div><p className="font-semibold text-white">{session.gymClass?.name || 'Clase'}</p><p className="mt-1 text-sm text-slate-400">{dateLabel(session.startAt)}{session.room ? ` · ${session.room}` : ''}</p><p className="mt-2 text-xs text-slate-500">{session._count?.reservations ?? 0} inscriptos <span className="mx-1">·</span> capacidad {session.capacity}</p></div></div><div className="flex flex-wrap gap-2"><button className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-cyan-300/40 hover:text-cyan-200" onClick={() => void openRoster(session)}>Ver inscriptos</button><button className="rounded-lg border border-red-400/20 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-400/10" onClick={() => void removeSession(session)}>Cancelar sesión</button></div></div>) : <div className="px-4 py-12 text-center"><p className="text-sm font-semibold text-slate-300">Tu agenda está libre por ahora</p><p className="mt-1 text-sm text-slate-500">Cuando programes sesiones, van a aparecer acá.</p></div>}
                  </div>
                </section>

                <section id="rutinas" className="scroll-mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0d1524]">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-5 sm:px-6"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-300">RUTINAS DE SOCIOS</p><h2 className="mt-1 text-xl font-bold">Rutinas de entrenamiento</h2><p className="mt-1 text-sm text-slate-400">Las rutinas asignadas se guardan en el sistema compartido y aparecen en la app del socio.</p></div><a href="#rutinas" className="inline-flex h-10 items-center rounded-lg bg-cyan-400 px-4 text-sm font-bold text-slate-950 transition hover:bg-cyan-300">Gestionar rutinas ↗</a></div>
                  <div className="divide-y divide-white/[.07] px-5 sm:px-6">{routines.length ? routines.map((routine) => <div key={routine.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300">↗</span><div><p className="font-semibold">{routine.name}</p><p className="mt-1 text-sm text-slate-400">{routine.memberName || (routine.isTemplate ? 'Plantilla reutilizable' : 'Rutina asignada')} · {routine.days?.length || 0} días</p></div></div><div className="flex items-center gap-2"><span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">Activa</span><button className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 transition hover:border-amber-300/40 hover:text-amber-200" onClick={async () => { if (!window.confirm('¿Cerrar este ciclo y conservar su historial?')) return; try { await http.post(`/routines/${routine.id}/archive`); await load(); } catch (e) { setError(e instanceof ApiError ? e.message : 'No se pudo archivar la rutina.'); } }}>Archivar ciclo</button></div></div>) : <p className="py-8 text-sm text-slate-500">Todavía no hay rutinas disponibles para tu sede.</p>}</div>
                </section>

                {archivedRoutines.length ? <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d1524]"><div className="border-b border-white/10 px-5 py-5 sm:px-6"><p className="text-xs font-bold uppercase tracking-[.18em] text-violet-300">HISTORIAL</p><h2 className="mt-1 text-xl font-bold">Ciclos anteriores</h2><p className="mt-1 text-sm text-slate-400">Consultá registros anteriores y compará la evolución.</p></div><div className="divide-y divide-white/[.07] px-5 sm:px-6">{archivedRoutines.map((routine) => <div key={routine.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="font-semibold">{routine.name}</p><p className="mt-1 text-sm text-slate-400">{routine.memberName || 'Plantilla'} · {routine.days?.length || 0} días</p></div><button className="rounded-lg border border-white/10 px-3 py-2 text-sm transition hover:border-cyan-300/40 hover:text-cyan-200" onClick={() => void compareRoutine(routine)}>Comparar progreso</button></div>)}</div></section> : null}
              </>
            )}
            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-5 text-xs text-slate-600"><span>FIT System · Portal de profesores</span><span>Clases, rutinas y socios conectados</span></footer>
          </div>
        </div>
      </div>

      {comparison ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setComparison(null)}><section className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0d1524] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}><div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Historial del ciclo</h2><p className="text-sm text-slate-400">{comparison.routine.name}</p></div><button className="rounded-lg border border-white/10 px-3 py-1.5 text-sm" onClick={() => setComparison(null)}>Cerrar</button></div>{comparison.logs.length ? <div className="mt-4 divide-y divide-white/10">{comparison.logs.map((log) => <div key={log.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-medium">{log.exerciseName}</p><p className="text-sm text-slate-400">{log.member ? `${log.member.firstName} ${log.member.lastName} · ${log.member.memberCode}` : 'Socio'} · {new Date(log.completedAt).toLocaleString('es-AR')}</p></div><p className="text-sm text-slate-400">{log.weight ? `${log.weight} kg` : 'Sin peso'}{log.sets ? ` · ${log.sets} series` : ''}{log.reps ? ` · ${log.reps} reps` : ''}</p></div>)}</div> : <p className="py-8 text-sm text-slate-400">Este ciclo no tiene registros de progreso todavía.</p>}</section></div> : null}

      {rosterSession ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setRosterSession(null)}><section className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#0d1524] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold">Inscriptos · {rosterSession.gymClass?.name || 'Clase'}</h2><button className="rounded-lg border border-white/10 px-3 py-1.5 text-sm" onClick={() => setRosterSession(null)}>Cerrar</button></div>{roster.length ? <div className="mt-4 divide-y divide-white/10">{roster.map((item) => <div key={item.id} className="py-3"><p className="font-medium">{item.member ? `${item.member.firstName} ${item.member.lastName}` : 'Socio'}</p><p className="text-sm text-slate-400">{item.member?.memberCode || ''} · {item.status}</p></div>)}</div> : <p className="py-8 text-sm text-slate-400">No hay inscriptos o todavía se están cargando.</p>}</section></div> : null}
    </main>
  );
}

// Redeploy del portal de profesores: recompilar la aplicacion web en el VPS.
