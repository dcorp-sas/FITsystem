import type { Metadata } from 'next';
import Link from 'next/link';
import { WithdrawalForm } from './solicitud-form';

export const metadata: Metadata = {
  title: 'Arrepentimiento, baja y reembolsos · FIT system',
  description: 'Formulario para iniciar solicitudes de arrepentimiento, cancelación o reembolso de una compra de FIT system.',
  alternates: { canonical: '/arrepentimiento' },
};

export default function WithdrawalPage() {
  return <main id="contenido" className="min-h-screen bg-base px-4 py-12 text-text sm:px-6 lg:px-8">
    <article className="mx-auto max-w-3xl rounded-2xl border border-line bg-surface p-6 sm:p-10">
      <Link href="/" className="text-sm text-primary-light hover:underline">Volver a FIT system</Link>
      <p className="mt-8 text-xs font-semibold uppercase tracking-widest text-primary-light">Atención al cliente</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Arrepentimiento, baja y reembolsos</h1>
      <p className="mt-4 text-sm leading-7 text-text-muted">Usá este formulario para solicitar el arrepentimiento de una compra, pedir la baja o no renovación, o consultar por un reembolso. Te enviaremos un acuse por email cuando el servicio de correo esté disponible. La recepción no significa que la solicitud haya sido aprobada.</p>
      <div className="mt-5 rounded-xl border border-line bg-base p-4 text-sm leading-6 text-text-muted">
        <strong className="text-text">Política comercial:</strong> para las licencias compradas directamente a FIT system, los términos publicados contemplan solicitar voluntariamente la devolución dentro de los primeros 15 días corridos desde la activación. Los derechos que correspondan por ley no quedan limitados por esa política. Revisá los <Link href="/terminos" className="text-primary-light underline">términos y condiciones</Link>.
      </div>
      <WithdrawalForm />
    </article>
  </main>;
}
