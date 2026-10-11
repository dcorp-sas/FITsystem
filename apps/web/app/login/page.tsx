'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { ApiError } from '@/lib/api';
import { Button, Field, Input, Spinner } from '@/components/ui';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email.trim(), password);
      const next = searchParams.get('next');
      router.replace(next && next.startsWith('/') ? next : '/dashboard');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
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
            placeholder="admin@fitsystem.app"
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

      <p className="mt-6 text-center text-xs text-text-muted">
        Demo: <span className="font-mono text-text">admin@fitsystem.app</span> / <span className="font-mono text-text">admin123</span>
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