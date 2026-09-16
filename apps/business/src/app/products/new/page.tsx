'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';
import ProductForm, { ProductFormValues } from '@/components/ProductForm';
import { apiFetch, ApiError, getActiveBusinessId } from '@/lib/api';

function NewProductContent() {
  const router = useRouter();
  const businessId = getActiveBusinessId();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(values: ProductFormValues) {
    if (!businessId) return;
    setSaving(true);
    setError(null);
    try {
      const created = await apiFetch<{ id: string }>(`/business/${businessId}/products`, {
        method: 'POST',
        body: JSON.stringify(values),
      });
      router.push(`/products/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el producto.');
      setSaving(false);
    }
  }

  return (
    <>
      <button className="bingo-button secondary small" style={{ marginBottom: 16, width: 'auto' }} onClick={() => router.push('/products')}>
        ← Productos
      </button>
      <header className="dashboard-page-header">
        <div className="dashboard-page-title">Nuevo producto</div>
      </header>
      {error && <div className="bingo-error-banner" style={{ marginBottom: 14, maxWidth: 640 }}>{error}</div>}
      <ProductForm submitting={saving} submitLabel="Crear producto" onSubmit={handleSubmit} />
    </>
  );
}

export default function NewProductPage() {
  return (
    <DashboardShell>
      <NewProductContent />
    </DashboardShell>
  );
}
