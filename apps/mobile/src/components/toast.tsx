import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';
import { subscribeToast, type ToastMessage, type ToastType } from '../lib/toast';

const ACCENTS: Record<ToastType, string> = {
  info: colors.primaryLight,
  success: colors.success,
  error: colors.danger,
};

const DURATION = 4200;

// Muestra el último aviso y lo oculta solo. Se monta una única vez en App.
export function ToastHost() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    subscribeToast((next) => {
      setToast(next);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setToast((current) => (current?.id === next.id ? null : current));
      }, DURATION);
    });
    return () => {
      subscribeToast(null);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!toast) return null;

  const accent = ACCENTS[toast.type];
  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <Pressable
        onPress={() => setToast(null)}
        style={[styles.card, { borderColor: accent }]}
        accessibilityRole="alert"
      >
        <View style={[styles.bar, { backgroundColor: accent }]} />
        <View style={styles.body}>
          <Text style={[styles.title, { color: accent }]}>{toast.title}</Text>
          {!!toast.message && <Text style={styles.message}>{toast.message}</Text>}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 72,
    paddingHorizontal: spacing.lg,
    zIndex: 50,
  },
  card: {
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: colors.surfaceAlt,
  },
  bar: { width: 5 },
  body: { flex: 1, padding: spacing.md },
  title: { fontSize: 15, fontWeight: '800' },
  message: { marginTop: 3, fontSize: 13, color: colors.text },
});
