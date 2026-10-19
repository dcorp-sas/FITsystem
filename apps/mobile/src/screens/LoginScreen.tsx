import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing } from '../theme';
import { PrimaryButton, Title } from '../components/ui';
import { portal, setToken, type LoginResponse } from '../lib/api';

export function LoginScreen({ onLogged }: { onLogged: (session: LoginResponse) => void }) {
  const [identifier, setIdentifier] = useState('');
  const [secret, setSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      // El servidor acepta tanto la clave como el codigo de alta del gimnasio.
      const session = await portal.login(identifier.trim(), secret);
      setToken(session.token);
      onLogged(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesion');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.logoMark}>
            <Text style={styles.logoMarkText}>FIT</Text>
          </View>
          <Title>FIT system™ Socios</Title>
          <Text style={styles.tagline}>Tu gimnasio en el celular</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>DNI</Text>
          <TextInput
            style={styles.input}
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            keyboardType="number-pad"
            placeholder="12345678"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.label}>Clave o código del gimnasio</Text>
          <TextInput
            style={styles.input}
            value={secret}
            onChangeText={setSecret}
            secureTextEntry
            autoCapitalize="none"
            placeholder="Tu clave o el código que te dieron"
            placeholderTextColor={colors.textMuted}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <PrimaryButton
              label="Ingresar"
              onPress={submit}
              loading={loading}
              disabled={!identifier || !secret}
            />
          </View>
        </View>

        <Text style={styles.hint}>
          ¿Primera vez? Entrá con tu DNI y el código que te dio tu gimnasio. Después podés crear tu clave desde tu perfil.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.lg },
  header: { alignItems: 'center', gap: spacing.sm },
  logoMark: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  logoMarkText: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  tagline: { color: colors.textMuted, fontSize: 13 },
  form: { gap: spacing.sm },
  label: { color: colors.textMuted, fontSize: 13, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 50,
    color: colors.text,
  },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
  actions: { gap: spacing.sm, marginTop: spacing.md },
  hint: { color: colors.textMuted, fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
