'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Spinner } from '@/components/ui';

export default function Home() {
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready) router.replace(user ? '/dashboard' : '/login');
  }, [ready, user, router]);

  return (
    <div className="flex min-h-screen items-center justify-center gap-3 text-text-muted">
      <Spinner className="h-6 w-6" />
      Cargando...
    </div>
  );
}