'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { http } from '@/lib/api';

interface ChecklistItem {
  key: string;
  title: string;
  description: string;
  done: boolean;
  hint?: string;
}

const LOOKUP: Record<string, string> = {
  mercadopago: '/settings',
  arca: '/settings',
  arcaCert: '/settings',
  whatsapp: '/settings',
  printer: '/settings',
  plan: '/plans',
  member: '/members',
  payment: '/payments',
};

export function OnboardingChecklist() {
  const [items, setItems] = useState<ChecklistItem[] | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    http
      .get<{ items: ChecklistItem[]; progress: number }>('/onboarding')
      .then((data) => setItems(data.items))
      .catch(() => setItems([]));
  }, []);

  if (!items || items.length === 0) return null;
  const done = items.filter((i) => i.done).length;
  if (done === items.length) return null;
  const pct = Math.round((done / items.length) * 100);

  return (
    <div className="mb-5 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-text">Puesta en marcha</span>
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary-light">
            {done}/{items.length}
          </span>
        </div>
        <button onClick={() => setCollapsed((c) => !c)} className="text-xs font-medium text-primary hover:underline">
          {collapsed ? 'Mostrar' : 'Ocultar'}
        </button>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-alt">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      {!collapsed && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Link
              key={item.key}
              href={LOOKUP[item.key] ?? '/'}
              className="flex items-start gap-2 rounded-lg border border-line bg-surface p-3 transition hover:border-primary/40"
            >
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                  item.done ? 'border-success bg-success text-white' : 'border-line'
                }`}
              >
                {item.done ? '✓' : ''}
              </span>
              <span>
                <span className={`block text-sm font-medium ${item.done ? 'text-text-muted line-through' : 'text-text'}`}>
                  {item.title}
                </span>
                <span className="block text-[11px] text-text-muted">{item.description}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default OnboardingChecklist;
