import { useEffect, useState } from 'react';
import { Pressable, SafeAreaView, StatusBar as RNStatusBar, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors, radius, shadow, spacing } from './src/theme';
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
import { Avatar } from './src/components/ui';
import { Icon, type IconName } from './src/components/icon';

type Tab = 'home' | 'checkin' | 'classes' | 'news' | 'routines' | 'payments';

const TABS: { key: Tab; label: string; icon: IconName; iconActive: IconName }[] = [
  { key: 'home', label: 'Inicio', icon: 'home-outline', iconActive: 'home' },
  { key: 'checkin', label: 'Ingreso', icon: 'qr-code-outline', iconActive: 'qr-code' },
  { key: 'classes', label: 'Clases', icon: 'calendar-outline', iconActive: 'calendar' },
  { key: 'news', label: 'Novedades', icon: 'megaphone-outline', iconActive: 'megaphone' },
  { key: 'routines', label: 'Rutinas', icon: 'barbell-outline', iconActive: 'barbell' },
  { key: 'payments', label: 'Pagos', icon: 'card-outline', iconActive: 'card' },
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
          <View style={styles.loadingMark}>
            <Text style={styles.loadingMarkText}>FIT</Text>
          </View>
          <Text style={styles.loadingText}>Cargando tu gimnasio…</Text>
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
        <View style={styles.headerLeft}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>FIT</Text>
          </View>
          <View style={styles.headerTextWrap}>
            <Text style={styles.brandSub} numberOfLines={1}>
              {session.organization.name}
            </Text>
            <Text style={styles.headerHello} numberOfLines={1}>
              Hola, {session.member.name.split(' ')[0]}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Avatar name={session.member.name} size={38} />
          <Pressable
            onPress={() => {
              setToken(null);
              setSession(null);
              setTab('home');
            }}
            style={({ pressed }) => [styles.logout, pressed && { opacity: 0.7 }]}
            hitSlop={8}
          >
            <Icon name="log-out-outline" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>

      {!online && (
        <View style={styles.offlineBanner}>
          <Icon name="cloud-offline-outline" size={14} color="#fed7aa" />
          <Text style={styles.offlineText}>Sin conexión · mostrando datos guardados</Text>
        </View>
      )}

      <View style={styles.content}>
        {tab === 'home' && (
          <HomeScreen
            org={session.organization}
            member={session.member}
            initialQuota={session.quota}
            onGoToCheckin={() => setTab('checkin')}
            onGoToTab={(t) => setTab(t)}
          />
        )}
        {tab === 'checkin' && <ScanScreen onDone={() => setTab('home')} />}
        {tab === 'classes' && <ClassesScreen />}
        {tab === 'news' && <NewsScreen />}
        {tab === 'routines' && <RoutinesScreen />}
        {tab === 'payments' && <PaymentsScreen quota={session.quota} />}
      </View>

      <View style={styles.tabbar}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={styles.tabButton}
              hitSlop={4}
            >
              <View style={[styles.tabIconWrap, active && styles.tabIconWrapActive]}>
                <Icon
                  name={active ? t.iconActive : t.icon}
                  size={22}
                  color={active ? colors.primaryLight : colors.textFaint}
                />
              </View>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]} numberOfLines={1}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
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
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  headerTextWrap: { flexShrink: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  brandMarkText: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 0.5 },
  brandSub: { color: colors.text, fontSize: 15, fontWeight: '700' },
  headerHello: { color: colors.textMuted, fontSize: 12.5 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingMark: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingMarkText: { color: '#fff', fontWeight: '900', fontSize: 20, letterSpacing: 1 },
  loadingText: { color: colors.textMuted, fontSize: 13 },
  logout: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1 },
  offlineBanner: {
    backgroundColor: '#7c2d12',
    paddingVertical: 6,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  offlineText: { color: '#fed7aa', fontSize: 12, fontWeight: '600' },
  tabbar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.bgElev,
    paddingTop: 6,
    paddingBottom: 8,
  },
  tabButton: { flex: 1, alignItems: 'center', gap: 3 },
  tabIconWrap: {
    width: 46,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconWrapActive: { backgroundColor: `${colors.primary}26` },
  tabLabel: { color: colors.textFaint, fontSize: 10, fontWeight: '600' },
  tabLabelActive: { color: colors.primaryLight },
});
