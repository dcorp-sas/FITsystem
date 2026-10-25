'use client';

import { useEffect, useState } from 'react';
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
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled ? 'border-b border-line/70 glass' : 'border-b border-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="#inicio" className="group flex items-center gap-3">
          <span className="relative flex h-9 w-9 items-center justify-center">
            <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary to-sky opacity-70 blur-[6px] transition-opacity group-hover:opacity-100" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="FIT system™" className="relative h-9 w-9 rounded-xl object-cover" />
          </span>
          <span className="text-base font-bold tracking-tight text-text">
            FIT<span className="text-text-muted"> system</span>
            <span className="align-super text-[10px] text-text-muted">™</span>
          </span>
        </a>

        <nav className="hidden items-center gap-7 lg:flex">
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

        <div className="hidden items-center gap-2 md:flex">
          <a
            href="#descargas"
            className="rounded-lg px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:text-text"
          >
            Probar gratis
          </a>
          <a
            href="#contacto"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-lg shadow-primary/25 transition-colors hover:bg-primary-dark"
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
        <div className="border-t border-line glass px-4 py-4 md:hidden">
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
