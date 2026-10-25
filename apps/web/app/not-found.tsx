import Link from 'next/link';

export default function NotFound() {
  return <main id="contenido" className="flex min-h-screen items-center justify-center bg-base px-4 py-16 text-text">
    <div className="max-w-xl rounded-3xl border border-line bg-surface p-8 text-center sm:p-12">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary-light">Error 404</p>
      <h1 className="mt-4 text-3xl font-bold">No encontramos esa página</h1>
      <p className="mt-4 text-sm leading-7 text-text-muted">El enlace puede haber cambiado o la dirección puede estar mal escrita. Volvé al sitio de FIT system o consultá las funciones del sistema para gimnasios.</p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Link href="/" className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white">Ir al inicio</Link>
        <Link href="/#planes" className="rounded-xl border border-line px-5 py-3 text-sm font-semibold hover:bg-surface-alt">Ver planes</Link>
        <Link href="/#contacto" className="rounded-xl border border-line px-5 py-3 text-sm font-semibold hover:bg-surface-alt">Contactar</Link>
      </div>
    </div>
  </main>;
}
