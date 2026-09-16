'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardShell, { useBusiness } from '@/components/DashboardShell';
import EmptyState from '@/components/EmptyState';
import { apiFetch, apiFetchPage, ApiError, getActiveBusinessId } from '@/lib/api';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

const SERVICE_TYPE_LABELS: Record<string, string> = {
  VETERINARY: 'Veterinario',
  GROOMING: 'Grooming',
  DAYCARE: 'Guardería',
  BOARDING: 'Hospedaje',
  DOG_WALKING: 'Paseador',
};

interface ServiceRow {
  id: string;
  type: string;
  name: string;
  price: string | number;
  durationMinutes: number;
  capacity: number | null;
  active: boolean;
  species: { name: string }[];
}

function ServicesContent() {
  const router = useRouter();
  const { business } = useBusiness();
  const businessId = getActiveBusinessId();
  const [services, setServices] = useState<ServiceRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<'' | 'true' | 'false'>('');
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!businessId) return;
    const params = new URLSearchParams({ pageSize: '100' });
    if (search) params.set('search', search);
    if (active) params.set('active', active);
    apiFetchPage<ServiceRow>(`/business/${businessId}/services?${params}`)
      .then((r) => {
        setServices(r.data);
        setTotal(r.meta.total);
      })
      .catch(() => setServices([]));
  }, [businessId, search, active]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function toggleActive(svc: ServiceRow) {
    if (!businessId) return;
    setActingOn(svc.id);
    setError(null);
    try {
      await apiFetch(`/business/${businessId}/services/${svc.id}/${svc.active ? 'deactivate' : 'activate'}`, {
        method: 'PATCH',
        body: JSON.stringify({}),
      });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar el servicio.');
    } finally {
      setActingOn(null);
    }
  }

  if (!business.capabilities.SERVICES) {
    return <EmptyState title="Esta sección no está disponible" subtitle="Tu negocio no tiene habilitados los servicios." />;
  }

  return (
    <>
      <header className="dashboard-page-header">
        <div>
          <div className="dashboard-page-title">Servicios</div>
          <div className="dashboard-page-subtitle">{total} servicio(s)</div>
        </div>
        <button className="bingo-button" style={{ width: 'auto' }} onClick={() => router.push('/services/new')}>
          + Agregar servicio
        </button>
      </header>

      {error && <div className="bingo-error-banner" style={{ marginBottom: 14, maxWidth: 640 }}>{error}</div>}

      <div className="dashboard-toolbar">
        <input
          className="bingo-input dashboard-search"
          placeholder="Buscar servicio…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="bingo-chip-row">
          {[
            { value: '', label: 'Todos' },
            { value: 'true', label: 'Activos' },
            { value: 'false', label: 'Inactivos' },
          ].map((t) => (
            <button
              key={t.value}
              className={`bingo-chip${active === t.value ? ' active' : ''}`}
              onClick={() => setActive(t.value as '' | 'true' | 'false')}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {services === null ? (
        <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
      ) : services.length === 0 ? (
        <EmptyState title="No tienes servicios configurados" subtitle="Agrega tu primer servicio para empezar a recibir reservas." />
      ) : (
        <div className="dashboard-table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Servicio</th>
                <th>Tipo</th>
                <th>Especies</th>
                <th>Precio</th>
                <th>Duración</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id} onClick={() => router.push(`/services/${s.id}`)}>
                  <td style={{ fontWeight: 700 }}>{s.name}</td>
                  <td>{SERVICE_TYPE_LABELS[s.type] ?? s.type}</td>
                  <td>{s.species.length > 0 ? s.species.map((sp) => sp.name).join(', ') : 'Todas'}</td>
                  <td>{currencyFormatter.format(Number(s.price))}</td>
                  <td>{s.durationMinutes} min</td>
                  <td>
                    <span className="bingo-badge" style={{ background: '#f2f4f7', color: s.active ? 'var(--bingo-success)' : '#9aa5b1' }}>
                      {s.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button
                      className="bingo-button secondary small"
                      style={{ width: 'auto' }}
                      disabled={actingOn === s.id}
                      onClick={() => toggleActive(s)}
                    >
                      {s.active ? 'Desactivar' : 'Activar'}
                    </button>
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

export default function ServicesPage() {
  return (
    <DashboardShell>
      <ServicesContent />
    </DashboardShell>
  );
}
