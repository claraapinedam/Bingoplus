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

export default function BusinessPaymentsPage() {
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
    <AdminShell>
      <h1 className="bingo-page-title" style={{ marginBottom: 24 }}>Pagos a negocios</h1>

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
    </AdminShell>
  );
}
