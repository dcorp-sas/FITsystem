import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';
import { Muted, Subtitle } from './ui';

// Evento no estándar de Chromium para la instalación de PWA.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type InstallWindow = Window & { __deferredInstallPrompt?: BeforeInstallPromptEvent | null };

const INSTALL_DISMISSED_KEY = 'fitsystem.socios.install-dismissed-v1';

function wasDismissed(): boolean {
  try { return window.localStorage.getItem(INSTALL_DISMISSED_KEY) === '1'; } catch { return false; }
}

function rememberDismissal() {
  try { window.localStorage.setItem(INSTALL_DISMISSED_KEY, '1'); } catch { /* ignore */ }
}

/**
 * Pide al usuario agregar la app a la pantalla de inicio. En Android/Chrome se
 * usa el prompt nativo (beforeinstallprompt); en navegadores que no lo soportan
 * (iOS/Safari o cuando aún no está disponible) se muestran las instrucciones
 * manuales. Se muestra al abrir con `?install=1` (enlace desde la web) o cuando
 * el navegador avisa que la app es instalable.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const win = window as InstallWindow;
    const nav = window.navigator as unknown as { standalone?: boolean };
    const standalone =
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || nav.standalone === true;
    if (standalone) return;

    const wants = new URLSearchParams(window.location.search).get('install') === '1';

    const adopt = () => {
      if (win.__deferredInstallPrompt) {
        setDeferred(win.__deferredInstallPrompt);
        if (wasDismissed() && !wants) return true;
        setManual(false);
        setOpen(true);
        return true;
      }
      return false;
    };
    const onPrompt = (e: Event) => {
      e.preventDefault();
      win.__deferredInstallPrompt = e as BeforeInstallPromptEvent;
      setDeferred(e as BeforeInstallPromptEvent);
      setManual(false);
      if (wasDismissed()) return;
      setOpen(true);
    };
    const onInstalled = () => {
      win.__deferredInstallPrompt = null;
      setDeferred(null);
      setOpen(false);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('fitsystem:install-available', adopt);
    window.addEventListener('appinstalled', onInstalled);

    // Si el usuario pidió instalar desde la web y el prompt nativo todavía no
    // está disponible, mostramos las instrucciones manuales.
    if (wants && !adopt()) {
      setManual(true);
      setOpen(true);
    } else if (!wants && !wasDismissed() && !adopt()) {
      // Recupera la invitacion inicial tambien en Safari/iOS, donde no existe
      // beforeinstallprompt. Se muestra una sola vez si el usuario la descarta.
      const timer = window.setTimeout(() => {
        if (!wasDismissed()) {
          setManual(true);
          setOpen(true);
        }
      }, 3500);
      return () => {
        window.clearTimeout(timer);
        window.removeEventListener('beforeinstallprompt', onPrompt);
        window.removeEventListener('fitsystem:install-available', adopt);
        window.removeEventListener('appinstalled', onInstalled);
      };
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('fitsystem:install-available', adopt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function confirm() {
    if (manual || !deferred) {
      rememberDismissal();
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === 'dismissed') rememberDismissal();
    } catch {
      /* el usuario canceló o el navegador no respondió */
    } finally {
      setBusy(false);
      setDeferred(null);
      setOpen(false);
    }
  }

  if (!open) return null;

  const ios = /iphone|ipad|ipod/i.test(window.navigator.userAgent);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Subtitle>Agregar a la pantalla de inicio</Subtitle>
          <Muted style={styles.text}>
            {manual
              ? ios
                ? 'Tocá el botón Compartir de Safari y elegí "Agregar a pantalla de inicio" para usar FIT system™ como una app.'
                : 'Abrí el menú del navegador (⋮) y elegí "Instalar app" o "Agregar a pantalla de inicio" para usar FIT system™ como una app.'
              : '¿Querés agregar FIT system™ a la pantalla de inicio? Se abrirá a pantalla completa, como una app común, sin la barra del navegador.'}
          </Muted>
          <View style={styles.actions}>
            <Pressable style={[styles.button, styles.cancel]} onPress={() => { rememberDismissal(); setOpen(false); }} disabled={busy}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.confirm]} onPress={confirm} disabled={busy}>
              <Text style={styles.confirmText}>{manual ? 'Entendido' : 'Confirmar'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(3,7,18,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  text: { marginTop: spacing.sm, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  button: { flex: 1, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  cancel: { backgroundColor: 'transparent', borderColor: colors.border },
  cancelText: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
  confirm: { backgroundColor: colors.primary, borderColor: colors.primary },
  confirmText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
