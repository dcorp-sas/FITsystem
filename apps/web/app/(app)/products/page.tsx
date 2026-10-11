'use client';

import { useCallback, useEffect, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import { formatMoney } from '@fitsystem/utils';
import type { Product, ProductCategory } from '@/lib/types';
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  Spinner,
  StatCard,
  Table,
  Textarea,
} from '@/components/ui';
import { Icon } from '@/components/icon';

interface Stats {
  outOfStock: number;
  lowStock: number;
  inventoryValue: number;
  potentialValue: number;
}

export default function ProductsPage() {
  const toast = useToast();
  const { organization } = useAuth();
  const currency = organization?.currency || 'ARS';

  const [items, setItems] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [stockFor, setStockFor] = useState<Product | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [newCategory, setNewCategory] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, cats] = await Promise.all([
        http.get<{ items: Product[]; stats: Stats }>('/products', { search, lowStock: lowStock ? '1' : '' }),
        http.get<ProductCategory[]>('/products/categories'),
      ]);
      setItems(res.items);
      setStats(res.stats);
      setCategories(cats);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al cargar productos');
    } finally {
      setLoading(false);
    }
  }, [search, lowStock, toast]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function createCategory() {
    if (!newCategory.trim()) return;
    try {
      await http.post('/products/categories', { name: newCategory.trim() });
      toast.success('Categoría creada');
      setNewCategory('');
      setCategoryOpen(false);
      load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error');
    }
  }

  return (
    <div>
      <PageHeader
        title="Inventario"
        subtitle="Productos y stock"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setCategoryOpen(true)}>
              <Icon name="plus" size={16} /> Categoría
            </Button>
            <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Icon name="plus" size={16} /> Nuevo producto
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Valor de inventario (costo)" value={formatMoney(stats?.inventoryValue ?? 0, currency)} accent="blue" />
        <StatCard label="Valor potencial (venta)" value={formatMoney(stats?.potentialValue ?? 0, currency)} accent="green" />
        <StatCard label="Stock bajo" value={stats?.lowStock ?? 0} accent="yellow" />
        <StatCard label="Sin stock" value={stats?.outOfStock ?? 0} accent="red" />
      </div>

      <div className="mb-4 mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre, SKU o código de barras..." />
        <label className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm text-text">
          <input type="checkbox" checked={lowStock} onChange={(e) => setLowStock(e.target.checked)} className="h-4 w-4" />
          Solo stock bajo
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-20 text-text-muted">
          <Spinner className="h-6 w-6" />
        </div>
      ) : (
        <Table head={['Producto', 'Categoría', 'Costo', 'Precio', 'Stock', '']} empty="Sin productos">
          {items.map((p) => (
            <tr key={p.id} className="hover:bg-surface-alt/40">
              <td className="px-4 py-3">
                <div className="font-medium text-text">{p.name}</div>
                <div className="text-[11px] text-text-muted">{p.sku || p.barcode || ''}</div>
              </td>
              <td className="px-4 py-3 text-text-muted">{p.category?.name ?? '—'}</td>
              <td className="px-4 py-3 text-text-muted">{formatMoney(p.cost, currency)}</td>
              <td className="px-4 py-3 font-medium text-text">{formatMoney(p.price, currency)}</td>
              <td className="px-4 py-3">
                <Badge color={p.stock <= 0 ? 'red' : p.minStock > 0 && p.stock <= p.minStock ? 'yellow' : 'green'}>
                  {p.stock} {p.unit}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setStockFor(p)}>
                    Stock
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(p); setFormOpen(true); }}>
                    <Icon name="edit" size={15} />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <ProductFormModal open={formOpen} onClose={() => setFormOpen(false)} product={editing} categories={categories} onSaved={load} />
      <StockModal product={stockFor} onClose={() => setStockFor(null)} onSaved={load} />

      <Modal
        open={categoryOpen}
        onClose={() => setCategoryOpen(false)}
        title="Nueva categoría"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCategoryOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={createCategory}>Crear</Button>
          </>
        }
      >
        <Field label="Nombre">
          <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} autoFocus />
        </Field>
      </Modal>
    </div>
  );
}

const EMPTY = {
  name: '',
  categoryId: '',
  sku: '',
  barcode: '',
  description: '',
  cost: '0',
  price: '',
  stock: '0',
  minStock: '0',
  unit: 'unidad',
  isActive: true,
};

function ProductFormModal({
  open,
  onClose,
  product,
  categories,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  product: Product | null;
  categories: ProductCategory[];
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (product) {
      setForm({
        name: product.name,
        categoryId: product.categoryId || '',
        sku: product.sku || '',
        barcode: product.barcode || '',
        description: product.description || '',
        cost: String(product.cost),
        price: String(product.price),
        stock: String(product.stock),
        minStock: String(product.minStock),
        unit: product.unit,
        isActive: product.isActive,
      });
    } else {
      setForm({ ...EMPTY });
    }
  }, [open, product]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      categoryId: form.categoryId || null,
      sku: form.sku || null,
      barcode: form.barcode || null,
      description: form.description || null,
      cost: Number(form.cost || 0),
      price: Number(form.price),
      stock: Number(form.stock || 0),
      minStock: Number(form.minStock || 0),
      unit: form.unit,
      isActive: form.isActive,
    };
    try {
      if (product) await http.put(`/products/${product.id}`, payload);
      else await http.post('/products', payload);
      toast.success(product ? 'Producto actualizado' : 'Producto creado');
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product ? 'Editar producto' : 'Nuevo producto'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} loading={saving}>
            Guardar
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nombre *" className="sm:col-span-2">
          <Input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </Field>
        <Field label="Categoría">
          <Select value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}>
            <option value="">Sin categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Unidad">
          <Input value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} />
        </Field>
        <Field label="SKU">
          <Input value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} />
        </Field>
        <Field label="Código de barras">
          <Input value={form.barcode} onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))} />
        </Field>
        <Field label="Costo">
          <Input type="number" step="0.01" min="0" value={form.cost} onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))} />
        </Field>
        <Field label="Precio venta *">
          <Input type="number" step="0.01" min="0" required value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
        </Field>
        <Field label="Stock">
          <Input type="number" min="0" value={form.stock} onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))} />
        </Field>
        <Field label="Stock mínimo">
          <Input type="number" min="0" value={form.minStock} onChange={(e) => setForm((f) => ({ ...f, minStock: e.target.value }))} />
        </Field>
        <Field label="Descripción" className="sm:col-span-2">
          <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-text">
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="h-4 w-4" />
          Activo
        </label>
      </form>
    </Modal>
  );
}

function StockModal({ product, onClose, onSaved }: { product: Product | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [type, setType] = useState('IN');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (product) {
      setType('IN');
      setQuantity('');
      setReason('');
    }
  }, [product]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await http.post(`/products/${product?.id}/stock`, { type, quantity: Number(quantity), reason: reason || null });
      toast.success('Stock actualizado');
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al mover stock');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={!!product}
      onClose={onClose}
      title={`Movimiento de stock · ${product?.name ?? ''}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} loading={saving}>
            Confirmar
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4">
        <div className="rounded-lg bg-surface-alt/50 px-3 py-2 text-sm text-text-muted">
          Stock actual: <span className="font-semibold text-text">{product?.stock}</span>
        </div>
        <Field label="Tipo">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="IN">Entrada</option>
            <option value="OUT">Salida</option>
            <option value="ADJUSTMENT">Ajuste</option>
            <option value="RETURN">Devolución</option>
          </Select>
        </Field>
        <Field label="Cantidad *">
          <Input type="number" min="1" required value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </Field>
        <Field label="Motivo">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}