'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';
import EmptyState from '@/components/EmptyState';
import ProductForm, { ProductFormValues } from '@/components/ProductForm';
import { apiFetch, ApiError, getActiveBusinessId } from '@/lib/api';

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: string | number;
  salePrice: string | number | null;
  sku: string | null;
  taxCategory: 'STANDARD' | 'ZERO';
  stock: number;
  lowStock: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  images: string[];
  category: { slug: string };
  species: { slug: string }[];
}

function ProductDetailContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const businessId = getActiveBusinessId();
  const [product, setProduct] = useState<Product | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!businessId) return;
    apiFetch<Product>(`/business/${businessId}/products/${params.id}`)
      .then(setProduct)
      .catch(() => setProduct(null));
  }, [businessId, params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(values: ProductFormValues) {
    if (!businessId) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/business/${businessId}/products/${params.id}`, {
        method: 'PATCH',
        body: JSON.stringify(values),
      });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el producto.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    if (!businessId || !product) return;
    setBusy(true);
    try {
      await apiFetch(`/business/${businessId}/products/${params.id}/${product.status === 'ACTIVE' ? 'deactivate' : 'activate'}`, {
        method: 'PATCH',
      });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar el estado.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!businessId) return;
    setBusy(true);
    try {
      await apiFetch(`/business/${businessId}/products/${params.id}`, { method: 'DELETE' });
      router.push('/products');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo eliminar el producto.');
      setBusy(false);
    }
  }

  if (product === undefined) return <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>;
  if (!product) return <EmptyState title="Producto no encontrado" />;

  return (
    <>
      <button className="bingo-button secondary small" style={{ marginBottom: 16, width: 'auto' }} onClick={() => router.push('/products')}>
        ← Productos
      </button>
      <header className="dashboard-page-header">
        <div>
          <div className="dashboard-page-title">{product.name}</div>
          <div className="dashboard-page-subtitle">
            Stock actual: {product.stock} {product.lowStock ? '⚠️ bajo' : ''} ·{' '}
            <a href="/inventory" style={{ color: 'var(--bingo-teal)', fontWeight: 700 }}>
              Ajustar en Inventario
            </a>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="bingo-button secondary small" disabled={busy} onClick={toggleActive}>
            {product.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}
          </button>
          <button className="bingo-button danger small" disabled={busy} onClick={remove}>
            Eliminar
          </button>
        </div>
      </header>

      {error && <div className="bingo-error-banner" style={{ marginBottom: 14, maxWidth: 640 }}>{error}</div>}

      <ProductForm
        showStock={false}
        submitting={saving}
        submitLabel="Guardar cambios"
        onSubmit={handleSubmit}
        initial={{
          name: product.name,
          description: product.description ?? '',
          categorySlug: product.category.slug,
          price: Number(product.price),
          salePrice: product.salePrice ? Number(product.salePrice) : undefined,
          sku: product.sku ?? '',
          taxCategory: product.taxCategory,
          images: product.images,
          speciesSlugs: product.species.map((s) => s.slug),
        }}
      />
    </>
  );
}

export default function ProductDetailPage() {
  return (
    <DashboardShell>
      <ProductDetailContent />
    </DashboardShell>
  );
}
