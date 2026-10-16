'use client';

import { useState } from 'react';
import { Icon } from '@/components/icon';
import { api, ApiError } from '@/lib/api';

const inputClass =
  'w-full rounded-lg border border-line bg-base px-3 py-2.5 text-sm text-text outline-none transition-colors focus:border-primary';

function validationMessage(details: unknown): string | null {
  if (!Array.isArray(details)) return null;
  const messages = details
    .map((d) => (d && typeof d === 'object' && 'message' in d ? String((d as { message?: unknown }).message) : ''))
    .filter((m) => m.trim().length > 0);
  return messages.length ? messages.join(' ') : null;
}


export function LandingContact({ contactEmail }: { contactEmail: string }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', gymName: '', message: '', company: '' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setError(null);
    try {
      await api('/contact', { method: 'POST', body: form });
      setStatus('sent');
      setForm({ name: '', email: '', phone: '', gymName: '', message: '', company: '' });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? validationMessage(err.details) || err.message
          : 'No se pudo enviar tu mensaje. Probá de nuevo.',
      );
      setStatus('error');
    }
  }

  return (
    <div className="grid gap-8 rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/20 via-surface to-base p-6 text-left sm:p-10 lg:grid-cols-2">
      <div className="flex flex-col justify-center">
        <h2 className="text-2xl font-bold tracking-tight text-text sm:text-3xl">Hablemos de tu gimnasio</h2>
        <p className="mt-4 text-base leading-relaxed text-text-muted">
          Contanos qué necesitás y te ayudamos a arrancar: demo del sistema, activación de la licencia o
          migración de tus datos. Te respondemos a la brevedad.
        </p>
        <ul className="mt-6 space-y-3 text-sm text-text-muted">
          <li className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary-light">
              <Icon name="mail" size={18} />
            </span>
            <a href={`mailto:${contactEmail}`} className="transition-colors hover:text-text">
              {contactEmail}
            </a>
          </li>
          <li className="flex items-center gap-2">
            <Icon name="check" size={16} className="text-success" />
            Respuesta en el día
          </li>
          <li className="flex items-center gap-2">
            <Icon name="check" size={16} className="text-success" />
            Demo guiada sin compromiso
          </li>
        </ul>
      </div>

      <form onSubmit={submit} className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        {status === 'sent' ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
              <Icon name="check" size={24} />
            </span>
            <p className="text-base font-semibold text-text">¡Mensaje enviado!</p>
            <p className="text-sm text-text-muted">Te respondemos a la brevedad a tu email.</p>
            <button
              type="button"
              onClick={() => setStatus('idle')}
              className="mt-2 text-sm font-medium text-primary-light transition-colors hover:text-primary"
            >
              Enviar otro mensaje
            </button>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nombre y apellido"
                className={inputClass}
              />
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="Email"
                className={inputClass}
              />
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="Teléfono (opcional)"
                className={inputClass}
              />
              <input
                value={form.gymName}
                onChange={(e) => setForm({ ...form, gymName: e.target.value })}
                placeholder="Gimnasio (opcional)"
                className={inputClass}
              />
            </div>
            <textarea
              required
              rows={4}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="Contanos sobre tu gimnasio y qué necesitás"
              className={`${inputClass} mt-3 resize-none`}
            />
            {/* Honeypot anti-spam (oculto para humanos) */}
            <div className="hidden" aria-hidden="true">
              <input tabIndex={-1} autoComplete="off" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </div>

            {status === 'error' && error && (
              <p className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
            )}

            <button
              type="submit"
              disabled={status === 'sending'}
              className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
            >
              <Icon name="mail" size={18} />
              {status === 'sending' ? 'Enviando…' : 'Enviar mensaje'}
            </button>
            <p className="mt-2 text-center text-xs text-text-muted">Usamos tus datos solo para responderte.</p>
          </>
        )}
      </form>
    </div>
  );
}
