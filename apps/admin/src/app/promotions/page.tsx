'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { apiFetchPage } from '@/lib/api';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

const STATUS_TABS = [
  { value: '', label: 'Todas' },
  { value: 'DRAFT', label: 'Borrador' },
  { value: 'ACTIVE', label: 'Activas' },
  { value: 'PAUSED', label: 'Pausadas' },
  { value: 'EXPIRED', label: 'Expiradas' },
  { value: 'CANCELLED', label: 'Canceladas' },
];

interface PromotionRow {
  id: string;
  name: string;
  type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  value: string | number;
  status: string;
  startDate: string;
  endDate: string;
  business: { tradeName: string };
  targets: { targetType: string }[];
}

export default function AdminPromotionsPage() {
  const [status, setStatus] = useState('');
  const [promotions, setPromotions] = useState<PromotionRow[] | null>(null);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ pageSize: '50' });
    if (status) params.set('status', status);
    const result = await apiFetchPage<PromotionRow>(`/admin/promotions?${params}`);
    setPromotions(result.data);
    setTotal(result.meta.total);
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AdminShell>
      <h1 className="bingo-page-title">Promociones</h1>
      <p className="bingo-page-subtitle">
        {total} promoción(es) — supervisión global. Solo lectura: cada negocio administra sus propias promociones.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {STATUS_TABS.map((t) => (
          <button key={t.value} onClick={() => setStatus(t.value)} className={`bingo-button ${status === t.value ? '' : 'secondary'}`} style={{ padding: '8px 14px', fontSize: 13 }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bingo-card">
        {promotions === null ? (
          <p>Cargando…</p>
        ) : promotions.length === 0 ? (
          <p>No hay promociones en este filtro.</p>
        ) : (
          <table className="bingo-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Negocio</th>
                <th>Aplica a</th>
                <th>Descuento</th>
                <th>Vigencia</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {promotions.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.business.tradeName}</td>
                  <td>{p.targets.map((t) => t.targetType).join(', ')}</td>
                  <td>{p.type === 'PERCENTAGE' ? `${p.value}%` : currencyFormatter.format(Number(p.value))}</td>
                  <td style={{ fontSize: 12 }}>
                    {new Date(p.startDate).toLocaleDateString('es-EC')} – {new Date(p.endDate).toLocaleDateString('es-EC')}
                  </td>
                  <td>
                    <span className={`bingo-badge badge-${p.status.toLowerCase()}`}>{p.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminShell>
  );
}
