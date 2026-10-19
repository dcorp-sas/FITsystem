import type { Metadata } from 'next';
import { LandingNav } from '@/components/landing-nav';
import { LandingPlans } from '@/components/landing-plans';
import { LandingContact } from '@/components/landing-contact';
import { BuyButton } from '@/components/landing-checkout';
import { Icon, type IconName } from '@/components/icon';

export const metadata: Metadata = {
  metadataBase: new URL('https://fitsystem.com.ar'),
  title: 'FIT system™ — Software de gestión para gimnasios',
  description:
    'Gestioná socios, cuotas, caja, clases, asistencia y tienda desde una sola app. Sistema de escritorio para tu PC que funciona sin internet, con app móvil para tus socios.',
  keywords: [
    'software para gimnasios',
    'sistema de gestión de gimnasios',
    'control de socios y cuotas',
    'app para gimnasios',
    'caja y cobros',
    'control de acceso',
    'MercadoPago',
    'Argentina',
  ],
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    locale: 'es_AR',
    url: 'https://fitsystem.com.ar',
    siteName: 'FIT system™',
    title: 'FIT system™ — Software de gestión para gimnasios',
    description:
      'Socios, cuotas, caja, clases, asistencia y tienda en un solo sistema. Corre en tu PC y sigue funcionando aunque se corte internet, con app móvil para tus socios.',
    images: [{ url: '/logo.png', width: 1254, height: 1254, alt: 'FIT system™' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FIT system™ — Software de gestión para gimnasios',
    description:
      'Socios, cuotas, caja, clases, asistencia y tienda en un solo sistema, con app móvil para tus socios.',
    images: ['/logo.png'],
  },
};

const CONTACT_EMAIL = 'contacto@fitsystem.com.ar';
const SALES_EMAIL = 'ventas@fitsystem.com.ar';
const SUPPORT_EMAIL = 'soporte@fitsystem.com.ar';
const DOWNLOAD_BASE = 'https://github.com/dcorp-sas/FITsystem/releases/latest/download';
const TRIAL_DAYS = 15;
const SETUP_URL = `${DOWNLOAD_BASE}/FIT-System-Setup.exe`;
const PORTABLE_URL = `${DOWNLOAD_BASE}/FIT-System-Portable.exe`;
const PWA_URL = process.env.NEXT_PUBLIC_SOCIOS_URL || 'https://socios.fitsystem.com.ar';
const PWA_INSTALL_URL = `${PWA_URL}${PWA_URL.includes('?') ? '&' : '?'}install=1`;

const STATS = [
  { value: '+10', label: 'Módulos integrados' },
  { value: 'Local', label: 'Tus datos en tu equipo' },
  { value: '∞', label: 'Socios y cuotas' },
  { value: '24/7', label: 'App para tus socios' },
];

const MODULES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'members', title: 'Socios', text: 'Altas, fichas, datos de contacto, estado y foto. Búsqueda instantánea y hoja de cada socio.' },
  { icon: 'memberships', title: 'Cuotas y membresías', text: 'Planes, vencimientos, renovaciones, congelamientos y avisos automáticos de deuda.' },
  { icon: 'payments', title: 'Cobros y pagos', text: 'Registrá pagos en efectivo, transferencia o MercadoPago. Comprobantes y deudas al día.' },
  { icon: 'cash', title: 'Caja diaria', text: 'Apertura, cierre, ingresos y egresos con arqueo y control por turno y usuario.' },
  { icon: 'attendance', title: 'Asistencia y check-in', text: 'Ingresos por DNI o QR, control de acceso y estadísticas de concurrencia.' },
  { icon: 'classes', title: 'Clases y turnos', text: 'Grilla de clases, cupos, reservas, listas de espera e instructores asignados.' },
  { icon: 'shop', title: 'Tienda y productos', text: 'Venta de productos y suplementos con stock, precios y control de inventario.' },
  { icon: 'reports', title: 'Reportes', text: 'Ingresos, altas, bajas, deudores y rendimiento por sucursal, en tiempo real.' },
  { icon: 'branches', title: 'Sedes y cajas', text: 'Organizá la operación por sede o caja dentro del sistema, con reportes comparativos por sede.' },
  { icon: 'routines', title: 'Rutinas', text: 'Armá rutinas por día y ejercicio, y envialas directo a la app del socio.' },
  { icon: 'news', title: 'Novedades', text: 'Publicá novedades, promos y avisos que tus socios ven en la app del socio.' },
  { icon: 'mobile', title: 'App del socio', text: 'Cada socio ve su cuota, paga su membresía y consulta su rutina y las novedades desde el celular.' },
];

const STEPS = [
  { n: '1', title: 'Instalá el escritorio', text: 'Descargá FIT system™ en la PC del gimnasio. Instalación simple, sin servidores ni configuración.' },
  { n: '2', title: 'Activá tu licencia', text: 'Ingresá la clave de licencia que te damos. Elegís el plan según los socios con app.' },
  { n: '3', title: 'Cargá y operá', text: 'Cargá socios, planes y productos. Empezá a cobrar, controlar caja y registrar asistencias.' },
  { n: '4', title: 'Tus socios, conectados', text: 'Los socios descargan la app y consultan cuota, rutinas, novedades y pagan desde el celular.' },
];

const SEAT_PACK = { seats: 100, price: '$60.000', period: '12 meses', amount: 60000 };

const MP_KIT = { price: '$75.000', period: 'pago único', amount: 75000 };

const FAQS = [
  {
    q: '¿Necesito internet para usar el sistema?',
    a: 'Para la operación diaria no: el sistema corre en la PC del gimnasio y sigue funcionando aunque se corte internet (socios, cuotas, caja, clases, asistencia y tienda). La conexión se usa para la app móvil de los socios, los pagos online, las novedades, el envío de recordatorios y la sincronización del consolidado para reportes.',
  },
  {
    q: '¿Qué es la app del socio?',
    a: 'Es una aplicación móvil donde cada socio ve el estado de su cuota, realiza pagos, consulta su rutina y recibe las novedades. Se habilita según los asientos que incluye tu licencia.',
  },
  {
    q: '¿Cómo funciona la licencia?',
    a: 'La licencia se activa una sola vez con una clave (FIT-). Define la cantidad de socios con acceso a la app y la duración. Podés activarla o renovarla desde el propio sistema.',
  },
  {
    q: '¿Puedo separar la operación por sede o caja?',
    a: 'Sí. Podés organizar la operación por sede o caja dentro del sistema, con datos separados y reportes por sede.',
  },
  {
    q: '¿Qué medios de pago acepta?',
    a: 'Efectivo, transferencia y MercadoPago. Registrás los cobros en la caja y controlás las deudas de cada socio desde un solo panel.',
  },
  {
    q: '¿Hay permanencia mínima?',
    a: `No. La prueba es gratis por ${TRIAL_DAYS} días y las licencias se renuevan por el período que elijas. Sin contratos atados.`,
  },
  {
    q: '¿Cómo consigo el código de licencia?',
    a: `Elegís un plan en la página (pago con MercadoPago) y, al aprobarse el pago, el sistema emite tu clave (FIT-) automáticamente y te la enviamos por email. La activás una sola vez desde la app del gimnasio (Configuración > Licencia). Si necesitás ayuda, el ID de instalación aparece en la app.`,
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-base">
      <LandingNav />

      {/* Hero */}
      <section id="inicio" className="relative scroll-mt-20 overflow-hidden pt-32 pb-20">
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" />
        <div className="pointer-events-none absolute right-0 top-40 h-72 w-72 rounded-full bg-sky/10 blur-[100px]" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary-light">
              <span className="h-1.5 w-1.5 rounded-full bg-primary-light" />
              Software integral para gimnasios
            </span>
            <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight text-text sm:text-5xl lg:text-6xl">
              Gestioná tu gimnasio <span className="text-primary-light">de punta a punta</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-text-muted">
              Socios, cuotas, caja, clases, asistencia y tienda en un solo sistema. Corre en tu PC y
              sigue funcionando aunque se corte internet; conecta a tus socios con una app móvil propia.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="#contacto"
                className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-6 text-base font-medium text-white transition-colors hover:bg-primary-dark"
              >
                <Icon name="dashboard" size={18} />
                Pedir una demo
              </a>
              <a
                href="#planes"
                className="inline-flex h-12 items-center gap-2 rounded-lg border border-line px-6 text-base font-medium text-text transition-colors hover:bg-surface-alt"
              >
                <Icon name="plans" size={18} />
                Ver planes
              </a>
            </div>

            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-text-muted">
              {['Opera sin internet', 'Datos en tu equipo', 'App del socio incluida', 'Sin permanencia'].map((item) => (
                <span key={item} className="inline-flex items-center gap-2">
                  <Icon name="check" size={16} className="text-success" />
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-line bg-surface/40">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-10 sm:px-6 lg:grid-cols-4 lg:px-8">
          {STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-2xl font-bold text-text sm:text-3xl">{stat.value}</div>
              <div className="mt-1 text-xs text-text-muted sm:text-sm">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Producto */}
      <section id="producto" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary-light">Producto</span>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-text sm:text-4xl">
              Todo tu gimnasio, en una pantalla
            </h2>
            <p className="mt-4 text-base text-text-muted">
              El panel de gestión en la PC y la app de cada socio en el celular. Así se ve FIT system™
              por dentro.
            </p>
          </div>

          {/* Panel de escritorio */}
          <div className="mt-12 overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl shadow-black/40">
            <div className="flex items-center gap-2 border-b border-line bg-surface-alt/50 px-4 py-3">
              <span className="h-3 w-3 rounded-full bg-danger/70" />
              <span className="h-3 w-3 rounded-full bg-warning/70" />
              <span className="h-3 w-3 rounded-full bg-success/70" />
              <span className="ml-3 text-xs text-text-muted">FIT system™ · Panel general</span>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/screens/sistema-dashboard.svg" alt="Panel general de FIT system™ con métricas del gimnasio" className="w-full" />
          </div>

          {/* Módulos destacados */}
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {[
              {
                src: '/screens/sistema-socios.svg',
                alt: 'Gestión de socios y cuotas en FIT system™',
                title: 'Socios y cuotas',
                text: 'Ficha de cada socio, estado de cuenta y cobro en un clic.',
              },
              {
                src: '/screens/sistema-caja.svg',
                alt: 'Cobros y caja diaria en FIT system™',
                title: 'Cobros y caja',
                text: 'Efectivo, transferencia o MercadoPago, con arqueo por turno.',
              },
            ].map((shot) => (
              <figure key={shot.src} className="overflow-hidden rounded-2xl border border-line bg-surface">
                <div className="flex items-center gap-2 border-b border-line bg-surface-alt/50 px-3 py-2.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-line" />
                  <span className="h-2.5 w-2.5 rounded-full bg-line" />
                  <span className="ml-2 text-xs text-text-muted">{shot.title}</span>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shot.src} alt={shot.alt} className="w-full" />
                <figcaption className="px-4 py-3 text-sm text-text-muted">{shot.text}</figcaption>
              </figure>
            ))}
          </div>

          {/* App del socio */}
          <div className="mt-6 flex flex-col items-center gap-8 rounded-2xl border border-line bg-gradient-to-br from-primary/10 via-surface to-base p-8 sm:flex-row sm:p-10">
            <div className="mx-auto w-[220px] shrink-0 sm:mx-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/screens/app-socios.svg" alt="App del socio de FIT system™ en el celular" className="w-full" />
            </div>
            <div className="max-w-lg text-center sm:text-left">
              <h3 className="text-xl font-bold text-text">App del socio, incluida en tu licencia</h3>
              <p className="mt-3 text-sm leading-relaxed text-text-muted">
                Cada socio instala la app desde el navegador (sin descargas) y ve el estado de su cuota,
                su rutina del día y las novedades del gimnasio. Registra su ingreso escaneando el QR de
                la entrada y puede iniciar el pago de su cuota desde el celular con MercadoPago.
              </p>
              <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                {['Cuota y pagos', 'Ingreso con QR', 'Rutina personalizada', 'Novedades del gym'].map((item) => (
                  <li key={item} className="flex items-center justify-center gap-2 text-sm text-text-muted sm:justify-start">
                    <Icon name="check" size={16} className="text-success" />
                    {item}
                  </li>
                ))}
              </ul>
              <a
                href={PWA_URL}
                className="mt-6 inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
              >
                <Icon name="mobile" size={18} />
                Probar la app del socio
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Módulos */}
      <section id="modulos" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary-light">Módulos</span>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-text sm:text-4xl">
              Todo lo que tu gimnasio necesita
            </h2>
            <p className="mt-4 text-base text-text-muted">
              Un sistema completo, pensado para el día a día del gimnasio. Sin módulos que sobren ni
              funciones que falten.
            </p>
          </div>

          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((mod) => (
              <div
                key={mod.title}
                className="group rounded-xl border border-line bg-surface p-5 transition-colors hover:border-primary/40"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary-light transition-colors group-hover:bg-primary/20">
                  <Icon name={mod.icon} size={20} />
                </span>
                <h3 className="mt-4 text-base font-semibold text-text">{mod.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-text-muted">{mod.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="border-y border-line bg-surface/40 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary-light">Cómo funciona</span>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-text sm:text-4xl">
              Empezar es muy simple
            </h2>
            <p className="mt-4 text-base text-text-muted">En cuatro pasos tenés tu gimnasio funcionando.</p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <div key={step.n} className="relative rounded-xl border border-line bg-base p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">
                  {step.n}
                </span>
                <h3 className="mt-4 text-base font-semibold text-text">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-text-muted">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Planes */}
      <section id="planes" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary-light">Planes</span>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-text sm:text-4xl">
              Planes que crecen con vos
            </h2>
            <p className="mt-4 text-base text-text-muted">
              Elegí la cantidad de socios con acceso a la app. El sistema completo está incluido en
              todos los planes.
            </p>
          </div>

          <LandingPlans setupUrl={SETUP_URL} trialDays={TRIAL_DAYS} />

          <p className="mt-8 text-center text-xs text-text-muted">
            Precios en pesos argentinos (ARS). El plan anual equivale a 10 meses (2 meses sin cargo).
            Todos los planes incluyen el sistema completo y la app del socio.
          </p>

          <div className="mx-auto mt-6 flex max-w-2xl flex-col items-center justify-between gap-3 rounded-xl border border-line bg-surface/60 px-5 py-4 text-center sm:flex-row sm:text-left">
            <div>
              <p className="text-sm font-semibold text-text">
                ¿Necesitás más socios con app? Sumá asientos
              </p>
              <p className="mt-0.5 text-sm text-text-muted">
                Pack de +{SEAT_PACK.seats} socios con app por {SEAT_PACK.price} / {SEAT_PACK.period}.
                Se combinan con cualquier plan.
              </p>
            </div>
            <BuyButton
              target={{
                plan: 'SEAT_PACK',
                title: 'Comprar Pack de asientos',
                subtitle: `+${SEAT_PACK.seats} socios con app · ${SEAT_PACK.price} / ${SEAT_PACK.period}`,
                amount: SEAT_PACK.amount,
                note: 'Pago seguro con MercadoPago. Al aprobarse, sumamos los asientos a tu licencia y te contactamos por email.',
              }}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
            >
              Comprar asientos
            </BuyButton>
          </div>
        </div>
      </section>

      {/* Kit MercadoPago */}
      <section id="cobros" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-8 overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-primary/10 via-surface to-base p-6 sm:p-10 lg:grid-cols-2">
            <figure className="overflow-hidden rounded-2xl border border-line bg-base shadow-xl shadow-black/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/screens/mp-kit.svg"
                alt="Kit MercadoPago: terminal Point y QR para cobrar en el mostrador"
                className="w-full"
              />
            </figure>
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary-light">
                <span className="h-1.5 w-1.5 rounded-full bg-primary-light" />
                Cobros presenciales · Equipo adicional
              </span>
              <h2 className="mt-4 text-2xl font-bold tracking-tight text-text sm:text-3xl">
                Sumá el kit de terminal POS y QR de MercadoPago
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-text-muted">
                Cobrá en el mostrador con la terminal Point (tarjetas) y el QR de MercadoPago
                (transferencias y billetera). Los pagos se acreditan solos en la caja del gimnasio,
                sin cargar nada a mano.
              </p>
              <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                {[
                  'Terminal Point para tarjetas',
                  'QR de MercadoPago',
                  'Acreditación automática en caja',
                  'Comprobante en un clic',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-text-muted">
                    <Icon name="check" size={16} className="text-success" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex flex-col items-start justify-between gap-4 rounded-xl border border-line bg-base/60 px-5 py-4 sm:flex-row sm:items-center">
                <div>
                  <div className="text-2xl font-bold text-text">{MP_KIT.price}</div>
                  <div className="text-xs text-text-muted">Se solicita adicionalmente · {MP_KIT.period}</div>
                </div>
                <BuyButton
                  target={{
                    plan: 'MP_KIT',
                    title: 'Comprar Kit MercadoPago',
                    subtitle: `Terminal Point + QR · ${MP_KIT.price} (${MP_KIT.period})`,
                    amount: MP_KIT.amount,
                    note: 'Pago seguro con MercadoPago. Coordinamos el envío y la vinculación del equipo a tu cuenta.',
                  }}
                  className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
                >
                  Comprar el kit
                </BuyButton>
              </div>
              <p className="mt-3 text-xs text-text-muted">
                Se combina con cualquier plan. El equipo se envía y se vincula a tu cuenta de MercadoPago.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Descargas */}
      <section id="descargas" className="scroll-mt-20 border-y border-line bg-surface/40 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary-light">Descargas</span>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-text sm:text-4xl">
              Llevalo a todos lados
            </h2>
            <p className="mt-4 text-base text-text-muted">
              La gestión en tu PC y a tus socios en el bolsillo.
            </p>
          </div>

          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {[
              {
                icon: 'dashboard' as IconName,
                title: 'Escritorio (Windows)',
                text: 'La app completa del gimnasio, con todos los módulos. Sigue operando aunque se corte internet.',
                cta: 'Descargar para Windows',
                href: SETUP_URL,
                note: `Incluye ${TRIAL_DAYS} días de prueba gratis`,
              },
              {
                icon: 'mobile' as IconName,
                title: 'App del socio',
                text: 'Se instala desde el navegador (PWA). Cada socio ve su cuota, rutinas, novedades y paga desde el celular.',
                cta: 'Instalar app del socio',
                href: PWA_INSTALL_URL,
                note: 'Sin descargas: abrila y "Agregar a pantalla de inicio"',
              },
              {
                icon: 'reports' as IconName,
                title: 'Acceso desde la PC del gimnasio',
                text: 'Accedé a tu gestión desde la computadora del gimnasio con la aplicación de escritorio; entra directo, sin usuario ni contraseña.',
                cta: 'Pedir demo',
                href: '#contacto',
                note: 'Para administradores y recepción',
              },
            ].map((item) => (
              <div key={item.title} className="flex flex-col rounded-2xl border border-line bg-base p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary-light">
                  <Icon name={item.icon} size={22} />
                </span>
                <h3 className="mt-4 text-base font-semibold text-text">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-text-muted">{item.text}</p>
                <p className="mt-2 text-xs text-text-muted">{item.note}</p>
                <a
                  href={item.href}
                  className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line px-4 text-sm font-medium text-text transition-colors hover:bg-surface-alt"
                >
                  <Icon name="import" size={16} />
                  {item.cta}
                </a>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 rounded-2xl border border-line bg-base p-6 text-center sm:flex-row sm:justify-between sm:text-left">
            <div>
              <p className="text-sm font-semibold text-text">
                Instalá gratis y probá {TRIAL_DAYS} días completos
              </p>
              <p className="mt-1 text-sm text-text-muted">
                Al terminar la prueba, elegí un plan: al aprobarse el pago emitimos tu clave y te la enviamos por email.
              </p>
            </div>
            <a
              href="#planes"
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
            >
              <Icon name="notifications" size={16} />
              Ver planes y activar licencia
            </a>
          </div>

          <p className="mt-6 text-center text-xs text-text-muted">
            ¿Preferís la versión portable?{' '}
            <a href={PORTABLE_URL} className="text-primary-light transition-colors hover:underline">
              Descargar FIT system™ Portable
            </a>
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary-light">Preguntas</span>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-text sm:text-4xl">Preguntas frecuentes</h2>
            <p className="mt-4 text-base text-text-muted">Las dudas más comunes antes de empezar.</p>
          </div>

          <div className="space-y-3">
            {FAQS.map((faq) => (
              <details
                key={faq.q}
                className="group rounded-xl border border-line bg-surface p-5 [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-4">
                  <span className="text-sm font-semibold text-text">{faq.q}</span>
                  <Icon
                    name="chevron"
                    size={18}
                    className="shrink-0 text-text-muted transition-transform group-open:rotate-180"
                  />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-text-muted">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Contacto */}
      <section id="contacto" className="scroll-mt-20 pb-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <LandingContact
            contacts={[
              { label: 'Contacto general', email: CONTACT_EMAIL },
              { label: 'Ventas', email: SALES_EMAIL },
              { label: 'Soporte', email: SUPPORT_EMAIL },
            ]}
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line bg-surface/40">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-5">
            <div className="md:col-span-3">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="FIT system™" className="h-9 w-9 rounded-xl object-cover" />
                <span className="text-base font-bold text-text">FIT system™</span>
              </div>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-text-muted">
                Software integral de gestión para gimnasios. Socios, cuotas, caja, clases, asistencia
                y app móvil para tus socios.
              </p>
              <p className="mt-4 text-xs text-text-muted">Datos en tu equipo · Opera sin internet · Sin permanencia</p>
            </div>
            <div className="md:col-span-2">
              <h4 className="text-sm font-semibold text-text">Contacto</h4>
              <ul className="mt-4 space-y-2.5 text-sm text-text-muted">
                <li><a href={`mailto:${CONTACT_EMAIL}`} className="transition-colors hover:text-text">{CONTACT_EMAIL}</a></li>
                <li><a href={`mailto:${SALES_EMAIL}`} className="transition-colors hover:text-text">{SALES_EMAIL}</a></li>
                <li><a href={`mailto:${SUPPORT_EMAIL}`} className="transition-colors hover:text-text">{SUPPORT_EMAIL}</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-line pt-6 text-xs text-text-muted sm:flex-row">
            <span>© {new Date().getFullYear()} FIT system™. Todos los derechos reservados.</span>
            <span>Hecho para gimnasios que quieren crecer.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
