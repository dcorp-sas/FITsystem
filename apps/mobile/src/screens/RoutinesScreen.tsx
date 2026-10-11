import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';
import { Badge, Card, Muted } from '../components/ui';
import { portal, type Routine } from '../lib/api';

export function RoutinesScreen() {
  const [items, setItems] = useState<Routine[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    const res = await portal.routines();
    setItems(res.items);
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

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
      <Text style={styles.heading}>Mis rutinas</Text>
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
            {r.days.map((d) => (
              <View key={d.id} style={styles.day}>
                <Text style={styles.dayLabel}>{d.label || `Dia ${d.dayIndex}`}</Text>
                {d.exercises.map((ex) => (
                  <View key={ex.id} style={styles.exercise}>
                    <Text style={styles.exerciseName}>{ex.name}</Text>
                    <Muted>
                      {ex.sets} x {ex.reps}
                      {ex.restSec ? ` · descanso ${ex.restSec}s` : ''}
                      {ex.weight ? ` · ${ex.weight}` : ''}
                    </Muted>
                  </View>
                ))}
              </View>
            ))}
          </Card>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, gap: spacing.md },
  heading: { color: colors.text, fontSize: 24, fontWeight: '800' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.text, fontSize: 17, fontWeight: '700' },
  day: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  dayLabel: { color: colors.primaryLight, fontSize: 14, fontWeight: '700', marginBottom: spacing.xs },
  exercise: { paddingVertical: 4 },
  exerciseName: { color: colors.text, fontSize: 14, fontWeight: '600' },
});
