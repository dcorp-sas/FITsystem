import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';
import { Badge, Card, Muted, PrimaryButton, Subtitle } from '../components/ui';
import { portal, type Checkin, type MemberInfo, type OrgInfo, type Quota } from '../lib/api';

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function quotaColor(quota: Quota | null) {
  if (!quota) return colors.textMuted;
  if (quota.isExpired) return colors.danger;
  if (quota.daysLeft <= 5) return colors.warning;
  return colors.success;
}

export function HomeScreen({
  org,
  member,
  initialQuota,
  onGoToCheckin,
}: {
  org: OrgInfo;
  member: MemberInfo;
  initialQuota: Quota | null;
  onGoToCheckin?: () => void;
}) {
  const [quota, setQuota] = useState<Quota | null>(initialQuota);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    const [me, chk] = await Promise.all([portal.me(), portal.checkins()]);
    setQuota(me.quota);
    setCheckins(chk.items);
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  const color = quotaColor(quota);

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryLight} />}
    >
      <Text style={styles.greeting}>Hola, {member.name.split(' ')[0]}!</Text>
      <Muted>
        {org.name}
        {member.memberCode ? ` · Legajo ${member.memberCode}` : ''}
      </Muted>

      <Card style={{ borderColor: color }}>
        <View style={styles.rowBetween}>
          <Subtitle>Mi cuota</Subtitle>
          {quota && (
            <Badge
              text={quota.isExpired ? 'Vencida' : quota.status === 'ACTIVE' ? 'Activa' : quota.status}
              color={color}
            />
          )}
        </View>
        {quota ? (
          <>
            <Text style={styles.plan}>{quota.plan}</Text>
            <Text style={[styles.days, { color }]}>
              {quota.isExpired ? 'Vencida' : `Vence en ${quota.daysLeft} dia${quota.daysLeft === 1 ? '' : 's'}`}
            </Text>
            <Muted>Vencimiento: {formatDate(quota.endDate)}</Muted>
          </>
        ) : (
          <Muted>No tenes una membresia activa.</Muted>
        )}
      </Card>

      <View style={styles.statsRow}>
        <Card style={styles.statCard}>
          <Text style={styles.statValue}>{member.totalVisits ?? 0}</Text>
          <Muted>Ingresos totales</Muted>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statValue}>{formatDate(member.lastVisitAt)}</Text>
          <Muted>Ultima visita</Muted>
        </Card>
      </View>

      <PrimaryButton
        label="Escanear QR para ingresar"
        onPress={() => onGoToCheckin?.()}
        disabled={!quota || quota.isExpired}
      />
      <Muted style={{ textAlign: 'center' }}>
        El ingreso se registra escaneando el QR de la entrada del gimnasio con la cámara de la app.
      </Muted>

      <Subtitle>Ultimos ingresos</Subtitle>
      <Card>
        {checkins.length === 0 ? (
          <Muted>Todavia no registramos ingresos.</Muted>
        ) : (
          checkins.slice(0, 6).map((c, idx) => (
            <View key={c.id} style={[styles.listRow, idx > 0 && styles.listRowBorder]}>
              <Text style={styles.listText}>{formatDate(c.checkedInAt)}</Text>
              <Badge text={c.status === 'ALLOWED' ? 'OK' : c.status} color={c.status === 'ALLOWED' ? colors.success : colors.danger} />
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, gap: spacing.md },
  greeting: { color: colors.text, fontSize: 24, fontWeight: '800' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  plan: { color: colors.text, fontSize: 22, fontWeight: '700', marginTop: spacing.sm },
  days: { fontSize: 15, fontWeight: '600', marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: spacing.md },
  statCard: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { color: colors.text, fontSize: 18, fontWeight: '700' },
  listRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm },
  listRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  listText: { color: colors.text, fontSize: 14 },
});
