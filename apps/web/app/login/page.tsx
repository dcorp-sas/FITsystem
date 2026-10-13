'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { ApiError } from '@/lib/api';
import { Button, Field, Input, Select, Spinner } from '@/components/ui';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, completeTwoFactorLogin } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [challenge, setChallenge] = useState<{ challenge: string; methods: string[]; email?: string } | null>(null);
  const [code, setCode] = useState('');
  const [method, setMethod] = useState<'totp' | 'email' | 'backup'>('totp');

  function goNext() {
    const next = searchParams.get('next');
    router.replace(next && next.startsWith('/') ? next : '/dashboard');
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await login(email.trim(), password);
      if (result && result.twoFactorRequired) {
        setChallenge({ challenge: result.challenge, methods: result.methods, email: result.email });
        setMethod(result.methods.includes('totp') ? 'totp' : (result.methods[0] as 'totp' | 'email' | 'backup'));
        toast.info('Ingresá el código de verificación');
        return;
      }
      goNext();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!challenge) return;
    setLoading(true);
    try {
      await completeTwoFactorLogin(challenge.challenge, code.trim(), method);
      goNext();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Código incorrecto');
    } finally {
      setLoading(false);
    }
  }

  async function sendEmailCode() {
    if (!challenge) return;
    try {
      const { http } = await import('@/lib/api');
      const data = await http.post<{ sent: boolean; error?: string }>('/auth/login/2fa/email', { challenge: challenge.challenge });
      if (data.sent) toast.success('Te enviamos un código por email');
      else toast.error(data.error || 'No se pudo enviar el código');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo enviar el código');
    }
  }

  if (challenge) {
    return (
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="FIT System" className="mx-auto mb-4 h-20 w-20 rounded-2xl object-cover shadow-lg shadow-primary/20" />
          <h1 className="text-2xl font-bold text-text">Verificación en dos pasos</h1>
          <p className="mt-1 text-sm text-text-muted">
            {challenge.email ? `Ingresá el código de 6 dígitos para ${challenge.email}` : 'Ingresá el código de 6 dígitos'}
          </p>
        </div>
        <form onSubmit={onVerify} className="space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-xl">
          {challenge.methods.length > 1 && (
            <Field label="Método">
              <Select value={method} onChange={(e) => setMethod(e.target.value as 'totp' | 'email' | 'backup')}>
                {challenge.methods.includes('totp') && <option value="totp">App autenticadora</option>}
                {challenge.methods.includes('email') && <option value="email">Código por email</option>}
                {challenge.methods.includes('backup') && <option value="backup">Código de recuperación</option>}
              </Select>
            </Field>
          )}
          <Field label="Código">
            <Input
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
          {method === 'email' && (
            <button type="button" onClick={sendEmailCode} className="text-xs font-medium text-primary hover:underline">
              Enviarme un código por email
            </button>
          )}
          <Button type="submit" className="w-full" size="lg" loading={loading}>
            Verificar
          </Button>
          <button
            type="button"
            onClick={() => {
              setChallenge(null);
              setCode('');
            }}
            className="w-full text-center text-xs text-text-muted hover:text-text"
          >
            Volver
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="FIT System" className="mx-auto mb-4 h-20 w-20 rounded-2xl object-cover shadow-lg shadow-primary/20" />
        <h1 className="text-2xl font-bold text-text">FIT System</h1>
        <p className="mt-1 text-sm text-text-muted">Iniciá sesión en tu gestión</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-xl">
        <Field label="Email">
          <Input
            type="email"
            required
            autoFocus
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Contraseña">
          <Input
            type="password"
            required
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Ingresar
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-text-muted">
        ¿Arrancás tu gimnasio?{' '}
        <Link href="/register" className="font-medium text-primary hover:underline">
          Registralo ahora
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-base px-4">
      <Suspense
        fallback={
          <span className="flex items-center gap-2 text-text-muted">
            <Spinner /> Cargando
          </span>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}