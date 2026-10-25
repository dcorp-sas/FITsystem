import type { Metadata } from 'next';
import { SeoArticle } from '@/components/seo-article';

export const metadata: Metadata = {
  title: 'App para socios de gimnasio | FIT system',
  description: 'Una app móvil para que los socios consulten información de su membresía, rutinas y novedades del gimnasio.',
  alternates: { canonical: '/app-para-socios' },
};

export default function Page() {
  return <SeoArticle title="App móvil para los socios de tu gimnasio" intro="Ofrecé a tus socios un acceso móvil a información de su membresía y a las funciones digitales que el gimnasio tenga habilitadas en FIT system." sections={[
    {title:'Una experiencia conectada con el gimnasio',paragraphs:[
      'La app del socio complementa el sistema que utiliza recepción. En lugar de depender de mensajes individuales para cada consulta, los socios pueden revisar la información que el gimnasio publica para ellos, como el estado de la cuota, rutinas y novedades, de acuerdo con la configuración y las funciones disponibles.',
      'Una app útil necesita información correcta. Mantené actualizados los datos de contacto, las membresías y los avisos, y definí quién dentro del gimnasio puede modificar cada contenido. La aplicación no reemplaza el diálogo directo cuando un socio tiene una consulta sobre un cobro o una condición especial.'
    ]},
    {title:'Qué puede consultar un socio',paragraphs:[
      'FIT system contempla funciones para consultar la membresía, acceder a rutinas y ver novedades. Los pagos móviles y otras funciones conectadas dependen de la configuración y disponibilidad del servicio. Antes de promocionar una característica concreta, probala en la versión que vas a instalar y confirmá cómo se presenta al socio.',
      'El plan determina cuántos socios pueden tener acceso a la app. Ese cupo no limita el total de fichas que podés mantener en el escritorio. Si tu comunidad crece, revisá las opciones de ampliación de cupo antes de alcanzar el límite.'
    ]},
    {title:'Conectividad y disponibilidad',paragraphs:[
      'La app móvil necesita Internet para comunicarse con los servicios del sistema. Esto es distinto de la operación local del escritorio, que está diseñada para continuar con las tareas locales durante una interrupción de conectividad. Si la red falla, algunas funciones remotas, pagos y sincronizaciones pueden quedar temporalmente disponibles.',
      'Conviene informar a los socios qué hacer si no pueden acceder, si cambian de teléfono o si un pago aparece pendiente. Establecé un canal de soporte y verificá el estado de la operación antes de repetir un pago.'
    ]},
    {title:'Protección de los datos de socios',paragraphs:[
      'La app puede manejar información personal como nombre, membresía, pagos, rutinas y notificaciones. Limitá la información a la que cada usuario necesita acceder, protegé las cuentas y evitá enviar por mensajes datos sensibles que no sean necesarios. El gimnasio debe informar a sus socios cómo trata sus datos y atender las solicitudes que le correspondan.',
      'La política de privacidad de FIT system explica qué categorías de información puede procesar el servicio y cómo contactar al proveedor. Revisá esa política junto con tus propios avisos de privacidad antes de activar funciones conectadas.'
    ]},
    {title:'Evaluación e implementación',paragraphs:[
      'Antes de invitar a todos los socios, probá el alta de una cuenta, la consulta de membresía, el flujo de recuperación de acceso y las notificaciones. Usá datos ficticios durante las pruebas y confirmá que la información visible corresponde a la cuenta correcta.',
      'Podés probar FIT system gratis durante 7 días sin ingresar una tarjeta. Consultá por WhatsApp si necesitás una orientación inicial sobre instalación, cupos o puesta en marcha.'
    ]}
  ]} />;
}
