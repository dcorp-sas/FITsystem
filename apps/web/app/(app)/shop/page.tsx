'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import { formatMoney, formatDateTime } from '@fitsystem/utils';
import { PAYMENT_METHOD_LABELS } from '@/lib/labels';
import type { Member, Product, Sale } from '@/lib/types';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  SearchInput,
  Select,
  Spinner,
  Table,
} from '@/components/ui';
import { Icon } from '@/components/icon';

interface CartLine {
  product: Product;
  quantity: number;
}

export default function ShopPage() {
  const toast = useToast();
  const { branches, activeBranchId, organization } = useAuth();
  const currency = organization?.currency || 'ARS';
  const branchId = activeBranchId || branches[0]?.id || '';

  const [products, setProducts] = useState<Product[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [memberId, setMemberId] = useState('');
  const [method, setMethod] = useState('CASH');
  const [discount, setDiscount] = useState('');
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [productsRes, membersRes, salesRes] = await Promise.all([
        http.get<{ items: Product[] }>('/products'),
        http.get<{ items: Member[] }>('/members', { pageSize: 200 }),
        http.get<{ items: Sale[] }>('/sales', { pageSize: 10 }),
      ]);
      setProducts(productsRes.items.filter((p) => p.isActive));
      setMembers(membersRes.items);
      setSales(salesRes.items);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al cargar el minishop');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () => products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku ?? '').toLowerCase().includes(search.toLowerCase())),
    [products, search],
  );

  const subtotal = cart.reduce((s, l) => s + l.product.price * l.quantity, 0);
  const total = Math.max(0, subtotal - Number(discount || 0));

  function addToCart(product: Product) {
    setCart((c) => {
      const existing = c.find((l) => l.product.id === product.id);
      if (existing) return c.map((l) => (l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...c, { product, quantity: 1 }];
    });
  }

  function setQty(id: string, qty: number) {
    setCart((c) =>
      c
        .map((l) => (l.product.id === id ? { ...l, quantity: Math.max(0, qty) } : l))
        .filter((l) => l.quantity > 0),
    );
  }

  async function checkout() {
    if (!cart.length) return;
    setChecking(true);
    try {
      await http.post('/sales', {
        branchId,
        memberId: memberId || null,
        method,
        discount: Number(discount || 0),
        items: cart.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
      });
      toast.success('Venta registrada');
      setCart([]);
      setDiscount('');
      setMemberId('');
      load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al registrar la venta');
    } finally {
      setChecking(false);
    }
  }

  if (loading && !products.length) {
    return (
      <div className="flex justify-center py-24 text-text-muted">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Minishop" subtitle="Punto de venta" />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Buscar producto..." />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                disabled={p.stock <= 0}
                className="rounded-xl border border-line bg-surface p-3 text-left transition hover:border-primary/50 hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-40"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text">{p.name}</span>
                  {p.stock <= 0 && <span className="text-[10px] text-danger">sin stock</span>}
                </div>
                {p.category && <div className="text-[11px] text-text-muted">{p.category.name}</div>}
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-semibold text-primary-light">{formatMoney(p.price, currency)}</span>
                  <span className="text-[11px] text-text-muted">stock {p.stock}</span>
                </div>
              </button>
            ))}
            {!filtered.length && <div className="col-span-full"><EmptyState icon="🛒" message="Sin productos" /></div>}
          </div>

          <Card title="Últimas ventas" className="mt-5" padded={false}>
            <Table head={['N°', 'Cliente', 'Ítems', 'Total', 'Fecha']} empty="Sin ventas">
              {sales.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 font-mono text-xs">{s.number}</td>
                  <td className="px-4 py-3 text-text">{s.member ? `${s.member.firstName} ${s.member.lastName}` : '—'}</td>
                  <td className="px-4 py-3 text-xs text-text-muted">{s.items.map((i) => `${i.name} x${i.quantity}`).join(', ')}</td>
                  <td className="px-4 py-3 font-medium text-text">{formatMoney(s.total, currency)}</td>
                  <td className="px-4 py-3 text-xs text-text-muted">{formatDateTime(s.createdAt)}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>

        <div>
          <Card title="Carrito" className="sticky top-6">
            {!cart.length ? (
              <EmptyState icon="🧺" message="Agregá productos" />
            ) : (
              <div className="space-y-2">
                {cart.map((l) => (
                  <div key={l.product.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-alt/40 p-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-text">{l.product.name}</div>
                      <div className="text-[11px] text-text-muted">{formatMoney(l.product.price, currency)}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="secondary" onClick={() => setQty(l.product.id, l.quantity - 1)}>
                        −
                      </Button>
                      <span className="w-6 text-center text-sm">{l.quantity}</span>
                      <Button size="sm" variant="secondary" onClick={() => setQty(l.product.id, l.quantity + 1)}>
                        +
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 space-y-3">
              <Field label="Cliente (opcional)">
                <Select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                  <option value="">Consumidor final</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.firstName} {m.lastName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Medio de pago">
                <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Descuento">
                <Input type="number" step="0.01" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0.00" />
              </Field>
            </div>

            <div className="mt-4 space-y-1 border-t border-line pt-4 text-sm">
              <div className="flex justify-between text-text-muted">
                <span>Subtotal</span>
                <span>{formatMoney(subtotal, currency)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold text-text">
                <span>Total</span>
                <span>{formatMoney(total, currency)}</span>
              </div>
            </div>

            <Button className="mt-4 w-full" size="lg" onClick={checkout} loading={checking} disabled={!cart.length}>
              <Icon name="check" size={16} /> Cobrar
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}