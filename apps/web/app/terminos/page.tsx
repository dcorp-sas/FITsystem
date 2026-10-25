import Link from 'next/link';

export const metadata = {
  title: 'Términos y condiciones · FIT system™',
  description: 'Términos y condiciones de uso de FIT system™.',
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-base px-4 py-12 text-text sm:px-6 lg:px-8">
      <article className="mx-auto max-w-3xl rounded-2xl border border-line bg-surface p-6 sm:p-10">
        <Link href="/" className="text-sm text-primary-light hover:underline">Volver a FIT system™</Link>
        <p className="mt-8 text-xs font-semibold uppercase tracking-widest text-primary-light">Información legal</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Términos y condiciones</h1>
        <p className="mt-4 text-sm leading-7 text-text-muted">Última actualización: 25 de octubre de 2026.</p>

        <section className="mt-8 space-y-4 text-sm leading-7 text-text-muted">
          <h2 className="text-xl font-semibold text-text">1. Identificación y aceptación</h2>
          <p>FIT system™ es el nombre de fantasía de Matias Dario Duranovich, CUIT 20-35720586-8, con domicilio en Calle 464 N.º 310, City Bell, Provincia de Buenos Aires. El uso del sitio, la descarga o la contratación del servicio implican la aceptación de estos términos.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">2. Servicio y licencia</h2>
          <p>FIT system™ ofrece herramientas para gestionar socios, cuotas, caja, clases, asistencia, productos y una app para socios. La licencia habilita una instalación del escritorio y la cantidad de socios con acceso a la app indicada en el plan contratado. El padrón del escritorio no está limitado por ese cupo.</p>
          <p>La prueba inicial dura 7 días y no requiere ingresar una tarjeta. Al finalizar, el cliente puede contratar un plan o dejar de utilizar el servicio.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">3. Usuarios y responsabilidades</h2>
          <p>El cliente debe mantener actualizados sus datos, proteger sus credenciales, asignar roles adecuados y utilizar el sistema conforme a la ley. El gimnasio es responsable de la información de sus socios, de contar con las autorizaciones necesarias y de definir sus políticas de acceso y conservación.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">4. Licencia, vencimiento y cupos</h2>
          <p>La licencia dura el período contratado. Cuando vence o queda suspendida, pueden limitarse las funciones de escritura hasta su renovación, conforme al estado de la licencia. El cliente debe exportar o respaldar sus datos antes de cancelar o dejar vencer el servicio.</p>
          <p>Si se alcanza el cupo de socios con app, no se habilitan nuevos accesos móviles hasta contratar una capacidad disponible. Los socios ya cargados en el escritorio no se eliminan por superar ese cupo.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">5. Precios, pagos y facturación</h2>
          <p>Los precios y el período aplicable se muestran antes de confirmar la compra. MercadoPago procesa el pago conforme a sus propios términos y comisiones. La facturación electrónica ARCA corresponde a la operación del gimnasio y se configura desde el sistema según la situación fiscal del cliente.</p>
          <p>La condición fiscal del responsable de FIT system™ es la que surge de su constancia vigente. El comprobante aplicable se emitirá conforme a la normativa fiscal correspondiente.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">6. Cancelación y reembolsos</h2>
          <p>La prueba de 7 días no genera cobros automáticos porque no requiere tarjeta. Para una licencia paga, cualquier solicitud de cancelación o reembolso debe enviarse a contacto@fitsystem.com.ar e indicar el comprador, la referencia de la operación y el motivo. Se analizará conforme a la legislación aplicable y a las condiciones informadas antes del pago.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">7. Soporte</h2>
          <p>El soporte se brinda por los canales publicados en el sitio. El alcance y la prioridad dependen del plan contratado. Las consultas comerciales se reciben en contacto@fitsystem.com.ar y el soporte de clientes en soporte@fitsystem.com.ar.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">8. Datos y respaldos</h2>
          <p>El cliente debe conservar respaldos propios y verificar que las copias puedan restaurarse. FIT system™ mantiene respaldos de infraestructura según su operación, pero no reemplaza la responsabilidad del cliente sobre sus datos.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">9. Cambios, ley y jurisdicción</h2>
          <p>Podemos actualizar estos términos para reflejar cambios del servicio o de la normativa. Las relaciones se rigen por las leyes de la República Argentina, sin perjuicio de los derechos irrenunciables que correspondan al usuario. La jurisdicción aplicable debe validarse con asesoramiento legal.</p>
        </section>
      </article>
    </main>
  );
}
