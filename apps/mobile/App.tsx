import { useState } from 'react';
import { Pressable, SafeAreaView, StatusBar as RNStatusBar, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing } from './src/theme';
import { setToken, type LoginResponse } from './src/lib/api';
import { LoginScreen } from './src/screens/LoginScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { NewsScreen } from './src/screens/NewsScreen';
import { RoutinesScreen } from './src/screens/RoutinesScreen';
import { PaymentsScreen } from './src/screens/PaymentsScreen';

type Tab = 'home' | 'news' | 'routines' | 'payments';

const TABS: { key: Tab; label: string }[] = [
  { key: 'home', label: 'Inicio' },
  { key: 'news', label: 'Novedades' },
  { key: 'routines', label: 'Rutinas' },
  { key: 'payments', label: 'Pagos' },
];

export default function App() {
  const [session, setSession] = useState<LoginResponse | null>(null);
  const [tab, setTab] = useState<Tab>('home');

  if (!session) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <LoginScreen onLogged={setSession} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>FIT System</Text>
          <Text style={styles.brandSub}>{session.organization.name}</Text>
        </View>
        <Pressable
          onPress={() => {
            setToken(null);
            setSession(null);
            setTab('home');
          }}
          style={styles.logout}
        >
          <Text style={styles.logoutText}>Salir</Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        {tab === 'home' && <HomeScreen org={session.organization} member={session.member} initialQuota={session.quota} />}
        {tab === 'news' && <NewsScreen />}
        {tab === 'routines' && <RoutinesScreen />}
        {tab === 'payments' && <PaymentsScreen quota={session.quota} />}
      </View>

      <View style={styles.tabbar}>
        {TABS.map((t) => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} style={styles.tabButton}>
            <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
            {tab === t.key && <View style={styles.tabIndicator} />}
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, paddingTop: RNStatusBar.currentHeight ?? 0 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  brand: { color: colors.primaryLight, fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  brandSub: { color: colors.textMuted, fontSize: 12 },
  logout: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  logoutText: { color: colors.textMuted, fontSize: 13 },
  content: { flex: 1 },
  tabbar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  tabButton: { flex: 1, alignItems: 'center', paddingVertical: spacing.md, gap: 4 },
  tabLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  tabLabelActive: { color: colors.primaryLight },
  tabIndicator: { width: 20, height: 2, borderRadius: 2, backgroundColor: colors.primaryLight },
});
