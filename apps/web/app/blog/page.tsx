import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Guías para administrar un gimnasio | Blog FIT system',
  description: 'Consejos prácticos para ordenar las cuotas, reducir la morosidad y organizar la administración de tu gimnasio.',
  alternates: { canonical: '/blog' },
};

export default function BlogPage() {
  return <main id="contenido" className="min-h-screen bg-base px-4 py-12 text-text sm:px-6 lg:px-8">
    <div className="mx-auto max-w-4xl">
      <Link href="/" className="text-sm text-primary-light hover:underline">← FIT system</Link>
      <header className="mt-8 rounded-3xl border border-line bg-gradient-to-br from-primary/15 via-surface to-base p-7 sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-light">Recursos</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">Guías prácticas para gestionar tu gimnasio</h1>
        <p className="mt-5 text-base leading-7 text-text-muted">Ideas para ordenar la administración, mejorar el seguimiento de cuotas y elegir herramientas de gestión con expectativas realistas.</p>
      </header>

      <article className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <h2 className="text-2xl font-semibold">Cómo reducir la morosidad en un gimnasio</h2>
        <p className="mt-4 text-sm leading-7 text-text-muted">El primer paso para reducir las cuotas impagas es contar con un padrón actualizado. Revisá que cada socio tenga un plan vigente, una fecha de vencimiento correcta y un medio de contacto válido. Cuando la información está distribuida en varias planillas, resulta más difícil detectar patrones y dar seguimiento a tiempo.</p>
        <p className="mt-3 text-sm leading-7 text-text-muted">Definí una rutina semanal para revisar vencimientos y deudas. Los recordatorios deben ser claros, respetuosos y enviados al contacto correcto. Evitá mensajes masivos con datos de deuda visibles para otros socios. Registrá los acuerdos de pago y confirmá los cobros antes de marcar una cuota como saldada.</p>
        <p className="mt-3 text-sm leading-7 text-text-muted">Medí el resultado con indicadores consistentes: porcentaje de cuotas vencidas, días promedio de atraso y renovaciones realizadas antes del vencimiento. Compará períodos equivalentes y no atribuyas una mejora a una sola acción si también cambiaron precios, horarios o membresías. Un software de gestión puede ayudar a centralizar el seguimiento, pero las reglas comerciales y la atención del equipo siguen siendo esenciales.</p>
      </article>

      <article className="mt-5 rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <h2 className="text-2xl font-semibold">Cómo organizar las cuotas y membresías</h2>
        <p className="mt-4 text-sm leading-7 text-text-muted">Empezá por definir pocos planes fáciles de explicar. Cada plan debería indicar precio, duración, fecha de inicio, reglas de congelamiento, qué actividades incluye y cómo se renueva. Si existen excepciones, documentalas para que recepción y administración apliquen los mismos criterios.</p>
        <p className="mt-3 text-sm leading-7 text-text-muted">Separá la fecha de cobro del período que cubre la membresía cuando sean conceptos distintos. Revisá cómo se registran los pagos parciales, los reintegros y los pases diarios. Al cerrar la caja, conciliá los movimientos del sistema con el efectivo, las transferencias y los proveedores de pagos. Una diferencia debe investigarse antes de cerrar el período.</p>
        <p className="mt-3 text-sm leading-7 text-text-muted">Si migrás desde Excel, limpiá los duplicados, unificá formatos de fecha y revisá las filas sin socio asociado. Probá la importación con una muestra anonimizada y conservá el archivo original como respaldo. Para controlar el acceso a la información, asigná permisos según la tarea y evitá compartir una cuenta entre todas las personas del gimnasio.</p>
      </article>

      <article className="mt-5 rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <h2 className="text-2xl font-semibold">Qué evaluar antes de contratar un software para gimnasios</h2>
        <p className="mt-4 text-sm leading-7 text-text-muted">No compares únicamente el precio mensual. Revisá qué funciones están incluidas, cuántos socios pueden usar la app, qué soporte ofrece cada plan y qué sucede al vencer una licencia. Preguntá cómo exportar los datos, cómo se hacen los respaldos y qué procedimiento se sigue si se rompe la computadora principal.</p>
        <p className="mt-3 text-sm leading-7 text-text-muted">Probá los flujos que el gimnasio utiliza todos los días: alta de socio, renovación, cobro, cierre de caja, registro de asistencia y consulta de reportes. Si usás MercadoPago, confirmá a qué cuenta se acreditan los fondos, qué comisiones se aplican y cómo se verifica un pago pendiente. Si necesitás torniquetes, huelleros o lectores especiales, comprobá el modelo exacto antes de comprar hardware.</p>
        <p className="mt-3 text-sm leading-7 text-text-muted">También evaluá la conectividad. Un escritorio que funciona localmente puede seguir con algunas tareas cuando se corta Internet, pero la app móvil y los pagos online necesitan conexión. Documentá ese límite y prepará un procedimiento alternativo. <Link href="/software-para-gimnasios" className="text-primary-light underline">Conocé el enfoque de FIT system</Link> y consultá las condiciones antes de contratar.</p>
      </article>

      <div className="mt-8 rounded-2xl border border-line bg-surface p-6">
        <h2 className="text-xl font-semibold">Más información</h2>
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <Link href="/control-de-socios-y-cuotas" className="text-primary-light hover:underline">Control de socios y cuotas</Link>
          <Link href="/cobros-mercadopago-gimnasios" className="text-primary-light hover:underline">Cobros con MercadoPago</Link>
          <Link href="/gimnasio-sin-internet" className="text-primary-light hover:underline">Operación sin Internet</Link>
          <Link href="/#contacto" className="text-primary-light hover:underline">Contactar a FIT system</Link>
        </div>
      </div>
    </div>
  </main>;
}
