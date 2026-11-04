'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { API_URL, getToken } from '@/lib/api';

function send(eventType: 'screen' | 'error', message: string, stack?: string) {
  const token = getToken();
  if (!token) return;
  const redact = (value: string) => value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[correo]')
    .replace(/\b(?:\+?54)?[\d ()-]{8,}\b/g, '[teléfono]')
    .slice(0, 1000);
  void fetch(`${API_URL}/system/client-telemetry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ eventType, source: window.location.pathname.startsWith('/profes') ? 'profes' : 'web', screen: window.location.pathname, message: redact(message), stack: stack ? redact(stack).slice(0, 4000) : null }),
    keepalive: true,
  }).catch(() => undefined);
}

export function ClientTelemetry() {
  const pathname = usePathname();

  useEffect(() => {
    send('screen', 'Pantalla abierta');
  }, [pathname]);

  useEffect(() => {
    const onError = (event: ErrorEvent) => send('error', event.message || 'Error de interfaz', event.error?.stack || `${event.filename}:${event.lineno}:${event.colno}`);
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      send('error', reason instanceof Error ? reason.message : String(reason || 'Promesa rechazada'), reason instanceof Error ? reason.stack : undefined);
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
