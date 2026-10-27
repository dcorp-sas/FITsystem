import type { Metadata } from 'next';
import { SeoArticle } from '@/components/seo-article';

export const metadata: Metadata = {
  title: 'Software para gimnasio que funciona sin internet | FIT system',
  description: 'Conocé cómo se diferencia la operación local del escritorio y las funciones online de una app de gestión para gimnasios.',
  alternates: { canonical: '/gimnasio-sin-internet' },
};

export default function Page() {
  return <SeoArticle title="Gestioná tu gimnasio aunque se corte Internet" intro="La operación local y los servicios conectados no dependen de la misma forma de la red. Conocé qué tareas podés seguir realizando y cuáles requieren conectividad." sections={[
    {title:'Por qué importa la operación local',paragraphs:[
      'En un gimnasio, una interrupción de Internet no debería detener innecesariamente todas las tareas de recepción. Consultar una ficha, registrar información local o revisar movimientos internos son operaciones que pueden funcionar en el equipo donde se ejecuta el escritorio, según la configuración instalada.',
      'FIT system está diseñado para que la operación local del escritorio pueda continuar sin conexión a Internet. Esto no significa que cada función sea completamente offline ni que los servicios remotos sigan disponibles durante una caída. La diferencia debe quedar clara para el personal que usa el sistema todos los días.'
    ]},
    {title:'Qué necesita conexión',paragraphs:[
      'La app móvil de socios, los pagos online, la sincronización con la nube, las novedades que se publican remotamente y algunos recordatorios requieren conectividad. Si se corta la red, esas tareas pueden demorarse o quedar pendientes hasta que vuelva la conexión. El comportamiento concreto depende de la función y la versión.',
      'Para los pagos online, no repitas una operación automáticamente si la confirmación no aparece. Revisá el estado en el proveedor de pago y en el sistema para evitar duplicaciones. Para la atención presencial, definí un procedimiento manual temporal aprobado por el gimnasio.'
    ]},
    {title:'Datos locales y seguridad',paragraphs:[
      'Guardar información en el equipo puede reducir la dependencia de una conexión constante, pero también hace importante proteger esa computadora. Un fallo de disco, robo, malware o borrado accidental puede afectar los datos que solo existen en esa instalación. Usá una cuenta de Windows protegida, limitá el acceso físico y mantené el equipo actualizado.',
      'Los respaldos deben estar separados de la computadora principal y revisarse periódicamente. Un archivo de backup que nunca se probó no garantiza que la restauración funcione. Antes de actualizar o reinstalar, generá una copia reciente y seguí el procedimiento recomendado para tu versión.'
    ]},
    {title:'Cómo prepararse para una caída',paragraphs:[
      'Definí quién atiende recepción, cómo registrar temporalmente una incidencia, cómo verificar pagos pendientes y dónde contactar soporte. Guardá los datos de soporte fuera del equipo principal y asegurate de que el personal conozca el procedimiento. Después de restablecer la conexión, revisá que las tareas pendientes se hayan sincronizado.',
      'Podés evaluar el escritorio con una prueba gratuita de 7 días sin tarjeta. Probá con datos ficticios, simulá una desconexión controlada y confirmá qué funciones de tu instalación siguen disponibles antes de usarla con todo el padrón real.'
    ]}
  ]} />;
}
