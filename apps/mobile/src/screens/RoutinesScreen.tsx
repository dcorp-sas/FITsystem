import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, spacing } from '../theme';
import { Badge, Card, Muted, ScreenHeader } from '../components/ui';
import { portal, type Exercise, type Routine, type RoutineDay, type RoutineLog, type ArchivedRoutine } from '../lib/api';

function lastLogFor(logs: RoutineLog[], exerciseId: string): RoutineLog | undefined {
  return logs.find((l) => l.exerciseId === exerciseId);
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

function routineProgress(routine: Routine, logs: RoutineLog[]) {
  const relevant = logs.filter((log) => log.routineId === routine.id);
  const firstLog = relevant.length ? relevant[relevant.length - 1].completedAt : undefined;
  const start = new Date(routine.createdAt || firstLog || new Date().toISOString());
  const elapsedDays = Math.max(0, Math.floor((Date.now() - start.getTime()) / 86400000));
  const currentWeek = Math.min(4, Math.floor(elapsedDays / 7) + 1);
  const expected = Math.max(1, routine.days.reduce((sum, day) => sum + day.exercises.length, 0));
  const weeks = [0, 1, 2, 3].map((week) => {
    const from = start.getTime() + week * 7 * 86400000;
    const to = from + 7 * 86400000;
    const completed = new Set(relevant.filter((log) => {
      const time = new Date(log.completedAt).getTime();
      return time >= from && time < to;
    }).map((log) => `${log.exerciseId || log.exerciseName}-${log.dayIndex ?? 0}`)).size;
    return { week: week + 1, percent: Math.min(100, Math.round((completed / expected) * 100)), completed, expected };
  });
  return { currentWeek, weeks, totalLogs: relevant.length };
}

export function RoutinesScreen() {
  const [items, setItems] = useState<Routine[]>([]);
  const [logs, setLogs] = useState<RoutineLog[]>([]);
  const [history, setHistory] = useState<ArchivedRoutine[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    const [routines, progress, archived] = await Promise.all([portal.routines(), portal.routineLogs({ limit: 200 }), portal.routineHistory()]);
    setItems(routines.items);
    setLogs(progress.items);
    setHistory(archived.items);
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  async function register(routine: Routine, day: RoutineDay, ex: Exercise) {
    setPending(ex.id);
    setNotice(null);
    try {
      const log = await portal.logRoutine({
        routineId: routine.id,
        exerciseId: ex.id,
        exerciseName: ex.name,
        dayIndex: day.dayIndex,
        sets: ex.sets,
        reps: ex.reps,
        weight: (weights[ex.id] || '').trim() || undefined,
        notes: undefined,
      });
      setLogs((prev) => [log, ...prev]);
      setNotice(`Registrado: ${ex.name}`);
      setWeights((prev) => ({ ...prev, [ex.id]: '' }));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'No se pudo registrar el ejercicio');
    } finally {
      setPending(null);
    }
  }

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.primaryLight}
          onRefresh={async () => {
            setRefreshing(true);
            try {
              await load();
            } finally {
              setRefreshing(false);
            }
          }}
        />
      }
    >
      <ScreenHeader icon="barbell-outline" title="Mis rutinas" subtitle="Seguí tu entrenamiento y registrá pesos" />
      {notice ? (
        <Card>
          <Muted>{notice}</Muted>
        </Card>
      ) : null}
      {items.length === 0 ? (
        <Card>
          <Muted>Todavia no tenes rutinas asignadas.</Muted>
        </Card>
      ) : (
        items.map((r) => (
          <Card key={r.id}>
            <View style={styles.rowBetween}>
              <Text style={styles.title}>{r.name}</Text>
              <Badge text={r.goal} color={colors.primaryLight} />
            </View>
            {r.description ? <Muted>{r.description}</Muted> : null}
            {(() => {
              const progress = routineProgress(r, logs);
              return (
                <View style={styles.progressBox}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.progressTitle}>Ciclo de 4 semanas</Text>
                    <Muted>Semana {progress.currentWeek} de 4</Muted>
                  </View>
                  {progress.weeks.map((week) => (
                    <View key={week.week} style={styles.weekRow}>
                      <Text style={styles.weekLabel}>S{week.week}</Text>
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${week.percent}%` }]} />
                      </View>
                      <Text style={styles.percent}>{week.percent}%</Text>
                    </View>
                  ))}
                </View>
              );
            })()}
            {r.days.map((d) => (
              <View key={d.id} style={styles.day}>
                <Text style={styles.dayLabel}>{d.label || `Dia ${d.dayIndex}`}</Text>
                {d.exercises.map((ex) => {
                  const last = lastLogFor(logs, ex.id);
                  const busy = pending === ex.id;
                  return (
                    <View key={ex.id} style={styles.exercise}>
                      <Text style={styles.exerciseName}>{ex.name}</Text>
                      <Muted>
                        {ex.sets} x {ex.reps}
                        {ex.restSec ? ` · descanso ${ex.restSec}s` : ''}
                        {ex.weight ? ` · ${ex.weight}` : ''}
                      </Muted>
                      {last ? (
                        <Muted>
                          Ultimo: {last.weight ? `${last.weight} · ` : ''}
                          {formatWhen(last.completedAt)}
                        </Muted>
                      ) : null}
                      <View style={styles.logRow}>
                        <TextInput
                          style={styles.input}
                          value={weights[ex.id] || ''}
                          onChangeText={(v) => setWeights((prev) => ({ ...prev, [ex.id]: v }))}
                          placeholder="Peso (kg)"
                          placeholderTextColor={colors.textMuted}
                          keyboardType="numeric"
                        />
                        <Pressable
                          onPress={() => register(r, d, ex)}
                          disabled={busy}
                          style={({ pressed }) => [
                            styles.doneBtn,
                            busy && styles.doneBtnDisabled,
                            pressed && { opacity: 0.85 },
                          ]}
                        >
                          <Text style={styles.doneText}>{busy ? '...' : 'Hecho'}</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
          </Card>
        ))
      )}
      {history.length > 0 ? (
        <Card>
          <Text style={styles.title}>Historial de rutinas</Text>
          <Muted>Los ciclos archivados quedan guardados para revisar tu evolución.</Muted>
          {history.map(({ routine, logs: archivedLogs }) => (
            <View key={routine.id} style={styles.historyItem}>
              <Text style={styles.exerciseName}>{routine.name}</Text>
              <Muted>{archivedLogs.length} registros de entrenamiento</Muted>
              {archivedLogs[0] ? <Muted>Último registro: {formatWhen(archivedLogs[0].completedAt)}</Muted> : <Muted>Sin registros en este ciclo</Muted>}
            </View>
          ))}
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, gap: spacing.md },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressBox: { marginTop: spacing.md, padding: spacing.sm, borderRadius: 10, backgroundColor: colors.surface, gap: 7 },
  progressTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  weekLabel: { color: colors.textMuted, fontSize: 12, width: 22 },
  progressTrack: { flex: 1, height: 7, borderRadius: 8, backgroundColor: colors.border, overflow: 'hidden' },
  progressFill: { height: 7, borderRadius: 8, backgroundColor: colors.primary },
  percent: { color: colors.textMuted, fontSize: 11, width: 34, textAlign: 'right' },
  historyItem: { marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, gap: 3 },
  title: { color: colors.text, fontSize: 17, fontWeight: '700' },
  day: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  dayLabel: { color: colors.primaryLight, fontSize: 14, fontWeight: '700', marginBottom: spacing.xs },
  exercise: { paddingVertical: 6, gap: 4 },
  exerciseName: { color: colors.text, fontSize: 14, fontWeight: '600' },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  input: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: spacing.sm,
    fontSize: 14,
  },
  doneBtn: {
    height: 38,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnDisabled: { opacity: 0.5 },
  doneText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
