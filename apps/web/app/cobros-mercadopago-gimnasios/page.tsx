import type { Metadata } from 'next';
import { SeoArticle } from '@/components/seo-article';

export const metadata: Metadata = {
  title: 'Cobrar cuotas de gimnasio con MercadoPago | FIT system',
  description: 'Organizá el registro de cobros y consultá cómo evaluar la integración de MercadoPago con el software de gestión del gimnasio.',
  alternates: { canonical: '/cobros-mercadopago-gimnasios' },
};

export default function Page() {
  return <SeoArticle title="Cobros de cuotas con MercadoPago para gimnasios" intro="Centralizá el registro de cobros con la gestión de socios y cuotas, y revisá el flujo de pago que corresponde a tu instalación antes de habilitarlo." sections={[
    {title:'Cobros vinculados a socios',paragraphs:[
      'Cobrar cuotas requiere identificar al socio, registrar el importe y poder consultar después qué ocurrió con la operación. FIT system incluye registros de cobros y contempla flujos con MercadoPago según la configuración. Tener el movimiento asociado a la ficha facilita el seguimiento de cuotas pendientes y la revisión administrativa.',
      'El registro dentro del sistema y la acreditación bancaria son procesos relacionados, pero distintos. Conciliá los movimientos de tu cuenta con los pagos que aparecen en el software y conservá los comprobantes y reportes que correspondan a tu operación.'
    ]},
    {title:'A qué cuenta se acredita el dinero',paragraphs:[
      'El destino de los fondos depende del flujo de pago y de la cuenta de MercadoPago que esté vinculada. En una integración pueden existir credenciales del proveedor del software y credenciales del comercio; por eso no debe asumirse que todos los pagos se acreditan automáticamente en la cuenta del gimnasio sin revisar la configuración concreta.',
      'Antes de empezar a cobrar desde la app, pedí una explicación del flujo que se habilitará para tu gimnasio, quién administra las credenciales, cómo se revisan los pagos y cómo se gestiona un pago rechazado o pendiente. No compartas tokens de acceso por correo o chat.'
    ]},
    {title:'Comisiones, acreditaciones y devoluciones',paragraphs:[
      'MercadoPago aplica sus propios términos, comisiones y condiciones de acreditación, que pueden variar por medio de pago, plazo y cuenta. Revisá la información vigente en tu panel de MercadoPago y no presupongas que una comisión determinada se aplica a todas las operaciones.',
      'Definí también quién atiende consultas de socios, cómo se identifican pagos duplicados y qué procedimiento seguir para una devolución. El gimnasio debe mantener una comunicación clara con sus socios y conciliar los registros del sistema con la información del proveedor de pagos.'
    ]},
    {title:'Kit Point y QR en el mostrador',paragraphs:[
      'Si estás evaluando un terminal Point o un QR para cobrar presencialmente, confirmá quién vende el equipo, la disponibilidad, el envío, la garantía y la cuenta en la que se acreditan los fondos. La compra de un equipo físico no implica por sí sola una integración automática con el software.',
      'Antes de adquirir un kit, consultá si el producto está disponible para tu zona y qué tareas quedan manuales. Así evitás comprar hardware con una expectativa de conexión que no se haya verificado.'
    ]},
    {title:'Cómo empezar con seguridad',paragraphs:[
      'Probá primero con una operación de bajo importe o con el entorno de prueba disponible, verificá la confirmación del pago y comprobá que el movimiento quede correctamente asociado al socio. Revisá también qué ocurre si la conexión se interrumpe durante la operación.',
      'Los planes de FIT system se publican en pesos argentinos. El precio final y el tratamiento fiscal deben revisarse antes de pagar. Para confirmar qué flujo de MercadoPago está habilitado para tu instalación, contactá al equipo antes de recibir pagos reales.'
    ]}
  ]} />;
}
