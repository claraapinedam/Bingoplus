'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetchPage } from '@/lib/api';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

interface PaymentRow {
  id: string;
  provider: string;
  amount: string | number;
  status: string;
  createdAt: string;
  order: { orderNumber: string; user: { firstName: string; lastName: string } };
}

const STATUS_TABS = [
  { value: '', label: 'Todos' },
  { value: 'PAID', label: 'Pagados' },
  { value: 'PENDING', label: 'Pendientes' },
  { value: 'FAILED', label: 'Fallidos' },
  { value: 'REFUNDED', label: 'Reembolsados' },
  { value: 'PARTIALLY_REFUNDED', label: 'Reemb. parcial' },
];

export default function PaymentsTab({ businessId }: { businessId: string }) {
  const [status, setStatus] = useState('');
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ pageSize: '50', businessId });
    if (status) params.set('status', status);
    const result = await apiFetchPage<PaymentRow>(`/admin/payments?${params}`);
    setPayments(result.data);
    setTotal(result.meta.total);
  }, [businessId, status]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <p style={{ fontSize: 13, color: '#7f8ea3', marginBottom: 14 }}>{total} pago(s) de pedidos de este negocio.</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {STATUS_TABS.map((t) => (
          <button key={t.value} onClick={() => setStatus(t.value)} className={`bingo-button ${status === t.value ? '' : 'secondary'}`} style={{ padding: '8px 14px', fontSize: 13 }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bingo-card">
        {payments === null ? (
          <p>Cargando…</p>
        ) : payments.length === 0 ? (
          <p>Este negocio no tiene pagos en este filtro.</p>
        ) : (
          <table className="bingo-table">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Monto</th>
                <th>Proveedor</th>
                <th>Estado</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} onClick={() => (window.location.href = `/payments/${p.id}`)} style={{ cursor: 'pointer' }}>
                  <td>{p.order.orderNumber}</td>
                  <td>
                    {p.order.user.firstName} {p.order.user.lastName}
                  </td>
                  <td>{currencyFormatter.format(Number(p.amount))}</td>
                  <td>{p.provider}</td>
                  <td>
                    <span className={`bingo-badge badge-${p.status.toLowerCase()}`}>{p.status}</span>
                  </td>
                  <td style={{ fontSize: 12 }}>{new Date(p.createdAt).toLocaleString('es-EC')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
