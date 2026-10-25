import Link from 'next/link';

export interface SeoSection {
  title: string;
  paragraphs: string[];
}

export function SeoArticle({ title, intro, sections }: { title: string; intro: string; sections: SeoSection[] }) {
  return (
    <main id="contenido" className="min-h-screen bg-base px-4 py-12 text-text sm:px-6 lg:px-8">
      <article className="mx-auto max-w-4xl">
        <Link href="/" className="text-sm text-primary-light hover:underline">← FIT system</Link>
        <header className="mt-8 rounded-3xl border border-line bg-gradient-to-br from-primary/15 via-surface to-base p-7 sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-light">FIT system · Gestión de gimnasios</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">{title}</h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-text-muted">{intro}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/#planes" className="inline-flex items-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary-dark">Ver planes</Link>
            <Link href="/#contacto" className="inline-flex items-center rounded-xl border border-line px-5 py-3 text-sm font-semibold text-text hover:bg-surface-alt">Consultar por mi gimnasio</Link>
          </div>
        </header>
        <div className="mt-8 grid gap-5">
          {sections.map((section) => (
            <section key={section.title} className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
              <h2 className="text-xl font-semibold text-text">{section.title}</h2>
              {section.paragraphs.map((paragraph, index) => <p key={index} className="mt-4 text-sm leading-7 text-text-muted">{paragraph}</p>)}
            </section>
          ))}
        </div>
        <section className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <h2 className="text-xl font-semibold">Conocé más sobre FIT system</h2>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-3 text-sm">
            <Link className="text-primary-light hover:underline" href="/software-para-gimnasios">Software para gimnasios</Link>
            <Link className="text-primary-light hover:underline" href="/control-de-socios-y-cuotas">Socios y cuotas</Link>
            <Link className="text-primary-light hover:underline" href="/control-de-acceso-qr">Control de acceso QR</Link>
            <Link className="text-primary-light hover:underline" href="/cobros-mercadopago-gimnasios">Cobros con MercadoPago</Link>
            <Link className="text-primary-light hover:underline" href="/app-para-socios">App para socios</Link>
            <Link className="text-primary-light hover:underline" href="/gimnasio-sin-internet">Gimnasio sin internet</Link>
          </div>
          <p className="mt-5 text-xs leading-6 text-text-muted">Las funciones disponibles dependen de la versión, configuración y plan contratado. Consultá antes de adquirir hardware o migrar datos. <Link className="text-primary-light hover:underline" href="/privacidad">Privacidad</Link> · <Link className="text-primary-light hover:underline" href="/terminos">Términos y condiciones</Link>.</p>
        </section>
      </article>
    </main>
  );
}
