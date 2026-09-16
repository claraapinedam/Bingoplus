'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardShell, { useBusiness } from '@/components/DashboardShell';
import { apiFetch, apiFetchPage, ApiError, getActiveBusinessId } from '@/lib/api';

interface Product {
  id: string;
  name: string;
}
interface Service {
  id: string;
  name: string;
}
interface Category {
  id: string;
  name: string;
}

type Scope = 'BUSINESS' | 'PRODUCT' | 'PRODUCT_CATEGORY' | 'SERVICE';

function NewPromotionContent() {
  const router = useRouter();
  const { business } = useBusiness();
  const businessId = getActiveBusinessId();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'PERCENTAGE' | 'FIXED_AMOUNT'>('PERCENTAGE');
  const [value, setValue] = useState('');
  const [minimumPurchase, setMinimumPurchase] = useState('');
  const [maximumDiscount, setMaximumDiscount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [scope, setScope] = useState<Scope>('BUSINESS');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [products, setProducts] = useState<Product[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) return;
    if (business.capabilities.SELLS_PRODUCTS) {
      apiFetchPage<Product>(`/business/${businessId}/products?pageSize=100`).then((r) => setProducts(r.data)).catch(() => undefined);
      apiFetch<Category[]>('/public/product-categories').then(setCategories).catch(() => undefined);
    }
    if (business.capabilities.SERVICES) {
      apiFetchPage<Service>(`/business/${businessId}/services?pageSize=100`)
        .then((r) => setServices(r.data))
        .catch(() => undefined);
    }
  }, [businessId, business.capabilities.SELLS_PRODUCTS, business.capabilities.SERVICES]);

  function toggleId(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!businessId) return;
    setSaving(true);
    setError(null);
    try {
      const targets =
        scope === 'BUSINESS'
          ? [{ targetType: 'BUSINESS' }]
          : selectedIds.map((id) => ({ targetType: scope, targetId: id }));
      if (targets.length === 0) {
        setError('Selecciona al menos un producto, categoría o servicio.');
        setSaving(false);
        return;
      }
      const created = await apiFetch<{ id: string }>(`/business/${businessId}/promotions`, {
        method: 'POST',
        body: JSON.stringify({
          name,
          description: description || undefined,
          type,
          value: Number(value),
          minimumPurchase: minimumPurchase ? Number(minimumPurchase) : undefined,
          maximumDiscount: maximumDiscount ? Number(maximumDiscount) : undefined,
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate).toISOString(),
          targets,
        }),
      });
      router.push(`/promotions`);
      void created;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear la promoción.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button className="bingo-button secondary small" style={{ marginBottom: 16, width: 'auto' }} onClick={() => router.push('/promotions')}>
        ← Promociones
      </button>
      <header className="dashboard-page-header">
        <div className="dashboard-page-title">Nueva promoción</div>
      </header>

      {error && <div className="bingo-error-banner" style={{ marginBottom: 14, maxWidth: 640 }}>{error}</div>}

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Nombre</label>
          <input className="bingo-input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. 20% en accesorios" />
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Descripción (opcional)</label>
          <textarea className="bingo-input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="dashboard-form-grid">
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Tipo</label>
            <select className="bingo-input" value={type} onChange={(e) => setType(e.target.value as 'PERCENTAGE' | 'FIXED_AMOUNT')}>
              <option value="PERCENTAGE">Porcentaje (%)</option>
              <option value="FIXED_AMOUNT">Monto fijo ($)</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Valor</label>
            <input className="bingo-input" type="number" min={0.01} step="0.01" required value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
        </div>

        <div className="dashboard-form-grid">
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Compra mínima (opcional)</label>
            <input className="bingo-input" type="number" min={0} step="0.01" value={minimumPurchase} onChange={(e) => setMinimumPurchase(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Descuento máximo (opcional)</label>
            <input className="bingo-input" type="number" min={0} step="0.01" value={maximumDiscount} onChange={(e) => setMaximumDiscount(e.target.value)} />
          </div>
        </div>

        <div className="dashboard-form-grid">
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Desde</label>
            <input className="bingo-input" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Hasta</label>
            <input className="bingo-input" type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>¿A qué aplica?</label>
          <div className="bingo-chip-row" style={{ flexWrap: 'wrap' }}>
            <button type="button" className={`bingo-chip${scope === 'BUSINESS' ? ' active' : ''}`} onClick={() => { setScope('BUSINESS'); setSelectedIds([]); }}>
              Todo el negocio
            </button>
            {business.capabilities.SELLS_PRODUCTS && (
              <>
                <button type="button" className={`bingo-chip${scope === 'PRODUCT' ? ' active' : ''}`} onClick={() => { setScope('PRODUCT'); setSelectedIds([]); }}>
                  Productos específicos
                </button>
                <button type="button" className={`bingo-chip${scope === 'PRODUCT_CATEGORY' ? ' active' : ''}`} onClick={() => { setScope('PRODUCT_CATEGORY'); setSelectedIds([]); }}>
                  Categoría de productos
                </button>
              </>
            )}
            {business.capabilities.SERVICES && (
              <button type="button" className={`bingo-chip${scope === 'SERVICE' ? ' active' : ''}`} onClick={() => { setScope('SERVICE'); setSelectedIds([]); }}>
                Servicios específicos
              </button>
            )}
          </div>
        </div>

        {scope === 'PRODUCT' && (
          <div className="bingo-chip-row" style={{ flexWrap: 'wrap' }}>
            {products.map((p) => (
              <button key={p.id} type="button" className={`bingo-chip${selectedIds.includes(p.id) ? ' active' : ''}`} onClick={() => toggleId(p.id)}>
                {p.name}
              </button>
            ))}
          </div>
        )}
        {scope === 'PRODUCT_CATEGORY' && (
          <div className="bingo-chip-row" style={{ flexWrap: 'wrap' }}>
            {categories.map((c) => (
              <button key={c.id} type="button" className={`bingo-chip${selectedIds.includes(c.id) ? ' active' : ''}`} onClick={() => setSelectedIds([c.id])}>
                {c.name}
              </button>
            ))}
          </div>
        )}
        {scope === 'SERVICE' && (
          <div className="bingo-chip-row" style={{ flexWrap: 'wrap' }}>
            {services.map((s) => (
              <button key={s.id} type="button" className={`bingo-chip${selectedIds.includes(s.id) ? ' active' : ''}`} onClick={() => toggleId(s.id)}>
                {s.name}
              </button>
            ))}
          </div>
        )}

        <button className="bingo-button" type="submit" disabled={saving} style={{ width: 'auto', alignSelf: 'flex-start', padding: '12px 28px' }}>
          {saving ? 'Guardando…' : 'Crear promoción (borrador)'}
        </button>
      </form>
    </>
  );
}

export default function NewPromotionPage() {
  return (
    <DashboardShell>
      <NewPromotionContent />
    </DashboardShell>
  );
}
