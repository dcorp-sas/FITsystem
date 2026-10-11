'use client';

import { cn } from '@fitsystem/ui';
import {
  useEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

// ---------------------------------------------------------------- Spinner
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent',
        className,
      )}
    />
  );
}

// ---------------------------------------------------------------- Button
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

const BTN_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-dark',
  secondary: 'bg-surface-alt text-text hover:bg-line',
  ghost: 'bg-transparent text-text-muted hover:bg-surface-alt hover:text-text',
  danger: 'bg-danger/15 text-danger hover:bg-danger/25 border border-danger/30',
  success: 'bg-success/15 text-success hover:bg-success/25 border border-success/30',
};

const BTN_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        BTN_VARIANTS[variant],
        BTN_SIZES[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- Fields
export function Field({ label, children, className, hint }: { label: string; children: ReactNode; className?: string; hint?: string }) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-xs font-medium text-text-muted">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-text-muted/70">{hint}</span>}
    </label>
  );
}

const FIELD_BASE =
  'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-text placeholder:text-text-muted/50 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(FIELD_BASE, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(FIELD_BASE, 'min-h-24 resize-y', className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(FIELD_BASE, 'appearance-none pr-8', className)} {...props}>
      {children}
    </select>
  );
}

// ---------------------------------------------------------------- Card
export function Card({
  title,
  action,
  children,
  className,
  padded = true,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div className={cn('rounded-xl border border-line bg-surface', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="text-sm font-semibold text-text">{title}</div>
          {action}
        </div>
      )}
      <div className={padded ? 'p-4' : undefined}>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------- Badge
const BADGE_COLORS: Record<string, string> = {
  green: 'bg-success/15 text-success border-success/30',
  red: 'bg-danger/15 text-danger border-danger/30',
  yellow: 'bg-warning/15 text-warning border-warning/30',
  blue: 'bg-primary/15 text-primary-light border-primary/30',
  sky: 'bg-sky/15 text-sky border-sky/30',
  gray: 'bg-surface-alt text-text-muted border-line',
};

export function Badge({ color = 'gray', children }: { color?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        BADGE_COLORS[color] || BADGE_COLORS.gray,
      )}
    >
      {children}
    </span>
  );
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    ACTIVE: 'green',
    COMPLETED: 'green',
    ALLOWED: 'green',
    OPERATIONAL: 'green',
    RESERVED: 'green',
    OPEN: 'yellow',
    IN_PROGRESS: 'blue',
    SENT: 'blue',
    PENDING: 'yellow',
    FROZEN: 'sky',
    EXPIRED: 'red',
    CANCELLED: 'red',
    SUSPENDED: 'red',
    INACTIVE: 'gray',
    OUT_OF_SERVICE: 'red',
    FAILED: 'red',
    LOW: 'green',
    MEDIUM: 'yellow',
    HIGH: 'red',
    DONE: 'green',
    WAITLIST: 'gray',
    NO_SHOW: 'red',
    MAINTENANCE: 'yellow',
    RETIRED: 'gray',
    REFUNDED: 'gray',
  };
  return map[status] || 'gray';
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge color={statusColor(status)}>{label ?? status}</Badge>;
}

// ---------------------------------------------------------------- Modal
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto p-4 pt-16">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          'relative z-10 w-full rounded-xl border border-line bg-surface shadow-2xl',
          sizes[size],
        )}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="text-base font-semibold text-text">{title}</div>
          <button
            onClick={onClose}
            className="rounded p-1 text-text-muted transition hover:bg-surface-alt hover:text-text"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Page header
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-text">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------- Stat card
export function StatCard({
  label,
  value,
  hint,
  accent = 'blue',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: 'blue' | 'green' | 'yellow' | 'red' | 'sky';
}) {
  const accents = {
    blue: 'border-primary/30 bg-primary/10 text-primary-light',
    green: 'border-success/30 bg-success/10 text-success',
    yellow: 'border-warning/30 bg-warning/10 text-warning',
    red: 'border-danger/30 bg-danger/10 text-danger',
    sky: 'border-sky/30 bg-sky/10 text-sky',
  };
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="text-xs font-medium text-text-muted">{label}</div>
      <div className="mt-2 text-2xl font-bold text-text">{value}</div>
      {hint && (
        <div className={cn('mt-2 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium', accents[accent])}>
          {hint}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Table
export function Table({
  head,
  children,
  empty,
  className,
}: {
  head: ReactNode[];
  children: ReactNode;
  empty?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('overflow-x-auto rounded-xl border border-line bg-surface', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-surface-alt/60 text-left text-xs uppercase tracking-wide text-text-muted">
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
      {!children && (
        <div className="flex items-center justify-center gap-2 border-t border-line p-8 text-sm text-text-muted">
          {empty ?? 'Sin datos'}
        </div>
      )}
    </div>
  );
}

export function EmptyState({ icon = '📭', message = 'Sin datos', action }: { icon?: string; message?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
      <div className="text-3xl">{icon}</div>
      <div className="text-sm text-text-muted">{message}</div>
      {action}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <svg
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" strokeLinecap="round" />
      </svg>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-9" />
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">{children}</h2>;
}