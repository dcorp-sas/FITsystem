'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';

export function WithdrawalForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [purchase, setPurchase] = useState('');
  const [reason, setReason] = useState('Arrepentimiento de compra');
  const [details, setDetails] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [status, setStatus] = useState<'idle'|'sending'|'sent'|'error'>('idle');
  const [confirmation, setConfirmation] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus('sending');
    setError('');
    try {
      const result = await api<{ confirmationEmailSent?: boolean }>('/contact', {
        method: 'POST',
        body: {
          name,
          email,
          phone,
          gymName: '',
          company: '',
          message: `SOLICITUD DE ARREPENTIMIENTO O BAJA\nTipo: ${reason}\nReferencia de compra/licencia: ${purchase || 'No informada'}\nDetalles: ${details || 'Sin detalles adicionales'}\n\nSolicito que revisen esta petición y me indiquen los próximos pasos.`,
        },
      });
      setConfirmation(Boolean(result?.confirmationEmailSent));
      setStatus('sent');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No pudimos enviar la solicitud. Probá de nuevo o escribí a contacto@fitsystem.com.ar.');
      setStatus('error');
    }
  }

  if (status === 'sent') {
    return <div role="status" className="mt-8 rounded-2xl border border-line bg-surface p-6">
      <h2 className="text-xl font-semibold">Solicitud recibida</h2>
      <p className="mt-3 text-sm leading-7 text-text-muted">Tu solicitud fue enviada al equipo de FIT system. Este mensaje confirma la recepción en el sitio, no la aprobación del arrepentimiento, baja o reembolso.</p>
      {confirmation
        ? <p className="mt-3 text-sm text-success">También enviamos un acuse al email indicado. Revisá tu bandeja de entrada y spam.</p>
        : <p className="mt-3 text-sm text-text-muted">No pudimos confirmar el envío del acuse por email. Conservá esta pantalla y, si necesitás constancia escrita, escribí a contacto@fitsystem.com.ar.</p>}
      <p className="mt-3 text-sm text-text-muted">El equipo revisará la referencia y te responderá por correo. Si se trata de un reembolso, se aplicarán los términos publicados y la normativa que corresponda.</p>
    </div>;
  }

  return <form onSubmit={submit} className="mt-8 space-y-4 rounded-2xl border border-line bg-surface p-6">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm text-text">Nombre y apellido
        <input required value={name} onChange={e=>setName(e.target.value)} autoComplete="name" className="mt-1 w-full rounded-lg border border-line bg-base px-3 py-2.5 text-text" />
      </label>
      <label className="block text-sm text-text">Email de la compra
        <input required type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" className="mt-1 w-full rounded-lg border border-line bg-base px-3 py-2.5 text-text" />
      </label>
      <label className="block text-sm text-text">Teléfono o WhatsApp (opcional)
        <input value={phone} onChange={e=>setPhone(e.target.value)} autoComplete="tel" className="mt-1 w-full rounded-lg border border-line bg-base px-3 py-2.5 text-text" />
      </label>
      <label className="block text-sm text-text">Referencia de compra o licencia (opcional)
        <input value={purchase} onChange={e=>setPurchase(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-base px-3 py-2.5 text-text" />
      </label>
    </div>
    <label className="block text-sm text-text">Tipo de solicitud
      <select value={reason} onChange={e=>setReason(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-base px-3 py-2.5 text-text">
        <option>Arrepentimiento de compra</option>
        <option>Solicitud de baja o no renovación</option>
        <option>Solicitud de reembolso</option>
        <option>Otra consulta sobre una compra</option>
      </select>
    </label>
    <label className="block text-sm text-text">Detalles (opcional)
      <textarea rows={4} value={details} onChange={e=>setDetails(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-base px-3 py-2.5 text-text" placeholder="Agregá cualquier dato que ayude a identificar la compra." />
    </label>
    <label className="flex items-start gap-2 text-xs leading-5 text-text-muted">
      <input type="checkbox" required checked={accepted} onChange={e=>setAccepted(e.target.checked)} className="mt-1" />
      <span>Confirmo que los datos son correctos y acepto que se utilicen para gestionar esta solicitud. Leí la política de <a href="/privacidad" className="text-primary-light underline">privacidad</a>.</span>
    </label>
    {status === 'error' && <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{error}</p>}
    <button type="submit" disabled={status==='sending'||!accepted} className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{status==='sending'?'Enviando…':'Enviar solicitud'}</button>
    <p className="text-xs leading-5 text-text-muted">El envío no implica aprobación automática. Para consultas urgentes, escribí a contacto@fitsystem.com.ar.</p>
  </form>;
}
