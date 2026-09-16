'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

export interface ServiceFormValues {
  type: string;
  name: string;
  description: string;
  price: number;
  durationMinutes: number;
  capacity: number | undefined;
  imageUrl: string;
  requirements: string;
  minAgeMonths: number | undefined;
  maxAgeMonths: number | undefined;
  speciesSlugs: string[];
}

const SERVICE_TYPES = [
  { value: 'VETERINARY', label: 'Veterinario' },
  { value: 'GROOMING', label: 'Grooming' },
  { value: 'DAYCARE', label: 'Guardería' },
  { value: 'BOARDING', label: 'Hospedaje' },
  { value: 'DOG_WALKING', label: 'Paseador' },
];

interface Species {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
}

export default function ServiceForm({
  initial,
  submitting,
  submitLabel,
  onSubmit,
}: {
  initial?: Partial<ServiceFormValues>;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (values: ServiceFormValues) => void;
}) {
  const [species, setSpecies] = useState<Species[]>([]);
  const [type, setType] = useState(initial?.type ?? 'VETERINARY');
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [price, setPrice] = useState(initial?.price?.toString() ?? '');
  const [durationMinutes, setDurationMinutes] = useState(initial?.durationMinutes?.toString() ?? '30');
  const [capacity, setCapacity] = useState(initial?.capacity?.toString() ?? '');
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? '');
  const [requirements, setRequirements] = useState(initial?.requirements ?? '');
  const [minAgeMonths, setMinAgeMonths] = useState(initial?.minAgeMonths?.toString() ?? '');
  const [maxAgeMonths, setMaxAgeMonths] = useState(initial?.maxAgeMonths?.toString() ?? '');
  const [speciesSlugs, setSpeciesSlugs] = useState<string[]>(initial?.speciesSlugs ?? []);

  useEffect(() => {
    apiFetch<Species[]>('/public/pet-species').then(setSpecies).catch(() => setSpecies([]));
  }, []);

  function toggleSpecies(slug: string) {
    setSpeciesSlugs((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      type,
      name,
      description,
      price: Number(price),
      durationMinutes: Number(durationMinutes),
      capacity: capacity ? Number(capacity) : undefined,
      imageUrl,
      requirements,
      minAgeMonths: minAgeMonths ? Number(minAgeMonths) : undefined,
      maxAgeMonths: maxAgeMonths ? Number(maxAgeMonths) : undefined,
      speciesSlugs,
    });
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640 }}>
      <div>
        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Tipo de servicio</label>
        <select className="bingo-input" required value={type} onChange={(e) => setType(e.target.value)}>
          {SERVICE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Nombre</label>
        <input className="bingo-input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Consulta general, Baño y corte…" />
      </div>

      <div>
        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Descripción</label>
        <textarea className="bingo-input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="dashboard-form-grid">
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Precio</label>
          <input className="bingo-input" type="number" min={0} step="0.01" required value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Duración (minutos)</label>
          <input className="bingo-input" type="number" min={5} step="5" required value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} />
        </div>
      </div>

      <div className="dashboard-form-grid">
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
            Capacidad simultánea (opcional)
          </label>
          <input
            className="bingo-input"
            type="number"
            min={1}
            step="1"
            placeholder="1 (por defecto — un profesional/cupo)"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Imagen (URL, opcional)</label>
          <input className="bingo-input" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />
        </div>
      </div>

      <div className="dashboard-form-grid">
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Edad mínima (meses, opcional)</label>
          <input className="bingo-input" type="number" min={0} step="1" value={minAgeMonths} onChange={(e) => setMinAgeMonths(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Edad máxima (meses, opcional)</label>
          <input className="bingo-input" type="number" min={0} step="1" value={maxAgeMonths} onChange={(e) => setMaxAgeMonths(e.target.value)} />
        </div>
      </div>

      <div>
        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
          Requisitos / información adicional (opcional)
        </label>
        <textarea
          className="bingo-input"
          rows={2}
          placeholder="Ej. Traer cartilla de vacunas, mascota bañada…"
          value={requirements}
          onChange={(e) => setRequirements(e.target.value)}
        />
      </div>

      <div>
        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>
          Especies (deja todas sin marcar para aplicar a cualquier especie)
        </label>
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

      <button className="bingo-button" type="submit" disabled={submitting} style={{ width: 'auto', alignSelf: 'flex-start', padding: '12px 28px' }}>
        {submitting ? 'Guardando…' : submitLabel}
      </button>
    </form>
  );
}
