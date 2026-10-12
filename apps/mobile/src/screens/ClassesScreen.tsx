import { useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';
import { Card, Muted, PrimaryButton, Badge } from '../components/ui';
import { portal, ApiError, type PortalClass } from '../lib/api';

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function ClassesScreen() {
  const [items, setItems] = useState<PortalClass[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const res = await portal.classes();
    setItems(res.items);
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  async function toggle(item: PortalClass) {
    setBusyId(item.id);
    try {
      if (item.myStatus && item.myStatus !== 'CANCELLED') {
        await portal.cancelReserve(item.id);
        Alert.alert('Reserva cancelada', `${item.name}`);
      } else {
        const res = await portal.reserve(item.id);
        Alert.alert(res.waitlisted ? 'En lista de espera' : 'Reserva confirmada', `${item.name}`);
      }
      await load();
    } catch (error) {
      Alert.alert('No se pudo completar', error instanceof ApiError ? error.message : 'Intentá de nuevo');
    } finally {
      setBusyId(null);
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
      <Text style={styles.heading}>Clases</Text>
      {items.length === 0 ? (
        <Card>
          <Muted>No hay clases programadas por ahora.</Muted>
        </Card>
      ) : (
        items.map((c) => {
          const reserved = c.myStatus === 'RESERVED';
          const waitlisted = c.myStatus === 'WAITLIST';
          return (
            <Card key={c.id}>
              <View style={styles.row}>
                <Text style={styles.title}>{c.name}</Text>
                {reserved && <Badge text="Reservada" color={colors.success ?? '#22c55e'} />}
                {waitlisted && <Badge text="En espera" color="#f59e0b" />}
                {c.full && !c.myStatus && <Badge text="Completa" color="#ef4444" />}
              </View>
              <Muted>{formatWhen(c.startAt)}</Muted>
              <Muted>
                {c.instructor ? `${c.instructor} · ` : ''}
                {c.reserved}/{c.capacity} anotados{c.room ? ` · ${c.room}` : ''}
              </Muted>
              <View style={styles.actions}>
                <PrimaryButton
                  label={reserved || waitlisted ? 'Cancelar' : c.full ? 'Lista de espera' : 'Reservar'}
                  variant={reserved || waitlisted ? 'ghost' : 'primary'}
                  loading={busyId === c.id}
                  onPress={() => toggle(c)}
                />
              </View>
            </Card>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, gap: spacing.md },
  heading: { color: colors.text, fontSize: 24, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { color: colors.text, fontSize: 17, fontWeight: '700', flexShrink: 1 },
  actions: { marginTop: spacing.md },
});
