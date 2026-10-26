import Link from 'next/link';

export const metadata = {
  title: 'Términos y condiciones · FIT system™',
  description: 'Términos de uso, licencia, mantenimiento, pagos, soporte y protección de datos de FIT system™.',
};

const holder = 'Matías Dario Duranovich';
const cuit = '20-35720586-8';
const address = 'Calle 464 N.º 310, City Bell, Provincia de Buenos Aires, Argentina';
const contact = 'contacto@fitsystem.com.ar';
const support = 'soporte@fitsystem.com.ar';

export default function TermsPage() {
  return (
    <main id="contenido" className="min-h-screen bg-base px-4 py-12 text-text sm:px-6 lg:px-8">
      <article className="mx-auto max-w-3xl rounded-2xl border border-line bg-surface p-6 sm:p-10">
        <Link href="/" className="text-sm text-primary-light hover:underline">Volver a FIT system™</Link>
        <p className="mt-8 text-xs font-semibold uppercase tracking-widest text-primary-light">Información legal</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Términos y condiciones de uso y contratación</h1>
        <p className="mt-4 text-sm leading-7 text-text-muted">Última actualización: 26 de octubre de 2026.</p>

        <section className="mt-8 space-y-4 text-sm leading-7 text-text-muted">
          <h2 className="text-xl font-semibold text-text">1. Proveedor y aceptación</h2>
          <p>FIT system™ es el nombre de fantasía de {holder}, CUIT {cuit}, con domicilio en {address} (en adelante, “FIT system” o “el proveedor”). Contacto comercial: <a className="text-primary-light hover:underline" href={`mailto:${contact}`}>{contact}</a>. Soporte: <a className="text-primary-light hover:underline" href={`mailto:${support}`}>{support}</a>.</p>
          <p>Estos términos regulan el acceso y uso del sitio, la aplicación de escritorio, la app de socios, el portal de profesores y los servicios asociados, en la medida en que cada uno esté incluido en la contratación. La oferta, el plan, la licencia, el comprobante de compra y cualquier acuerdo particular aceptado por el cliente complementan estos términos. Si existe una contradicción, se aplicará la condición particular informada y aceptada para esa contratación, sin afectar derechos irrenunciables establecidos por ley.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">2. Qué ofrece FIT system</h2>
          <p>FIT system es una herramienta de gestión para gimnasios que puede incluir administración de socios, membresías, cobros, caja, asistencia, clases, productos, reportes, rutinas, app de socios y portal de profesores. Las funciones disponibles dependen de la versión, el plan, la licencia y la configuración. Las funciones online y la sincronización requieren conexión a internet; determinadas funciones locales del escritorio pueden operar sin conexión, pero eso no significa que todas las funciones estén disponibles offline.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">3. Licencia, mantenimiento y modalidad contratada</h2>
          <p>El cliente recibe una licencia de uso limitada, no exclusiva, no transferible salvo autorización escrita, para utilizar el software conforme a la oferta contratada. La licencia no transfiere la propiedad intelectual del programa ni autoriza a revenderlo, sublicenciarlo, descompilarlo o utilizarlo fuera del alcance permitido por la ley.</p>
          <p>Cuando la oferta comercial contemple una licencia inicial y un cargo mensual de mantenimiento, ambos conceptos se detallarán por separado: el precio y alcance de la licencia, el importe del mantenimiento, sus tareas incluidas, el canal de soporte y las condiciones de vigencia. El mantenimiento puede incluir, según la oferta aceptada, asistencia técnica, correcciones y actualizaciones. No se considerarán incluidas migraciones, desarrollos a medida, instalación adicional, capacitación especial ni servicios de terceros, salvo que se indique expresamente.</p>
          <p>Si el cliente contrata un plan de suscripción publicado en el sitio, se aplicarán la modalidad, duración, cupos y precio que se muestren antes de confirmar la compra. No se presume que una licencia inicial incluya mantenimiento indefinido ni que el mantenimiento transfiera la propiedad del software. La oferta o confirmación comercial debe identificar claramente la modalidad que corresponde a cada cliente.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">4. Prueba, activación y cupos</h2>
          <p>Cuando se ofrezca una prueba gratuita, su duración y condiciones serán las que se informen al iniciarla. La prueba no implica una obligación de contratar ni un débito automático si eso no fue informado y aceptado de forma expresa. La licencia o plan puede establecer límites de instalaciones, sedes, usuarios, duración o socios con acceso a la app. Los límites aplicables se informarán en la oferta o en el panel de contratación.</p>
          <p>Al alcanzar un cupo contratado, ciertas altas o accesos adicionales pueden requerir ampliar el plan. No se eliminarán datos del cliente únicamente por alcanzar un límite, salvo que se informe una condición específica válida y compatible con la normativa aplicable.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">5. Precios, pagos y facturación</h2>
          <p>El precio, moneda, impuestos aplicables, periodicidad, vencimiento y medios de pago se informarán antes de la compra o en la propuesta comercial aceptada. Los cargos recurrentes solo se realizarán bajo la modalidad de pago informada y autorizada. Los cambios de precio para períodos futuros se comunicarán antes de que entren en vigor, respetando las normas aplicables y el derecho del cliente a cancelar cuando corresponda.</p>
          <p>Los pagos pueden procesarse mediante Mercado Pago u otros medios indicados durante la compra. Cada proveedor de pago aplica sus propias condiciones y medidas de seguridad. Registrar un cobro dentro de FIT system no equivale por sí mismo a emitir una factura fiscal electrónica. El comprobante fiscal será emitido conforme a la situación tributaria del proveedor y la normativa aplicable.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">6. Renovación, baja y arrepentimiento</h2>
          <p>La duración y renovación serán las indicadas en la oferta aceptada. El cliente puede solicitar la baja o no renovación por el mecanismo disponible en el sitio o por el mismo medio digital utilizado para contratar, cuando corresponda. Para iniciar una solicitud, ingresá a <Link href="/arrepentimiento" className="text-primary-light underline">Arrepentimiento y baja</Link>. La solicitud no debe requerir registración previa ni trámites adicionales cuando la normativa prohíba exigirlos.</p>
          <p>El derecho de arrepentimiento en contrataciones a distancia, sus plazos y excepciones se rigen por la Ley 24.240, el Código Civil y Comercial de la Nación y las normas vigentes. Estos términos no eliminan ni restringen derechos legales. La baja de una suscripción o mantenimiento no supone automáticamente la devolución de importes por períodos ya transcurridos; cualquier devolución se resolverá conforme a la ley y a las condiciones válidas de la contratación.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">7. Suspensión y finalización del servicio</h2>
          <p>Ante un incumplimiento de pago, uso no autorizado o riesgo de seguridad, podremos limitar o suspender las funciones afectadas en la medida razonablemente necesaria y de acuerdo con la oferta y la normativa aplicable. Cuando sea posible, informaremos el motivo y los pasos para regularizar la situación. La finalización de una licencia o mantenimiento no autoriza a apropiarse de los datos del gimnasio ni elimina las obligaciones legales de conservación que correspondan.</p>
          <p>Antes de la finalización, el cliente debe exportar sus datos y mantener respaldos propios. La posibilidad de seguir usando una versión instalada, recibir actualizaciones o acceder a funciones online después del vencimiento depende de la licencia, la arquitectura técnica y la oferta contratada; estos puntos deben quedar expresamente informados para cada modalidad.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">8. Obligaciones del cliente y datos de terceros</h2>
          <p>El cliente debe proporcionar información exacta, mantener protegidas sus credenciales, asignar permisos adecuados, usar el software de forma lícita y contar con una base legal para cargar y tratar los datos de sus socios, empleados y profesores. Debe informar a las personas afectadas cuando corresponda, atender sus derechos y evitar cargar información que no sea necesaria para la finalidad del servicio.</p>
          <p>El gimnasio es responsable de las decisiones comerciales y operativas que tome a partir de reportes o registros del sistema, así como de verificar cobros, saldos, asistencias y demás información relevante. FIT system no reemplaza el asesoramiento contable, impositivo, jurídico ni profesional que pueda requerir el cliente.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">9. Datos personales y confidencialidad</h2>
          <p>El tratamiento de datos personales se describe en la <Link href="/privacidad" className="text-primary-light underline">Política de privacidad</Link>. En general, el gimnasio determina los fines del tratamiento de los datos de sus socios y FIT system puede procesarlos por cuenta del gimnasio para prestar el servicio. Las partes deberán respetar la Ley 25.326 y las demás normas aplicables. Ninguna de las partes debe acceder, divulgar o utilizar información confidencial para fines ajenos al servicio o a una obligación legal.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">10. Soporte, mantenimiento y actualizaciones</h2>
          <p>Los canales de contacto son {contact} y {support}. El alcance del soporte, horario de atención, tiempos objetivo y tareas de mantenimiento son los incluidos en la oferta aceptada. Salvo acuerdo expreso, no se garantiza disponibilidad ininterrumpida ni un tiempo de resolución específico. Las actualizaciones pueden incorporar correcciones, mejoras, cambios de compatibilidad o ajustes de seguridad.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">11. Copias de seguridad y continuidad operativa</h2>
          <p>El cliente debe mantener copias de seguridad periódicas y verificar que pueda restaurarlas. Las copias de respaldo que pudiera mantener un proveedor de infraestructura no sustituyen una exportación independiente de los datos del gimnasio. La operación local puede ayudar a continuar ciertas tareas sin internet, pero las funciones online, la app de socios, el portal docente y las integraciones remotas pueden quedar temporalmente indisponibles.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">12. Propiedad intelectual</h2>
          <p>El software, su diseño, marcas, documentación y demás elementos protegidos pertenecen a sus respectivos titulares. La contratación concede únicamente los derechos de uso expresamente previstos. El cliente conserva los derechos que le correspondan sobre los datos que incorpora al sistema.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">13. Disponibilidad y responsabilidad</h2>
          <p>Trabajamos para mantener el software operativo y seguro, pero pueden existir interrupciones por mantenimiento, conectividad, fallas de equipos, proveedores externos o circunstancias fuera de nuestro control. El cliente debe contar con procedimientos alternativos para tareas críticas. Nada de lo dispuesto en estos términos excluye o limita responsabilidades que legalmente no puedan excluirse, ni los derechos irrenunciables de consumidores cuando resulten aplicables.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">14. Modificaciones de los términos</h2>
          <p>Podremos actualizar estos términos para reflejar cambios del servicio o de la normativa. Publicaremos la versión vigente en esta página e indicaremos la fecha de actualización. Los cambios que afecten de manera sustancial una contratación en curso se comunicarán por un medio adecuado y no se aplicarán retroactivamente en perjuicio de derechos adquiridos, salvo exigencia legal.</p>

          <h2 className="pt-4 text-xl font-semibold text-text">15. Ley aplicable y contacto</h2>
          <p>Estos términos se interpretan conforme a las leyes de la República Argentina, sin perjuicio de las normas imperativas que correspondan y de la jurisdicción que legalmente resulte aplicable. Para consultas comerciales escribí a <a className="text-primary-light hover:underline" href={`mailto:${contact}`}>{contact}</a>; para soporte, a <a className="text-primary-light hover:underline" href={`mailto:${support}`}>{support}</a>.</p>
        </section>
      </article>
    </main>
  );
}
