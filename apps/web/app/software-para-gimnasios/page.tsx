import type { Metadata } from 'next';
import { SeoArticle } from '@/components/seo-article';

export const metadata: Metadata = {
  title: 'Software para gimnasios: socios, cuotas y caja | FIT system',
  description: 'Conocé FIT system, el software de gestión para gimnasios con socios, cuotas, caja, asistencia, clases, tienda y app móvil.',
  alternates: { canonical: '/software-para-gimnasios' },
};

export default function Page() {
  return <SeoArticle title="Software de gestión para gimnasios" intro="Organizá la administración diaria del gimnasio desde un mismo sistema: padrón de socios, cuotas, cobros, caja, asistencia, clases, productos y comunicación con tus clientes. FIT system combina una aplicación de escritorio con una app móvil para socios." sections={[
    {title:'Qué debería resolver un sistema para gimnasios',paragraphs:[
      'La administración de un gimnasio combina tareas que se repiten todos los días: registrar nuevas altas, consultar el estado de una membresía, controlar vencimientos, registrar cobros, revisar la caja y saber quién ingresó. Cuando la información queda repartida en planillas, mensajes y recibos, es fácil perder tiempo o pasar por alto un pago. Un sistema de gestión permite reunir esos procesos y consultar la información desde un único lugar.',
      'FIT system incluye módulos para socios, cuotas y membresías, cobros, caja diaria, asistencia, clases, productos, rutinas, novedades y reportes. La disponibilidad exacta de cada función puede variar por versión y plan, por eso conviene revisar una demostración antes de contratar.'
    ]},
    {title:'Socios, membresías y cobros',paragraphs:[
      'El padrón centraliza fichas y datos de contacto. Los planes y vencimientos ayudan a identificar renovaciones y deudas; el registro de pagos permite consultar el historial y relacionar los cobros con la gestión diaria. Para que los datos sean confiables, el gimnasio debe establecer un procedimiento de carga, revisar los movimientos y mantener copias de seguridad.',
      'Los precios publicados para FIT system están expresados en pesos argentinos. El plan determina el cupo de socios habilitados para la app móvil, mientras que el padrón del escritorio no se limita por ese cupo. Consultá las condiciones de cada plan y los importes finales antes de pagar.'
    ]},
    {title:'Caja, asistencia y clases',paragraphs:[
      'El control de caja ayuda a registrar entradas y salidas de dinero y a revisar los movimientos de un turno. El módulo de asistencia permite registrar ingresos por DNI o QR según la función utilizada. Para clases y turnos, el sistema organiza horarios, cupos y reservas, de acuerdo con las funciones habilitadas en la instalación.',
      'Si tu gimnasio utiliza torniquetes, huelleros u otro equipo físico, no asumas compatibilidad automática. Antes de comprar hardware, consultanos el modelo y el protocolo para verificar si puede integrarse con tu versión.'
    ]},
    {title:'Escritorio y app del socio',paragraphs:[
      'El escritorio está pensado para la operación del gimnasio y puede continuar con sus tareas locales cuando se interrumpe Internet. En cambio, las funciones que dependen de servicios en la nube —como la app móvil, los pagos online o la sincronización— necesitan conectividad. Es importante que el equipo conozca esa diferencia para poder trabajar durante una caída de conexión.',
      'La app del socio puede mostrar información de la membresía, rutinas y novedades y permitir determinados flujos de pago según la configuración. La información personal debe tratarse con cuidado y el gimnasio debe definir quién puede acceder a cada dato.'
    ]},
    {title:'Cómo evaluar si FIT system te sirve',paragraphs:[
      'Antes de instalar, confirmá los requisitos de tu PC, la cantidad de socios que usarán la app, las necesidades de varias sedes, el flujo de MercadoPago y el procedimiento de respaldo y restauración. Si migrás desde Excel u otro software, enviá una muestra sin datos personales para evaluar el formato y el alcance del trabajo.',
      'Podés descargar la prueba gratuita de 7 días sin ingresar una tarjeta. Si necesitás más tiempo para evaluarla, escribinos por WhatsApp desde el sitio. Revisá también la política de privacidad, los términos y las condiciones de cancelación antes de contratar.'
    ]}
  ]} />;
}
