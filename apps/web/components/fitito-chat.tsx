'use client';

import { useState, type FormEvent } from 'react';
import { Icon } from '@/components/icon';

type Message = { from: 'fitito' | 'user'; text: string };

const topics = [
  { label: 'Instalación', keys: ['instal', 'descarg', 'windows', 'pc'], text: 'Te acompaño con la instalación de FIT System en la PC del gimnasio. Descargá el instalador desde la web y seguí los pasos. Si aparece un error, mandanos el mensaje exacto a soporte@fitsystem.com.ar.' },
  { label: 'Clases y agenda', keys: ['clase', 'clases', 'agenda', 'sesion', 'sesión', 'horario', 'programar', 'profesor', 'profe', 'portal docente', 'portal de profesores'], text: 'Las clases y las sesiones programadas se gestionan desde Operación → Clases en FIT System. El portal de profesores tiene una interfaz propia, pero comparte los datos: las clases creadas y las sesiones programadas en el sistema deben aparecer allí, y las sesiones creadas desde Profes deben guardarse en el mismo sistema. Si no ves una clase, comprobá que corresponda a la misma sede y que el usuario tenga acceso.' },
  { label: 'Portal de profesores', keys: ['portal de profesor', 'portal profesores', 'portal docente', 'profes.fitsystem', 'profesores'], text: 'El portal de profesores es una interfaz separada para consultar clases, ver la agenda, programar sesiones, revisar inscriptos y trabajar con rutinas. No es otro sistema independiente: utiliza los datos compartidos de FIT System. El acceso a cada información depende del usuario y la sede asignada.' },
  { label: 'Rutinas', keys: ['rutina', 'rutinas', 'ejercicio', 'ejercicios', 'series', 'repeticiones', 'descanso', 'entrenamiento'], text: 'Las rutinas se administran desde App móvil → Rutinas y también desde el portal de profesores. Se pueden editar los días, ejercicios, series, repeticiones y descansos. Las rutinas asignadas se guardan en el backend compartido para que estén disponibles en la app del socio. Si un cambio no aparece, actualizá la vista y verificá que la rutina esté activa y asignada al socio correcto.' },
  { label: 'QR de ingreso', keys: ['qr', 'código qr', 'codigo qr', 'ingreso', 'asistencia', 'monitor', 'pantalla'], text: 'El QR de ingreso puede mostrarse en una ventana independiente para dejarlo visible en un monitor, sin ocupar la pantalla principal del panel. Es una opción manual: no reemplaza la pantalla habitual ni se abre automáticamente. Si no encontrás la opción, escribí a soporte@fitsystem.com.ar indicando la versión del sistema.' },
  { label: 'Socios y app', keys: ['socio', 'cupo', 'límite', 'limite', 'app móvil', 'app movil', 'aplicación móvil', 'aplicacion movil'], text: 'La app móvil está vinculada a los datos de FIT System. Los socios pueden consultar el contenido que el gimnasio tenga habilitado, incluidas las rutinas que les fueron asignadas. El cupo de la app corresponde a los socios habilitados para usarla; no limita las fichas que administrás desde el escritorio. Para consultar opciones comerciales, escribí a ventas@fitsystem.com.ar.' },
  { label: 'Licencia', keys: ['licencia', 'clave', 'activar', 'venc'], text: 'La licencia se activa desde Configuración → Licencia. Si ya pagaste y no recibiste la clave, revisá el correo no deseado y escribí a soporte@fitsystem.com.ar con la referencia de compra.' },
  { label: 'Cobros', keys: ['cobro', 'pago', 'mercadopago', 'mercado pago', 'cuota'], text: 'Podés registrar cobros en efectivo, transferencia y MercadoPago, según la configuración. Si un pago online no aparece, verificá su estado antes de intentar cobrarlo otra vez.' },
  { label: 'Usuarios', keys: ['contraseña', 'contrasena', 'usuario', 'admin', 'rol', 'permiso'], text: 'Los usuarios y permisos se administran dentro del sistema del gimnasio. Cambiá las credenciales iniciales antes de trabajar con datos reales y asigná a cada persona solo los permisos que necesita.' },
  { label: 'Copias de seguridad', keys: ['backup', 'respaldo', 'copia', 'restaur'], text: 'Te recomendamos guardar copias de seguridad fuera de la PC y comprobar que puedan restaurarse. Antes de restaurar una copia en producción, consultá soporte para evitar sobrescribir datos recientes.' },
];

function answer(query: string) {
  const q = query.toLocaleLowerCase('es-AR');
  return topics.find((topic) => topic.keys.some((key) => q.includes(key)))?.text
    ?? 'No tengo esa respuesta confirmada todavía, pero te puedo orientar. Escribí a soporte@fitsystem.com.ar y el equipo te ayuda a resolverlo.';
}

function Avatar({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dimension = size === 'lg' ? 'h-14 w-14' : size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  return (
    <div className={`relative flex ${dimension} shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white/80 bg-gradient-to-br from-cyan-300 via-sky-500 to-blue-700 shadow-md`} aria-label="Avatar de FITito" role="img">
      <svg viewBox="0 0 48 48" className="h-full w-full" aria-hidden="true">
        <path d="M10 20 7 10l12 5M38 20l3-10-12 5" fill="#f8fafc" stroke="#0f2747" strokeWidth="2" strokeLinejoin="round"/>
        <path d="M10 22c0-9 6-14 14-14s14 5 14 14v9c0 8-6 12-14 12S10 39 10 31z" fill="#f8fafc" stroke="#0f2747" strokeWidth="2"/>
        <path d="M14 23c2-4 6-6 10-6s8 2 10 6" fill="none" stroke="#93c5fd" strokeWidth="3" strokeLinecap="round"/>
        <ellipse cx="18" cy="28" rx="3" ry="4" fill="#0f2747"/><ellipse cx="30" cy="28" rx="3" ry="4" fill="#0f2747"/>
        <circle cx="19" cy="27" r="1" fill="white"/><circle cx="31" cy="27" r="1" fill="white"/>
        <path d="M18 35c3 4 9 4 12 0" fill="none" stroke="#0f2747" strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M17 5h14" stroke="#facc15" strokeWidth="3" strokeLinecap="round"/>
      </svg>
      <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
    </div>
  );
}

export function FititoChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { from: 'fitito', text: '¡Hola! 👋 Soy FITito, el asistente de FIT System.' },
    { from: 'fitito', text: 'Puedo orientarte con clases y agenda, el portal de profesores, rutinas conectadas con la app del socio, el QR de ingreso, licencias y el uso diario del sistema. ¿Qué necesitás resolver?' },
  ]);

  function send(raw: string) {
    const q = raw.trim();
    if (!q) return;
    setMessages((old) => [...old, { from: 'user', text: q }, { from: 'fitito', text: answer(q) }]);
    setInput('');
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    send(input);
  }

  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col items-end">
      {open && (
        <section aria-label="Chat con FITito" className="mb-3 flex h-[min(560px,78vh)] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl shadow-black/25">
          <header className="flex items-center gap-3 bg-gradient-to-r from-slate-950 to-blue-900 px-4 py-4 text-white">
            <Avatar size="lg" />
            <div className="min-w-0 flex-1">
              <p className="font-bold tracking-wide">FITito</p>
              <p className="text-xs text-blue-100">Tu asistente de FIT System</p>
              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-200"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />Listo para ayudarte</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar FITito" className="rounded-full p-2 text-white/80 transition hover:bg-white/10 hover:text-white"><Icon name="close" /></button>
          </header>
          <div aria-live="polite" className="flex-1 space-y-4 overflow-y-auto bg-base/50 p-4">
            <div className="text-center text-[11px] text-text-muted">Asistente FIT System</div>
            {messages.map((message, index) => (
              <div key={index} className={`flex items-end gap-2 ${message.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                {message.from === 'fitito' && <Avatar size="sm" />}
                <p className={`max-w-[82%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${message.from === 'user' ? 'rounded-br-md bg-primary text-white' : 'rounded-bl-md border border-line bg-surface text-text shadow-sm'}`}>{message.text}</p>
              </div>
            ))}
            {messages.length === 2 && (
              <div className="flex flex-wrap gap-2 pl-10">
                {topics.slice(0, 6).map((topic) => <button key={topic.label} type="button" onClick={() => send(topic.label)} className="rounded-full border border-primary/30 bg-surface px-3 py-2 text-xs font-medium text-text transition hover:border-primary hover:bg-primary/5">{topic.label}</button>)}
              </div>
            )}
          </div>
          <form onSubmit={submit} className="flex gap-2 border-t border-line bg-surface p-3">
            <input value={input} onChange={(e) => setInput(e.target.value)} aria-label="Escribí tu mensaje para FITito" placeholder="Escribile a FITito…" className="min-w-0 flex-1 rounded-xl border border-line bg-base px-3 py-2.5 text-sm text-text outline-none focus:border-primary" />
            <button type="submit" aria-label="Enviar mensaje" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition hover:opacity-90"><Icon name="mail" /></button>
          </form>
        </section>
      )}
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={open ? 'Cerrar FITito' : 'Hablar con FITito'} className="group inline-flex h-14 items-center gap-3 rounded-full border border-white/80 bg-surface py-1 pl-1.5 pr-5 text-sm font-semibold text-text shadow-xl shadow-black/20 transition hover:-translate-y-0.5 hover:shadow-2xl">
        <span className="relative"><Avatar /><span className="absolute -right-1 -top-1 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-white">FIT</span></span>
        <span className="text-left"><span className="block">FITito</span><span className="block text-[10px] font-normal text-text-muted">¿Te ayudo?</span></span>
      </button>
    </div>
  );
}
