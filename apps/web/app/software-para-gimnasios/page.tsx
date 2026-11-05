import type { Metadata } from 'next';
import { SeoArticle } from '@/components/seo-article';
import { getDownloadUrl } from '@/lib/download-urls';

export const metadata: Metadata = {
  title: 'Software para gimnasios: prueba gratis 7 días | FIT system',
  description:
    'Gestioná socios, cuotas, cobros, caja y asistencia en un solo sistema. Descargá la prueba gratis por 7 días, sin tarjeta.',
  alternates: { canonical: '/software-para-gimnasios' },
  openGraph: {
    type: 'website',
    locale: 'es_AR',
    url: 'https://fitsystem.com.ar/software-para-gimnasios',
    siteName: 'FIT system',
    title: 'Software para gimnasios: prueba gratis 7 días | FIT system',
    description:
      'Gestioná socios, cuotas, cobros, caja y asistencia en un solo sistema. Descargá la prueba gratis por 7 días, sin tarjeta.',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'FIT system: software de gestión para gimnasios',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Software para gimnasios: prueba gratis 7 días | FIT system',
    description:
      'Gestioná socios, cuotas, cobros, caja y asistencia. Probá FIT system gratis por 7 días, sin tarjeta.',
    images: ['/opengraph-image'],
  },
};

export default function Page() {
  return (
    <SeoArticle
      downloadHref={getDownloadUrl('setup')}
      trialDays={7}
      title="Software de gestión para gimnasios"
      intro="Organizá la administración diaria de tu gimnasio desde un mismo sistema: socios, cuotas, cobros, caja, asistencia, clases, productos y comunicación con tus clientes. FIT system combina un programa de gestión para PC con una aplicación móvil para socios."
      internationalContact
      sections={[
        {
          title: 'Qué es un software de gestión para gimnasios',
          paragraphs: [
            'Un software para gimnasios permite reunir en un solo lugar las tareas habituales de administración: registrar socios, consultar membresías, controlar vencimientos, anotar pagos, revisar la caja y llevar un registro de asistencia. En lugar de depender de varias planillas, mensajes y recibos, el equipo puede consultar la información desde un sistema de gestión centralizado.',
            'FIT system es un programa de administración para gimnasios que integra módulos de socios, cuotas y membresías, cobros, caja diaria, asistencia, clases, productos, rutinas, novedades y reportes. La disponibilidad exacta de cada función puede variar según la versión y el plan; por eso recomendamos solicitar una demostración antes de contratar.'
          ],
        },
        {
          title: 'Gestión de socios, cuotas y mensualidades',
          paragraphs: [
            'El padrón centraliza las fichas y los datos de contacto de los socios. Los planes y vencimientos ayudan a identificar renovaciones y cuotas pendientes; el registro de pagos permite consultar el historial y relacionar los cobros con la gestión diaria del gimnasio. Tanto si llamás cuotas a los abonos como si trabajás con mensualidades, es importante mantener reglas claras de alta, renovación y seguimiento.',
            'Los precios publicados para FIT system están expresados en pesos argentinos. El plan determina el cupo de socios habilitados para la app móvil, mientras que el padrón del programa de escritorio no se limita por ese cupo. Consultá las condiciones y los importes finales antes de pagar.'
          ],
        },
        {
          title: 'Cobros, pagos y control de caja',
          paragraphs: [
            'El sistema permite registrar cobros y consultar movimientos relacionados con la administración diaria. El control de caja ayuda a registrar entradas y salidas de dinero y a revisar los movimientos de un turno. Los medios de pago y los flujos disponibles dependen de la configuración de la instalación.',
            'Para mantener registros confiables, el gimnasio debe revisar los movimientos, realizar las conciliaciones que correspondan y conservar copias de seguridad. El software organiza la información, pero no sustituye los controles administrativos y contables del negocio.'
          ],
        },
        {
          title: 'Control de asistencia y acceso mediante QR',
          paragraphs: [
            'El módulo de asistencia permite registrar ingresos por DNI o QR, según la función utilizada. De esta manera, recepción puede consultar quién ingresó y mantener un historial de visitas relacionado con la información del socio.',
            'Si tu gimnasio utiliza torniquetes, lectores biométricos u otro equipo físico, no presupongas compatibilidad automática. Antes de comprar hardware, consultanos la marca, el modelo y el protocolo para verificar si puede integrarse con tu versión.'
          ],
        },
        {
          title: 'Clases, rutinas y aplicación móvil para socios',
          paragraphs: [
            'FIT system reúne herramientas para organizar clases y turnos, gestionar productos y asignar rutinas. La aplicación móvil permite que los socios consulten información de su membresía, pagos, rutinas y novedades, y utilicen las funciones de seguimiento disponibles en su configuración.',
            'La aplicación móvil y las funciones que dependen de servicios en la nube necesitan conexión a Internet. La información personal debe tratarse con cuidado y el gimnasio debe definir quién puede acceder a cada dato.'
          ],
        },
        {
          title: 'Programa para gimnasios que puede trabajar sin Internet',
          paragraphs: [
            'La aplicación de escritorio está pensada para la operación local del gimnasio y puede continuar con sus tareas locales cuando se interrumpe Internet. En cambio, las funciones que dependen de servicios en la nube —como la app móvil, los pagos online o la sincronización— necesitan conectividad. Esta diferencia permite organizar el trabajo diario sin confundir las funciones locales con los servicios online.',
            'Antes de instalar, confirmá los requisitos de tu PC y el procedimiento de respaldo y restauración. Si migrás desde Excel u otro programa de gestión, enviá una muestra sin datos personales para evaluar el formato y el alcance del trabajo.'
          ],
        },
        {
          title: 'Prueba gratuita y contratación de FIT system',
          paragraphs: [
            'Podés descargar FIT system y probarlo gratis durante 7 días sin ingresar una tarjeta. Durante la evaluación, revisá los procesos que utiliza tu gimnasio y comprobá qué funciones necesitás según tu forma de trabajar. Si necesitás más tiempo para evaluarlo, podés consultarnos por los canales de contacto del sitio.',
            'FIT system publica sus precios en pesos argentinos para el mercado local. Si administrás un gimnasio fuera de Argentina, incluida España, escribinos directamente para consultar disponibilidad, condiciones comerciales y modalidad de contratación internacional.'
          ],
        },
        {
          title: 'Preguntas frecuentes sobre programas de gestión para gimnasios',
          paragraphs: [
            '¿Qué permite administrar un software para gimnasios? Puede reunir la gestión de socios, membresías, cuotas o mensualidades, pagos, caja, asistencia, clases y otras tareas, según las funciones incluidas en cada producto.',
            '¿FIT system funciona sin Internet? La aplicación de escritorio puede continuar con sus tareas locales durante una interrupción de conexión. La app móvil, los pagos online y la sincronización necesitan Internet.',
            '¿Puedo probar FIT system antes de contratar? Sí. La prueba gratuita dura 7 días y no requiere ingresar una tarjeta.',
            '¿Puedo consultar desde España u otro país? Sí. Para consultas comerciales y contratación fuera de Argentina, contactanos directamente en ventas@fitsystem.com.ar.'
          ],
        },
      ]}
    />
  );
}
