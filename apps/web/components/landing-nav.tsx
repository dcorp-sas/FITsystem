'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/icon';

const LINKS = [
  { href: '#producto', label: 'Producto' },
  { href: '#modulos', label: 'Módulos' },
  { href: '#planes', label: 'Planes' },
  { href: '#descargas', label: 'Descargas' },
  { href: '#faq', label: 'Preguntas' },
  { href: '#contacto', label: 'Contacto' },
];

export function LandingNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line/80 bg-base/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="#inicio" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="FIT System" className="h-9 w-9 rounded-xl object-cover" />
          <span className="text-base font-bold tracking-tight text-text">FIT System</span>
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-text-muted transition-colors hover:text-text"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/login"
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-alt"
          >
            Iniciar sesión
          </Link>
          <a
            href="#contacto"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
          >
            Pedir demo
          </a>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Abrir menú"
          className="rounded-lg border border-line p-2 text-text md:hidden"
        >
          <Icon name={open ? 'close' : 'menu'} size={20} />
        </button>
      </div>

      {open && (
        <div className="border-t border-line bg-base px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-1">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-text-muted transition-colors hover:bg-surface-alt hover:text-text"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-3 flex flex-col gap-2">
            <Link
              href="/login"
              className="rounded-lg border border-line px-4 py-2.5 text-center text-sm font-medium text-text transition-colors hover:bg-surface-alt"
            >
              Iniciar sesión
            </Link>
            <a
              href="#contacto"
              onClick={() => setOpen(false)}
              className="rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-primary-dark"
            >
              Pedir demo
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
