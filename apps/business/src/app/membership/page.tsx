'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import DashboardShell from '@/components/DashboardShell';
import EmptyState from '@/components/EmptyState';
import ImageUploadField from '@/components/ImageUploadField';
import { apiFetch, ApiError, getActiveBusinessId } from '@/lib/api';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

const STATUS_LABELS: Record<string, string> = {
  TRIAL: 'Prueba gratuita',
  ACTIVE: 'Activa',
  PAST_DUE: 'Pago pendiente',
  PAUSED: 'Pausada',
  CANCELLED: 'Cancelada',
  EXPIRED: 'Expirada',
};

const STATUS_COLORS: Record<string, string> = {
  TRIAL: 'var(--bingo-teal)',
  ACTIVE: 'var(--bingo-success)',
  PAST_DUE: 'var(--bingo-error)',
  PAUSED: 'var(--bingo-warning)',
  CANCELLED: '#9aa5b1',
  EXPIRED: '#9aa5b1',
};

interface Subscription {
  id: string;
  periodStart: string;
  periodEnd: string;
  amount: string | number;
  currency: string;
  status: string;
}

type PaymentMethod = 'DEPOSIT' | 'TRANSFER' | 'CARD';
// DEPOSIT/TRANSFER are the only methods offered on the manual receipt-upload form — CARD is a
// real charge handled by its own flow (payWithCard below), never a receipt upload. See
// MembershipsService.submitPayment, which now rejects method=CARD outright.
type ManualPaymentMethod = Exclude<PaymentMethod, 'CARD'>;

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  DEPOSIT: 'Depósito bancario',
  TRANSFER: 'Transferencia bancaria',
  CARD: 'Pago con tarjeta',
};

const MANUAL_PAYMENT_METHODS: ManualPaymentMethod[] = ['DEPOSIT', 'TRANSFER'];

// A membership CARD charge's own real Payment row (see Payment.membershipPaymentId) — mirrors the
// Booking payment shape from apps/customer/src/app/bookings/[id]/page.tsx.
interface CardPayment {
  id: string;
  status: 'PENDING' | 'PAID' | 'FAILED' | string;
  provider: string;
}

interface MembershipPayment {
  id: string;
  periodStart: string;
  periodEnd: string;
  amount: string | number;
  currency: string;
  // Null on an auto-generated placeholder, or on a CARD row (never a receipt) — the cutoff
  // sweeper creates the PENDING row the moment the billing period ends, before anyone has
  // actually paid anything.
  receiptUrl: string | null;
  method: PaymentMethod | null;
  dueDate: string | null;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  rejectionReason: string | null;
  createdAt: string;
  // Only ever set on a CARD row — the real Sandbox charge behind it.
  payment: CardPayment | null;
}

interface Membership {
  status: string;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  plan: { name: string; price: string | number; currency: string; billingFrequency: string; benefits: Record<string, unknown> | null };
  subscriptions: Subscription[];
  payments: MembershipPayment[];
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'En revisión',
  VERIFIED: 'Verificado',
  REJECTED: 'Rechazado',
};

function MembershipContent() {
  const businessId = getActiveBusinessId();
  const idempotencyKey = useRef(crypto.randomUUID());
  const [membership, setMembership] = useState<Membership | null | undefined>(undefined);
  const [receiptUrl, setReceiptUrl] = useState('');
  const [method, setMethod] = useState<ManualPaymentMethod>('DEPOSIT');
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Whether the business has opened the manual receipt sub-form — otherwise, once a payment is
  // due, only the card-vs-manual choice buttons show (see duePayment below).
  const [showManualForm, setShowManualForm] = useState(false);

  const load = useCallback(() => {
    if (!businessId) return;
    apiFetch<Membership | null>(`/me/business/${businessId}/membership`)
      .then(setMembership)
      .catch(() => setMembership(null));
  }, [businessId]);

  useEffect(() => {
    load();
  }, [load]);

  async function submitReceipt() {
    if (!businessId || !receiptUrl) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/me/business/${businessId}/membership/payments`, {
        method: 'POST',
        body: JSON.stringify({ receiptUrl, method }),
      });
      setReceiptUrl('');
      setShowManualForm(false);
      setNotice('Comprobante enviado. Un administrador lo revisará en breve.');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar el comprobante.');
    } finally {
      setSubmitting(false);
    }
  }

  // "Pagar con tarjeta": same create-then-confirm pair the Booking card flow and /checkout use
  // (real Sandbox PaymentService.createPayment/confirmPayment), just re-targeted at the due
  // membership period — see MembershipsService.createMembershipCardPayment/
  // confirmMembershipCardPayment. If a card Payment already exists for this period (e.g. a
  // previous attempt, possibly FAILED), skip straight to confirming it instead of creating a
  // second one.
  async function payWithCard(existingCardPayment: CardPayment | null) {
    if (!businessId) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      if (!existingCardPayment) {
        await apiFetch(`/me/business/${businessId}/membership/payments/card`, {
          method: 'POST',
          body: JSON.stringify({ idempotencyKey: idempotencyKey.current }),
        });
      }
      await apiFetch(`/me/business/${businessId}/membership/payments/card/confirm`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setNotice('Pago con tarjeta procesado correctamente.');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo procesar el pago con tarjeta.');
    } finally {
      setSubmitting(false);
    }
  }

  // The membership's most recent payment row, ordered newest-first by the API — mirrors
  // MembershipPastDueSweeper's own "only the most recent row decides" rule (see its class
  // comment): if it's VERIFIED, this period is settled and nothing is due; otherwise (PENDING —
  // auto-generated and untouched, awaiting review, or an in-progress/failed card charge — or
  // REJECTED) it's the one actionable record. This is the whole fix for "the pagar UI showed up
  // during a free trial with nothing generated yet": before, the form rendered whenever the
  // membership itself wasn't CANCELLED/EXPIRED, regardless of whether any MembershipPayment row
  // existed at all. Now it renders only when there's an actual due record to act on.
  const mostRecentPayment = membership?.payments?.[0] ?? null;
  const duePayment = mostRecentPayment && mostRecentPayment.status !== 'VERIFIED' ? mostRecentPayment : null;
  const awaitingReceipt = duePayment != null && duePayment.method == null && !duePayment.receiptUrl;
  const awaitingReview = duePayment != null && !!duePayment.receiptUrl;
  const cardInProgress = duePayment != null && duePayment.method === 'CARD';
  const cardFailed = cardInProgress && duePayment?.payment?.status === 'FAILED';
  const duePeriodEnd = membership?.currentPeriodEnd ?? membership?.trialEndsAt ?? null;
  const isPastDue = membership?.status === 'PAST_DUE';

  return (
    <>
      <header className="dashboard-page-header">
        <div className="dashboard-page-title">Membresía</div>
      </header>

      {membership === undefined ? (
        <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
      ) : !membership ? (
        <EmptyState title="Sin membresía todavía" subtitle="Tu negocio aún no tiene una membresía asignada." />
      ) : (
        <>
          <div className="bingo-card" style={{ maxWidth: 480 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{membership.plan.name}</div>
              <span className="bingo-badge" style={{ background: '#f2f4f7', color: STATUS_COLORS[membership.status] ?? '#54617a' }}>
                {STATUS_LABELS[membership.status] ?? membership.status}
              </span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 8 }}>
              {currencyFormatter.format(Number(membership.plan.price))}
              <span style={{ fontSize: 12, fontWeight: 600, color: '#7f8ea3' }}>
                {' '}
                / {membership.plan.billingFrequency === 'MONTHLY' ? 'mes' : 'año'}
              </span>
            </div>
            {membership.trialEndsAt && (
              <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 8 }}>
                Prueba gratuita hasta {new Date(membership.trialEndsAt).toLocaleDateString('es-EC')}
              </div>
            )}
            {membership.currentPeriodEnd && (
              <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 4 }}>
                Próxima renovación: {new Date(membership.currentPeriodEnd).toLocaleDateString('es-EC')}
              </div>
            )}
          </div>

          {isPastDue && (
            <div className="bingo-card" style={{ maxWidth: 480, marginTop: 16, color: 'var(--bingo-error)' }}>
              Tu pago de membresía está atrasado y tu negocio ya no es visible para los clientes. Paga con tarjeta o
              sube tu comprobante de pago para restablecerlo.
            </div>
          )}

          {awaitingReceipt && duePayment?.dueDate && !isPastDue && (
            <div className="bingo-card" style={{ maxWidth: 480, marginTop: 16, color: 'var(--bingo-warning)' }}>
              Tu período de facturación terminó. Paga antes del{' '}
              {new Date(duePayment.dueDate).toLocaleDateString('es-EC')} para que tu negocio siga siendo visible para
              los clientes.
            </div>
          )}

          {duePayment?.status === 'REJECTED' && (
            <div className="bingo-card" style={{ maxWidth: 480, marginTop: 16, color: 'var(--bingo-error)' }}>
              Tu comprobante fue rechazado{duePayment.rejectionReason ? `: ${duePayment.rejectionReason}` : '.'} Intenta
              de nuevo.
            </div>
          )}

          {error && <div className="bingo-card" style={{ maxWidth: 480, marginTop: 16, color: 'var(--bingo-error)' }}>{error}</div>}
          {notice && <div className="bingo-card" style={{ maxWidth: 480, marginTop: 16, color: 'var(--bingo-success)' }}>{notice}</div>}

          {!duePayment ? (
            // Problem 1's fix: no due record exists yet (still within a free/covered period, or the
            // current period is already settled) — never show the pagar UI "just in case".
            <div className="bingo-card" style={{ maxWidth: 480, marginTop: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px' }}>Al día</h2>
              <p style={{ fontSize: 12, color: '#7f8ea3', margin: 0 }}>
                No tienes ningún pago de membresía pendiente en este momento.
                {duePeriodEnd && (
                  <> Próximo cobro: {new Date(duePeriodEnd).toLocaleDateString('es-EC')}.</>
                )}
              </p>
            </div>
          ) : (
            <div className="bingo-card" style={{ maxWidth: 480, marginTop: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px' }}>Pagar membresía</h2>
              <p style={{ fontSize: 12, color: '#7f8ea3', margin: '0 0 12px' }}>
                Período a pagar: hasta {new Date(duePayment.periodEnd).toLocaleDateString('es-EC')} ·{' '}
                {currencyFormatter.format(Number(duePayment.amount))}.
                {duePayment.dueDate && (
                  <> Fecha máxima de pago: {new Date(duePayment.dueDate).toLocaleDateString('es-EC')}.</>
                )}
              </p>

              {awaitingReview ? (
                <p style={{ fontSize: 13, color: '#7f8ea3' }}>
                  Ya tienes un comprobante en revisión. Espera a que un administrador lo apruebe o lo rechace antes de
                  enviar otro.
                </p>
              ) : cardInProgress ? (
                <>
                  {cardFailed ? (
                    <p style={{ fontSize: 13, color: 'var(--bingo-error)', marginBottom: 10 }}>
                      El pago con tarjeta no se pudo completar.
                    </p>
                  ) : (
                    <p style={{ fontSize: 13, color: '#54617a', marginBottom: 10 }}>
                      Tu pago con tarjeta está en proceso.
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      className="bingo-button"
                      style={{ width: 'auto', padding: '0 20px' }}
                      disabled={submitting}
                      onClick={() => payWithCard(duePayment.payment)}
                    >
                      {submitting ? 'Procesando…' : cardFailed ? 'Reintentar pago con tarjeta' : 'Confirmar pago con tarjeta'}
                    </button>
                    {cardFailed && (
                      <button
                        className="bingo-button secondary"
                        style={{ width: 'auto', padding: '0 20px' }}
                        disabled={submitting}
                        onClick={() => setShowManualForm(true)}
                      >
                        Pagar en efectivo o transferencia
                      </button>
                    )}
                  </div>
                </>
              ) : !showManualForm ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    className="bingo-button"
                    style={{ width: 'auto', padding: '0 20px' }}
                    disabled={submitting}
                    onClick={() => payWithCard(null)}
                  >
                    💳 Pagar con tarjeta
                  </button>
                  <button
                    className="bingo-button secondary"
                    style={{ width: 'auto', padding: '0 20px' }}
                    disabled={submitting}
                    onClick={() => setShowManualForm(true)}
                  >
                    💵 Pagar en efectivo o transferencia
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                      Método de pago
                    </label>
                    <select
                      className="bingo-input"
                      value={method}
                      onChange={(e) => setMethod(e.target.value as ManualPaymentMethod)}
                    >
                      {MANUAL_PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {PAYMENT_METHOD_LABELS[m]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <ImageUploadField
                    label="Comprobante de pago"
                    value={receiptUrl}
                    onChange={setReceiptUrl}
                    onUploadingChange={setUploadingReceipt}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button
                      className="bingo-button"
                      style={{ width: 'auto', padding: '0 20px' }}
                      disabled={!receiptUrl || uploadingReceipt || submitting}
                      onClick={submitReceipt}
                    >
                      {uploadingReceipt ? 'Esperando la imagen…' : submitting ? 'Enviando…' : 'Enviar comprobante'}
                    </button>
                    <button className="bingo-button secondary" style={{ width: 'auto' }} onClick={() => setShowManualForm(false)}>
                      Cancelar
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {membership.payments.length > 0 && (
            <>
              <h2 className="bingo-section-title">Comprobantes enviados</h2>
              <div className="dashboard-table-wrap">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Período</th>
                      <th>Monto</th>
                      <th>Método</th>
                      <th>Fecha máxima</th>
                      <th>Estado</th>
                      <th>Comprobante</th>
                    </tr>
                  </thead>
                  <tbody>
                    {membership.payments.map((p) => (
                      <tr key={p.id}>
                        <td>
                          {new Date(p.periodStart).toLocaleDateString('es-EC')} – {new Date(p.periodEnd).toLocaleDateString('es-EC')}
                        </td>
                        <td>{currencyFormatter.format(Number(p.amount))}</td>
                        <td>{p.method ? PAYMENT_METHOD_LABELS[p.method] : '—'}</td>
                        <td>{p.dueDate ? new Date(p.dueDate).toLocaleDateString('es-EC') : '—'}</td>
                        <td>
                          <span
                            className="bingo-badge"
                            style={{
                              background: '#f2f4f7',
                              color: p.status === 'REJECTED' ? 'var(--bingo-error)' : p.status === 'VERIFIED' ? 'var(--bingo-success)' : 'var(--bingo-warning)',
                            }}
                          >
                            {PAYMENT_STATUS_LABELS[p.status] ?? p.status}
                          </span>
                          {p.status === 'REJECTED' && p.rejectionReason && (
                            <div style={{ fontSize: 11, color: '#7f8ea3', marginTop: 2 }}>{p.rejectionReason}</div>
                          )}
                        </td>
                        <td>
                          {p.method === 'CARD' ? (
                            <span style={{ color: '#9aa5b1' }}>{p.payment?.status === 'PAID' ? 'Pagado con tarjeta' : p.payment?.status === 'FAILED' ? 'Pago fallido' : 'Procesando'}</span>
                          ) : p.receiptUrl ? (
                            <a href={p.receiptUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--bingo-teal)', fontWeight: 700 }}>
                              Ver
                            </a>
                          ) : (
                            <span style={{ color: '#9aa5b1' }}>Pendiente de subir</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <h2 className="bingo-section-title">Historial de facturación</h2>
          {membership.subscriptions.length === 0 ? (
            <EmptyState title="Sin períodos de facturación todavía" />
          ) : (
            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Período</th>
                    <th>Monto</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {membership.subscriptions.map((s) => (
                    <tr key={s.id}>
                      <td>
                        {new Date(s.periodStart).toLocaleDateString('es-EC')} – {new Date(s.periodEnd).toLocaleDateString('es-EC')}
                      </td>
                      <td>{currencyFormatter.format(Number(s.amount))}</td>
                      <td>
                        <span className="bingo-badge" style={{ background: '#f2f4f7', color: STATUS_COLORS[s.status] ?? '#54617a' }}>
                          {STATUS_LABELS[s.status] ?? s.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}

export default function MembershipPage() {
  return (
    <DashboardShell>
      <MembershipContent />
    </DashboardShell>
  );
}
