'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetchPage } from '@/lib/api';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

interface ProductRow {
  id: string;
  name: string;
  price: string | number;
  stock: number;
  lowStock: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  category: { name: string };
  species: { name: string }[];
}

export default function ProductsTab({ businessId }: { businessId: string }) {
  const [status, setStatus] = useState('');
  const [products, setProducts] = useState<ProductRow[] | null>(null);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ pageSize: '50', businessId });
    if (status) params.set('status', status);
    const result = await apiFetchPage<ProductRow>(`/admin/products?${params}`);
    setProducts(result.data);
    setTotal(result.meta.total);
  }, [businessId, status]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <p style={{ fontSize: 13, color: '#7f8ea3', marginBottom: 14 }}>
        {total} producto(s). Solo lectura: el negocio administra su propio catálogo desde el Business Portal.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { value: '', label: 'Todos' },
          { value: 'ACTIVE', label: 'Activos' },
          { value: 'INACTIVE', label: 'Inactivos' },
        ].map((t) => (
          <button key={t.value} onClick={() => setStatus(t.value)} className={`bingo-button ${status === t.value ? '' : 'secondary'}`} style={{ padding: '8px 14px', fontSize: 13 }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bingo-card">
        {products === null ? (
          <p>Cargando…</p>
        ) : products.length === 0 ? (
          <p>Este negocio no tiene productos en este filtro.</p>
        ) : (
          <table className="bingo-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Categoría</th>
                <th>Especies</th>
                <th>Precio</th>
                <th>Stock</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.category.name}</td>
                  <td>{p.species.map((s) => s.name).join(', ') || '—'}</td>
                  <td>{currencyFormatter.format(Number(p.price))}</td>
                  <td style={p.lowStock ? { color: 'var(--bingo-warning)', fontWeight: 700 } : undefined}>{p.stock}</td>
                  <td>
                    <span className={`bingo-badge ${p.status === 'ACTIVE' ? 'badge-active' : 'badge-inactive'}`}>{p.status}</span>
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
