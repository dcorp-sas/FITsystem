'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import { formatMoney } from '@fitsystem/utils';
import { PAYMENT_CONCEPT_LABELS } from '@/lib/labels';
import { reportSaleInProgress } from '@/lib/desktop';
import type { Member } from '@/lib/types';
import {
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
  Textarea,
} from '@/components/ui';
import { Icon } from '@/components/icon';

type Stage = 'form' | 'point' | 'qr' | 'done';
type ManualMethod = 'CASH' | 'TRANSFER' | 'CARD';

interface PointOrder {
  paymentId: string;
  intentId: string | null;
  deviceId: string | null;
}

interface QrOrder {
  paymentId: string;
  image: string;
  checkoutUrl: string | null;
  payload: string;
}

interface InvoiceResult {
  invoiceNumber: string;
  type: string;
  cae?: string | null;
  mode?: string;
  puntoVenta?: number;
}

interface ArcaStatus {
  enabled: boolean;
  mode: string;
  cbteLabel: string;
  configured: boolean;
}

export default function ChargePage() {
  const toast = useToast();
  const { organization } = useAuth();
  const currency = organization?.currency || 'ARS';

  const [stage, setStage] = useState<Stage>('form');
  const [amount, setAmount] = useState('');
  const [concept, setConcept] = useState('MEMBERSHIP');
  const [description, setDescription] = useState('');
  const [invoiceType, setInvoiceType] = useState('');
  const [arca, setArca] = useState<ArcaStatus | null>(null);

  const [memberQuery, setMemberQuery] = useState('');
  const [memberResults, setMemberResults] = useState<Member[]>([]);
  const [member, setMember] = useState<Member | null>(null);

  const [busy, setBusy] = useState(false);
  const [pointOrder, setPointOrder] = useState<PointOrder | null>(null);
  const [qrOrder, setQrOrder] = useState<QrOrder | null>(null);
  const [invoice, setInvoice] = useState<InvoiceResult | null>(null);
  const [paidId, setPaidId] = useState<string | null>(null);
  const [pollState, setPollState] = useState('');

  const finished = useRef(false);
  const prefillDone = useRef(false);

  const amountNum = Number(amount) || 0;
  const canCharge = amountNum > 0 && !busy;

  useEffect(() => {
    http
      .get<{ arca: ArcaStatus }>('/integrations/status')
      .then((res) => setArca(res.arca))
      .catch(() => undefined);
  }, []);

  // Avisa al escritorio si hay una venta/cobro en curso, para que la
  // actualización automática no reinicie la app mientras se factura.
  useEffect(() => {
    reportSaleInProgress(Boolean(busy || pointOrder || qrOrder));
    return () => reportSaleInProgress(false);
  }, [busy, pointOrder, qrOrder]);

  useEffect(() => {
    if (prefillDone.current) return;
    prefillDone.current = true;
    const params = new URLSearchParams(window.location.search);
    const id = params.get('memberId');
    const pre = params.get('amount');
    if (pre) setAmount(pre);
    if (!id) return;
    http
      .get<{ member: Member }>(`/members/${id}`)
      .then((res) => {
        const m = res.member;
        setMember(m);
        setMemberQuery(`${m.firstName} ${m.lastName}`);
        const active = m.memberships?.[0];
        if (active && !pre) setAmount(String(Math.max(0, active.price - active.discount)));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (member || memberQuery.trim().length < 2) {
      setMemberResults([]);
      return;
    }
    const t = setTimeout(() => {
      http
        .get<{ items: Member[] }>('/members', { search: memberQuery.trim(), pageSize: 8 })
        .then((res) => setMemberResults(res.items))
        .catch(() => setMemberResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [memberQuery, member]);

  const finish = useCallback(
    async (paymentId: string) => {
      if (finished.current) return;
      finished.current = true;
      setPaidId(paymentId);
      if (invoiceType) {
        try {
          const res = await http.post<InvoiceResult>('/integrations/arca/invoices', {
            paymentId,
            invoiceType,
          });
          setInvoice(res);
          toast.success(`Comprobante ${res.invoiceNumber} emitido`);
        } catch (error) {
          toast.error(error instanceof ApiError ? error.message : 'No se pudo emitir el comprobante');
        }
      } else {
        toast.success('Cobro registrado');
      }
      setStage('done');
    },
    [invoiceType, toast],
  );

  useEffect(() => {
    if (stage !== 'point' || !pointOrder?.intentId) return;
    const intentId = pointOrder.intentId;
    const t = setInterval(() => {
      http
        .get<{ approved: boolean; payment?: { id: string } | null }>('/integrations/mercadopago/point/poll', { intentId })
        .then((res) => {
          if (res.approved && res.payment?.id) finish(res.payment.id);
        })
        .catch(() => undefined);
    }, 3000);
    return () => clearInterval(t);
  }, [stage, pointOrder, finish]);

  useEffect(() => {
    if (stage !== 'qr' || !qrOrder) return;
    const t = setInterval(() => {
      http
        .get<{ status: string }>(`/integrations/mercadopago/orders/${qrOrder.paymentId}`)
        .then((p) => {
          setPollState(p.status);
          if (p.status === 'COMPLETED') finish(qrOrder.paymentId);
        })
        .catch(() => undefined);
    }, 3000);
    return () => clearInterval(t);
  }, [stage, qrOrder, finish]);

  function reset() {
    finished.current = false;
    setStage('form');
    setAmount('');
    setDescription('');
    setInvoiceType('');
    setPointOrder(null);
    setQrOrder(null);
    setInvoice(null);
    setPaidId(null);
    setPollState('');
  }

  function pickMember(m: Member) {
    setMember(m);
    setMemberQuery(`${m.firstName} ${m.lastName}`);
    setMemberResults([]);
    const active = m.memberships?.[0];
    if (active) setAmount((prev) => (Number(prev) > 0 ? prev : String(Math.max(0, active.price - active.discount))));
  }

  const finalDescription = description.trim() || PAYMENT_CONCEPT_LABELS[concept] || 'Cobro';

  async function sendPoint() {
    setBusy(true);
    try {
      const res = await http.post<PointOrder>('/integrations/mercadopago/point', {
        amount: amountNum,
        description: finalDescription,
        concept,
        memberId: member?.id || undefined,
      });
      setPointOrder(res);
      setStage('point');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo enviar a la terminal Point');
    } finally {
      setBusy(false);
    }
  }

  async function sendQr() {
    setBusy(true);
    try {
      const res = await http.post<QrOrder>('/integrations/mercadopago/qr', {
        amount: amountNum,
        description: finalDescription,
        concept,
        memberId: member?.id || undefined,
      });
      setQrOrder(res);
      setStage('qr');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo generar el QR');
    } finally {
      setBusy(false);
    }
  }

  async function chargeManual(method: ManualMethod) {
    setBusy(true);
    try {
      const payment = await http.post<{ id: string }>('/payments', {
        memberId: member?.id || null,
        concept,
        method,
        amount: amountNum,
        status: 'COMPLETED',
        notes: description || null,
      });
      await finish(payment.id);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo registrar el cobro');
    } finally {
      setBusy(false);
    }
  }

  async function confirmOrder() {
    const paymentId = pointOrder?.paymentId ?? qrOrder?.paymentId;
    if (!paymentId) return;
    setBusy(true);
    try {
      await http.post(`/integrations/mercadopago/orders/${paymentId}/confirm`, {});
      await finish(paymentId);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo confirmar el cobro');
    } finally {
      setBusy(false);
    }
  }

  async function printReceipt() {
    if (!paidId) return;
    try {
      await http.post(`/integrations/print/receipt/${paidId}`, {});
      toast.success('Comprobante enviado a la impresora');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo imprimir');
    }
  }

  return (
    <div>
      <PageHeader title="Cobrar" subtitle="Punto de venta: Point, QR, efectivo y facturación" />

      {stage === 'form' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card title="Datos del cobro" className="lg:col-span-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Socio (opcional)" className="sm:col-span-2">
                {member ? (
                  <div className="flex items-center justify-between rounded-lg border border-line bg-surface-alt px-3 py-2.5">
                    <div className="text-sm text-text">
                      {member.firstName} {member.lastName}
                      <span className="ml-2 text-xs text-text-muted">{member.memberCode}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setMember(null);
                        setMemberQuery('');
                      }}
                    >
                      Quitar
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Input
                      value={memberQuery}
                      onChange={(e) => setMemberQuery(e.target.value)}
                      placeholder="Buscar por nombre, código o documento…"
                    />
                    {memberResults.length > 0 && (
                      <ul className="max-h-52 overflow-y-auto rounded-lg border border-line bg-surface">
                        {memberResults.map((m) => (
                          <li key={m.id} className="border-b border-line last:border-0">
                            <button
                              type="button"
                              onClick={() => pickMember(m)}
                              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-text hover:bg-surface-alt"
                            >
                              <span>
                                {m.firstName} {m.lastName}
                              </span>
                              <span className="text-xs text-text-muted">{m.memberCode}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </Field>

              <Field label="Concepto">
                <Select value={concept} onChange={(e) => setConcept(e.target.value)}>
                  {Object.entries(PAYMENT_CONCEPT_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={`Monto (${currency}) *`}>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="text-lg font-semibold"
                />
              </Field>

              <Field label="Descripción" hint="Se imprime en el ticket y el comprobante" className="sm:col-span-2">
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={PAYMENT_CONCEPT_LABELS[concept] || 'Cobro'}
                />
              </Field>

              {arca?.enabled && (
                <Field
                  label="Facturar con ARCA"
                  hint={
                    arca.mode === 'real'
                      ? `Comprobante ${arca.cbteLabel}`
                      : 'Sin certificado válido: revisá la configuración de ARCA'
                  }
                  className="sm:col-span-2"
                >
                  <Select value={invoiceType} onChange={(e) => setInvoiceType(e.target.value)}>
                    <option value="">No facturar</option>
                    <option value="C">Factura C</option>
                    <option value="B">Factura B</option>
                    <option value="A">Factura A</option>
                  </Select>
                </Field>
              )}
            </div>
          </Card>

          <Card title="Medio de pago">
            <div className="grid gap-3">
              <Button size="lg" disabled={!canCharge} onClick={sendPoint}>
                <Icon name="card" size={18} /> Cobrar en Point
              </Button>
              <Button size="lg" variant="secondary" disabled={!canCharge} onClick={sendQr}>
                <Icon name="mobile" size={18} /> Cobrar con QR MercadoPago
              </Button>
              <div className="grid grid-cols-3 gap-2">
                <Button variant="secondary" disabled={!canCharge} onClick={() => chargeManual('CASH')}>
                  Efectivo
                </Button>
                <Button variant="secondary" disabled={!canCharge} onClick={() => chargeManual('TRANSFER')}>
                  Transf.
                </Button>
                <Button variant="secondary" disabled={!canCharge} onClick={() => chargeManual('CARD')}>
                  Tarjeta
                </Button>
              </div>
              {busy && <div className="text-center text-xs text-text-muted">Procesando…</div>}
            </div>
          </Card>
        </div>
      )}

      {stage === 'point' && pointOrder && (
        <Card title="Cobrar en terminal Point">
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="text-3xl font-bold text-text">{formatMoney(amountNum, currency)}</div>
            <div className="text-sm text-text-muted">Esperando confirmación en la terminal… ({pollState || 'pendiente'})</div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button loading={busy} onClick={confirmOrder}>
                <Icon name="check" size={16} /> Confirmar cobro recibido
              </Button>
              <Button variant="ghost" onClick={reset}>
                Cancelar
              </Button>
            </div>
          </div>
        </Card>
      )}

      {stage === 'qr' && qrOrder && (
        <Card title="Cobrar con QR MercadoPago">
          <div className="flex flex-col items-center gap-4 py-4">
            {qrOrder.checkoutUrl && (
              <a
                href={qrOrder.checkoutUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-primary-light hover:underline"
              >
                Abrir link de pago de MercadoPago
              </a>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrOrder.image} alt="QR MercadoPago" className="h-64 w-64 rounded-xl border border-line bg-white p-2" />
            <div className="text-2xl font-bold text-text">{formatMoney(amountNum, currency)}</div>
            <div className="text-xs text-text-muted">Esperando pago… ({pollState || 'pendiente'})</div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button loading={busy} onClick={confirmOrder}>
                <Icon name="check" size={16} /> Marcar como cobrado
              </Button>
              <Button variant="ghost" onClick={reset}>
                Cancelar
              </Button>
            </div>
          </div>
        </Card>
      )}

      {stage === 'done' && (
        <Card title="Cobro registrado">
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
              <Icon name="check" size={28} />
            </div>
            <div className="text-lg font-bold text-text">{formatMoney(amountNum, currency)}</div>
            {member && (
              <div className="text-sm text-text-muted">
                {member.firstName} {member.lastName}
              </div>
            )}
            {invoice && (
              <div className="rounded-lg border border-line bg-surface-alt px-4 py-3 text-sm">
                <div className="font-medium text-text">
                  {invoice.type} {invoice.invoiceNumber}
                </div>
                <div className="mt-1 text-xs text-text-muted">
                  {invoice.cae ? `CAE ${invoice.cae}` : 'Emitido'}
                </div>
              </div>
            )}
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="secondary" disabled={!paidId} onClick={printReceipt}>
                <Icon name="import" size={16} /> Imprimir ticket
              </Button>
              <Button onClick={reset}>
                <Icon name="plus" size={16} /> Nuevo cobro
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
