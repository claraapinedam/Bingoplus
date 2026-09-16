'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminShell from '@/components/AdminShell';
import { apiFetch, ApiError } from '@/lib/api';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

interface Refund {
  id: string;
  amount: string | number;
  reason: string | null;
  status: string;
  createdAt: string;
}

interface Transaction {
  id: string;
  type: string;
  amount: string | number;
  status: string;
  createdAt: string;
}

interface PaymentDetail {
  id: string;
  provider: string;
  providerPaymentId: string | null;
  amount: string | number;
  currency: string;
  status: string;
  createdAt: string;
  order: { id: string; orderNumber: string; business: { tradeName: string }; user: { firstName: string; lastName: string } };
  refunds: Refund[];
  transactions: Transaction[];
}

const REFUNDABLE_STATUSES = ['PAID', 'PARTIALLY_REFUNDED'];

export default function AdminPaymentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [payment, setPayment] = useState<PaymentDetail | null | undefined>(undefined);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPayment(await apiFetch<PaymentDetail>(`/admin/payments/${params.id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar el pago.');
      setPayment(null);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function refund() {
    if (!amount) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/admin/payments/${params.id}/refund`, {
        method: 'POST',
        body: JSON.stringify({ amount: Number(amount), reason: reason || undefined }),
      });
      setAmount('');
      setReason('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo procesar el reembolso.');
    } finally {
      setBusy(false);
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
        <div className="bingo-card" style={{ color: 'var(--bingo-error)' }}>{error ?? 'Pago no encontrado.'}</div>
      </AdminShell>
    );
  }

  const alreadyRefunded = payment.refunds.filter((r) => r.status === 'COMPLETED').reduce((sum, r) => sum + Number(r.amount), 0);
  const canRefund = REFUNDABLE_STATUSES.includes(payment.status);

  return (
    <AdminShell>
      <button className="bingo-button secondary" style={{ marginBottom: 16, padding: '8px 14px', fontSize: 13 }} onClick={() => router.back()}>
        ← Volver
      </button>

      <h1 className="bingo-page-title">Pago — {payment.order.orderNumber}</h1>
      <p className="bingo-page-subtitle">
        {payment.order.user.firstName} {payment.order.user.lastName} · {payment.order.business.tradeName} ·{' '}
        <span className={`bingo-badge badge-${payment.status.toLowerCase()}`}>{payment.status}</span>
      </p>

      {error && (
        <div className="bingo-card" style={{ marginBottom: 16, color: 'var(--bingo-error)' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="bingo-card">
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>Detalle</h2>
          <div style={{ fontSize: 13, marginBottom: 6 }}>Monto: {currencyFormatter.format(Number(payment.amount))}</div>
          <div style={{ fontSize: 13, marginBottom: 6 }}>Proveedor: {payment.provider}</div>
          <div style={{ fontSize: 13, marginBottom: 6 }}>Ya reembolsado: {currencyFormatter.format(alreadyRefunded)}</div>
          <div style={{ fontSize: 12, color: '#9aa5b1' }}>Creado: {new Date(payment.createdAt).toLocaleString('es-EC')}</div>
        </div>

        {canRefund && (
          <div className="bingo-card">
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px', color: 'var(--bingo-error)' }}>Reembolsar</h2>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Monto (USD)</label>
            <input className="bingo-input" type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ marginBottom: 8 }} />
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Motivo (opcional)</label>
            <input className="bingo-input" value={reason} onChange={(e) => setReason(e.target.value)} style={{ marginBottom: 10 }} />
            <button className="bingo-button danger" disabled={busy || !amount} onClick={refund}>
              {busy ? 'Procesando…' : 'Confirmar reembolso'}
            </button>
          </div>
        )}

        <div className="bingo-card" style={{ gridColumn: 'span 2' }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>Reembolsos</h2>
          {payment.refunds.length === 0 ? (
            <p style={{ fontSize: 13, color: '#7f8ea3' }}>Sin reembolsos todavía.</p>
          ) : (
            <table className="bingo-table">
              <thead>
                <tr>
                  <th>Monto</th>
                  <th>Motivo</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {payment.refunds.map((r) => (
                  <tr key={r.id}>
                    <td>{currencyFormatter.format(Number(r.amount))}</td>
                    <td>{r.reason ?? '—'}</td>
                    <td>
                      <span className={`bingo-badge badge-${r.status.toLowerCase()}`}>{r.status}</span>
                    </td>
                    <td style={{ fontSize: 12 }}>{new Date(r.createdAt).toLocaleString('es-EC')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
