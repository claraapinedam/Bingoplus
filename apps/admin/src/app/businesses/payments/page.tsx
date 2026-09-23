'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '@/components/AdminShell';
import { apiFetch, ApiError } from '@/lib/api';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });
const percentFormatter = new Intl.NumberFormat('es-EC', { style: 'percent', minimumFractionDigits: 1 });

interface PendingBusinessRow {
  businessId: string;
  tradeName: string;
  ordersCount: number;
  gmv: number;
  commissionRate: number;
  amount: number;
}

const MEMBERSHIP_PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'En revisión',
  VERIFIED: 'Verificado',
  REJECTED: 'Rechazado',
};

const MEMBERSHIP_PAYMENT_METHOD_LABELS: Record<string, string> = {
  DEPOSIT: 'Depósito',
  TRANSFER: 'Transferencia',
  CARD: 'Tarjeta',
};

interface MembershipPaymentRow {
  id: string;
  periodStart: string;
  periodEnd: string;
  amount: string | number;
  // Null on an auto-generated row the cutoff sweeper created before the business uploaded anything.
  receiptUrl: string | null;
  method: 'DEPOSIT' | 'TRANSFER' | 'CARD' | null;
  dueDate: string | null;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  createdAt: string;
  membership: { business: { tradeName: string }; plan: { name: string } };
}

function OutgoingPayoutsSection() {
  const router = useRouter();
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<PendingBusinessRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await apiFetch<{ total: number; items: PendingBusinessRow[] }>('/admin/payouts/businesses/pending');
      setTotal(result.total);
      setItems(result.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar el listado de pagos a negocios.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <p style={{ fontSize: 13, color: '#7f8ea3', marginBottom: 16 }}>
        GMV real de pedidos pagados/completados, ya neto de la comisión vigente de cada negocio, que todavía no se
        ha liquidado, acumulado por negocio. Haz clic en un negocio para ver el detalle de sus pedidos pendientes y
        su historial de pagos. Negocios sin una tasa de comisión vigente no aparecen aquí.
      </p>

      {error && (
        <div className="bingo-card" style={{ marginBottom: 16, color: 'var(--bingo-error)' }}>
          {error}
        </div>
      )}

      <div className="bingo-card" style={{ marginBottom: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: '#7f8ea3' }}>Monto acumulado pendiente (todos los negocios)</div>
        <div style={{ fontSize: 28, fontWeight: 800 }}>{currencyFormatter.format(total)}</div>
      </div>

      <div className="bingo-card">
        <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>Negocios con saldo pendiente</h2>

        {items === null ? (
          <p>Cargando…</p>
        ) : items.length === 0 ? (
          <p style={{ fontSize: 13, color: '#7f8ea3' }}>No hay pagos pendientes a negocios.</p>
        ) : (
          <table className="bingo-table">
            <thead>
              <tr>
                <th>Negocio</th>
                <th>Pedidos</th>
                <th>GMV</th>
                <th>Comisión</th>
                <th>Monto a pagar</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.businessId} style={{ cursor: 'pointer' }} onClick={() => router.push(`/businesses/payments/${item.businessId}`)}>
                  <td>{item.tradeName}</td>
                  <td>{item.ordersCount}</td>
                  <td>{currencyFormatter.format(item.gmv)}</td>
                  <td>{percentFormatter.format(item.commissionRate)}</td>
                  <td>{currencyFormatter.format(item.amount)}</td>
                  <td style={{ color: 'var(--bingo-teal)', fontWeight: 700 }}>Ver detalle →</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function IncomingMembershipPaymentsSection() {
  const router = useRouter();
  const [items, setItems] = useState<MembershipPaymentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyPending, setOnlyPending] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      const query = onlyPending ? '?status=PENDING' : '';
      setItems(await apiFetch<MembershipPaymentRow[]>(`/admin/membership-payments${query}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar el listado de pagos de membresía.');
    }
  }, [onlyPending]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <p style={{ fontSize: 13, color: '#7f8ea3', marginBottom: 16 }}>
        Comprobantes de depósito que los negocios suben para pagar su membresía (RULE: pago manual, no se cobra con
        tarjeta). Revisa la imagen del comprobante y márcalo como verificado o rechazado. Un negocio cuyo pago se
        atrasa más de 5 días queda con acceso bloqueado automáticamente hasta que se verifique un pago.
      </p>

      {error && (
        <div className="bingo-card" style={{ marginBottom: 16, color: 'var(--bingo-error)' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          className={`bingo-button ${onlyPending ? '' : 'secondary'}`}
          style={{ width: 'auto' }}
          onClick={() => setOnlyPending(true)}
        >
          Pendientes
        </button>
        <button
          className={`bingo-button ${!onlyPending ? '' : 'secondary'}`}
          style={{ width: 'auto' }}
          onClick={() => setOnlyPending(false)}
        >
          Todos
        </button>
      </div>

      <div className="bingo-card">
        <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>
          {onlyPending ? 'Comprobantes pendientes de revisión' : 'Todos los comprobantes'}
        </h2>

        {items === null ? (
          <p>Cargando…</p>
        ) : items.length === 0 ? (
          <p style={{ fontSize: 13, color: '#7f8ea3' }}>
            {onlyPending ? 'No hay comprobantes pendientes de revisión.' : 'Sin comprobantes todavía.'}
          </p>
        ) : (
          <table className="bingo-table">
            <thead>
              <tr>
                <th>Negocio</th>
                <th>Plan</th>
                <th>Período</th>
                <th>Monto</th>
                <th>Método</th>
                <th>Fecha máxima</th>
                <th>Estado</th>
                <th>Enviado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => router.push(`/businesses/payments/membership/${item.id}`)}
                >
                  <td>{item.membership.business.tradeName}</td>
                  <td>{item.membership.plan.name}</td>
                  <td>
                    {new Date(item.periodStart).toLocaleDateString('es-EC')} – {new Date(item.periodEnd).toLocaleDateString('es-EC')}
                  </td>
                  <td>{currencyFormatter.format(Number(item.amount))}</td>
                  <td>{item.method ? MEMBERSHIP_PAYMENT_METHOD_LABELS[item.method] ?? item.method : '—'}</td>
                  <td>{item.dueDate ? new Date(item.dueDate).toLocaleDateString('es-EC') : '—'}</td>
                  <td>
                    <span
                      className="bingo-badge"
                      style={{
                        background: '#f2f4f7',
                        color: item.status === 'REJECTED' ? 'var(--bingo-error)' : item.status === 'VERIFIED' ? 'var(--bingo-success)' : 'var(--bingo-warning)',
                      }}
                    >
                      {MEMBERSHIP_PAYMENT_STATUS_LABELS[item.status] ?? item.status}
                    </span>
                    {!item.receiptUrl && item.status === 'PENDING' && (
                      <div style={{ fontSize: 11, color: '#9aa5b1', marginTop: 2 }}>Sin comprobante todavía</div>
                    )}
                  </td>
                  <td style={{ fontSize: 12 }}>{new Date(item.createdAt).toLocaleDateString('es-EC')}</td>
                  <td style={{ color: 'var(--bingo-teal)', fontWeight: 700 }}>Revisar →</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

export default function BusinessPaymentsPage() {
  const [tab, setTab] = useState<'payouts' | 'memberships'>('payouts');

  return (
    <AdminShell>
      <h1 className="bingo-page-title" style={{ marginBottom: 8 }}>Pagos</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button
          className={`bingo-button ${tab === 'payouts' ? '' : 'secondary'}`}
          style={{ width: 'auto' }}
          onClick={() => setTab('payouts')}
        >
          Pagos a negocios
        </button>
        <button
          className={`bingo-button ${tab === 'memberships' ? '' : 'secondary'}`}
          style={{ width: 'auto' }}
          onClick={() => setTab('memberships')}
        >
          Pagos de membresía
        </button>
      </div>

      {tab === 'payouts' ? <OutgoingPayoutsSection /> : <IncomingMembershipPaymentsSection />}
    </AdminShell>
  );
}
