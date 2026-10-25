import type { Metadata } from 'next';
import { LandingNav } from '@/components/landing-nav';
import { LandingPlans, type PlanDef } from '@/components/landing-plans';
import { LandingContact } from '@/components/landing-contact';
import { BuyButton } from '@/components/landing-checkout';
import { Icon, type IconName } from '@/components/icon';
import { TrackVisit } from '@/components/track-visit';
import { getSiteContent } from '@/lib/site-content';

export const metadata: Metadata = {
  metadataBase: new URL('https://fitsystem.com.ar'),
  title: 'Software para gimnasios con app y portal docente | FIT System',
  description:
    'Administrá socios, cuotas, cobros, caja y asistencia desde Windows. La operación local puede continuar sin internet; las funciones online requieren conexión.',
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    locale: 'es_AR',
    url: 'https://fitsystem.com.ar',
    siteName: 'FIT system™',
    title: 'Software para gimnasios con app y portal docente | FIT System',
    description:
      'Software integral para gimnasios con escritorio Windows, app de socios y portal de profesores conectados. Gestioná socios, cuotas, clases, rutinas y progreso; las funciones online requieren conexión.',
    images: [{ url: '/opengraph-image.png', width: 1200, height: 630, alt: 'FIT system™ — Software de gestión para gimnasios' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Software para gimnasios con app y portal docente | FIT System',
    description:
      'Administrá socios, cuotas, cobros, caja y asistencia desde Windows. Las funciones online requieren conexión.',
    images: ['/opengraph-image.png'],
  },
};

const DOWNLOAD_BASE = 'https://github.com/dcorp-sas/FITsystem/releases/latest/download';
// La API expone sus rutas bajo /api (NEXT_PUBLIC_API_URL es el host, sin /api).
const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
const API_ROOT = API_BASE ? (/\/api$/.test(API_BASE) ? API_BASE : `${API_BASE}/api`) : '';
// Los botones de descarga pasan por la API (redireccion contada): registra el
// hit y despues manda al instalador real. Si no hay API configurada, va directo.
const counted = (asset: 'setup' | 'portable', direct: string) =>
  API_ROOT ? `${API_ROOT}/metrics/download/go?asset=${asset}` : direct;
const SETUP_URL = counted('setup', `${DOWNLOAD_BASE}/FIT-System-Setup.exe`);
const PORTABLE_URL = counted('portable', `${DOWNLOAD_BASE}/FIT-System-Portable.exe`);
const PWA_URL = process.env.NEXT_PUBLIC_SOCIOS_URL || 'https://socios.fitsystem.com.ar';
const PWA_INSTALL_URL = `${PWA_URL}${PWA_URL.includes('?') ? '&' : '?'}install=1`;

const MODULES: { icon: IconName; title: string; text: string; wide?: boolean }[] = [
  { icon: 'members', title: 'Socios', text: 'Altas, fichas, datos de contacto, estado y foto. Búsqueda instantánea y hoja de cada socio.', wide: true },
  { icon: 'memberships', title: 'Cuotas y membresías', text: 'Planes, vencimientos, renovaciones, congelamientos y avisos automáticos de deuda.' },
  { icon: 'payments', title: 'Cobros y pagos', text: 'Registro de cobros y comprobantes para seguir las cuotas pendientes.' },
  { icon: 'cash', title: 'Caja diaria', text: 'Apertura, cierre, ingresos y egresos con arqueo y control por turno y usuario.' },
  { icon: 'attendance', title: 'Asistencia y check-in', text: 'Ingresos por DNI o QR, control de acceso y estadísticas de concurrencia.' },
  { icon: 'classes', title: 'Clases y turnos', text: 'Grilla de clases, cupos, reservas, listas de espera e instructores asignados.' },
  { icon: 'shop', title: 'Tienda y productos', text: 'Venta de productos y suplementos con stock, precios y control de inventario.' },
  { icon: 'reports', title: 'Reportes', text: 'Ingresos, altas, bajas, deudores y rendimiento por sucursal, según las funciones del plan contratado.', wide: true },
  { icon: 'branches', title: 'Sedes y cajas', text: 'Operación por sede o caja, con reportes comparativos.' },
  { icon: 'routines', title: 'Rutinas y seguimiento', text: 'Creá y asigná rutinas desde el sistema, seguí los ejercicios y pesos registrados en la app y consultá el historial para comparar ciclos de entrenamiento de 4 semanas.' },
  { icon: 'classes', title: 'Portal de profesores', text: 'Cada profesor entra con su propio usuario al portal conectado al sistema principal: consulta su agenda, revisa inscriptos, gestiona sesiones y accede a rutinas e historial según sus permisos.' },
  { icon: 'news', title: 'Novedades', text: 'Publicá promos y avisos que tus socios ven en la app.' },
  { icon: 'mobile', title: 'App del socio', text: 'Cada socio consulta su cuota, pagos, rutinas y novedades; registra ejercicios y pesos para seguir su progreso y conservar el historial de entrenamiento.' },
];

const STEPS = [
  { n: '1', title: 'Instalá el escritorio', text: 'Instalá FIT system™ en una PC con Windows y completá la configuración inicial. La operación local no requiere contratar un servidor externo.' },
  { n: '2', title: 'Activá tu licencia', text: 'Ingresá la clave de licencia que te damos. Elegís el plan según los socios con app.' },
  { n: '3', title: 'Cargá y operá', text: 'Cargá socios, planes y productos. Empezá a cobrar, controlar caja y registrar asistencias.' },
  { n: '4', title: 'Conectá profesores y socios', text: 'Los profesores trabajan desde su portal con las clases y rutinas del sistema principal. Los socios consultan su rutina en la app y registran su progreso; las funciones online requieren conexión.' },
];

const faqs = (trialDays: number) => [
  {
    q: '¿Necesito internet para usar el sistema?',
    a: 'La operación local del escritorio puede continuar sin conexión a Internet. Las funciones en la nube, la app móvil de socios, los pagos online, las novedades y la sincronización de datos sí requieren conectividad.',
  },
  {
    q: '¿Cómo trabajan los profesores con las rutinas y las clases?',
    a: 'El administrador crea un acceso para cada profesor. El portal usa el sistema principal y sus datos existentes: permite consultar clases y agenda, ver inscriptos, gestionar sesiones y revisar rutinas e historial según permisos. Los socios usan la app conectada para consultar rutinas y registrar ejercicios y pesos. Las funciones online requieren conexión.',
  },
  {
    q: '¿Cómo se conectan el sistema, la app y el portal de profesores?',
    a: 'No son tres sistemas independientes: el escritorio de FIT System, la app de socios y el portal de profesores trabajan conectados a la misma plataforma y comparten los datos disponibles para cada perfil. Las funciones online requieren conexión.',
  },
  {
    q: '¿Qué es la app del socio?',
    a: 'Es una aplicación móvil donde cada socio ve el estado de su cuota, realiza pagos, consulta su rutina y recibe las novedades. Se habilita según los asientos que incluye tu licencia.',
  },
  {
    q: '¿Cómo funciona la licencia?',
    a: 'La licencia se activa una sola vez con una clave que comienza con FIT y contiene tres bloques de caracteres separados por guiones (formato de ejemplo: FIT-AB12-CD34-EF56). Define la cantidad de socios con acceso a la app y la duración. Podés activarla o renovarla desde el propio sistema.',
  },
  {
    q: '¿Puedo separar la operación por sede o caja?',
    a: 'Sí. Podés organizar la operación por sede o caja dentro del sistema, con datos separados. Los reportes comparativos por sede dependen del plan contratado.',
  },
  {
    q: '¿Qué medios de pago acepta?',
    a: 'Efectivo, transferencia y MercadoPago. Registrás los cobros en la caja y controlás las deudas de cada socio desde un solo panel.',
  },
  {
    q: '¿Hay permanencia mínima?',
    a: `La prueba es gratis por ${trialDays} días. Después podés suscribirte mes a mes y cancelar la renovación cuando quieras.`,
  },
  {
    q: '¿Cómo consigo el código de licencia?',
    a: `Elegís un plan en la página (pago con MercadoPago) y, al aprobarse el pago, el sistema emite tu clave automáticamente y te la enviamos por email. La activás una sola vez desde la app del gimnasio (Configuración > Licencia). Si necesitás ayuda, el ID de instalación aparece en la app.`,
  },
  {
    q: '¿La prueba requiere una tarjeta?',
    a: `No. Podés probar FIT system durante ${trialDays} días sin ingresar una tarjeta ni asumir un cobro automático. Al terminar la prueba, elegís si querés contratar un plan.`,
  },
  {
    q: '¿Emiten factura electrónica ARCA?',
    a: 'FIT System no ofrece como función estándar confirmada la emisión electrónica de comprobantes ARCA. El registro de pagos no equivale a emitir una factura fiscal; consultanos por escrito antes de contratar si necesitás esa función.',
  },
  {
    q: '¿Qué pasa si se rompe o me roban la PC?',
    a: 'Tus datos se guardan en el equipo. Para proteger la información ante un fallo o pérdida de la computadora, mantené copias de seguridad periódicas en un dispositivo externo y consultá a soporte si necesitás ayuda para recuperarlas.',
  },
  {
    q: '¿Puedo migrar mis datos desde Excel u otro sistema?',
    a: 'La posibilidad de migrar depende del formato y de la calidad de los datos de origen. Escribinos antes de contratar con una muestra sin datos sensibles para confirmar columnas, alcance, plazos y si el trabajo tiene costo.',
  },
  {
    q: '¿Qué ocurre cuando vence la licencia?',
    a: 'La licencia cubre el período contratado. Antes del vencimiento, revisá el estado de la licencia y conservá una copia de seguridad exportable. Para conocer qué funciones quedan disponibles en tu versión, contactá a soporte.',
  },
  {
    q: '¿Qué pasa si supero el cupo de socios con app?',
    a: 'El cupo de la licencia se aplica a los accesos de la app móvil, no al padrón cargado en el escritorio. Para habilitar más socios con app, consultá las opciones de ampliación disponibles.',
  },
  {
    q: '¿Se integra con torniquetes o lectores de huella?',
    a: 'El sistema permite registrar asistencia mediante DNI o QR según la función utilizada. No publicamos una lista general de torniquetes o lectores de huella compatibles; consultanos el modelo exacto antes de comprar hardware.',
  },
  {
    q: '¿A dónde va el dinero de MercadoPago y qué comisión se cobra?',
    a: 'Las condiciones dependen del flujo de pago configurado y de la cuenta de MercadoPago vinculada. MercadoPago aplica sus propias comisiones. Antes de habilitar cobros, confirmá con nosotros el flujo correspondiente a tu instalación; no asumimos que todas las integraciones acreditan a la misma cuenta.',
  },
  {
    q: '¿Cuáles son los requisitos de la PC?',
    a: 'FIT system está orientado a equipos con Windows. Como los requisitos dependen de la versión y del hardware, consultá soporte con el modelo de tu PC antes de instalarlo, especialmente si usás Windows de 32 bits o un equipo antiguo.',
  },
  {
    q: '¿Cómo funciona el soporte?',
    a: 'El canal de contacto general es contacto@fitsystem.com.ar y el soporte para clientes es soporte@fitsystem.com.ar. La prioridad depende del plan contratado. Para evitar expectativas incorrectas, consultá el horario vigente al activar tu licencia.',
  },
  {
    q: '¿Puedo dar de baja la licencia?',
    a: 'Podés consultar el procedimiento de baja o no renovación por email. Las solicitudes se evalúan según las condiciones de contratación y los derechos que correspondan por ley.',
  },
];

function SectionHeading({
  kicker,
  title,
  text,
}: {
  kicker: string;
  title: React.ReactNode;
  text?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-light">{kicker}</span>
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-text sm:text-4xl">{title}</h2>
      {text && <p className="mt-4 text-base text-text-muted">{text}</p>}
    </div>
  );
}

function BrowserFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl shadow-black/40">
      <div className="flex items-center gap-2 border-b border-line bg-surface-alt/50 px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-danger/70" />
        <span className="h-3 w-3 rounded-full bg-warning/70" />
        <span className="h-3 w-3 rounded-full bg-success/70" />
        <span className="ml-3 truncate text-xs text-text-muted">{title}</span>
      </div>
      {children}
    </div>
  );
}

export default function LandingPage() {
  const content = getSiteContent();
  const { hero, stats, trialDays } = content;
  const CONTACT_EMAIL = content.contact.email;
  const SUPPORT_EMAIL = content.contact.supportEmail;
  const plans: PlanDef[] = content.plans.map((plan) => ({
    tag: plan.tag === 'PRO' ? 'PRO' : plan.tag === 'ENTERPRISE' ? 'ENTERPRISE' : 'BASIC',
    name: plan.name,
    seats: `Hasta ${plan.seats} socios con app`,
    monthly: plan.monthly,
    popular: plan.popular,
    features: plan.features,
  }));
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: 'FIT system',
        url: 'https://fitsystem.com.ar',
        email: CONTACT_EMAIL,
        logo: 'https://fitsystem.com.ar/logo.png',
      },
      {
        '@type': 'SoftwareApplication',
        name: 'FIT system',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Windows',
        description: 'Software para gimnasios en Windows: socios, cuotas, cobros, caja y asistencia. La operación local puede continuar sin internet; las funciones online requieren conexión.',
        offers: plans.map((plan) => ({
          '@type': 'Offer',
          name: `${plan.name} mensual`,
          price: String(plan.monthly),
          priceCurrency: 'ARS',
          description: 'Suscripción mensual de licencia. Se renueva mes a mes.',
        })),
      },
      {
        '@type': 'FAQPage',
        mainEntity: faqs(trialDays).map((faq) => ({
          '@type': 'Question',
          name: faq.q,
          acceptedAnswer: { '@type': 'Answer', text: faq.a },
        })),
      },
    ],
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-base">
      <TrackVisit />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <LandingNav />

      {/* Hero */}
      <section id="inicio" className="relative scroll-mt-20 overflow-hidden pt-28 pb-16 sm:pt-32 lg:pb-24">
        <div className="pointer-events-none absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_35%,transparent_100%)]" />
        <div className="pointer-events-none absolute -top-32 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-primary/25 blur-[130px] animate-glow" />
        <div className="pointer-events-none absolute right-0 top-24 h-72 w-72 rounded-full bg-sky/15 blur-[110px]" />

        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:px-8">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary-light">
              <span className="h-1.5 w-1.5 rounded-full bg-primary-light" />
              {hero.kicker}
            </span>
            <h1 className="mt-6 text-4xl font-bold leading-[1.05] tracking-tight text-text sm:text-5xl lg:text-6xl">
              {hero.title} <span className="text-gradient">{hero.titleAccent}</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-text-muted sm:text-lg">{hero.subtitle}</p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="#descargas"
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-6 text-base font-medium text-white shadow-lg shadow-primary/30 transition-colors hover:bg-primary-dark"
              >
                <Icon name="dashboard" size={18} />
                {hero.ctaPrimary}
              </a>
              <a
                href="#planes"
                className="inline-flex h-12 items-center gap-2 rounded-xl border border-line px-6 text-base font-medium text-text transition-colors hover:bg-surface-alt"
              >
                <Icon name="plans" size={18} />
                {hero.ctaSecondary}
              </a>
            </div>

            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-text-muted">
              {hero.chips.map((item) => (
                <span key={item} className="inline-flex items-center gap-2">
                  <Icon name="check" size={16} className="text-success" />
                  {item}
                </span>
              ))}
            </div>
          </div>

          {/* Mockup */}
          <div className="relative mx-auto w-full max-w-xl">
            <div className="pointer-events-none absolute -inset-8 -z-10 rounded-[2.5rem] bg-gradient-to-tr from-primary/30 via-sky/10 to-transparent blur-2xl" />
            <BrowserFrame title="FIT system™ · Panel general">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/screens/sistema-dashboard.svg"
                alt="Vista ilustrativa del panel general de FIT system™ con métricas del gimnasio"
                className="w-full"
              />
            </BrowserFrame>

            <div className="absolute -bottom-8 -left-4 hidden w-36 animate-float sm:block">
              <div className="overflow-hidden rounded-[1.6rem] border border-line bg-base p-1.5 shadow-2xl ring-glow">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/screens/app-socios.svg"
                  alt="Vista ilustrativa de la app del socio de FIT system™"
                  className="w-full rounded-[1.2rem]"
                />
              </div>
            </div>

            
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-line bg-surface/40">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-10 sm:px-6 lg:grid-cols-4 lg:px-8">
          {stats.map((stat) => (
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
          <SectionHeading
            kicker="Producto"
            title="Todo tu gimnasio, en una pantalla"
            text="El sistema de gestión en la PC, la app para socios y el portal docente trabajando conectados."
          />
          <p className="mt-5 text-center text-xs text-text-muted">Vistas ilustrativas de la interfaz; la disponibilidad de funciones depende de la versión y del plan contratado.</p>

          <div className="mt-12 ring-glow rounded-2xl">
            <BrowserFrame title="FIT system™ · Panel general">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/screens/sistema-dashboard.svg" alt="Vista ilustrativa del panel general de FIT system™ con métricas del gimnasio" className="w-full" />
            </BrowserFrame>
          </div>

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {[
              {
                src: '/screens/sistema-socios.svg',
                alt: 'Vista ilustrativa de la gestión de socios y cuotas en FIT system™',
                title: 'Socios y cuotas',
                text: 'Ficha de cada socio, estado de cuenta e historial de cobros.',
              },
              {
                src: '/screens/sistema-caja.svg',
                alt: 'Vista ilustrativa de cobros y caja diaria en FIT system™',
                title: 'Cobros y caja',
                text: 'Registro de cobros y arqueo por turno.',
              },
            ].map((shot) => (
              <figure key={shot.src} className="overflow-hidden rounded-2xl border border-line bg-surface transition-colors hover:border-primary/40">
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

          <div className="mt-6 grid items-center gap-8 overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-primary/10 via-surface to-base p-8 sm:p-10 lg:grid-cols-[220px_1fr]">
            <div className="mx-auto w-[200px] shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/screens/app-socios.svg" alt="Vista ilustrativa de la app del socio de FIT system™ en el celular" className="w-full" />
            </div>
            <div className="text-center lg:text-left">
              <h3 className="text-xl font-bold text-text">App del socio según el cupo de tu plan</h3>
              <p className="mt-3 text-sm leading-relaxed text-text-muted">
                Cada socio instala la app desde el navegador (sin descargas) y ve el estado de su cuota,
                su rutina del día y las novedades del gimnasio. Registra su ingreso escaneando el QR de
                la entrada y puede acceder a funciones online de consulta o pago según la configuración y con conexión a Internet.
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
                className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-white shadow-lg shadow-primary/25 transition-colors hover:bg-primary-dark"
              >
                <Icon name="mobile" size={18} />
                Probar la app del socio
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Módulos */}
      <section id="modulos" className="relative scroll-mt-20 overflow-hidden py-20">
        <div className="pointer-events-none absolute inset-0 bg-dots [mask-image:radial-gradient(ellipse_70%_60%_at_50%_50%,#000_20%,transparent_100%)] opacity-60" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            kicker="Módulos"
            title={
              <>
                Todo lo que tu gimnasio <span className="text-gradient">necesita</span>
              </>
            }
            text="Un sistema completo, pensado para el día a día del gimnasio. Sin módulos que sobren ni funciones que falten."
          />

          <div className="mt-14 grid auto-rows-[1fr] gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((mod) => (
              <div
                key={mod.title}
                className={`group relative overflow-hidden rounded-2xl border border-line bg-surface/80 p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-surface ${
                  mod.wide ? 'sm:col-span-2 lg:col-span-2' : ''
                }`}
              >
                <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-primary/10 opacity-0 blur-2xl transition-opacity group-hover:opacity-100" />
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-sky/10 text-primary-light transition-colors group-hover:from-primary/30">
                  <Icon name={mod.icon} size={20} />
                </span>
                <h3 className="mt-4 text-base font-semibold text-text">{mod.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-text-muted">{mod.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Portal de profesores */}
      <section id="portal-profesores" className="scroll-mt-20 border-y border-line bg-surface/40 py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-light">Para tu equipo</span>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-text sm:text-4xl">Un espacio propio para cada profesor</h2>
            <p className="mt-4 text-base leading-relaxed text-text-muted">Tus profesores tienen un portal de trabajo propio, conectado a FIT System y a la app de los socios. Cada uno accede con su usuario y trabaja con la información que le corresponde, sin entrar a la administración del gimnasio.</p>
            <ul className="mt-6 space-y-3 text-sm text-text-muted">
              <li className="flex gap-3"><Icon name="check" size={18} className="shrink-0 text-success" /><span><strong className="text-text">Clases y agenda:</strong> programación de sesiones, horarios y consulta de inscriptos.</span></li>
              <li className="flex gap-3"><Icon name="check" size={18} className="shrink-0 text-success" /><span><strong className="text-text">Rutinas de socios:</strong> creación y actualización de planes de entrenamiento desde el espacio docente.</span></li>
              <li className="flex gap-3"><Icon name="check" size={18} className="shrink-0 text-success" /><span><strong className="text-text">Todo conectado:</strong> las rutinas y clases se comparten con el sistema principal y la app según los permisos del usuario.</span></li>
            </ul>
          </div>
          <div className="rounded-2xl border border-line bg-base p-6 shadow-xl shadow-black/10 sm:p-8">
            <div className="flex items-center gap-3 border-b border-line pb-5"><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary-light"><Icon name="classes" size={24} /></span><div><p className="font-semibold text-text">Portal de profesores</p><p className="mt-1 text-sm text-text-muted">Clases · agenda · rutinas</p></div></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-line bg-surface p-4"><Icon name="classes" size={20} className="text-primary-light" /><p className="mt-3 text-sm font-semibold text-text">Agenda organizada</p><p className="mt-1 text-xs leading-5 text-text-muted">Próximas sesiones y participantes en un mismo lugar.</p></div>
              <div className="rounded-xl border border-line bg-surface p-4"><Icon name="routines" size={20} className="text-primary-light" /><p className="mt-3 text-sm font-semibold text-text">Rutinas conectadas</p><p className="mt-1 text-xs leading-5 text-text-muted">Planes de entrenamiento disponibles para los socios desde la app.</p></div>
            </div>
            <a href="https://profes.fitsystem.com.ar" className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-white transition-colors hover:bg-primary-dark">Ingresar al portal de profesores</a>
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="border-y border-line bg-surface/40 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            kicker="Cómo funciona"
            title="Empezar es muy simple"
            text="En cuatro pasos tenés tu gimnasio funcionando."
          />

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <div key={step.n} className="relative rounded-2xl border border-line bg-base p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-dark text-sm font-bold text-white shadow-lg shadow-primary/30">
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
          <SectionHeading
            kicker="Planes"
            title="Planes que crecen con vos"
            text="El sistema de escritorio no limita la cantidad de socios cargados. El plan define cuántos pueden usar la app; el sistema completo está incluido en todos los planes."
          />

          <LandingPlans setupUrl={SETUP_URL} trialDays={trialDays} plans={plans} />
          <div className="mt-10 overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <caption className="px-5 py-4 text-left text-base font-semibold text-text">Comparativa de planes</caption>
              <thead><tr className="border-y border-line bg-base text-text-muted"><th scope="col" className="px-5 py-3">Función</th><th scope="col" className="px-4 py-3">Prueba</th><th scope="col" className="px-4 py-3">Básico</th><th scope="col" className="px-4 py-3">Pro</th><th scope="col" className="px-4 py-3">Empresa</th></tr></thead>
              <tbody className="divide-y divide-line">
                <tr><th scope="row" className="px-5 py-3 font-medium text-text">Socios con app</th><td className="px-4 py-3">10</td><td className="px-4 py-3">100</td><td className="px-4 py-3">300</td><td className="px-4 py-3">500</td></tr>
                <tr><th scope="row" className="px-5 py-3 font-medium text-text">Módulos de escritorio</th><td className="px-4 py-3">Incluidos</td><td className="px-4 py-3">Incluidos</td><td className="px-4 py-3">Incluidos</td><td className="px-4 py-3">Incluidos</td></tr>
                <tr><th scope="row" className="px-5 py-3 font-medium text-text">App del socio</th><td className="px-4 py-3">Hasta 10</td><td className="px-4 py-3">Incluida</td><td className="px-4 py-3">Incluida</td><td className="px-4 py-3">Incluida</td></tr>
                <tr><th scope="row" className="px-5 py-3 font-medium text-text">Registro de cobros</th><td className="px-4 py-3">Incluido</td><td className="px-4 py-3">Incluido</td><td className="px-4 py-3">Incluido</td><td className="px-4 py-3">Incluido</td></tr>
                <tr><th scope="row" className="px-5 py-3 font-medium text-text">Reportes por sede</th><td className="px-4 py-3">—</td><td className="px-4 py-3">—</td><td className="px-4 py-3">Incluidos</td><td className="px-4 py-3">Avanzados</td></tr>
                <tr><th scope="row" className="px-5 py-3 font-medium text-text">Soporte prioritario</th><td className="px-4 py-3">—</td><td className="px-4 py-3">—</td><td className="px-4 py-3">Incluido</td><td className="px-4 py-3">Incluido</td></tr>
              </tbody>
            </table>
          </div>

          <p className="mt-8 text-center text-xs text-text-muted">
            Precios en pesos argentinos (ARS). Todos los planes se contratan y renuevan mensualmente.
            Todos los planes incluyen el sistema completo y la app del socio.
          </p>
        </div>
      </section>

      {/* Descargas */}
      <section id="descargas" className="scroll-mt-20 border-y border-line bg-surface/40 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            kicker="Descargas"
            title="Llevalo a todos lados"
            text="La gestión en tu PC y acceso móvil para tus socios cuando tienen conexión."
          />

          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {[
              {
                icon: 'dashboard' as IconName,
                title: 'Escritorio (Windows)',
                text: 'La gestión del gimnasio en Windows puede continuar con sus funciones locales si se corta internet. Las funciones online quedan temporalmente no disponibles.',
                cta: 'Descargar para Windows',
                href: SETUP_URL,
                note: `Incluye ${trialDays} días de prueba gratis`,
              },
              {
                icon: 'mobile' as IconName,
                title: 'App del socio',
                text: 'Se abre desde el navegador y puede agregarse a la pantalla de inicio. Las funciones online requieren conexión y dependen de la configuración.',
                cta: 'Instalar app del socio',
                href: PWA_INSTALL_URL,
                note: 'Sin descargas: abrila y "Agregar a pantalla de inicio"',
              },
              {
                icon: 'reports' as IconName,
                title: 'Acceso desde la PC del gimnasio',
                text: 'Accedé a tu gestión desde la computadora del gimnasio con la aplicación de escritorio y credenciales según el rol de cada operador.',
                cta: 'Pedir demo',
                href: '#contacto',
                note: 'Para administradores y recepción',
              },
            ].map((item) => (
              <div key={item.title} className="flex flex-col rounded-2xl border border-line bg-base p-6 transition-colors hover:border-primary/40">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-sky/10 text-primary-light">
                  <Icon name={item.icon} size={22} />
                </span>
                <h3 className="mt-4 text-base font-semibold text-text">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-text-muted">{item.text}</p>
                <p className="mt-2 text-xs text-text-muted">{item.note}</p>
                <a
                  href={item.href}
                  className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-line px-4 text-sm font-medium text-text transition-colors hover:bg-surface-alt"
                >
                  <Icon name="import" size={16} />
                  {item.cta}
                </a>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 rounded-2xl border border-line bg-base p-6 text-center sm:flex-row sm:justify-between sm:text-left">
            <div>
              <p className="text-sm font-semibold text-text">Instalá gratis y probá {trialDays} días completos</p>
              <p className="mt-1 text-sm text-text-muted">
                Al terminar la prueba, elegí un plan: al aprobarse el pago emitimos tu clave y te la enviamos por email.
              </p>
            </div>
            <a
              href="#planes"
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-white shadow-lg shadow-primary/25 transition-colors hover:bg-primary-dark"
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
          <SectionHeading
            kicker="Preguntas"
            title="Preguntas frecuentes"
            text="Las dudas más comunes antes de empezar."
          />

          <div className="mt-12 space-y-3">
            {faqs(trialDays).map((faq) => (
              <details
                key={faq.q}
                className="group rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-primary/30 [&_summary::-webkit-details-marker]:hidden"
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

      {/* Quiénes somos */}
      <section id="quienes-somos" className="scroll-mt-20 py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-line bg-surface p-7 sm:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-light">Quiénes somos</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-text sm:text-3xl">Tecnología pensada para el día a día del gimnasio</h2>
            <p className="mt-4 text-sm leading-7 text-text-muted">FIT system es una herramienta de gestión enfocada en reunir en un solo flujo la administración de socios, cuotas, caja, asistencia, clases y la comunicación con los socios. Buscamos que el equipo del gimnasio dedique menos tiempo a tareas dispersas y tenga una visión más ordenada de su operación.</p>
            <p className="mt-3 text-sm leading-7 text-text-muted">Si querés conocer el alcance real de una función, consultar una integración o evaluar una migración, escribinos antes de contratar. Preferimos confirmar compatibilidad y condiciones de antemano.</p>
          </div>
        </div>
      </section>

      {/* Contacto */}
      <section id="contacto" className="scroll-mt-20 pb-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <LandingContact
            contacts={[
              { label: 'Contacto general', email: CONTACT_EMAIL },
              { label: 'Soporte', email: SUPPORT_EMAIL },
            ]}
          />
        </div>
      </section>

      <a
        href="https://wa.me/5492212005382?text=Hola%2C%20quiero%20informaci%C3%B3n%20sobre%20FIT%20system%20para%20mi%20gimnasio"
        target="_blank"
        rel="noreferrer"
        aria-label="Contactar por WhatsApp"
        title="Contactar por WhatsApp"
        className="fixed bottom-5 left-5 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-[#25D366] px-4 text-sm font-semibold text-[#062b12] shadow-xl shadow-black/30 transition-transform hover:scale-105"
      >
        <Icon name="whatsapp" size={21} />
        WhatsApp
      </a>


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
              <p className="mt-4 text-xs text-text-muted">App del socio incluida · Planes mensuales</p>
              <p className="mt-3 text-xs text-text-muted">FIT system™ · CUIT 20-35720586-8</p>
            </div>
            <div className="md:col-span-2">
              <h4 className="text-sm font-semibold text-text">Contacto</h4>
              <ul className="mt-4 space-y-2.5 text-sm text-text-muted">
                <li><a href={`mailto:${CONTACT_EMAIL}`} className="transition-colors hover:text-text">{CONTACT_EMAIL}</a></li>
                <li><a href={`mailto:${SUPPORT_EMAIL}`} className="transition-colors hover:text-text">{SUPPORT_EMAIL}</a></li>
              </ul>
              <a
                href="https://www.instagram.com/fitsystemgym/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Seguir a FIT system en Instagram"
                title="Seguir a FIT system en Instagram"
                className="group mt-5 flex w-full max-w-sm items-center gap-3 rounded-2xl border border-fuchsia-400/50 bg-gradient-to-r from-fuchsia-600/30 via-purple-600/25 to-orange-500/20 p-4 shadow-lg shadow-fuchsia-950/20 transition-all hover:border-fuchsia-300 hover:from-fuchsia-600/40 hover:via-purple-600/35 hover:to-orange-500/30"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 via-purple-500 to-orange-400 text-white shadow-lg shadow-fuchsia-950/30">
                  <Icon name="instagram" size={23} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-text">¡Seguinos en Instagram!</span>
                  <span className="mt-0.5 block text-sm font-semibold text-fuchsia-200">@fitsystemgym</span>
                </span>
                <span aria-hidden="true" className="text-lg text-fuchsia-300 transition-transform group-hover:translate-x-0.5">↗</span>
              </a>
              <div className="mt-3 flex items-center gap-2 border-t border-line/70 pt-3">
                <a href="https://qr.afip.gob.ar/?qr=Wm5cesE9tbTfPnnbeQW5tA,," target="_blank" rel="noreferrer" aria-label="Consultar constancia fiscal de FIT system" className="inline-flex shrink-0 items-center rounded bg-white p-0.5" style={{ width: 46, minWidth: 46 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="https://www.afip.gob.ar/images/f960/DATAWEB.jpg" alt="Constancia fiscal de FIT system" width="42" height="16" loading="lazy" style={{ display: 'block', width: 42, maxWidth: 42, height: 'auto' }} />
                </a>
                <span className="text-[10px] leading-4 text-text-muted">Constancia fiscal · Ver datos</span>
              </div>
              <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-text-muted">
                <a href="/software-para-gimnasios" className="transition-colors hover:text-text">Software para gimnasios</a>
                <a href="/control-de-socios-y-cuotas" className="transition-colors hover:text-text">Socios y cuotas</a>
                <a href="/control-de-acceso-qr" className="transition-colors hover:text-text">Control de acceso QR</a>
                <a href="/cobros-mercadopago-gimnasios" className="transition-colors hover:text-text">Cobros con MercadoPago</a>
                <a href="/app-para-socios" className="transition-colors hover:text-text">App para socios</a>
                <a href="/privacidad" className="transition-colors hover:text-text">Política de privacidad</a>
                <a href="/terminos" className="transition-colors hover:text-text">Términos y condiciones</a>
                <a href="/arrepentimiento" className="transition-colors hover:text-text">Arrepentimiento y baja</a>
                <a href="https://www.argentina.gob.ar/produccion/defensadelconsumidor" target="_blank" rel="noreferrer" className="transition-colors hover:text-text">Defensa del Consumidor</a>
              </div>
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
