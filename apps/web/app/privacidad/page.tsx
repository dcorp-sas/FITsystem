import Link from 'next/link';

export const metadata = {
  title: 'Política de privacidad · FIT system™',
  description: 'Política de privacidad y tratamiento de datos de FIT system™.',
};

const legalName = 'Matias Dario Duranovich';
const tradeName = 'FIT system™';
const taxId = '20-35720586-8';
const address = 'Calle 464 N.º 310, City Bell, Provincia de Buenos Aires';
const contact = 'contacto@fitsystem.com.ar';

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-base px-4 py-12 text-text sm:px-6 lg:px-8">
      <article className="mx-auto max-w-3xl rounded-2xl border border-line bg-surface p-6 sm:p-10">
        <Link href="/" className="text-sm text-primary-light hover:underline">Volver a FIT system™</Link>
        <p className="mt-8 text-xs font-semibold uppercase tracking-widest text-primary-light">Información legal</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Política de privacidad</h1>
        <p className="mt-4 text-sm leading-7 text-text-muted">Última actualización: 25 de octubre de 2026.</p>

        <section className="mt-8 space-y-4 text-sm leading-7 text-text-muted">
          <h2 className="text-xl font-semibold text-text">1. Responsable</h2>
          <p>
            FIT system™ es el nombre de fantasía de <strong className="text-text">{legalName}</strong>, CUIT
            <strong className="text-text"> {taxId}</strong>, con domicilio en {address}. Para consultas sobre privacidad,
            podés escribir a <a className="text-primary-light hover:underline" href={`mailto:${contact}`}>{contact}</a>.
          </p>
          <p>La condición fiscal aplicable es la que surge de la constancia fiscal vigente del responsable.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">2. Datos que recopilamos en el sitio</h2>
          <p>Cuando completás el formulario de contacto podemos recopilar nombre, email, teléfono, nombre del gimnasio y el contenido de tu consulta. También registramos métricas técnicas de descargas para conocer el uso del sitio y mejorar la distribución del producto.</p>
          <p>Usamos esos datos para responder consultas, coordinar demostraciones, gestionar compras y brindar soporte solicitado. No vendemos los datos personales.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">3. Datos procesados por FIT system™</h2>
          <p>El sistema puede procesar datos de socios del gimnasio, como nombre, documento, foto, contacto, membresías, pagos, deuda y asistencia. En general, el gimnasio decide la finalidad de esos datos y actúa como responsable del tratamiento; FIT system™ presta el servicio y actúa como encargado en la medida que corresponda. Esta asignación debe ser revisada por cada cliente con su asesor legal.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">4. Datos en la nube y proveedores</h2>
          <p>Según la configuración y las funciones utilizadas, pueden sincronizarse a la nube datos de socios, cuotas, pagos, asistencia, rutinas, novedades y credenciales necesarias para la app del socio. El servicio puede interactuar con MercadoPago, proveedores de hosting y proveedores de email para ejecutar las funciones solicitadas.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">5. Conservación y eliminación</h2>
          <p>Conservamos los datos mientras sean necesarios para prestar el servicio, cumplir obligaciones legales o resolver reclamos. Al cancelar una licencia, el cliente debe solicitar la exportación o eliminación de los datos y conservar sus propios respaldos. Los plazos concretos dependen del servicio y de las obligaciones aplicables.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">6. Derechos</h2>
          <p>Podés solicitar acceso, rectificación, actualización o supresión de tus datos escribiendo a {contact}. La solicitud debe permitir identificar al titular y describir claramente el pedido. También podés recurrir a la Agencia de Acceso a la Información Pública (AAIP), autoridad de aplicación de la Ley 25.326. La AAIP tiene atribuciones para atender denuncias y reclamos de quienes resulten afectados en sus derechos por incumplimientos de la normativa de protección de datos personales. Más información: https://www.argentina.gob.ar/aaip/datospersonales.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">7. Plazos de respuesta y solicitudes</h2>
          <p>Para ejercer derechos, escribí a {contact} con el asunto “Privacidad”, identificando el dato o pedido. Responderemos dentro de los plazos que establezca la normativa aplicable. Las solicitudes referidas a socios de un gimnasio pueden requerir que el titular se comunique también con el gimnasio, que normalmente determina el uso de esos datos.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">8. Seguridad</h2>
          <p>Aplicamos controles técnicos y organizativos razonables, como autenticación, control de acceso, cifrado de secretos y copias de seguridad de la infraestructura. Ningún sistema conectado a Internet puede garantizar riesgo cero.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">9. Cambios</h2>
          <p>Podemos actualizar esta política para reflejar cambios legales, técnicos o del servicio. Publicaremos la versión vigente en esta página.</p>
        </section>
      </article>
    </main>
  );
}
