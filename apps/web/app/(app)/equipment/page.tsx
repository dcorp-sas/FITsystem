'use client';

import { useCallback, useEffect, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import { formatMoney, formatDateTime } from '@fitsystem/utils';
import {
  EQUIPMENT_STATUS_LABELS,
  MAINTENANCE_STATUS_LABELS,
  MAINTENANCE_PRIORITY_LABELS,
} from '@/lib/labels';
import type { Equipment, MaintenanceOrder } from '@/lib/types';
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
  StatusBadge,
  Table,
  Textarea,
} from '@/components/ui';
import { Icon } from '@/components/icon';

interface EquipmentData {
  items: Equipment[];
  stats: { total: number; operational: number; maintenance: number; outOfService: number; openOrders: number };
}

export default function EquipmentPage() {
  const toast = useToast();
  const { branches, activeBranchId } = useAuth();
  const branchId = activeBranchId || branches[0]?.id || '';

  const [tab, setTab] = useState<'equipment' | 'orders'>('equipment');
  const [data, setData] = useState<EquipmentData | null>(null);
  const [orders, setOrders] = useState<MaintenanceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [eqOpen, setEqOpen] = useState(false);
  const [editingEq, setEditingEq] = useState<Equipment | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderFor, setOrderFor] = useState<Equipment | null>(null);
  const [editingOrder, setEditingOrder] = useState<MaintenanceOrder | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [eq, ord] = await Promise.all([
        http.get<EquipmentData>('/equipment', { search }),
        http.get<MaintenanceOrder[]>('/maintenance-orders'),
      ]);
      setData(eq);
      setOrders(ord);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al cargar equipos');
    } finally {
      setLoading(false);
    }
  }, [search, toast]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Equipos y mantenimiento"
        subtitle="Inventario y órdenes"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => { setOrderFor(null); setEditingOrder(null); setOrderOpen(true); }}>
              <Icon name="plus" size={16} /> Orden
            </Button>
            <Button onClick={() => { setEditingEq(null); setEqOpen(true); }}>
              <Icon name="plus" size={16} /> Nuevo equipo
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total" value={data?.stats.total ?? 0} accent="blue" />
        <StatCard label="Operativos" value={data?.stats.operational ?? 0} accent="green" />
        <StatCard label="En mantenimiento" value={data?.stats.maintenance ?? 0} accent="yellow" />
        <StatCard label="Órdenes abiertas" value={data?.stats.openOrders ?? 0} accent="red" />
      </div>

      <div className="mb-5 mt-5 flex gap-1 rounded-lg border border-line bg-surface p-1">
        {(['equipment', 'orders'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              'flex-1 rounded-md px-4 py-2 text-sm font-medium transition ' +
              (tab === t ? 'bg-primary text-white' : 'text-text-muted hover:text-text')
            }
          >
            {t === 'equipment' ? 'Equipos' : 'Órdenes de mantenimiento'}
          </button>
        ))}
      </div>

      {tab === 'equipment' ? (
        <>
          <div className="mb-4 max-w-md">
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar equipo..." />
          </div>
          {loading ? (
            <div className="flex justify-center py-20 text-text-muted">
              <Spinner className="h-6 w-6" />
            </div>
          ) : (
            <Table head={['Equipo', 'Categoría', 'Ubicación', 'Estado', 'Órdenes', '']} empty="Sin equipos">
              {(data?.items ?? []).map((e) => (
                <tr key={e.id} className="hover:bg-surface-alt/40">
                  <td className="px-4 py-3">
                    <div className="font-medium text-text">{e.name}</div>
                    <div className="text-[11px] text-text-muted">
                      {[e.brand, e.model].filter(Boolean).join(' ') || ''}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-muted">{e.category || '—'}</td>
                  <td className="px-4 py-3 text-text-muted">{e.location || '—'}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={e.status} label={EQUIPMENT_STATUS_LABELS[e.status] ?? e.status} />
                  </td>
                  <td className="px-4 py-3 text-text-muted">{e.orders?.length ?? 0}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setOrderFor(e); setEditingOrder(null); setOrderOpen(true); }}>
                        Orden
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEditingEq(e); setEqOpen(true); }}>
                        <Icon name="edit" size={15} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </>
      ) : (
        <Table head={['Equipo', 'Título', 'Tipo', 'Prioridad', 'Estado', 'Costo', 'Programado', '']} empty="Sin órdenes">
          {orders.map((o) => (
            <tr key={o.id} className="hover:bg-surface-alt/40">
              <td className="px-4 py-3 text-text">{o.equipment?.name ?? '—'}</td>
              <td className="px-4 py-3 text-text-muted">{o.title}</td>
              <td className="px-4 py-3 text-text-muted">{o.type === 'PREVENTIVE' ? 'Preventivo' : 'Correctivo'}</td>
              <td className="px-4 py-3">
                <Badge color={o.priority === 'HIGH' ? 'red' : o.priority === 'MEDIUM' ? 'yellow' : 'green'}>
                  {MAINTENANCE_PRIORITY_LABELS[o.priority] ?? o.priority}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={o.status} label={MAINTENANCE_STATUS_LABELS[o.status] ?? o.status} />
              </td>
              <td className="px-4 py-3 text-text-muted">{formatMoney(o.cost)}</td>
              <td className="px-4 py-3 text-xs text-text-muted">{o.scheduledAt ? formatDateTime(o.scheduledAt) : '—'}</td>
              <td className="px-4 py-3 text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setEditingOrder(o); setOrderFor(null); setOrderOpen(true); }}
                >
                  <Icon name="edit" size={15} />
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <EquipmentModal open={eqOpen} onClose={() => setEqOpen(false)} equipment={editingEq} branchId={branchId} onSaved={load} />
      <OrderModal
        open={orderOpen}
        onClose={() => setOrderOpen(false)}
        order={editingOrder}
        equipment={orderFor}
        equipmentList={data?.items ?? []}
        onSaved={load}
      />
    </div>
  );
}

const EQ_EMPTY = {
  name: '',
  category: '',
  brand: '',
  model: '',
  serialNumber: '',
  location: '',
  status: 'OPERATIONAL',
  notes: '',
};

function EquipmentModal({
  open,
  onClose,
  equipment,
  branchId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  equipment: Equipment | null;
  branchId: string;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({ ...EQ_EMPTY });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (equipment) {
      setForm({
        name: equipment.name,
        category: equipment.category || '',
        brand: equipment.brand || '',
        model: equipment.model || '',
        serialNumber: equipment.serialNumber || '',
        location: equipment.location || '',
        status: equipment.status,
        notes: '',
      });
    } else {
      setForm({ ...EQ_EMPTY });
    }
  }, [open, equipment]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      branchId,
      category: form.category || null,
      brand: form.brand || null,
      model: form.model || null,
      serialNumber: form.serialNumber || null,
      location: form.location || null,
      status: form.status,
      notes: form.notes || null,
    };
    try {
      if (equipment) await http.put(`/equipment/${equipment.id}`, payload);
      else await http.post('/equipment', payload);
      toast.success(equipment ? 'Equipo actualizado' : 'Equipo creado');
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
      title={equipment ? 'Editar equipo' : 'Nuevo equipo'}
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
          <Input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
        </Field>
        <Field label="Ubicación">
          <Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
        </Field>
        <Field label="Marca">
          <Input value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} />
        </Field>
        <Field label="Modelo">
          <Input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} />
        </Field>
        <Field label="N° de serie">
          <Input value={form.serialNumber} onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))} />
        </Field>
        <Field label="Estado">
          <Select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
            {Object.entries(EQUIPMENT_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notas" className="sm:col-span-2">
          <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </Field>
      </form>
    </Modal>
  );
}

function OrderModal({
  open,
  onClose,
  order,
  equipment,
  equipmentList,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  order: MaintenanceOrder | null;
  equipment: Equipment | null;
  equipmentList: Equipment[];
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    equipmentId: '',
    type: 'CORRECTIVE',
    title: '',
    description: '',
    priority: 'MEDIUM',
    status: 'OPEN',
    cost: '0',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (order) {
      setForm({
        equipmentId: order.equipmentId,
        type: order.type,
        title: order.title,
        description: order.description || '',
        priority: order.priority,
        status: order.status,
        cost: String(order.cost),
      });
    } else {
      setForm({
        equipmentId: equipment?.id || '',
        type: 'CORRECTIVE',
        title: '',
        description: '',
        priority: 'MEDIUM',
        status: 'OPEN',
        cost: '0',
      });
    }
  }, [open, order, equipment]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      equipmentId: form.equipmentId,
      type: form.type,
      title: form.title.trim(),
      description: form.description || null,
      priority: form.priority,
      status: form.status,
      cost: Number(form.cost || 0),
    };
    try {
      if (order) await http.put(`/maintenance-orders/${order.id}`, payload);
      else await http.post('/maintenance-orders', payload);
      toast.success(order ? 'Orden actualizada' : 'Orden creada');
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
      title={order ? 'Editar orden' : 'Nueva orden de mantenimiento'}
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
        <Field label="Equipo *" className="sm:col-span-2">
          <Select value={form.equipmentId} onChange={(e) => setForm((f) => ({ ...f, equipmentId: e.target.value }))} required>
            <option value="">Seleccionar...</option>
            {equipmentList.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Título *" className="sm:col-span-2">
          <Input required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        </Field>
        <Field label="Tipo">
          <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
            <option value="PREVENTIVE">Preventivo</option>
            <option value="CORRECTIVE">Correctivo</option>
          </Select>
        </Field>
        <Field label="Prioridad">
          <Select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
            {Object.entries(MAINTENANCE_PRIORITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Estado">
          <Select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
            {Object.entries(MAINTENANCE_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Costo">
          <Input type="number" step="0.01" min="0" value={form.cost} onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))} />
        </Field>
        <Field label="Descripción" className="sm:col-span-2">
          <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </Field>
      </form>
    </Modal>
  );
}