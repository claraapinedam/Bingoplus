'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetchPage } from '@/lib/api';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

const SERVICE_TYPE_LABELS: Record<string, string> = {
  VETERINARY: 'Veterinario',
  GROOMING: 'Grooming',
  DAYCARE: 'Guardería',
  BOARDING: 'Hospedaje',
  DOG_WALKING: 'Paseador',
  TRAINING: 'Adiestramiento',
  OTHER: 'Otro',
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

export default function ServicesTab({ businessId }: { businessId: string }) {
  const [services, setServices] = useState<ServiceRow[] | null>(null);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    const result = await apiFetchPage<ServiceRow>(`/admin/services?businessId=${businessId}&pageSize=100`);
    setServices(result.data);
    setTotal(result.meta.total);
  }, [businessId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <p style={{ fontSize: 13, color: '#7f8ea3', marginBottom: 14 }}>
        {total} servicio(s) — solo lectura, este negocio administra su propio catálogo desde el Business Portal.
      </p>

      <div className="bingo-card">
        {services === null ? (
          <p>Cargando…</p>
        ) : services.length === 0 ? (
          <p>Este negocio no tiene servicios.</p>
        ) : (
          <table className="bingo-table">
            <thead>
              <tr>
                <th>Servicio</th>
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
    </div>
  );
}
