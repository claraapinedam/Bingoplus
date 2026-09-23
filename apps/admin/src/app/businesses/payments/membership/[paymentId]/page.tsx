'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminShell from '@/components/AdminShell';
import BackButton from '@/components/BackButton';
import { apiFetch, ApiError } from '@/lib/api';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'En revisión',
  VERIFIED: 'Verificado',
  REJECTED: 'Rechazado',
};

interface MembershipPaymentDetail {
  id: string;
  periodStart: string;
  periodEnd: string;
  amount: string | number;
  currency: string;
  receiptUrl: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  rejectionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
  membership: { business: { id: string; tradeName: string }; plan: { name: string } };
}

// Mirrors the refund-completion review UX exactly (AdminPaymentsController.completeRefund /
// apps/admin/src/app/payments/[id]/page.tsx "Marcar como reembolsado"): a business submits an
// off-system proof, it sits PENDING, an admin looks at the evidence and marks it VERIFIED or
// REJECTED (with a reason) — no payment-provider call either way, this only records what happened.
export default function AdminMembershipPaymentDetailPage() {
  const params = useParams<{ paymentId: string }>();
  const router = useRouter();
  const [payment, setPayment] = useState<MembershipPaymentDetail | null | undefined>(undefined);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'verify' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPayment(await apiFetch<MembershipPaymentDetail>(`/admin/membership-payments/${params.paymentId}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar el comprobante.');
      setPayment(null);
    }
  }, [params.paymentId]);

  useEffect(() => {
    load();
  }, [load]);

  async function verify() {
    setBusy('verify');
    setError(null);
    try {
      await apiFetch(`/admin/membership-payments/${params.paymentId}/verify`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo verificar el comprobante.');
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    setBusy('reject');
    setError(null);
    try {
      await apiFetch(`/admin/membership-payments/${params.paymentId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason || undefined }),
      });
      setReason('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo rechazar el comprobante.');
    } finally {
      setBusy(null);
    }
  }

  if (payment === undefined) {
    return (
      <AdminShell>
        <p>Cargando…</p>
      </AdminShell>
    );
  }
  if (!payment) {
    return (
      <AdminShell>
        <div className="bingo-card" style={{ color: 'var(--bingo-error)' }}>{error ?? 'Comprobante no encontrado.'}</div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <BackButton onClick={() => router.push('/businesses/payments')} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
        <h1 className="bingo-page-title" style={{ margin: 0 }}>
          {payment.membership.business.tradeName} — {payment.membership.plan.name}
        </h1>
        <span className={`bingo-badge badge-${payment.status.toLowerCase()}`}>{STATUS_LABELS[payment.status]}</span>
      </div>

      {error && (
        <div className="bingo-card" style={{ marginBottom: 16, color: 'var(--bingo-error)' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="bingo-card">
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>Detalle</h2>
          <div style={{ fontSize: 13, marginBottom: 6 }}>Monto: {currencyFormatter.format(Number(payment.amount))}</div>
          <div style={{ fontSize: 13, marginBottom: 6 }}>
            Período: {new Date(payment.periodStart).toLocaleDateString('es-EC')} – {new Date(payment.periodEnd).toLocaleDateString('es-EC')}
          </div>
          <div style={{ fontSize: 12, color: '#9aa5b1' }}>Enviado: {new Date(payment.createdAt).toLocaleString('es-EC')}</div>
          {payment.reviewedAt && (
            <div style={{ fontSize: 12, color: '#9aa5b1' }}>Revisado: {new Date(payment.reviewedAt).toLocaleString('es-EC')}</div>
          )}
          {payment.status === 'REJECTED' && payment.rejectionReason && (
            <div style={{ fontSize: 13, color: 'var(--bingo-error)', marginTop: 8 }}>Motivo del rechazo: {payment.rejectionReason}</div>
          )}
        </div>

        <div className="bingo-card">
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>Comprobante de depósito</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={payment.receiptUrl}
            alt="Comprobante de depósito"
            style={{ maxWidth: '100%', borderRadius: 10, border: '1px solid #e0e4ea' }}
          />
          <div style={{ marginTop: 8 }}>
            <a href={payment.receiptUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--bingo-teal)', fontWeight: 700, fontSize: 13 }}>
              Abrir en tamaño completo →
            </a>
          </div>
        </div>

        {payment.status === 'PENDING' && (
          <div className="bingo-card" style={{ gridColumn: 'span 2' }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>Revisar</h2>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <button className="bingo-button" disabled={busy !== null} onClick={verify}>
                  {busy === 'verify' ? 'Verificando…' : 'Marcar como verificado'}
                </button>
              </div>
              <div style={{ flex: '1 1 260px' }}>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Motivo de rechazo (opcional)</label>
                <input
                  className="bingo-input"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ej. comprobante ilegible, monto incorrecto…"
                  style={{ marginBottom: 8 }}
                />
                <button className="bingo-button danger" disabled={busy !== null} onClick={reject}>
                  {busy === 'reject' ? 'Rechazando…' : 'Rechazar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
