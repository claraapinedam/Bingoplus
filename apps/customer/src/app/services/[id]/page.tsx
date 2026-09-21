'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import CustomerShell from '@/components/CustomerShell';
import BackButton from '@/components/BackButton';
import EmptyState from '@/components/EmptyState';
import { apiFetch } from '@/lib/api';

const SERVICE_TYPE_LABELS: Record<string, string> = {
  VETERINARY: 'Veterinario',
  GROOMING: 'Grooming',
  DAYCARE: 'Guardería',
  BOARDING: 'Hospedaje',
  DOG_WALKING: 'Paseador',
  TRAINING: 'Adiestramiento',
  OTHER: 'Otro',
};

interface ServiceDetail {
  id: string;
  type: string;
  name: string;
  description: string | null;
  price: string | number;
  durationMinutes: number;
  imageUrl: string | null;
  requirements: string | null;
  minAgeMonths: number | null;
  maxAgeMonths: number | null;
  species: { id: string; name: string }[];
  business: {
    id: string;
    tradeName: string;
    city: string;
    addressLine: string;
    logoUrl: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  bookingsEnabled: boolean;
  locationType: 'AT_BUSINESS' | 'AT_CUSTOMER_HOME' | 'BOTH';
}

export default function ServiceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [service, setService] = useState<ServiceDetail | null | undefined>(undefined);

  useEffect(() => {
    apiFetch<ServiceDetail>(`/public/services/${params.id}`)
      .then(setService)
      .catch(() => setService(null));
  }, [params.id]);

  if (service === undefined) {
    return (
      <CustomerShell>
        <div className="bingo-content">
          <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
        </div>
      </CustomerShell>
    );
  }
  if (!service) {
    return (
      <CustomerShell>
        <div className="bingo-content">
          <EmptyState title="Servicio no disponible" subtitle="Puede que ya no esté activo." />
        </div>
      </CustomerShell>
    );
  }

  return (
    <CustomerShell>
      <header className="bingo-header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo%20para%20fondo%20osc.png" alt="BINGO+" className="bingo-logo-img" style={{ display: 'block', marginBottom: 10 }} />
        <BackButton onClick={() => router.back()} light />
        <div className="bingo-header-sub">{service.name}</div>
      </header>

      <div className="bingo-content">
        <div className="bingo-card">
          <span className="bingo-badge" style={{ background: '#fff3ea', color: 'var(--bingo-coral)' }}>
            {SERVICE_TYPE_LABELS[service.type] ?? service.type}
          </span>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: '10px 0 4px' }}>{service.name}</h1>
          <div style={{ fontSize: 13, color: '#7f8ea3' }}>
            {service.business.tradeName}
            {service.locationType !== 'AT_CUSTOMER_HOME' && ` · ${service.business.addressLine}, ${service.business.city}`}
            {service.locationType === 'AT_CUSTOMER_HOME' && ' · A domicilio del cliente'}
          </div>
          {service.locationType !== 'AT_CUSTOMER_HOME' && service.business.latitude != null && service.business.longitude != null && (
            <button
              className="bingo-button secondary small"
              style={{ width: 'auto', marginTop: 8 }}
              onClick={() =>
                window.open(
                  `https://www.google.com/maps/dir/?api=1&destination=${service.business.latitude},${service.business.longitude}`,
                  '_blank',
                )
              }
            >
              🧭 Cómo llegar
            </button>
          )}

          <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>${Number(service.price).toFixed(2)}</div>
              <div style={{ fontSize: 11, color: '#9aa5b1' }}>Precio</div>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{service.durationMinutes} min</div>
              <div style={{ fontSize: 11, color: '#9aa5b1' }}>Duración</div>
            </div>
          </div>

          {service.description && <p style={{ fontSize: 13, color: '#54617a', marginTop: 12 }}>{service.description}</p>}

          <div style={{ marginTop: 12, fontSize: 13 }}>
            <strong>Especies: </strong>
            {service.species.length > 0 ? service.species.map((s) => s.name).join(', ') : 'Todas'}
          </div>

          {(service.minAgeMonths != null || service.maxAgeMonths != null) && (
            <div style={{ marginTop: 6, fontSize: 13 }}>
              <strong>Edad: </strong>
              {service.minAgeMonths != null ? `desde ${service.minAgeMonths} meses` : ''}
              {service.minAgeMonths != null && service.maxAgeMonths != null ? ' — ' : ''}
              {service.maxAgeMonths != null ? `hasta ${service.maxAgeMonths} meses` : ''}
            </div>
          )}

          {service.requirements && (
            <div style={{ marginTop: 10, fontSize: 13, background: '#f7f9fb', borderRadius: 10, padding: 10 }}>
              <strong>Requisitos: </strong>
              {service.requirements}
            </div>
          )}
        </div>

        {service.bookingsEnabled ? (
          <button className="bingo-button" style={{ marginTop: 16 }} onClick={() => router.push(`/services/${service.id}/book`)}>
            Reservar
          </button>
        ) : (
          <p style={{ textAlign: 'center', color: '#9aa5b1', fontSize: 13, marginTop: 16 }}>
            Este negocio no acepta reservas en línea por ahora.
          </p>
        )}
      </div>
    </CustomerShell>
  );
}
