import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StatusBar as RNStatusBar, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing } from './src/theme';
import { setToken, portal, bootstrapToken, type LoginResponse } from './src/lib/api';
import { configureNotifications, registerPushAsync } from './src/lib/push';
import { LoginScreen } from './src/screens/LoginScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { NewsScreen } from './src/screens/NewsScreen';
import { RoutinesScreen } from './src/screens/RoutinesScreen';
import { PaymentsScreen } from './src/screens/PaymentsScreen';
import { ClassesScreen } from './src/screens/ClassesScreen';
import { ScanScreen } from './src/screens/ScanScreen';
import { InstallPrompt } from './src/components/install-prompt';
import { NotificationPrompt } from './src/components/notification-prompt';
import { ToastHost } from './src/components/toast';

type Tab = 'home' | 'checkin' | 'classes' | 'news' | 'routines' | 'payments';

const TABS: { key: Tab; label: string }[] = [
  { key: 'home', label: 'Inicio' },
  { key: 'checkin', label: 'Ingreso' },
  { key: 'classes', label: 'Clases' },
  { key: 'news', label: 'Novedades' },
  { key: 'routines', label: 'Rutinas' },
  { key: 'payments', label: 'Pagos' },
];

export default function App() {
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');
  const [session, setSession] = useState<LoginResponse | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [online, setOnline] = useState(true);

  useEffect(() => {
    configureNotifications();
  }, []);

  // Indicador de conexión (solo web/PWA): avisa cuando se ven datos guardados.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    const update = () => setOnline(typeof navigator === 'undefined' ? true : navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  // Restaura la sesión guardada al abrir la app (PWA recarga o nativo reabierto).
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stored = await bootstrapToken();
        if (stored) {
          const me = await portal.me();
          if (mounted) setSession({ token: stored, ...me });
        }
      } catch {
        setToken(null);
      } finally {
        if (mounted) setStatus('ready');
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (session) void registerPushAsync(portal.registerPush);
  }, [session]);

  if (status === 'loading') {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primaryLight} />
          <Text style={styles.loadingText}>Cargando...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <InstallPrompt />
        <LoginScreen onLogged={setSession} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <InstallPrompt />
      <NotificationPrompt />
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>FIT system™</Text>
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

      {!online && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>Sin conexión · mostrando datos guardados</Text>
        </View>
      )}

      <View style={styles.content}>
        {tab === 'home' && <HomeScreen org={session.organization} member={session.member} initialQuota={session.quota} onGoToCheckin={() => setTab('checkin')} />}
        {tab === 'checkin' && <ScanScreen onDone={() => setTab('home')} />}
        {tab === 'classes' && <ClassesScreen />}
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

      <ToastHost />
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
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  loadingText: { color: colors.textMuted, fontSize: 13 },
  logout: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  logoutText: { color: colors.textMuted, fontSize: 13 },
  content: { flex: 1 },
  offlineBanner: {
    backgroundColor: '#7c2d12',
    paddingVertical: 6,
    paddingHorizontal: spacing.lg,
  },
  offlineText: { color: '#fed7aa', fontSize: 12, textAlign: 'center', fontWeight: '600' },
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
