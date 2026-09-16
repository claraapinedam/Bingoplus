'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

export interface ProductFormValues {
  name: string;
  description: string;
  categorySlug: string;
  price: number;
  salePrice: number | undefined;
  sku: string;
  taxCategory: 'STANDARD' | 'ZERO';
  stock?: number;
  images: string[];
  speciesSlugs: string[];
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface Species {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
}

export default function ProductForm({
  initial,
  submitting,
  submitLabel,
  onSubmit,
  showStock = true,
}: {
  initial?: Partial<ProductFormValues>;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (values: ProductFormValues) => void;
  /** Editing an existing product never touches stock here — stock changes go through the
   * dedicated Inventory "adjust stock" flow so every change lands in the InventoryMovement
   * ledger with a reason, instead of silently overwriting it via the generic product PATCH. */
  showStock?: boolean;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [species, setSpecies] = useState<Species[]>([]);
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [categorySlug, setCategorySlug] = useState(initial?.categorySlug ?? '');
  const [price, setPrice] = useState(initial?.price?.toString() ?? '');
  const [salePrice, setSalePrice] = useState(initial?.salePrice?.toString() ?? '');
  const [sku, setSku] = useState(initial?.sku ?? '');
  const [taxCategory, setTaxCategory] = useState<'STANDARD' | 'ZERO'>(initial?.taxCategory ?? 'STANDARD');
  const [stock, setStock] = useState(initial?.stock?.toString() ?? '0');
  const [imagesText, setImagesText] = useState((initial?.images ?? []).join('\n'));
  const [speciesSlugs, setSpeciesSlugs] = useState<string[]>(initial?.speciesSlugs ?? []);

  useEffect(() => {
    apiFetch<Category[]>('/public/product-categories').then(setCategories).catch(() => setCategories([]));
    apiFetch<Species[]>('/public/pet-species').then(setSpecies).catch(() => setSpecies([]));
  }, []);

  function toggleSpecies(slug: string) {
    setSpeciesSlugs((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      name,
      description,
      categorySlug,
      price: Number(price),
      salePrice: salePrice ? Number(salePrice) : undefined,
      sku,
      taxCategory,
      stock: showStock ? Number(stock) : undefined,
      images: imagesText.split('\n').map((s) => s.trim()).filter(Boolean),
      speciesSlugs,
    });
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640 }}>
      <div>
        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Nombre</label>
        <input className="bingo-input" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div>
        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Descripción</label>
        <textarea className="bingo-input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="dashboard-form-grid">
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Categoría</label>
          <select className="bingo-input" required value={categorySlug} onChange={(e) => setCategorySlug(e.target.value)}>
            <option value="">Elige una categoría…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>SKU (opcional)</label>
          <input className="bingo-input" value={sku} onChange={(e) => setSku(e.target.value)} />
        </div>
      </div>

      <div className="dashboard-form-grid">
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Precio</label>
          <input className="bingo-input" type="number" min={0} step="0.01" required value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Precio de oferta (opcional)</label>
          <input className="bingo-input" type="number" min={0} step="0.01" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
        </div>
      </div>

      <div className="dashboard-form-grid">
        {showStock && (
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Stock inicial</label>
            <input className="bingo-input" type="number" min={0} step="1" required value={stock} onChange={(e) => setStock(e.target.value)} />
          </div>
        )}
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>IVA</label>
          <select className="bingo-input" value={taxCategory} onChange={(e) => setTaxCategory(e.target.value as 'STANDARD' | 'ZERO')}>
            <option value="STANDARD">Tarifa general</option>
            <option value="ZERO">Tarifa 0%</option>
          </select>
        </div>
      </div>

      <div>
        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>Especies</label>
        <div className="bingo-chip-row" style={{ flexWrap: 'wrap' }}>
          {species.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`bingo-chip${speciesSlugs.includes(s.slug) ? ' active' : ''}`}
              onClick={() => toggleSpecies(s.slug)}
            >
              {s.icon ? `${s.icon} ` : ''}
              {s.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
          Imágenes (una URL por línea, opcional)
        </label>
        <textarea
          className="bingo-input"
          rows={3}
          placeholder={'https://…\nhttps://…'}
          value={imagesText}
          onChange={(e) => setImagesText(e.target.value)}
        />
      </div>

      <button className="bingo-button" type="submit" disabled={submitting} style={{ width: 'auto', alignSelf: 'flex-start', padding: '12px 28px' }}>
        {submitting ? 'Guardando…' : submitLabel}
      </button>
    </form>
  );
}
