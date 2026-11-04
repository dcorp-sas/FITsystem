'use client';

import type { ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/lib/toast';
import { ClientTelemetry } from '@/components/client-telemetry';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider><ClientTelemetry />{children}</ToastProvider>
    </AuthProvider>
  );
}
