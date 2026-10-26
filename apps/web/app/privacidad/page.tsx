import Link from 'next/link';

export const metadata = {
  title: 'Política de privacidad · FIT system™',
  description: 'Información sobre la recopilación, el uso, la conservación y la protección de datos personales en FIT system™.',
};

const tradeName = 'FIT system™';
const holder = 'Matías Dario Duranovich';
const cuit = '20-35720586-8';
const address = 'Calle 464 N.º 310, City Bell, Provincia de Buenos Aires, Argentina';
const contact = 'contacto@fitsystem.com.ar';
const support = 'soporte@fitsystem.com.ar';

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-base px-4 py-12 text-text sm:px-6 lg:px-8">
      <article className="mx-auto max-w-3xl rounded-2xl border border-line bg-surface p-6 sm:p-10">
        <Link href="/" className="text-sm text-primary-light hover:underline">Volver a FIT system™</Link>
        <p className="mt-8 text-xs font-semibold uppercase tracking-widest text-primary-light">Información legal</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Política de privacidad y protección de datos</h1>
        <p className="mt-4 text-sm leading-7 text-text-muted">Última actualización: 26 de octubre de 2026.</p>

        <section className="mt-8 space-y-4 text-sm leading-7 text-text-muted">
          <h2 className="text-xl font-semibold text-text">1. Responsable y contacto</h2>
          <p>FIT system™ es el nombre de fantasía utilizado por {holder}, CUIT {cuit}, con domicilio en {address} (en adelante, “FIT system”, “nosotros” o “el proveedor”). Para consultas sobre privacidad o para ejercer derechos sobre datos personales, escribí a <a className="text-primary-light hover:underline" href={`mailto:${contact}`}>{contact}</a>, indicando en el asunto “Privacidad”.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">2. Alcance de esta política</h2>
          <p>Esta política explica cómo se tratan los datos en el sitio fitsystem.com.ar, en las consultas comerciales, durante la compra y el soporte, y al utilizar las funciones de FIT system™ que correspondan. El tratamiento concreto depende de los módulos contratados, la configuración del gimnasio y las funciones que el cliente active.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">3. Datos que podemos recopilar</h2>
          <p>Según tu interacción con el sitio y el servicio, podemos tratar:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li><strong className="text-text">Consultas y contacto:</strong> nombre, correo electrónico, teléfono, nombre del gimnasio y contenido del mensaje.</li>
            <li><strong className="text-text">Licencia, compras y soporte:</strong> datos de referencia de la compra o licencia, comunicaciones, incidencias y datos necesarios para verificar una solicitud.</li>
            <li><strong className="text-text">Uso técnico del sitio:</strong> información de navegación y eventos técnicos. Las solicitudes de descarga pueden registrar dirección IP, navegador y el recurso solicitado para medir descargas, investigar fallos y proteger el servicio.</li>
            <li><strong className="text-text">Datos cargados en el sistema por un gimnasio:</strong> datos identificatorios y de contacto de socios, fotografías, membresías, vencimientos, pagos, deudas, asistencias, clases, rutinas y otra información que el gimnasio decida administrar.</li>
            <li><strong className="text-text">Funciones de acceso:</strong> si el gimnasio habilita funciones de control de acceso mediante QR, rostro, huella u otra tecnología compatible, pueden tratarse los datos o identificadores técnicos necesarios para esa función. El cliente debe informar a las personas afectadas y contar con una base legal válida antes de activarla.</li>
          </ul>

          <h2 className="pt-4 text-xl font-semibold text-text">4. Finalidades y fundamento del tratamiento</h2>
          <p>Utilizamos los datos para responder consultas, coordinar demostraciones, gestionar licencias y pagos, prestar soporte solicitado, mantener la seguridad, diagnosticar errores, registrar descargas, cumplir obligaciones legales y mejorar el funcionamiento del producto. Tratamos los datos para estas finalidades y no los vendemos a terceros.</p>
          <p>Cuando corresponda, el tratamiento se basa en la ejecución de una solicitud o contrato, el cumplimiento de obligaciones legales, el consentimiento de la persona o un interés legítimo compatible con sus derechos. Si una función requiere consentimiento u otra base legal específica, deberá obtenerse antes de utilizarla.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">5. Datos de socios y responsabilidades del gimnasio</h2>
          <p>El gimnasio que carga información de sus socios normalmente decide para qué y cómo utilizarla y debe contar con una base legal para hacerlo, informar a los titulares y atender sus solicitudes. FIT system puede tratar esos datos por cuenta del gimnasio para prestar las funciones contratadas, según el servicio y los acuerdos aplicables. Si sos socio de un gimnasio, dirigí primero al gimnasio las consultas sobre el uso de tus datos; también podés escribirnos para que te orientemos.</p>
          <p>El gimnasio debe limitar los datos cargados a los necesarios, asignar permisos adecuados a cada usuario y evitar ingresar información sensible que no resulte necesaria para la operación.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">6. Almacenamiento local, sincronización y proveedores</h2>
          <p>FIT system incluye funciones que operan en la computadora del gimnasio y funciones online. La operación local puede conservar datos en el equipo; la app de socios, el portal de profesores, la sincronización, los pagos online y otras funciones conectadas requieren internet y pueden implicar el envío o almacenamiento de datos en servicios remotos.</p>
          <p>Para prestar las funciones solicitadas podemos utilizar proveedores de infraestructura y alojamiento, correo electrónico, procesamiento de pagos —incluido Mercado Pago cuando corresponda— y servicios técnicos. Estos proveedores pueden tratar los datos necesarios para cumplir sus funciones, bajo sus propias condiciones y las obligaciones que resulten aplicables. La disponibilidad y el flujo concreto de datos dependen de la configuración y las integraciones activadas.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">7. Comunicación y transferencias</h2>
          <p>No comercializamos bases de datos personales. Solo comunicamos información cuando sea necesaria para prestar una función solicitada, atender una obligación legal, proteger la seguridad del servicio o responder a un requerimiento válido de autoridad competente. Si la utilización de un proveedor implica alojar o tratar datos fuera de Argentina, el tratamiento deberá ajustarse a las reglas aplicables a transferencias internacionales de datos.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">8. Conservación, exportación y eliminación</h2>
          <p>Conservamos la información durante el tiempo necesario para las finalidades indicadas, la relación contractual, la atención de reclamos y el cumplimiento de obligaciones legales. Los datos de los gimnasios deben exportarse o eliminarse de acuerdo con las funciones disponibles, la configuración y las instrucciones válidas del cliente. Antes de cancelar una licencia, el gimnasio debe gestionar una exportación y mantener respaldos propios. La eliminación de copias de respaldo y registros técnicos puede requerir un plazo adicional razonable, salvo que la ley exija conservarlos por más tiempo.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">9. Seguridad</h2>
          <p>Aplicamos medidas técnicas y organizativas razonables para proteger la información frente a accesos no autorizados, pérdida o alteración. Ningún sistema puede garantizar seguridad absoluta. El cliente también debe proteger sus dispositivos, credenciales, permisos de usuario y copias de seguridad, y notificar cuanto antes cualquier acceso sospechoso.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">10. Derechos de los titulares</h2>
          <p>Podés solicitar acceso, actualización, rectificación o supresión de tus datos personales, conforme a la Ley 25.326 y demás normas aplicables, escribiendo a {contact}. Indicá el derecho que querés ejercer y la información necesaria para localizar el registro; podremos solicitar una verificación razonable de identidad. Las solicitudes relativas a datos administrados por un gimnasio pueden tener que ser resueltas por ese gimnasio como responsable del tratamiento.</p>
          <p>La Ley 25.326 establece, en los casos y condiciones previstos por ella, un plazo de diez (10) días corridos para responder solicitudes de acceso y de cinco (5) días hábiles para rectificar, actualizar o suprimir datos. Podés consultar a la Agencia de Acceso a la Información Pública (AAIP), autoridad de aplicación en materia de datos personales, en <a className="text-primary-light hover:underline" href="https://www.argentina.gob.ar/aaip/datospersonales" target="_blank" rel="noreferrer">argentina.gob.ar/aaip/datospersonales</a>.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">11. Menores de edad</h2>
          <p>El gimnasio es responsable de verificar las autorizaciones y la base legal que correspondan cuando administre información de menores de edad. No debe cargar datos de menores que no sean necesarios para la finalidad legítima del servicio ni habilitar funciones sin cumplir las exigencias aplicables.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">12. Cambios en esta política</h2>
          <p>Podemos actualizar esta política para reflejar cambios legales, técnicos o funcionales. Publicaremos la versión vigente en esta página e indicaremos la fecha de actualización. Cuando un cambio requiera una comunicación adicional por ley o por el contrato, utilizaremos un medio adecuado.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">13. Contacto y normativa</h2>
          <p>Esta política se interpreta conforme a las normas aplicables de la República Argentina, incluida la Ley 25.326 de Protección de los Datos Personales. Para consultas generales, escribí a <a className="text-primary-light hover:underline" href={`mailto:${contact}`}>{contact}</a>; para soporte técnico, a <a className="text-primary-light hover:underline" href={`mailto:${support}`}>{support}</a>.</p>
        </section>
      </article>
    </main>
  );
}
