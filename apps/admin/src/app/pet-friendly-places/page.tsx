'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { apiFetch, apiFetchPage, ApiError } from '@/lib/api';

interface PetFriendlyPlace {
  id: string;
  name: string;
  category: 'RESTAURANT' | 'OUTDOOR_SPACE' | 'OTHER';
  address: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  photoUrl: string | null;
  description: string | null;
  rejectionReason: string | null;
  createdAt: string;
  submittedBy: { firstName: string; lastName: string; id: string };
}

const CATEGORY_LABELS: Record<string, string> = {
  RESTAURANT: 'Restaurante',
  OUTDOOR_SPACE: 'Espacio al aire libre',
  OTHER: 'Otro',
};

const STATUS_TABS = [
  { value: '', label: 'Todos' },
  { value: 'PENDING', label: 'Pendientes' },
  { value: 'APPROVED', label: 'Aprobados' },
  { value: 'REJECTED', label: 'Rechazados' },
];

export default function PetFriendlyPlacesPage() {
  const [status, setStatus] = useState('PENDING');
  const [places, setPlaces] = useState<PetFriendlyPlace[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const qs = status ? `?status=${status}&pageSize=100` : '?pageSize=100';
      const result = await apiFetchPage<PetFriendlyPlace>(`/admin/pet-friendly-places${qs}`);
      setPlaces(result.data);
      setTotal(result.meta.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar los lugares.');
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  async function approve(id: string) {
    setActingOn(id);
    try {
      await apiFetch(`/admin/pet-friendly-places/${id}/approve`, { method: 'PATCH', body: JSON.stringify({}) });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'La acción falló.');
    } finally {
      setActingOn(null);
    }
  }

  async function reject(id: string) {
    const reason = window.prompt('Motivo del rechazo (opcional):') ?? undefined;
    setActingOn(id);
    try {
      await apiFetch(`/admin/pet-friendly-places/${id}/reject`, { method: 'PATCH', body: JSON.stringify({ reason }) });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'La acción falló.');
    } finally {
      setActingOn(null);
    }
  }

  return (
    <AdminShell>
      <h1 className="bingo-page-title">Espacios Pet Friendly</h1>
      <p className="bingo-page-subtitle">
        {total} lugar(es). Comunidad de restaurantes, parques y espacios que reciben mascotas — enviados por usuarios, nunca negocios registrados.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {STATUS_TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setStatus(t.value)}
            className={`bingo-button ${status === t.value ? '' : 'secondary'}`}
            style={{ padding: '8px 14px', fontSize: 13 }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bingo-card" style={{ marginBottom: 16, color: 'var(--bingo-error)' }}>
          {error}
        </div>
      )}

      <div className="bingo-card">
        {places === null ? (
          <p>Cargando…</p>
        ) : places.length === 0 ? (
          <p>No hay lugares en este filtro.</p>
        ) : (
          <table className="bingo-table">
            <thead>
              <tr>
                <th>Foto</th>
                <th>Nombre</th>
                <th>Categoría</th>
                <th>Dirección</th>
                <th>Enviado por</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {places.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photoUrl} alt={p.name} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6 }} />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {p.name}
                    {p.status === 'REJECTED' && p.rejectionReason && (
                      <div style={{ fontSize: 11, color: 'var(--bingo-error)' }}>Motivo: {p.rejectionReason}</div>
                    )}
                  </td>
                  <td>{CATEGORY_LABELS[p.category]}</td>
                  <td style={{ maxWidth: 220 }}>{p.address}</td>
                  <td>
                    {p.submittedBy.firstName} {p.submittedBy.lastName}
                  </td>
                  <td>
                    <span className={`bingo-badge badge-${p.status.toLowerCase()}`}>{p.status}</span>
                  </td>
                  <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {p.status === 'PENDING' && (
                      <>
                        <button className="bingo-button" disabled={actingOn === p.id} onClick={() => approve(p.id)}>
                          Aprobar
                        </button>
                        <button className="bingo-button danger" disabled={actingOn === p.id} onClick={() => reject(p.id)}>
                          Rechazar
                        </button>
                      </>
                    )}
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
