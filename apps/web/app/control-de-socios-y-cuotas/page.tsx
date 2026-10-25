import type { Metadata } from 'next';
import { SeoArticle } from '@/components/seo-article';

export const metadata: Metadata = {
  title: 'Control de socios y cuotas para gimnasios | FIT system',
  description: 'Centralizá fichas, membresías, vencimientos, renovaciones, pagos y deudas de socios en un sistema de gestión para gimnasios.',
  alternates: { canonical: '/control-de-socios-y-cuotas' },
};

export default function Page() {
  return <SeoArticle title="Control de socios y cuotas para gimnasios" intro="Mantené ordenado el padrón del gimnasio y consultá el estado de las membresías, sus vencimientos y los pagos desde un solo sistema." sections={[
    {title:'Un padrón organizado',paragraphs:[
      'El padrón de socios es una de las herramientas más importantes de la administración de un gimnasio. Una ficha ordenada permite encontrar datos de contacto, revisar el estado de una membresía y dar seguimiento a la relación con cada cliente. FIT system ofrece fichas de socios y búsqueda para que recepción pueda localizar registros sin recorrer varias planillas.',
      'Definí qué información necesitás guardar y evitá recopilar datos innecesarios. Los documentos, las fotografías, los datos de contacto y la información de pagos requieren controles de acceso y una finalidad clara. El gimnasio debe informar a sus socios cómo utiliza sus datos y mantenerlos actualizados.'
    ]},
    {title:'Cuotas, vencimientos y renovaciones',paragraphs:[
      'La gestión de cuotas permite configurar planes, registrar vencimientos, renovar membresías y consultar el estado de cada socio. Un procedimiento consistente ayuda a detectar cuotas pendientes y reduce el trabajo manual de revisar varias listas al comienzo de cada turno.',
      'Los avisos y recordatorios deben configurarse de acuerdo con las preferencias del gimnasio y la información de contacto disponible. Antes de usar comunicaciones automáticas, revisá que el mensaje sea correcto, que llegue al destinatario adecuado y que cumpla las reglas aplicables sobre comunicaciones y datos personales.'
    ]},
    {title:'Pagos y seguimiento de deudas',paragraphs:[
      'Relacionar los pagos con la ficha del socio ayuda a revisar qué se cobró, cuándo se registró y qué saldo queda pendiente. FIT system contempla registros de cobros en efectivo, transferencia y flujos con MercadoPago según la configuración disponible. La conciliación bancaria y los movimientos del proveedor de pagos deben revisarse por separado cuando corresponda.',
      'El software ayuda a organizar la información, pero el gimnasio sigue siendo responsable de verificar la exactitud de sus registros, emitir los comprobantes fiscales que correspondan y mantener sus respaldos.'
    ]},
    {title:'Límites del plan y app móvil',paragraphs:[
      'Los planes de FIT system establecen cuántos socios pueden utilizar la app móvil. Ese límite no significa que debas eliminar registros del escritorio cuando llegás al cupo. Si necesitás habilitar más usuarios móviles, consultá las opciones de ampliación disponibles antes de renovar.',
      'La app y las funciones online requieren conexión a Internet. El escritorio está diseñado para que la operación local continúe durante una interrupción de conectividad, pero conviene definir un procedimiento alternativo para pagos online y otras tareas que dependan de servicios remotos.'
    ]},
    {title:'Migración y puesta en marcha',paragraphs:[
      'Si hoy gestionás el padrón en Excel, prepará columnas con nombres claros, fechas consistentes y datos duplicados revisados. No compartas un archivo real con DNI, fotos o información de deuda para una primera evaluación; alcanza con una copia de ejemplo anonimizada. El formato de importación, el alcance de la migración y cualquier costo deben confirmarse antes de iniciar el trabajo.',
      'Podés empezar con una prueba gratuita de 7 días sin tarjeta. Consultá los planes, los términos y la política de privacidad, y coordiná con soporte el proceso de instalación y respaldo.'
    ]}
  ]} />;
}
