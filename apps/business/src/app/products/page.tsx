'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardShell, { useBusiness } from '@/components/DashboardShell';
import EmptyState from '@/components/EmptyState';
import { apiFetchPage, getActiveBusinessId } from '@/lib/api';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

interface ProductRow {
  id: string;
  name: string;
  price: string | number;
  salePrice: string | number | null;
  stock: number;
  status: 'ACTIVE' | 'INACTIVE';
  lowStock: boolean;
  category: { name: string };
  images: string[];
}

function ProductsContent() {
  const router = useRouter();
  const { business } = useBusiness();
  const businessId = getActiveBusinessId();
  const [products, setProducts] = useState<ProductRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);

  const load = useCallback(() => {
    if (!businessId) return;
    const params = new URLSearchParams({ pageSize: '100' });
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    if (lowStockOnly) params.set('lowStock', 'true');
    apiFetchPage<ProductRow>(`/business/${businessId}/products?${params}`)
      .then((r) => {
        setProducts(r.data);
        setTotal(r.meta.total);
      })
      .catch(() => setProducts([]));
  }, [businessId, search, status, lowStockOnly]);

  useEffect(() => {
    const t = setTimeout(load, 250); // debounce the free-text search
    return () => clearTimeout(t);
  }, [load]);

  if (!business.capabilities.SELLS_PRODUCTS) {
    return <EmptyState title="Esta sección no está disponible" subtitle="Tu negocio no tiene habilitada la venta de productos." />;
  }

  return (
    <>
      <header className="dashboard-page-header">
        <div>
          <div className="dashboard-page-title">Productos</div>
          <div className="dashboard-page-subtitle">{total} producto(s)</div>
        </div>
        <button className="bingo-button" style={{ width: 'auto' }} onClick={() => router.push('/products/new')}>
          + Agregar producto
        </button>
      </header>

      <div className="dashboard-toolbar">
        <input
          className="bingo-input dashboard-search"
          placeholder="Buscar producto…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="bingo-chip-row">
          {[
            { value: '', label: 'Todos' },
            { value: 'ACTIVE', label: 'Activos' },
            { value: 'INACTIVE', label: 'Inactivos' },
          ].map((t) => (
            <button key={t.value} className={`bingo-chip${status === t.value ? ' active' : ''}`} onClick={() => setStatus(t.value)}>
              {t.label}
            </button>
          ))}
          <button className={`bingo-chip${lowStockOnly ? ' active' : ''}`} onClick={() => setLowStockOnly((v) => !v)}>
            Stock bajo
          </button>
        </div>
      </div>

      {products === null ? (
        <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
      ) : products.length === 0 ? (
        <EmptyState title="No hay productos" subtitle="Agrega tu primer producto para empezar a vender." />
      ) : (
        <div className="dashboard-table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Categoría</th>
                <th>Precio</th>
                <th>Stock</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} onClick={() => router.push(`/products/${p.id}`)}>
                  <td style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {p.images[0] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.images[0]} alt="" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover' }} />
                    )}
                    {p.name}
                  </td>
                  <td>{p.category.name}</td>
                  <td>
                    {p.salePrice ? (
                      <>
                        <span style={{ textDecoration: 'line-through', color: '#9aa5b1', marginRight: 6 }}>
                          {currencyFormatter.format(Number(p.price))}
                        </span>
                        {currencyFormatter.format(Number(p.salePrice))}
                      </>
                    ) : (
                      currencyFormatter.format(Number(p.price))
                    )}
                  </td>
                  <td style={p.lowStock ? { color: 'var(--bingo-warning)', fontWeight: 700 } : undefined}>
                    {p.stock} {p.lowStock ? '⚠️' : ''}
                  </td>
                  <td>
                    <span
                      className="bingo-badge"
                      style={{
                        background: '#f2f4f7',
                        color: p.status === 'ACTIVE' ? 'var(--bingo-success)' : '#9aa5b1',
                      }}
                    >
                      {p.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function ProductsPage() {
  return (
    <DashboardShell>
      <ProductsContent />
    </DashboardShell>
  );
}
