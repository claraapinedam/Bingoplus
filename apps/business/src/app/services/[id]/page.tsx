'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';
import EmptyState from '@/components/EmptyState';
import ServiceForm, { ServiceFormValues } from '@/components/ServiceForm';
import { apiFetch, ApiError, getActiveBusinessId } from '@/lib/api';

interface Service {
  id: string;
  type: string;
  name: string;
  description: string | null;
  price: string | number;
  durationMinutes: number;
  capacity: number | null;
  imageUrl: string | null;
  requirements: string | null;
  minAgeMonths: number | null;
  maxAgeMonths: number | null;
  active: boolean;
  species: { slug: string }[];
}

function ServiceDetailContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const businessId = getActiveBusinessId();
  const [service, setService] = useState<Service | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!businessId) return;
    apiFetch<Service>(`/business/${businessId}/services/${params.id}`)
      .then(setService)
      .catch(() => setService(null));
  }, [businessId, params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(values: ServiceFormValues) {
    if (!businessId) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/business/${businessId}/services/${params.id}`, {
        method: 'PATCH',
        body: JSON.stringify(values),
      });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el servicio.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    if (!businessId || !service) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/business/${businessId}/services/${params.id}/${service.active ? 'deactivate' : 'activate'}`, {
        method: 'PATCH',
        body: JSON.stringify({}),
      });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar el servicio.');
    } finally {
      setBusy(false);
    }
  }

  if (service === undefined) {
    return <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>;
  }
  if (!service) {
    return <EmptyState title="Servicio no encontrado" />;
  }

  return (
    <>
      <button className="bingo-button secondary small" style={{ marginBottom: 16, width: 'auto' }} onClick={() => router.push('/services')}>
        ← Servicios
      </button>
      <header className="dashboard-page-header">
        <div>
          <div className="dashboard-page-title">{service.name}</div>
          <div className="dashboard-page-subtitle">
            <span className="bingo-badge" style={{ background: '#f2f4f7', color: service.active ? 'var(--bingo-success)' : '#9aa5b1' }}>
              {service.active ? 'Activo' : 'Inactivo'}
            </span>
          </div>
        </div>
        <button className="bingo-button secondary" style={{ width: 'auto' }} disabled={busy} onClick={toggleActive}>
          {service.active ? 'Desactivar' : 'Activar'}
        </button>
      </header>

      {error && <div className="bingo-error-banner" style={{ marginBottom: 14, maxWidth: 640 }}>{error}</div>}

      <ServiceForm
        initial={{
          type: service.type,
          name: service.name,
          description: service.description ?? '',
          price: Number(service.price),
          durationMinutes: service.durationMinutes,
          capacity: service.capacity ?? undefined,
          imageUrl: service.imageUrl ?? '',
          requirements: service.requirements ?? '',
          minAgeMonths: service.minAgeMonths ?? undefined,
          maxAgeMonths: service.maxAgeMonths ?? undefined,
          speciesSlugs: service.species.map((s) => s.slug),
        }}
        submitting={saving}
        submitLabel="Guardar cambios"
        onSubmit={handleSubmit}
      />
    </>
  );
}

export default function ServiceDetailPage() {
  return (
    <DashboardShell>
      <ServiceDetailContent />
    </DashboardShell>
  );
}
