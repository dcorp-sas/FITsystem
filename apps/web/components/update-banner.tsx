'use client';

import { useEffect, useState } from 'react';
import type { UpdateEvent } from '../lib/desktop';

export function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const bridge = window.fitsystem;
    if (!bridge) return;
    void bridge.getUpdateState?.().then((state) => {
      if (state) setUpdate(state);
    });
    return bridge.onUpdateEvent?.((payload) => {
      if (payload.state === 'available' || payload.state === 'downloaded') setDismissed(false);
      setUpdate(payload);
    });
  }, []);

  if (!update || dismissed) return null;

  const visible = update.state === 'available' || update.state === 'downloading' || update.state === 'downloaded' || update.state === 'error';
  if (!visible) return null;

  async function descargar() {
    if (!window.fitsystem?.downloadUpdate) return;
    setBusy(true);
    setUpdate({ state: 'downloading', percent: 0 });
    try {
      const r = await window.fitsystem.downloadUpdate();
      if (r && !r.ok) setUpdate({ state: 'error', message: r.error });
    } finally {
      setBusy(false);
    }
  }

  async function instalar() {
    setBusy(true);
    const r = await window.fitsystem?.installUpdate?.();
    if (r && !r.ok) {
      setBusy(false);
      setUpdate({ state: 'error', message: r.error });
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
      <span className="min-w-0">
        {update.state === 'available' && (
          <>Hay una versión nueva disponible{update.version ? ` (${update.version})` : ''}. Se descarga en segundo plano; también podés descargarla ahora.</>
        )}
        {update.state === 'downloading' && (
          <span className="flex flex-wrap items-center gap-3">
            Descargando actualización… {update.percent ?? 0}%
            <span className="h-2 w-40 overflow-hidden rounded-full bg-sky-950/50">
              <span className="block h-full rounded-full bg-sky-400" style={{ width: `${update.percent ?? 0}%` }} />
            </span>
          </span>
        )}
        {update.state === 'downloaded' && <>Actualización lista{update.version ? ` (${update.version})` : ''}. Reiniciá la aplicación para instalarla.</>}
        {update.state === 'error' && <>No se pudo actualizar: {update.message ?? 'error desconocido'}.</>}
      </span>
      <div className="flex items-center gap-3">
        {update.state === 'available' && (
          <button
            type="button"
            onClick={descargar}
            disabled={busy}
            className="rounded-lg bg-sky-400 px-3 py-1.5 font-semibold text-sky-950 hover:bg-sky-300 disabled:opacity-60"
          >
            Descargar ahora
          </button>
        )}
        {update.state === 'downloading' && <span className="text-sky-200/80">Un momento…</span>}
        {(update.state === 'downloaded' || update.state === 'error') && (
          <button
            type="button"
            onClick={update.state === 'downloaded' ? instalar : descargar}
            disabled={busy}
            className="rounded-lg bg-sky-400 px-3 py-1.5 font-semibold text-sky-950 hover:bg-sky-300 disabled:opacity-60"
          >
            {update.state === 'downloaded' ? 'Reiniciar e instalar' : 'Reintentar'}
          </button>
        )}
        <button type="button" onClick={() => setDismissed(true)} className="text-sky-300/80 hover:text-sky-200">
          Ocultar
        </button>
      </div>
    </div>
  );
}
