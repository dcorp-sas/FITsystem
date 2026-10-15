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

  if (!status || dismissed) return null;

  const { info } = status;
  const expired = !info.isUsable || info.status === 'EXPIRED' || (info.daysLeft ?? 1) < 0;
  const trial = info.plan === 'TRIAL';
  // Recordatorio proactivo de renovación (la prueba avisa más cerca del final).
  const renewWindow = trial ? 3 : 15;
  const nearExpiry = !expired && info.daysLeft !== null && info.daysLeft <= renewWindow;
  if (!expired && !nearExpiry) return null;

  const title = expired
    ? 'Tu licencia venció'
    : `Tu licencia ${trial ? 'de prueba' : info.plan} vence en ${info.daysLeft} día(s)`;

  const detail = expired
    ? 'Renovala para desbloquear las operaciones del sistema.'
    : 'Renová ahora para no interrumpir el servicio del gimnasio.';

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
      <span>
        <span className="font-semibold">{title}.</span> {detail}
      </span>
      <div className="flex items-center gap-3">
        <a
          href="/license"
          className="rounded-lg bg-amber-400 px-3 py-1.5 font-semibold text-amber-950 hover:bg-amber-300"
        >
          {expired ? 'Activar licencia' : 'Renovar licencia'}
        </a>
        <button type="button" onClick={() => setDismissed(true)} className="text-amber-300/80 hover:text-amber-200">
          Ocultar
        </button>
      </div>
    </div>
  );
}
