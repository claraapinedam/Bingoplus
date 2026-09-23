'use client';

import { useCallback, useEffect, useState } from 'react';
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

interface MembershipPayment {
  id: string;
  periodStart: string;
  periodEnd: string;
  amount: string | number;
  currency: string;
  receiptUrl: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  rejectionReason: string | null;
  createdAt: string;
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
  const [membership, setMembership] = useState<Membership | null | undefined>(undefined);
  const [receiptUrl, setReceiptUrl] = useState('');
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
        body: JSON.stringify({ receiptUrl }),
      });
      setReceiptUrl('');
      setNotice('Comprobante enviado. Un administrador lo revisará en breve.');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar el comprobante.');
    } finally {
      setSubmitting(false);
    }
  }

  const hasPendingPayment = membership?.payments?.some((p) => p.status === 'PENDING') ?? false;
  const duePeriodEnd = membership?.currentPeriodEnd ?? membership?.trialEndsAt ?? null;
  const isPastDue = membership?.status === 'PAST_DUE';
  // A CANCELLED/EXPIRED membership has nothing left to pay for through this flow; every other
  // status (TRIAL/ACTIVE/PAST_DUE/PAUSED) can still have a period awaiting a receipt.
  const canSubmitPayment =
    membership != null && membership.status !== 'CANCELLED' && membership.status !== 'EXPIRED';

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
              Tu pago de membresía está atrasado y tu acceso está bloqueado. Sube tu comprobante de depósito para
              restablecerlo.
            </div>
          )}

          {error && <div className="bingo-card" style={{ maxWidth: 480, marginTop: 16, color: 'var(--bingo-error)' }}>{error}</div>}
          {notice && <div className="bingo-card" style={{ maxWidth: 480, marginTop: 16, color: 'var(--bingo-success)' }}>{notice}</div>}

          {canSubmitPayment && (
            <div className="bingo-card" style={{ maxWidth: 480, marginTop: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px' }}>Reportar pago de membresía</h2>
              <p style={{ fontSize: 12, color: '#7f8ea3', margin: '0 0 12px' }}>
                Realiza el depósito bancario y sube una foto o captura del comprobante para que un administrador lo
                verifique.
                {duePeriodEnd && (
                  <>
                    {' '}
                    Período a pagar: hasta {new Date(duePeriodEnd).toLocaleDateString('es-EC')} ·{' '}
                    {currencyFormatter.format(Number(membership.plan.price))}.
                  </>
                )}
              </p>
              {hasPendingPayment ? (
                <p style={{ fontSize: 13, color: '#7f8ea3' }}>
                  Ya tienes un comprobante en revisión. Espera a que un administrador lo apruebe o lo rechace antes de
                  enviar otro.
                </p>
              ) : (
                <>
                  <ImageUploadField
                    label="Comprobante de depósito"
                    value={receiptUrl}
                    onChange={setReceiptUrl}
                    onUploadingChange={setUploadingReceipt}
                  />
                  <button
                    className="bingo-button"
                    style={{ marginTop: 12, width: 'auto', padding: '0 20px' }}
                    disabled={!receiptUrl || uploadingReceipt || submitting}
                    onClick={submitReceipt}
                  >
                    {uploadingReceipt ? 'Esperando la imagen…' : submitting ? 'Enviando…' : 'Enviar comprobante'}
                  </button>
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
                          <a href={p.receiptUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--bingo-teal)', fontWeight: 700 }}>
                            Ver
                          </a>
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
