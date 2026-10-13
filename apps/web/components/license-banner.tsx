'use client';

import { useEffect, useState } from 'react';
import { http, ApiError } from '../lib/api';

type LicenseInfo = {
  plan: string;
  status: string;
  daysLeft: number | null;
  isUsable: boolean;
};

type LicenseStatus = {
  activated: boolean;
  info: LicenseInfo;
};

export function LicenseBanner() {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const load = async () => {
    try {
      const data = await http.get<LicenseStatus>('/license/current');
      setStatus(data);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return;
      setStatus(null);
    }
  };

  useEffect(() => {
    void load();
    const onLicense = () => {
      setDismissed(false);
      void load();
    };
    window.addEventListener('focus', onLicense);
    window.addEventListener('fitsystem:license-expired', onLicense);
    return () => {
      window.removeEventListener('focus', onLicense);
      window.removeEventListener('fitsystem:license-expired', onLicense);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!status || status.info.isUsable || dismissed) return null;

  const expired = status.info.status === 'EXPIRED' || (status.info.daysLeft ?? 1) < 0;

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
      <span>
        {expired
          ? 'Tu licencia venció. Las operaciones de escritura están bloqueadas.'
          : `Tu licencia ${status.info.plan} está inactiva. Activá una clave para seguir operando.`}
        {status.info.daysLeft !== null && status.info.daysLeft >= 0 && status.info.daysLeft <= 5 && (
          <> Quedan {status.info.daysLeft} días de prueba.</>
        )}
      </span>
      <div className="flex items-center gap-3">
        <a
          href="/license"
          className="rounded-lg bg-amber-400 px-3 py-1.5 font-semibold text-amber-950 hover:bg-amber-300"
        >
          Activar licencia
        </a>
        <button type="button" onClick={() => setDismissed(true)} className="text-amber-300/80 hover:text-amber-200">
          Ocultar
        </button>
      </div>
    </div>
  );
}
