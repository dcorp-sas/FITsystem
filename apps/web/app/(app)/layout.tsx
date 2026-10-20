'use client';

import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { Sidebar } from '@/components/sidebar';
import { LicenseBanner } from '@/components/license-banner';
import { UpdateBanner } from '@/components/update-banner';
import { Spinner } from '@/components/ui';

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 text-text-muted">
        <Spinner className="h-6 w-6" />
        Cargando...
      </div>
    );
  }

  // El panel del gimnasio es de un solo gimnasio (single-tenant) y entra directo
  // como administrador local: no hay pantalla de correo/contraseña. Si no hay
  // sesión, la API local todavía no terminó de arrancar: se reintenta sola.
  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center text-text-muted">
        <Spinner className="h-6 w-6" />
        <p className="text-sm">Preparando el panel...</p>
        <button
          className="rounded-lg border border-line px-4 py-2 text-sm text-text hover:border-primary"
          onClick={() => window.location.reload()}
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar />
      <main className="flex-1 min-w-0 px-4 py-6 pt-16 sm:px-8 sm:pt-6 lg:px-10 lg:pt-6">
        <div className="mx-auto max-w-6xl">
          <UpdateBanner />
          <LicenseBanner />
          {children}
        </div>
      </main>
    </div>
  );
}