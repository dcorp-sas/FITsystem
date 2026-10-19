import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme';
import { Badge, Card, Muted, SectionTitle } from '../components/ui';
import { Icon, type IconName } from '../components/icon';
import { portal, type Checkin, type MemberInfo, type OrgInfo, type Quota } from '../lib/api';

type DestTab = 'checkin' | 'classes' | 'routines' | 'payments' | 'news';

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

function useProgress(quota: Quota | null) {
  if (!quota) return 0;
  const start = new Date(quota.startDate).getTime();
  const end = new Date(quota.endDate).getTime();
  const total = end - start;
  if (total <= 0) return quota.isExpired ? 1 : 0;
  const elapsed = Date.now() - start;
  return Math.min(1, Math.max(0, elapsed / total));
}

export function HomeScreen({
  org,
  member,
  initialQuota,
  onGoToCheckin,
  onGoToTab,
}: {
  org: OrgInfo;
  member: MemberInfo;
  initialQuota: Quota | null;
  onGoToCheckin?: () => void;
  onGoToTab?: (tab: DestTab) => void;
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
  const progress = useProgress(quota);
  const canEnter = !!quota && !quota.isExpired;

  const actions: { key: DestTab; label: string; icon: IconName }[] = [
    { key: 'checkin', label: 'Ingreso', icon: 'qr-code-outline' },
    { key: 'classes', label: 'Clases', icon: 'calendar-outline' },
    { key: 'routines', label: 'Rutinas', icon: 'barbell-outline' },
    { key: 'payments', label: 'Pagos', icon: 'card-outline' },
  ];

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryLight} />}
    >
      {/* Tarjeta tipo credencial de membresía */}
      <View style={[styles.wallet, { borderColor: `${color}55` }]}>
        <View style={styles.walletGlow} />
        <View style={styles.rowBetween}>
          <View style={styles.walletLabelRow}>
            <Icon name="card-outline" size={15} color={colors.primaryLight} />
            <Text style={styles.walletLabel}>Mi cuota</Text>
          </View>
          {quota && (
            <Badge
              text={quota.isExpired ? 'Vencida' : quota.status === 'ACTIVE' ? 'Activa' : quota.status}
              color={color}
            />
          )}
        </View>

        {quota ? (
          <>
            <Text style={styles.walletDays}>
              {quota.isExpired ? 'Vencida' : `${quota.daysLeft}`}
              {!quota.isExpired && <Text style={styles.walletDaysUnit}> {quota.daysLeft === 1 ? 'día' : 'días'}</Text>}
            </Text>
            <Text style={styles.walletPlan}>{quota.plan}</Text>

            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: color }]} />
            </View>

            <View style={styles.rowBetween}>
              <Muted>Vence {formatDate(quota.endDate)}</Muted>
              <Muted>{org.currency === 'ARS' ? '$' : ''}{Math.round(quota.price).toLocaleString('es-AR')}</Muted>
            </View>
          </>
        ) : (
          <View style={styles.emptyQuota}>
            <Icon name="alert-circle-outline" size={18} color={colors.warning} />
            <Muted>No tenés una membresía activa. Acercate a recepción.</Muted>
          </View>
        )}
      </View>

      {/* Acciones rápidas */}
      <View style={styles.actionsRow}>
        {actions.map((a) => (
          <Pressable
            key={a.key}
            onPress={() => (a.key === 'checkin' ? onGoToCheckin?.() : onGoToTab?.(a.key))}
            disabled={a.key === 'checkin' && !canEnter}
            style={({ pressed }) => [styles.action, pressed && { opacity: 0.75 }, a.key === 'checkin' && !canEnter && styles.actionDisabled]}
          >
            <View style={styles.actionIcon}>
              <Icon name={a.icon} size={22} color={colors.primaryLight} />
            </View>
            <Text style={styles.actionLabel}>{a.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.statsRow}>
        <Card style={styles.statCard}>
          <Icon name="footsteps-outline" size={18} color={colors.accent} />
          <Text style={styles.statValue}>{member.totalVisits ?? 0}</Text>
          <Muted>Ingresos</Muted>
        </Card>
        <Card style={styles.statCard}>
          <Icon name="time-outline" size={18} color={colors.accent} />
          <Text style={styles.statValue}>{formatDate(member.lastVisitAt)}</Text>
          <Muted>Última visita</Muted>
        </Card>
      </View>

      <SectionTitle
        icon="scan-outline"
        action={
          <Pressable onPress={() => onGoToCheckin?.()} disabled={!canEnter} hitSlop={8}>
            <Text style={[styles.link, !canEnter && { color: colors.textFaint }]}>Abrir cámara</Text>
          </Pressable>
        }
      >
        Ingresar al gimnasio
      </SectionTitle>
      <Card>
        <View style={styles.scanRow}>
          <View style={styles.scanIcon}>
            <Icon name="qr-code-outline" size={26} color={colors.primaryLight} />
          </View>
          <View style={styles.scanText}>
            <Text style={styles.scanTitle}>Escaneá el QR de la entrada</Text>
            <Muted>Usá la cámara de la app para registrar tu ingreso.</Muted>
          </View>
        </View>
      </Card>

      <SectionTitle icon="calendar-outline">Últimos ingresos</SectionTitle>
      <Card>
        {checkins.length === 0 ? (
          <Muted>Todavía no registramos ingresos.</Muted>
        ) : (
          checkins.slice(0, 6).map((c, idx) => (
            <View key={c.id} style={[styles.listRow, idx > 0 && styles.listRowBorder]}>
              <View style={styles.listLeft}>
                <Icon name="checkmark-circle-outline" size={16} color={colors.textMuted} />
                <Text style={styles.listText}>{formatDate(c.checkedInAt)}</Text>
              </View>
              <Badge
                text={c.status === 'ALLOWED' ? 'OK' : c.status}
                color={c.status === 'ALLOWED' ? colors.success : colors.danger}
              />
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.xxl },
  wallet: {
    backgroundColor: colors.bgElev,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    overflow: 'hidden',
    gap: spacing.sm,
  },
  walletGlow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: `${colors.primary}22`,
    top: -110,
    right: -60,
  },
  walletLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  walletLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
  walletDays: { color: colors.text, fontSize: 44, fontWeight: '900', letterSpacing: -1, marginTop: spacing.sm },
  walletDaysUnit: { fontSize: 16, fontWeight: '600', color: colors.textMuted },
  walletPlan: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
    marginVertical: spacing.sm,
  },
  progressFill: { height: '100%', borderRadius: radius.pill },
  emptyQuota: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actionsRow: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1, alignItems: 'center', gap: 6 },
  actionDisabled: { opacity: 0.4 },
  actionIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: spacing.md },
  statCard: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { color: colors.text, fontSize: 18, fontWeight: '800' },
  scanRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  scanIcon: {
    width: 54,
    height: 54,
    borderRadius: radius.md,
    backgroundColor: `${colors.primary}22`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanText: { flex: 1, gap: 2 },
  scanTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  link: { color: colors.primaryLight, fontSize: 13, fontWeight: '600' },
  listRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm },
  listRowBorder: { borderTopWidth: 1, borderTopColor: colors.borderSoft },
  listLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  listText: { color: colors.text, fontSize: 14 },
});
