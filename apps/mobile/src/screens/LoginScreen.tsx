import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, spacing } from '../theme';
import { PrimaryButton, Title } from '../components/ui';
import { portal, setToken, type LoginResponse } from '../lib/api';

const DEMO_IDENTIFIER = 'juan@mail.com';
const DEMO_PASSWORD = 'socio123';

export function LoginScreen({ onLogged }: { onLogged: (session: LoginResponse) => void }) {
  const [mode, setMode] = useState<'login' | 'activate'>('login');
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
          ? await portal.login(identifier.trim(), password)
          : await portal.activate(identifier.trim(), activationCode.trim(), password);
      setToken(session.token);
      onLogged(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesion');
    } finally {
      setLoading(false);
    }
  }

  async function demo() {
    setError(null);
    setLoading(true);
    try {
      const session = await portal.login(DEMO_IDENTIFIER, DEMO_PASSWORD);
      setToken(session.token);
      onLogged(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar la cuenta de prueba');
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
          <Text style={styles.label}>DNI</Text>
          <TextInput
            style={styles.input}
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            placeholder="12345678"
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
              disabled={!identifier || !password}
            />
            <PrimaryButton
              label={mode === 'login' ? 'Tengo un codigo de activacion' : 'Ya tengo cuenta'}
              variant="ghost"
              onPress={() => {
                setError(null);
                setMode(mode === 'login' ? 'activate' : 'login');
              }}
            />
            <PrimaryButton
              label="Probar con cuenta de prueba"
              variant="ghost"
              onPress={demo}
              disabled={loading}
            />
          </View>
        </View>

        <Text style={styles.hint}>
          Ingresa con tu DNI y tu contrasena. La primera vez, usa el codigo de activacion que te dio tu gimnasio.
        </Text>
        <Text style={styles.hint}>Tu gimnasio te entrega el codigo y la clave al darte de alta.</Text>
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
