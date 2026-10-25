'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Sidebar } from '@/components/sidebar';
import { LicenseBanner } from '@/components/license-banner';
import { UpdateBanner } from '@/components/update-banner';
import { LoginScreen } from '@/components/login-screen';
import { Spinner } from '@/components/ui';

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, ready, sessionError, retrySession } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // El profesor trabaja exclusivamente en el portal separado. Nunca mostrar
    // la carcasa administrativa, incluso si abre una URL interna directamente.
    if (ready && user?.role === 'INSTRUCTOR' && pathname !== '/classes' && pathname !== '/routines') router.replace('/profes');
  }, [ready, user, router, pathname]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 text-text-muted">
        <Spinner className="h-6 w-6" />
        Cargando...
      </div>
    );
  }

  // Sin sesión se pide usuario y contraseña (credencial inicial visible:
  // admin/admin123). Si la sesión automática falló por un error real, se
  // muestra el motivo con la opción de reintentar.
  if (!user) {
    if (sessionError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center text-text-muted">
          <p className="text-sm">{sessionError}</p>
          <button
            className="rounded-lg border border-line px-4 py-2 text-sm text-text hover:border-primary"
            onClick={retrySession}
          >
            Reintentar
          </button>
        </div>
      );
    }
    return <LoginScreen />;
  }

  if (user.role === 'INSTRUCTOR' && pathname !== '/classes' && pathname !== '/routines') {
    return <div className="flex min-h-screen items-center justify-center text-text-muted">Abriendo el portal de profesores…</div>;
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