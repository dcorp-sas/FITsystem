import type { Metadata } from 'next';
import Link from 'next/link';
import { LandingNav } from '@/components/landing-nav';
import { Icon, type IconName } from '@/components/icon';

export const metadata: Metadata = {
  title: 'FIT System — Software de gestión para gimnasios',
  description:
    'Gestioná socios, cuotas, caja, clases, asistencia y tienda desde una sola app. Sistema de escritorio que funciona sin internet, con app móvil para tus socios. Multi-sucursal.',
};

const CONTACT_EMAIL = 'contacto@fitsystem.app';
const DOWNLOAD_BASE = 'https://github.com/dcorp-sas/FITsystem/releases/latest/download';
const TRIAL_DAYS = 7;
const SETUP_URL = `${DOWNLOAD_BASE}/FIT-System-Setup.exe`;
const PORTABLE_URL = `${DOWNLOAD_BASE}/FIT-System-Portable.exe`;
const PWA_URL = 'https://fitsystem-socios.onrender.com';

const STATS = [
  { value: '+10', label: 'Módulos integrados' },
  { value: '100%', label: 'Funciona sin internet' },
  { value: '∞', label: 'Sucursales y socios' },
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
  { icon: 'branches', title: 'Multi-sucursal', text: 'Administrá todas tus sedes desde un mismo sistema, con datos separados.' },
  { icon: 'routines', title: 'Rutinas', text: 'Armá rutinas por día y ejercicio, y envialas directo a la app del socio.' },
  { icon: 'news', title: 'Novedades', text: 'Publicá novedades, promos y avisos que llegan al instante al celular de tus socios.' },
  { icon: 'mobile', title: 'App del socio', text: 'Cada socio ve su cuota, paga, reserva y consulta su rutina desde el celular.' },
];

const STEPS = [
  { n: '1', title: 'Instalá el escritorio', text: 'Descargá FIT System en la PC del gimnasio. Instalación simple, sin servidores ni configuración.' },
  { n: '2', title: 'Activá tu licencia', text: 'Ingresá la clave de licencia que te damos. Elegís el plan según los socios con app.' },
  { n: '3', title: 'Cargá y operá', text: 'Cargá socios, planes y productos. Empezá a cobrar, controlar caja y registrar asistencias.' },
  { n: '4', title: 'Tus socios, conectados', text: 'Los socios descargan la app y consultan cuota, rutinas, novedades y pagan desde el celular.' },
];

const PLANS = [
  {
    name: 'Prueba',
    tag: 'TRIAL',
    price: 'Gratis',
    period: `${TRIAL_DAYS} días`,
    popular: false,
    features: [`Hasta 10 socios con app`, 'Todos los módulos', 'Soporte por email', 'Sin tarjeta'],
    cta: 'Descargar gratis',
    href: '#descargas',
  },
  {
    name: 'Básico',
    tag: 'BASIC',
    price: 'A consultar',
    period: '12 meses',
    popular: false,
    features: ['Hasta 100 socios con app', 'Todos los módulos', 'App del socio incluida', 'Soporte por email'],
    cta: 'Solicitar cotización',
    href: '#contacto',
  },
  {
    name: 'Pro',
    tag: 'PRO',
    price: 'A consultar',
    period: '12 meses',
    popular: true,
    features: ['Hasta 500 socios con app', 'Todos los módulos', 'App del socio incluida', 'Soporte prioritario'],
    cta: 'Solicitar cotización',
    href: '#contacto',
  },
  {
    name: 'Empresa',
    tag: 'ENTERPRISE',
    price: 'A consultar',
    period: '10 años',
    popular: false,
    features: ['Socios ilimitados con app', 'Multi-sucursal sin límite', 'Onboarding acompañado', 'Soporte dedicado'],
    cta: 'Hablar con ventas',
    href: '#contacto',
  },
];

const FAQS = [
  {
    q: '¿Necesito internet para usar el sistema?',
    a: 'No. La aplicación de escritorio funciona de forma local en la PC del gimnasio, sin depender de internet. La conexión solo se usa para la app móvil de los socios y las novedades.',
  },
  {
    q: '¿Qué es la app del socio?',
    a: 'Es una aplicación móvil donde cada socio ve el estado de su cuota, realiza pagos, consulta su rutina, recibe novedades y hace check-in. Se habilita según los asientos que incluye tu licencia.',
  },
  {
    q: '¿Cómo funciona la licencia?',
    a: 'La licencia se activa una sola vez con una clave (FIT-). Define la cantidad de socios con acceso a la app y la duración. Podés activarla o renovarla desde el propio sistema.',
  },
  {
    q: '¿Puedo administrar más de un gimnasio o sucursal?',
    a: 'Sí. FIT System es multi-sucursal: administrás todas tus sedes desde el mismo lugar, con datos separados y reportes por sede.',
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
    a: `Al terminar la prueba de ${TRIAL_DAYS} días, la app te muestra un ID de instalación. Enviás ese ID a nuestro contacto y te devolvemos el código de licencia (FIT-) para activar el sistema. La activación se hace una sola vez desde la propia app.`,
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
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary-light">
              <span className="h-1.5 w-1.5 rounded-full bg-primary-light" />
              Software integral para gimnasios
            </span>
            <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight text-text sm:text-5xl">
              Gestioná tu gimnasio <span className="text-primary-light">de punta a punta</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-text-muted">
              Socios, cuotas, caja, clases, asistencia y tienda en un solo sistema. Funciona en tu
              PC, sin internet, y conecta a tus socios con una app móvil propia.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="#contacto"
                className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-6 text-base font-medium text-white transition-colors hover:bg-primary-dark"
              >
                <Icon name="dashboard" size={18} />
                Pedir una demo
              </a>
              <Link
                href="/login"
                className="inline-flex h-12 items-center gap-2 rounded-lg border border-line px-6 text-base font-medium text-text transition-colors hover:bg-surface-alt"
              >
                Iniciar sesión
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-text-muted">
              {['Funciona sin internet', 'Datos en tu equipo', 'App del socio incluida'].map((item) => (
                <span key={item} className="inline-flex items-center gap-2">
                  <Icon name="check" size={16} className="text-success" />
                  {item}
                </span>
              ))}
            </div>
          </div>

          {/* Mockup */}
          <div className="relative">
            <div className="rounded-2xl border border-line bg-surface p-2 shadow-2xl shadow-primary/10">
              <div className="overflow-hidden rounded-xl border border-line bg-base">
                <div className="flex items-center gap-1.5 border-b border-line px-4 py-3">
                  <span className="h-3 w-3 rounded-full bg-danger/70" />
                  <span className="h-3 w-3 rounded-full bg-warning/70" />
                  <span className="h-3 w-3 rounded-full bg-success/70" />
                  <span className="ml-3 text-xs text-text-muted">FIT System — Panel de gestión</span>
                </div>
                <div className="flex">
                  <div className="hidden w-36 shrink-0 flex-col gap-1 border-r border-line p-3 sm:flex">
                    {(
                      [
                        ['dashboard', 'Panel'],
                        ['members', 'Socios'],
                        ['memberships', 'Cuotas'],
                        ['cash', 'Caja'],
                        ['classes', 'Clases'],
                        ['reports', 'Reportes'],
                      ] as [IconName, string][]
                    ).map(([icon, label], i) => (
                      <div
                        key={label}
                        className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
                          i === 0 ? 'bg-primary/15 text-primary-light' : 'text-text-muted'
                        }`}
                      >
                        <Icon name={icon} size={14} />
                        {label}
                      </div>
                    ))}
                  </div>
                  <div className="min-w-0 flex-1 p-4">
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        ['Socios', '842', 'text-primary-light'],
                        ['Ingresos hoy', '$186k', 'text-success'],
                        ['Deudores', '37', 'text-warning'],
                      ].map(([label, value, color]) => (
                        <div key={label} className="rounded-lg border border-line bg-surface p-3">
                          <div className="text-[10px] text-text-muted">{label}</div>
                          <div className={`mt-1 text-lg font-bold ${color}`}>{value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 overflow-hidden rounded-lg border border-line bg-surface">
                      <div className="grid grid-cols-3 border-b border-line px-3 py-2 text-[10px] uppercase tracking-wide text-text-muted">
                        <span>Socio</span>
                        <span>Cuota</span>
                        <span>Estado</span>
                      </div>
                      {[
                        ['Juan Pérez', 'Mensual', 'Al día', 'text-success'],
                        ['Ana Gómez', 'Trimestral', 'Por vencer', 'text-warning'],
                        ['Lucas Díaz', 'Mensual', 'Vencida', 'text-danger'],
                        ['Sofía Ruiz', 'Anual', 'Al día', 'text-success'],
                      ].map(([name, plan, status, color]) => (
                        <div key={name} className="grid grid-cols-3 items-center px-3 py-2 text-xs text-text-muted">
                          <span className="truncate text-text">{name}</span>
                          <span>{plan}</span>
                          <span className={`font-medium ${color}`}>{status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="pointer-events-none absolute -bottom-5 -right-4 hidden rounded-xl border border-line bg-surface px-4 py-3 shadow-xl sm:block">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary-light">
                  <Icon name="mobile" size={18} />
                </span>
                <div>
                  <div className="text-xs font-semibold text-text">App del socio</div>
                  <div className="text-[10px] text-text-muted">Cuota, rutinas y pagos</div>
                </div>
              </div>
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

      {/* Módulos */}
      <section id="modulos" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-text sm:text-4xl">
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
            <h2 className="text-3xl font-bold tracking-tight text-text sm:text-4xl">
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
            <h2 className="text-3xl font-bold tracking-tight text-text sm:text-4xl">
              Planes que crecen con vos
            </h2>
            <p className="mt-4 text-base text-text-muted">
              Elegí la cantidad de socios con acceso a la app. El sistema completo está incluido en
              todos los planes.
            </p>
          </div>

          <div className="mt-14 grid gap-5 lg:grid-cols-4">
            {PLANS.map((plan) => (
              <div
                key={plan.tag}
                className={`relative flex flex-col rounded-2xl border bg-surface p-6 ${
                  plan.popular ? 'border-primary/60 shadow-xl shadow-primary/10' : 'border-line'
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-white">
                    Más elegido
                  </span>
                )}
                <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">{plan.tag}</div>
                <h3 className="mt-1 text-lg font-bold text-text">{plan.name}</h3>
                <div className="mt-4">
                  <div className="text-2xl font-bold text-text">{plan.price}</div>
                  <div className="text-xs text-text-muted">{plan.period}</div>
                </div>
                <ul className="mt-5 flex-1 space-y-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-text-muted">
                      <Icon name="check" size={16} className="mt-0.5 shrink-0 text-success" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <a
                  href={plan.href}
                  className={`mt-6 inline-flex h-11 items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                    plan.popular
                      ? 'bg-primary text-white hover:bg-primary-dark'
                      : 'border border-line text-text hover:bg-surface-alt'
                  }`}
                >
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>

          <p className="mt-8 text-center text-xs text-text-muted">
            Los precios se ajustan según la cantidad de sucursales y socios. Consultanos por tu caso.
          </p>
        </div>
      </section>

      {/* Descargas */}
      <section id="descargas" className="scroll-mt-20 border-y border-line bg-surface/40 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-text sm:text-4xl">
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
                text: 'La app completa del gimnasio, con todos los módulos. Funciona sin internet.',
                cta: 'Descargar para Windows',
                href: SETUP_URL,
                note: `Incluye ${TRIAL_DAYS} días de prueba gratis`,
              },
              {
                icon: 'mobile' as IconName,
                title: 'App del socio',
                text: 'Se instala desde el navegador (PWA). Cada socio ve su cuota, rutinas, novedades y paga desde el celular.',
                cta: 'Instalar app del socio',
                href: PWA_URL,
                note: 'Sin descargas: abrila y "Agregar a pantalla de inicio"',
              },
              {
                icon: 'reports' as IconName,
                title: 'Panel en la nube',
                text: 'Accedé a tu gestión desde cualquier navegador con tu usuario y contraseña.',
                cta: 'Iniciar sesión',
                href: '/login',
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
                Al terminar la prueba, enviás el ID de instalación y te damos tu código de licencia.
              </p>
            </div>
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=Solicito%20c%C3%B3digo%20de%20licencia%20FIT%20System`}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
            >
              <Icon name="notifications" size={16} />
              Solicitar código de licencia
            </a>
          </div>

          <p className="mt-6 text-center text-xs text-text-muted">
            ¿Preferís la versión portable?{' '}
            <a href={PORTABLE_URL} className="text-primary-light transition-colors hover:underline">
              Descargar FIT System Portable
            </a>
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-text sm:text-4xl">Preguntas frecuentes</h2>
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
          <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/20 via-surface to-base px-6 py-14 text-center sm:px-12">
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/20 blur-[100px]" />
            <div className="relative mx-auto max-w-2xl">
              <h2 className="text-3xl font-bold tracking-tight text-text sm:text-4xl">
                Empezá hoy con FIT System
              </h2>
              <p className="mt-4 text-base text-text-muted">
                Contanos sobre tu gimnasio y te mostramos el sistema en funcionamiento. Te ayudamos a
                activar tu licencia y a poner en marcha la app de tus socios.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <a
                  href={`mailto:${CONTACT_EMAIL}?subject=Quiero%20una%20demo%20de%20FIT%20System`}
                  className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-6 text-base font-medium text-white transition-colors hover:bg-primary-dark"
                >
                  <Icon name="notifications" size={18} />
                  Pedir una demo
                </a>
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="inline-flex h-12 items-center gap-2 rounded-lg border border-line bg-base/60 px-6 text-base font-medium text-text transition-colors hover:bg-surface-alt"
                >
                  {CONTACT_EMAIL}
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line bg-surface/40">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-4">
            <div className="md:col-span-2">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="FIT System" className="h-9 w-9 rounded-xl object-cover" />
                <span className="text-base font-bold text-text">FIT System</span>
              </div>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-text-muted">
                Software integral de gestión para gimnasios. Socios, cuotas, caja, clases, asistencia
                y app móvil para tus socios.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-text">Producto</h4>
              <ul className="mt-4 space-y-2.5 text-sm text-text-muted">
                <li><a href="#modulos" className="transition-colors hover:text-text">Módulos</a></li>
                <li><a href="#planes" className="transition-colors hover:text-text">Planes</a></li>
                <li><a href="#descargas" className="transition-colors hover:text-text">Descargas</a></li>
                <li><a href="#faq" className="transition-colors hover:text-text">Preguntas</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-text">Acceso</h4>
              <ul className="mt-4 space-y-2.5 text-sm text-text-muted">
                <li><Link href="/login" className="transition-colors hover:text-text">Iniciar sesión</Link></li>
                <li><a href="#contacto" className="transition-colors hover:text-text">Contacto</a></li>
                <li><a href={`mailto:${CONTACT_EMAIL}`} className="transition-colors hover:text-text">{CONTACT_EMAIL}</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-line pt-6 text-xs text-text-muted sm:flex-row">
            <span>© {new Date().getFullYear()} FIT System. Todos los derechos reservados.</span>
            <span>Hecho para gimnasios que quieren crecer.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
