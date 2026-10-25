import Link from 'next/link';

export const metadata = {
  title: 'Términos y condiciones · FIT system™',
  description: 'Condiciones de licencia, pagos, soporte, cancelación y tratamiento de datos de FIT system™.',
};

const contact = 'contacto@fitsystem.com.ar';
const support = 'soporte@fitsystem.com.ar';

export default function TermsPage() {
  return (
    <main id="contenido" className="min-h-screen bg-base px-4 py-12 text-text sm:px-6 lg:px-8">
      <article className="mx-auto max-w-3xl rounded-2xl border border-line bg-surface p-6 sm:p-10">
        <Link href="/" className="text-sm text-primary-light hover:underline">Volver a FIT system™</Link>
        <p className="mt-8 text-xs font-semibold uppercase tracking-widest text-primary-light">Información legal</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Términos y condiciones</h1>
        <p className="mt-4 text-sm leading-7 text-text-muted">Última actualización: 25 de octubre de 2026.</p>
        <section className="mt-8 space-y-4 text-sm leading-7 text-text-muted">
          <h2 className="text-xl font-semibold text-text">1. Responsable y contacto</h2>
          <p>FIT system™ ofrece herramientas de gestión para gimnasios. Contacto comercial: <a className="text-primary-light hover:underline" href={`mailto:${contact}`}>{contact}</a>. Soporte de clientes: <a className="text-primary-light hover:underline" href={`mailto:${support}`}>{support}</a>.</p>
          <h2 className="pt-4 text-xl font-semibold text-text">2. Servicio y alcance de la licencia</h2>
          <p>FIT system ofrece herramientas para gestionar socios, cuotas, caja, clases, asistencia, productos y una app para socios. Salvo que la oferta contratada indique otra cosa, la licencia habilita una instalación del escritorio y el cupo de socios con acceso a la app indicado en el plan. El padrón del escritorio no está limitado por ese cupo.</p>
          <p>La prueba gratuita disponible actualmente dura 7 días y no requiere tarjeta. La duración y condiciones vigentes se mostrarán antes de iniciar una prueba o contratación.</p>
          <h2 className="pt-4 text-xl font-semibold text-text">3. Usuarios, permisos y datos del cliente</h2>
          <p>El cliente debe proteger sus credenciales, asignar permisos adecuados y asegurar que cuenta con base legal para cargar y tratar los datos de sus socios. El gimnasio normalmente determina para qué utiliza esos datos y FIT system puede tratarlos por cuenta del gimnasio para prestar las funciones contratadas; las responsabilidades concretas deben establecerse en el acuerdo aplicable y según la normativa vigente.</p>
          <h2 className="pt-4 text-xl font-semibold text-text">4. Duración, renovación y vencimiento</h2>
          <p>La licencia dura el período que figure en el comprobante de compra. Un plan anual cubre 12 meses. No se realiza un débito automático por la prueba gratuita. Al vencer una licencia, algunas funciones pueden quedar limitadas hasta su renovación. El cliente debe mantener copias de sus datos y solicitar asistencia para exportarlos antes de cancelar o dejar vencer el servicio.</p>
          <p>Los precios pueden actualizarse para futuras contrataciones o renovaciones. El importe ya pagado se mantiene durante el período contratado; cualquier precio nuevo debe informarse antes de confirmar una nueva compra.</p>
          <h2 className="pt-4 text-xl font-semibold text-text">5. Cupo de socios con app</h2>
          <p>El límite indicado en el plan se refiere a los socios habilitados para utilizar la app. Al alcanzar el cupo, puede ser necesario ampliar el plan para habilitar nuevos accesos móviles. No se eliminan del escritorio los socios ya cargados por alcanzar ese límite.</p>
          <h2 className="pt-4 text-xl font-semibold text-text">6. Precios, IVA y facturación</h2>
          <p>Los importes se muestran en pesos argentinos (ARS). Antes de confirmar el pago se debe revisar el importe final y el tratamiento impositivo aplicable. La condición fiscal del proveedor y el comprobante que corresponda se rigen por su constancia fiscal vigente y por la normativa aplicable. La revisión del código disponible no confirmó una integración para emitir comprobantes fiscales electrónicos ARCA en FIT system; el registro de pagos no equivale a emitir una factura fiscal. Antes de contratar, pedí confirmación por escrito si necesitás esa función.</p>
          <p>MercadoPago procesa las operaciones conforme a sus términos, comisiones y disponibilidad. Las comisiones de MercadoPago y el destino de los fondos dependen del flujo de pago y la cuenta vinculada que se informe para la compra o integración correspondiente.</p>
          <h2 className="pt-4 text-xl font-semibold text-text">7. Cancelación y derechos del consumidor</h2>
          <p>Podés consultar el procedimiento de baja o no renovación escribiendo a {contact} o usando la página de <Link href="/arrepentimiento" className="text-primary-light hover:underline">arrepentimiento y baja</Link>. Las solicitudes se evaluarán según las condiciones de contratación y la normativa vigente. Esta información no limita los derechos irrenunciables que pudieran corresponder por ley. No se ofrece una política comercial general de devolución voluntaria adicional a esos derechos.</p>
          <h2 className="pt-4 text-xl font-semibold text-text">8. Soporte</h2>
          <p>Las consultas generales se reciben en {contact} y las de clientes en {support}. El alcance y prioridad dependen del plan. El horario y tiempo de respuesta deben confirmarse en la oferta vigente; no se garantiza disponibilidad ininterrumpida salvo acuerdo expreso.</p>
          <h2 className="pt-4 text-xl font-semibold text-text">9. Seguridad y copias de respaldo</h2>
          <p>El cliente debe conservar copias de seguridad independientes y comprobar periódicamente que se puedan restaurar. Los respaldos de infraestructura del proveedor no sustituyen una copia exportable de los datos del gimnasio. No cargues contraseñas ni información personal innecesaria en solicitudes de soporte.</p>
          <h2 className="pt-4 text-xl font-semibold text-text">10. Disponibilidad y responsabilidad</h2>
          <p>Trabajamos para mantener el servicio disponible, pero pueden existir interrupciones por mantenimiento, conectividad, proveedores o incidencias. El cliente debe verificar sus datos y mantener procedimientos alternativos para operar durante una interrupción. Ninguna disposición limita responsabilidades que no puedan excluirse legalmente.</p>
          <h2 className="pt-4 text-xl font-semibold text-text">11. Ley aplicable</h2>
          <p>Estos términos se interpretan conforme a las leyes de la República Argentina, sin perjuicio de las normas imperativas que correspondan. La jurisdicción aplicable y la validez de cada cláusula deben interpretarse de acuerdo con la legislación vigente.</p>
          <p className="pt-4">Para consultas legales y de privacidad, escribí a <a className="text-primary-light hover:underline" href={`mailto:${contact}`}>{contact}</a>. Estos términos deben ser revisados por asesoría legal y contable antes de su uso comercial definitivo.</p>
        </section>
      </article>
    </main>
  );
}
