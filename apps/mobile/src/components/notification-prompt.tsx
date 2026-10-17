import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';
import { Muted, Subtitle } from './ui';
import { portal } from '../lib/api';
import { registerWebPushAsync } from '../lib/push';

const DISMISS_KEY = 'fitsystem.socios.notif-dismissed';

/**
 * Pregunta al socio si quiere activar las notificaciones en la PWA. Solo se
 * muestra en la web, cuando el navegador lo soporta, no hay permiso decidido
 * todavia y el usuario no lo descarto antes. Al aceptar se suscribe al Web Push.
 */
export function NotificationPrompt() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (!('PushManager' in window) || typeof Notification === 'undefined') return;
    if (Notification.permission !== 'default') return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return;
    } catch {
      /* ignore */
    }
    const timer = setTimeout(() => setOpen(true), 2500);
    return () => clearTimeout(timer);
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  async function enable() {
    setBusy(true);
    try {
      const ok = await registerWebPushAsync(portal.pushKey, portal.subscribeWebPush);
      if (!ok) {
        try {
          localStorage.setItem(DISMISS_KEY, '1');
        } catch {
          /* ignore */
        }
      }
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  if (!open) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Subtitle>Activar notificaciones</Subtitle>
          <Muted style={styles.text}>
            ¿Querés que te avisemos cuando tu gimnasio cargue novedades o te asigne una rutina nueva? Podés desactivarlas
            cuando quieras desde el navegador.
          </Muted>
          <View style={styles.actions}>
            <Pressable style={[styles.button, styles.cancel]} onPress={dismiss} disabled={busy}>
              <Text style={styles.cancelText}>Ahora no</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.confirm]} onPress={enable} disabled={busy}>
              <Text style={styles.confirmText}>Activar</Text>
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
