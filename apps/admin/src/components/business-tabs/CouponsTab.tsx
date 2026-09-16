'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetchPage } from '@/lib/api';

interface CouponRow {
  id: string;
  code: string;
  title: string;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: string | number;
  status: string;
  startDate: string;
  expirationDate: string;
}

const STATUS_TABS = [
  { value: '', label: 'Todos' },
  { value: 'ACTIVE', label: 'Activos' },
  { value: 'DRAFT', label: 'Borrador' },
  { value: 'PAUSED', label: 'Pausados' },
  { value: 'EXPIRED', label: 'Expirados' },
  { value: 'CANCELLED', label: 'Cancelados' },
];

export default function CouponsTab({ businessId }: { businessId: string }) {
  const [status, setStatus] = useState('');
  const [coupons, setCoupons] = useState<CouponRow[] | null>(null);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ pageSize: '50', businessId });
    if (status) params.set('status', status);
    const result = await apiFetchPage<CouponRow>(`/admin/business-coupons?${params}`);
    setCoupons(result.data);
    setTotal(result.meta.total);
  }, [businessId, status]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <p style={{ fontSize: 13, color: '#7f8ea3', marginBottom: 14 }}>
        {total} cupón(es) que este negocio ofrece a sus propios clientes.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {STATUS_TABS.map((t) => (
          <button key={t.value} onClick={() => setStatus(t.value)} className={`bingo-button ${status === t.value ? '' : 'secondary'}`} style={{ padding: '8px 14px', fontSize: 13 }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bingo-card">
        {coupons === null ? (
          <p>Cargando…</p>
        ) : coupons.length === 0 ? (
          <p>Este negocio no tiene cupones en este filtro.</p>
        ) : (
          <table className="bingo-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Título</th>
                <th>Descuento</th>
                <th>Vigencia</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id}>
                  <td>
                    <code>{c.code}</code>
                  </td>
                  <td>{c.title}</td>
                  <td>{c.discountType === 'PERCENTAGE' ? `${c.discountValue}%` : `$${c.discountValue}`}</td>
                  <td style={{ fontSize: 12 }}>
                    {new Date(c.startDate).toLocaleDateString('es-EC')} – {new Date(c.expirationDate).toLocaleDateString('es-EC')}
                  </td>
                  <td>
                    <span className={`bingo-badge badge-${c.status.toLowerCase()}`}>{c.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
