'use client';

import { useState, type FormEvent } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth, type TwoFactorPrompt } from '@/lib/auth';
import { Button, Field, Input } from '@/components/ui';

// Pantalla de ingreso del panel. En el equipo del gimnasio (escritorio) entra
// directo como administrador local; esta pantalla se muestra cuando el panel se
// abre desde otra PC de la red (terminal) o cuando la sesión expiró, y exige
// email y contraseña.
export function LoginScreen() {
  const { login, completeTwoFactorLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [method, setMethod] = useState<'totp' | 'email' | 'backup'>('totp');
  const [prompt, setPrompt] = useState<TwoFactorPrompt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (prompt) {
        await completeTwoFactorLogin(prompt.challenge, code.trim(), method);
      } else {
        const result = await login(email.trim(), password);
        if (result && result.twoFactorRequired) {
          setPrompt(result);
          setCode('');
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-base px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-xl shadow-black/20">
        <div className="mb-6 text-center">
          <div className="text-2xl font-black tracking-[3px] text-primary-light">FIT</div>
          <h1 className="mt-2 text-lg font-semibold text-text">Panel del gimnasio</h1>
          <p className="mt-1 text-sm text-text-muted">
            {prompt ? 'Ingresá el código de verificación' : 'Ingresá con tu usuario'}
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {!prompt ? (
            <>
              <Field label="Email">
                <Input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  required
                />
              </Field>
              <Field label="Contraseña">
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Método">
                <select
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-text outline-none focus:border-primary"
                  value={method}
                  onChange={(e) => setMethod(e.target.value as 'totp' | 'email' | 'backup')}
                >
                  <option value="totp">App autenticadora</option>
                  {prompt.methods.includes('email') && <option value="email">Código por email</option>}
                  <option value="backup">Código de recuperación</option>
                </select>
              </Field>
              <Field label="Código">
                <Input
                  inputMode="numeric"
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="000000"
                  required
                />
              </Field>
            </>
          )}

          {error && (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
          )}

          <Button type="submit" className="w-full" size="lg" loading={busy}>
            {prompt ? 'Verificar' : 'Ingresar'}
          </Button>

          {prompt && (
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setPrompt(null);
                setCode('');
                setError(null);
              }}
            >
              Volver
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}

export default LoginScreen;
