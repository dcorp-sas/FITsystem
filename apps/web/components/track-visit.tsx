'use client';

import { useEffect } from 'react';
import { API_URL } from '@/lib/api';
import { getAnalyticsVisitorId } from '@/lib/analytics-identity';

/*
 * Registra una visita a la landing (una por carga de pagina). Es anonimo: no
 * manda nada del usuario, solo la ruta y el referer. Se manda con keepalive
 * para que cuente aunque el visitante navegue o cierre enseguida.
 */
export function TrackVisit() {
  useEffect(() => {
    fetch(`${API_URL}/metrics/visit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: window.location.pathname,
        referer: document.referrer || '',
        visitorId: getAnalyticsVisitorId(),
      }),
      keepalive: true,
    }).catch(() => {
      /* si falla el conteo, la landing sigue igual */
    });
  }, []);
  return null;
}
