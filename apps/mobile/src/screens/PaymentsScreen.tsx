import { useEffect, useState } from 'react';
import { Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';
import { Badge, Card, Muted, PrimaryButton, Subtitle } from '../components/ui';
import { portal, type Payment, type PaymentIntent, type Quota } from '../lib/api';

function money(amount: number, currency = 'ARS') {
  const rounded = Math.round(amount);
  const withThousands = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const symbol = currency === 'ARS' ? '$' : currency === 'USD' ? 'US$' : `${currency} `;
  return `${symbol}${withThousands}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function PaymentsScreen({ quota }: { quota: Quota | null }) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [intents, setIntents] = useState<PaymentIntent[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<'mp' | 'transfer' | null>(null);

  async function load() {
    const res = await portal.payments();
    setPayments(res.payments);
    setIntents(res.intents);
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  async function payWithMp() {
    setBusy('mp');
    try {
      const res = await portal.createIntent('MERCADOPAGO');
      if (res.checkoutUrl) {
        await Linking.openURL(res.checkoutUrl);
      } else {
        Alert.alert('MercadoPago', 'Se genero la intencion de pago. El gimnasio aun no tiene configurado MercadoPago online; acercate a recepcion.');
      }
      await load();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo iniciar el pago');
    } finally {
      setBusy(null);
    }
  }

  async function payWithTransfer() {
    setBusy('transfer');
    try {
      const res = await portal.createIntent('TRANSFER');
      const alias = res.transfer?.alias;
      Alert.alert(
        'Pago por transferencia',
        alias
          ? `Transferi ${money(res.transfer!.amount)} al alias: ${alias}\n\nLuego subi el comprobante en tu gimnasio.`
          : 'Se genero la intencion de pago. Consulta el alias de transferencia en recepcion.',
      );
      await load();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo iniciar el pago');
    } finally {
      setBusy(null);
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
      <Text style={styles.heading}>Pagos</Text>

      <Card>
        <Subtitle>Pagar mi cuota</Subtitle>
        <Text style={styles.amount}>
          {quota ? `${money(quota.price)} · ${quota.plan}` : 'Sin membresia activa'}
        </Text>
        <View style={styles.actions}>
          <PrimaryButton label="Pagar con MercadoPago" onPress={payWithMp} loading={busy === 'mp'} />
          <PrimaryButton label="Transferencia" variant="ghost" onPress={payWithTransfer} loading={busy === 'transfer'} />
        </View>
      </Card>

      <Subtitle>Solicitudes recientes</Subtitle>
      <Card>
        {intents.length === 0 ? (
          <Muted>No hay solicitudes de pago.</Muted>
        ) : (
          intents.map((it, idx) => (
            <View key={it.id} style={[styles.row, idx > 0 && styles.rowBorder]}>
              <View>
                <Text style={styles.rowText}>{money(it.amount)} · {it.method}</Text>
                <Muted>{formatDate(it.createdAt)}</Muted>
              </View>
              <Badge
                text={it.status}
                color={it.status === 'PAID' ? colors.success : it.status === 'PENDING' ? colors.warning : colors.danger}
              />
            </View>
          ))
        )}
      </Card>

      <Subtitle>Historial</Subtitle>
      <Card>
        {payments.length === 0 ? (
          <Muted>No hay pagos registrados.</Muted>
        ) : (
          payments.map((p, idx) => (
            <View key={p.id} style={[styles.row, idx > 0 && styles.rowBorder]}>
              <View>
                <Text style={styles.rowText}>{money(p.amount, p.currency)} · {p.concept}</Text>
                <Muted>{formatDate(p.paidAt)} · {p.method}</Muted>
              </View>
              <Badge text={p.status} color={p.status === 'COMPLETED' ? colors.success : colors.warning} />
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
  heading: { color: colors.text, fontSize: 24, fontWeight: '800' },
  amount: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: spacing.xs },
  actions: { gap: spacing.sm, marginTop: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  rowText: { color: colors.text, fontSize: 14, fontWeight: '600' },
});
