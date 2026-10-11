'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { formatDate } from '@fitsystem/utils';
import { MEMBER_STATUS_LABELS, RISK_LABELS } from '@/lib/labels';
import type { Member } from '@/lib/types';
import { MemberFormModal } from '@/components/member-form';
import {
  Badge,
  Button,
  PageHeader,
  SearchInput,
  Select,
  Spinner,
  StatusBadge,
  Table,
} from '@/components/ui';
import { Icon } from '@/components/icon';

interface MembersResponse {
  total: number;
  page: number;
  pageSize: number;
  items: Member[];
}

export default function MembersPage() {
  const toast = useToast();
  const [items, setItems] = useState<Member[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [risk, setRisk] = useState('');
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await http.get<MembersResponse>('/members', {
        search,
        status,
        risk,
        page,
        pageSize,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al cargar socios');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, risk, page]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <PageHeader
        title="Socios"
        subtitle={`${total} socios registrados`}
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Icon name="plus" size={16} /> Nuevo socio
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <SearchInput value={search} onChange={(v) => { setPage(1); setSearch(v); }} placeholder="Buscar por nombre, DNI, código, teléfono..." />
        <Select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} className="sm:w-44">
          <option value="">Todos los estados</option>
          {Object.entries(MEMBER_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select value={risk} onChange={(e) => { setPage(1); setRisk(e.target.value); }} className="sm:w-40">
          <option value="">Todo riesgo</option>
          <option value="HIGH">Riesgo alto</option>
          <option value="MEDIUM">Riesgo medio</option>
          <option value="LOW">Riesgo bajo</option>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20 text-text-muted">
          <Spinner className="h-6 w-6" />
        </div>
      ) : (
        <Table head={['Socio', 'Contacto', 'Estado', 'Membresía', 'Riesgo', '']} empty="No se encontraron socios">
          {items.map((m) => {
            const active = m.memberships?.[0];
            return (
              <tr key={m.id} className="transition hover:bg-surface-alt/40">
                <td className="px-4 py-3">
                  <Link href={`/members/${m.id}`} className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary-light">
                      {m.firstName.charAt(0)}
                      {m.lastName.charAt(0)}
                    </div>
                    <div>
                      <div className="font-medium text-text">
                        {m.firstName} {m.lastName}
                      </div>
                      <div className="text-[11px] text-text-muted">#{m.memberCode}</div>
                    </div>
                  </Link>
                </td>
                <td className="px-4 py-3 text-text-muted">
                  <div>{m.phone || '-'}</div>
                  <div className="text-[11px]">{m.email || ''}</div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={m.status} label={MEMBER_STATUS_LABELS[m.status]} />
                </td>
                <td className="px-4 py-3">
                  {active ? (
                    <div className="text-xs">
                      <div className="text-text">{active.plan?.name}</div>
                      <div className="text-text-muted">vence {formatDate(active.endDate)}</div>
                    </div>
                  ) : (
                    <span className="text-xs text-text-muted">Sin membresía</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {m.risk && m.risk.level !== 'LOW' ? (
                    <Badge color={m.risk.level === 'HIGH' ? 'red' : 'yellow'}>
                      {RISK_LABELS[m.risk.level]} · {m.risk.score}
                    </Badge>
                  ) : (
                    <span className="text-xs text-text-muted">Bajo</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Link href={`/members/${m.id}`}>
                      <Button variant="ghost" size="sm">
                        Ver
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(m);
                        setFormOpen(true);
                      }}
                    >
                      <Icon name="edit" size={15} />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </Button>
          <span className="text-sm text-text-muted">
            Página {page} de {totalPages}
          </span>
          <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Siguiente
          </Button>
        </div>
      )}

      <MemberFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        member={editing}
        onSaved={load}
      />
    </div>
  );
}