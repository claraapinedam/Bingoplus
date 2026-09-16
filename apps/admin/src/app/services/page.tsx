'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { apiFetchPage } from '@/lib/api';

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
  business: { tradeName: string };
  species: { name: string }[];
}

export default function AdminServicesPage() {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [services, setServices] = useState<ServiceRow[] | null>(null);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ pageSize: '100' });
    if (search) params.set('search', search);
    if (type) params.set('type', type);
    const result = await apiFetchPage<ServiceRow>(`/admin/services?${params}`);
    setServices(result.data);
    setTotal(result.meta.total);
  }, [search, type]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <AdminShell>
      <h1 className="bingo-page-title">Servicios</h1>
      <p className="bingo-page-subtitle">
        {total} servicio(s) — visión global del Service Engine. Solo lectura: cada negocio administra su propio
        catálogo de servicios desde el Business Portal.
      </p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="bingo-input" style={{ maxWidth: 280 }} placeholder="Buscar servicio…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="bingo-input" style={{ maxWidth: 220 }} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Todos los tipos</option>
          {Object.entries(SERVICE_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="bingo-card">
        {services === null ? (
          <p>Cargando…</p>
        ) : services.length === 0 ? (
          <p>No se encontraron servicios.</p>
        ) : (
          <table className="bingo-table">
            <thead>
              <tr>
                <th>Servicio</th>
                <th>Negocio</th>
                <th>Tipo</th>
                <th>Especies</th>
                <th>Precio</th>
                <th>Duración</th>
                <th>Capacidad</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.business.tradeName}</td>
                  <td>{SERVICE_TYPE_LABELS[s.type] ?? s.type}</td>
                  <td>{s.species.length > 0 ? s.species.map((sp) => sp.name).join(', ') : 'Todas'}</td>
                  <td>{currencyFormatter.format(Number(s.price))}</td>
                  <td>{s.durationMinutes} min</td>
                  <td>{s.capacity ?? '1 (por defecto)'}</td>
                  <td>
                    <span className={`bingo-badge ${s.active ? 'badge-active' : 'badge-inactive'}`}>{s.active ? 'ACTIVE' : 'INACTIVE'}</span>
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
