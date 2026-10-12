'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { ApiError } from '@/lib/api';
import { Button, Field, Input, Select } from '@/components/ui';

const CURRENCIES = ['ARS', 'USD', 'UYU', 'BOB', 'PYG', 'CLP', 'MXN', 'EUR'];

function RegisterForm() {
  const router = useRouter();
  const { registerOrg } = useAuth();
  const toast = useToast();
  const [organizationName, setOrganizationName] = useState('');
  const [slug, setSlug] = useState('');
  const [currency, setCurrency] = useState('ARS');
  const [userName, setUserName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await registerOrg({
        organizationName: organizationName.trim(),
        slug: slug.trim().toLowerCase(),
        currency,
        userName: userName.trim(),
        email: email.trim(),
        password,
      });
      toast.success('Tu gimnasio fue creado. Bienvenido!');
      router.replace('/dashboard');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo crear la cuenta');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="FIT System" className="mx-auto mb-4 h-20 w-20 rounded-2xl object-cover shadow-lg shadow-primary/20" />
        <h1 className="text-2xl font-bold text-text">Crear tu gimnasio</h1>
        <p className="mt-1 text-sm text-text-muted">Configurá tu cuenta y empezá a cargar socios</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-xl">
        <Field label="Nombre del gimnasio">
          <Input
            required
            autoFocus
            placeholder="Mi Gimnasio"
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
          />
        </Field>
        <Field label="Nombre corto (link de acceso)" hint="Mínusculas, números y guiones. Sin espacios.">
          <Input
            required
            placeholder="mi-gimnasio"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
          />
        </Field>
        <Field label="Moneda">
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tu nombre">
          <Input
            required
            placeholder="Juan Pérez"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            required
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Contraseña" hint="Al menos 6 caracteres">
          <Input
            type="password"
            required
            minLength={6}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Crear mi gimnasio
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-text-muted">
        ¿Ya tenés cuenta?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Iniciá sesión
        </Link>
      </p>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-base px-4">
      <RegisterForm />
    </div>
  );
}