'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@fitsystem/ui';
import { useAuth } from '@/lib/auth';
import { Icon, type IconName } from './icon';

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  adminOnly?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    title: 'Principal',
    items: [
      { href: '/dashboard', label: 'Panel', icon: 'dashboard' },
      { href: '/reports', label: 'Reportes', icon: 'reports' },
    ],
  },
  {
    title: 'Socios',
    items: [
      { href: '/members', label: 'Socios', icon: 'members' },
      { href: '/memberships', label: 'Membresías', icon: 'memberships' },
      { href: '/plans', label: 'Planes', icon: 'plans' },
      { href: '/attendance', label: 'Asistencia', icon: 'attendance' },
      { href: '/import', label: 'Importar socios', icon: 'import' },
    ],
  },
  {
    title: 'Finanzas',
    items: [
      { href: '/charge', label: 'Cobrar', icon: 'card' },
      { href: '/payments', label: 'Pagos', icon: 'payments' },
      { href: '/cash', label: 'Caja', icon: 'cash' },
      { href: '/shop', label: 'Minishop', icon: 'shop' },
      { href: '/products', label: 'Inventario', icon: 'products' },
    ],
  },
  {
    title: 'Operación',
    items: [
      { href: '/classes', label: 'Clases', icon: 'classes' },
      { href: '/instructors', label: 'Profesores', icon: 'instructors' },
      { href: '/equipment', label: 'Equipamiento', icon: 'equipment' },
      { href: '/notifications', label: 'Notificaciones', icon: 'notifications' },
    ],
  },
  {
    title: 'App móvil',
    items: [
      { href: '/portal', label: 'Socios de la app', icon: 'mobile', adminOnly: true },
      { href: '/routines', label: 'Rutinas', icon: 'routines' },
      { href: '/news', label: 'Novedades', icon: 'news' },
      { href: '/license', label: 'Licencia', icon: 'license', adminOnly: true },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { href: '/users', label: 'Usuarios', icon: 'users', adminOnly: true },
      { href: '/branches', label: 'Sedes', icon: 'branches', adminOnly: true },
      { href: '/settings', label: 'Configuración', icon: 'settings', adminOnly: true },
      { href: '/activity', label: 'Auditoría', icon: 'activity', adminOnly: true },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, organization, logout, branches, activeBranchId, setActiveBranchId } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const isAdmin = user ? user.role === 'OWNER' || user.role === 'ADMIN' : false;

  const content = (
    <div className="flex h-full w-64 flex-col border-r border-line bg-surface">
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="FIT system™" className="h-9 w-9 rounded-lg object-cover" />
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-text">FIT system™</div>
          <div className="truncate text-[11px] text-text-muted">{organization?.name || 'Gestión'}</div>
        </div>
      </div>

      {branches.length > 1 && (
        <div className="border-b border-line px-4 py-3">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-text-muted">Sede activa</label>
          <select
            value={activeBranchId ?? ''}
            onChange={(e) => setActiveBranchId(e.target.value || null)}
            className="w-full rounded-lg border border-line bg-surface-alt px-2 py-1.5 text-xs text-text outline-none focus:border-primary"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <nav className="flex-1 space-y-2 overflow-y-auto px-3 py-4">
        {GROUPS.map((group) => {
          const items = group.items.filter((i) => !i.adminOnly || isAdmin);
          if (!items.length) return null;
          const activeGroup = items.some((i) => pathname === i.href || pathname.startsWith(i.href + '/'));
          const expanded = openGroups[group.title] ?? activeGroup;
          return (
            <div key={group.title}>
              <button
                type="button"
                onClick={() => setOpenGroups((prev) => ({ ...prev, [group.title]: !expanded }))}
                className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted/70 transition-colors hover:text-text"
              >
                {group.title}
                <Icon
                  name="chevron"
                  size={14}
                  className={'transition-transform ' + (expanded ? '' : '-rotate-90')}
                />
              </button>
              {expanded && (
                <div className="mt-1 space-y-0.5">
                  {items.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(item.href + '/');
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                          active
                            ? 'bg-primary/15 font-medium text-primary-light'
                            : 'text-text-muted hover:bg-surface-alt hover:text-text',
                        )}
                      >
                        <Icon name={item.icon} size={17} />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-line p-3">
        <div className="mb-2 flex items-center gap-2 rounded-lg px-2 py-1.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary-light">
            {user?.name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium text-text">{user?.name}</div>
            <div className="truncate text-[10px] text-text-muted">{user?.email}</div>
          </div>
        </div>
        <Link
          href="/profile/password"
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-text-muted transition-colors hover:bg-surface-alt hover:text-text"
        >
          <Icon name="settings" size={15} />
          Cambiar contraseña
        </Link>
        <button
          onClick={logout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-muted transition-colors hover:bg-danger/10 hover:text-danger"
        >
          <Icon name="logout" size={17} />
          Cerrar sesión
        </button>
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-40 rounded-lg border border-line bg-surface p-2 text-text lg:hidden"
        aria-label="Abrir menú"
      >
        <Icon name="menu" size={20} />
      </button>

      <aside className="hidden lg:block">{content}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full">{content}</div>
        </div>
      )}
    </>
  );
}