'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { Sidebar } from '@/components/sidebar';
import { LicenseBanner } from '@/components/license-banner';
import { UpdateBanner } from '@/components/update-banner';
import { Spinner } from '@/components/ui';

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (ready && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [ready, user, router, pathname]);

  if (!ready || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 text-text-muted">
        <Spinner className="h-6 w-6" />
        Cargando...
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