import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, spacing } from '../theme';
import { PrimaryButton, Title } from '../components/ui';
import { portal, setToken, type LoginResponse } from '../lib/api';

export function LoginScreen({ onLogged }: { onLogged: (session: LoginResponse) => void }) {
  const [mode, setMode] = useState<'login' | 'activate'>('login');
  const [orgSlug, setOrgSlug] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [activationCode, setActivationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      const session =
        mode === 'login'
          ? await portal.login(orgSlug.trim(), identifier.trim(), password)
          : await portal.activate(orgSlug.trim(), identifier.trim(), activationCode.trim(), password);
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
          <Text style={styles.logo}>FIT</Text>
          <Title>FIT System Socios</Title>
          <Text style={styles.tagline}>Tu gimnasio en el celular</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Gimnasio (codigo)</Text>
          <TextInput
            style={styles.input}
            value={orgSlug}
            onChangeText={setOrgSlug}
            autoCapitalize="none"
            placeholder="mi-gimnasio"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.label}>Email, DNI o legajo</Text>
          <TextInput
            style={styles.input}
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            placeholder="tu@email.com"
            placeholderTextColor={colors.textMuted}
          />

          {mode === 'activate' && (
            <>
              <Text style={styles.label}>Codigo de activacion</Text>
              <TextInput
                style={styles.input}
                value={activationCode}
                onChangeText={setActivationCode}
                autoCapitalize="characters"
                placeholder="XXXX"
                placeholderTextColor={colors.textMuted}
              />
            </>
          )}

          <Text style={styles.label}>{mode === 'login' ? 'Contrasena' : 'Elegi tu contrasena'}</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••"
            placeholderTextColor={colors.textMuted}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <PrimaryButton
              label={mode === 'login' ? 'Ingresar' : 'Activar cuenta'}
              onPress={submit}
              loading={loading}
              disabled={!orgSlug || !identifier || !password}
            />
            <PrimaryButton
              label={mode === 'login' ? 'Tengo un codigo de activacion' : 'Ya tengo cuenta'}
              variant="ghost"
              onPress={() => {
                setError(null);
                setMode(mode === 'login' ? 'activate' : 'login');
              }}
            />
          </View>
        </View>

        <Text style={styles.hint}>El codigo y las claves de acceso te los entrega tu gimnasio al darte de alta.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.lg },
  header: { alignItems: 'center', gap: spacing.xs },
  logo: { color: colors.primaryLight, fontSize: 34, fontWeight: '900', letterSpacing: 4 },
  tagline: { color: colors.textMuted, fontSize: 13 },
  form: { gap: spacing.sm },
  label: { color: colors.textMuted, fontSize: 13, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    height: 48,
    color: colors.text,
  },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
  actions: { gap: spacing.sm, marginTop: spacing.md },
  hint: { color: colors.textMuted, fontSize: 11, textAlign: 'center' },
});
