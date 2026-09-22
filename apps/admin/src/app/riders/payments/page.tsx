'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '@/components/AdminShell';
import { apiFetch, ApiError } from '@/lib/api';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

interface PendingRiderRow {
  riderId: string;
  riderName: string;
  riderEmail: string | null;
  earningsCount: number;
  amount: number;
}

export default function RiderPaymentsPage() {
  const router = useRouter();
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<PendingRiderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await apiFetch<{ total: number; items: PendingRiderRow[] }>('/admin/payouts/riders/pending');
      setTotal(result.total);
      setItems(result.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar el listado de pagos a riders.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AdminShell>
      <h1 className="bingo-page-title" style={{ marginBottom: 24 }}>Pagos a riders</h1>

      <p style={{ fontSize: 13, color: '#7f8ea3', marginBottom: 16 }}>
        Ganancias netas de comisión y retención de impuesto que todavía no se han pagado, acumuladas por rider. Haz
        clic en un rider para ver el detalle de sus pagos pendientes y su historial.
      </p>

      {error && (
        <div className="bingo-card" style={{ marginBottom: 16, color: 'var(--bingo-error)' }}>
          {error}
        </div>
      )}

      <div className="bingo-card" style={{ marginBottom: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: '#7f8ea3' }}>Monto acumulado pendiente (todos los riders)</div>
        <div style={{ fontSize: 28, fontWeight: 800 }}>{currencyFormatter.format(total)}</div>
      </div>

      <div className="bingo-card">
        <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>Riders con saldo pendiente</h2>

        {items === null ? (
          <p>Cargando…</p>
        ) : items.length === 0 ? (
          <p style={{ fontSize: 13, color: '#7f8ea3' }}>No hay pagos pendientes a riders.</p>
        ) : (
          <table className="bingo-table">
            <thead>
              <tr>
                <th>Rider</th>
                <th>Entregas</th>
                <th>Monto neto</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.riderId} style={{ cursor: 'pointer' }} onClick={() => router.push(`/riders/payments/${item.riderId}`)}>
                  <td>
                    {item.riderName}
                    {item.riderEmail && (
                      <>
                        <br />
                        <span style={{ color: '#7f8ea3', fontSize: 12 }}>{item.riderEmail}</span>
                      </>
                    )}
                  </td>
                  <td>{item.earningsCount}</td>
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
