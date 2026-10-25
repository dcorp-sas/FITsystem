import type { Metadata } from 'next';
import { SeoArticle } from '@/components/seo-article';

export const metadata: Metadata = {
  title: 'Control de acceso al gimnasio con QR y DNI | FIT system',
  description: 'Registrá asistencia al gimnasio mediante DNI o QR y mantené un historial organizado de ingresos con FIT system.',
  alternates: { canonical: '/control-de-acceso-qr' },
};

export default function Page() {
  return <SeoArticle title="Control de acceso al gimnasio con QR" intro="Registrá ingresos, consultá asistencia y conectá el control de acceso con la gestión diaria de socios y membresías." sections={[
    {title:'Registro de asistencia en recepción',paragraphs:[
      'Un control de acceso claro ayuda a recepción a verificar quién ingresa y a mantener un historial de asistencia. FIT system contempla registro de ingresos por DNI o QR, según la función disponible en la versión instalada. Esto permite reducir búsquedas manuales y relacionar la asistencia con la información del socio.',
      'Antes de adoptar un nuevo método, definí cómo se identificará al socio cuando olvide su teléfono, tenga problemas con el QR o su membresía necesite revisión. Un procedimiento de excepción evita que la recepción tenga que improvisar en los horarios de mayor concurrencia.'
    ]},
    {title:'Qué significa usar QR',paragraphs:[
      'Un QR puede representar una identificación que el sistema reconoce para registrar una visita. La lectura depende de la cámara o del lector compatible y de la implementación concreta. La existencia de un módulo de QR no implica por sí sola que el sistema controle eléctricamente un molinete, una puerta o una cerradura.',
      'Si necesitás automatizar una barrera física, consultá antes el modelo del equipo, el método de conexión y el protocolo que admite. No compres torniquetes, lectores biométricos o controladores suponiendo que funcionarán sin una verificación técnica previa.'
    ]},
    {title:'Membresía y autorización de ingreso',paragraphs:[
      'El proceso de recepción debe combinar la identificación del socio con la regla que usa el gimnasio para permitir el ingreso. Es importante definir cómo se manejan las cuotas vencidas, las pruebas, los pases diarios y las excepciones autorizadas. Los datos del sistema deben mantenerse actualizados para evitar decisiones basadas en información incorrecta.',
      'Los permisos de los usuarios internos también importan: quienes registran asistencia no necesariamente necesitan acceder a reportes financieros, exportaciones o eliminación de fichas. Revisá los roles que realmente ofrece tu versión antes de poner el sistema en producción.'
    ]},
    {title:'Privacidad y datos biométricos',paragraphs:[
      'Un registro de asistencia puede revelar hábitos y horarios de una persona. Las fotos y, especialmente, los datos biométricos requieren un análisis cuidadoso de finalidad, seguridad, acceso y conservación. No habilites captura facial o huellas sin confirmar su funcionamiento, las responsabilidades legales y las medidas de protección que corresponden.',
      'La política de privacidad de FIT system describe las categorías de datos que puede procesar el producto. El gimnasio debe comunicar sus propios tratamientos y responder a las solicitudes de sus socios cuando sea el responsable de esos datos.'
    ]},
    {title:'Cómo verificar la compatibilidad',paragraphs:[
      'Para evaluar tu caso, indicá el tipo de ingreso que querés controlar, la marca y el modelo del lector o torniquete, la cantidad de accesos y si el equipo ya está instalado. No incluyas contraseñas ni credenciales técnicas en una consulta inicial. Con esa información podremos confirmar si se trata de una función disponible, una integración que requiere desarrollo o un equipo no compatible.',
      'FIT system ofrece una prueba gratuita de 7 días sin tarjeta. Usala para evaluar el flujo de recepción y asistencia con datos ficticios antes de cargar información real.'
    ]}
  ]} />;
}
