'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import CustomerShell from '@/components/CustomerShell';
import EmptyState from '@/components/EmptyState';
import { apiFetch, ApiError } from '@/lib/api';

interface ServiceDetail {
  id: string;
  name: string;
  price: string | number;
  durationMinutes: number;
  business: { id: string; tradeName: string };
  species: { id: string }[];
  bookingsEnabled: boolean;
}

interface Pet {
  id: string;
  name: string;
  speciesId: string;
  species: { id: string; name: string; icon: string | null };
}

interface Slot {
  startTime: string;
  endTime: string;
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const STEPS = ['pet', 'date', 'time', 'review'] as const;
type Step = (typeof STEPS)[number];

export default function BookServicePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [service, setService] = useState<ServiceDetail | null | undefined>(undefined);
  const [pets, setPets] = useState<Pet[] | null>(null);
  const [step, setStep] = useState<Step>('pet');
  const [petId, setPetId] = useState('');
  const [date, setDate] = useState(todayString());
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [startTime, setStartTime] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useMemo(newIdempotencyKey, [params.id]);

  useEffect(() => {
    apiFetch<ServiceDetail>(`/public/services/${params.id}`).then(setService).catch(() => setService(null));
    apiFetch<Pet[]>('/me/pets').then(setPets).catch(() => setPets([]));
  }, [params.id]);

  useEffect(() => {
    if (step !== 'time' || !date) return;
    setSlots(null);
    setStartTime('');
    apiFetch<Slot[]>(`/public/services/${params.id}/availability?date=${date}`)
      .then(setSlots)
      .catch(() => setSlots([]));
  }, [step, date, params.id]);

  if (service === undefined || pets === null) {
    return (
      <CustomerShell>
        <div className="bingo-content">
          <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
        </div>
      </CustomerShell>
    );
  }
  if (!service || !service.bookingsEnabled) {
    return (
      <CustomerShell>
        <div className="bingo-content">
          <EmptyState title="No se puede reservar este servicio" />
        </div>
      </CustomerShell>
    );
  }

  const eligiblePets = service.species.length === 0 ? pets : pets.filter((p) => service.species.some((s) => s.id === p.speciesId));

  async function confirmBooking() {
    setSubmitting(true);
    setError(null);
    try {
      const booking = await apiFetch<{ id: string }>('/me/bookings', {
        method: 'POST',
        body: JSON.stringify({ serviceId: params.id, petId, date, startTime, notes: notes || undefined, idempotencyKey }),
      });
      router.push(`/bookings/${booking.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear la reserva.');
      setSubmitting(false);
    }
  }

  const selectedPet = eligiblePets.find((p) => p.id === petId);

  return (
    <CustomerShell>
      <header className="bingo-header">
        <button className="bingo-button secondary small" style={{ marginBottom: 10 }} onClick={() => router.back()}>
          ← Volver
        </button>
        <div className="bingo-logo" style={{ fontSize: 18 }}>
          Reservar {service.name}
        </div>
      </header>

      <div className="bingo-content">
        {error && (
          <div className="bingo-card" style={{ marginBottom: 14, color: 'var(--bingo-error)' }}>
            {error}
          </div>
        )}

        {step === 'pet' && (
          <>
            <h2 className="bingo-section-title" style={{ marginTop: 0 }}>
              ¿Para qué mascota?
            </h2>
            {eligiblePets.length === 0 ? (
              <EmptyState
                title="Ninguna de tus mascotas puede reservar este servicio"
                subtitle="Este servicio solo aplica a ciertas especies. Agrega una mascota elegible desde tu perfil."
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {eligiblePets.map((p) => (
                  <button
                    key={p.id}
                    className={`bingo-card${petId === p.id ? '' : ''}`}
                    style={{
                      textAlign: 'left',
                      border: petId === p.id ? '2px solid var(--bingo-teal)' : '1px solid transparent',
                      cursor: 'pointer',
                    }}
                    onClick={() => setPetId(p.id)}
                  >
                    <div style={{ fontWeight: 700 }}>
                      {p.species.icon ? `${p.species.icon} ` : ''}
                      {p.name}
                    </div>
                    <div style={{ fontSize: 12, color: '#7f8ea3' }}>{p.species.name}</div>
                  </button>
                ))}
              </div>
            )}
            <button className="bingo-button" style={{ marginTop: 16 }} disabled={!petId} onClick={() => setStep('date')}>
              Continuar
            </button>
          </>
        )}

        {step === 'date' && (
          <>
            <h2 className="bingo-section-title" style={{ marginTop: 0 }}>
              ¿Qué día?
            </h2>
            <input
              className="bingo-input"
              type="date"
              min={todayString()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="bingo-button secondary" onClick={() => setStep('pet')}>
                Atrás
              </button>
              <button className="bingo-button" disabled={!date} onClick={() => setStep('time')}>
                Continuar
              </button>
            </div>
          </>
        )}

        {step === 'time' && (
          <>
            <h2 className="bingo-section-title" style={{ marginTop: 0 }}>
              ¿A qué hora?
            </h2>
            {slots === null ? (
              <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando horarios…</p>
            ) : slots.length === 0 ? (
              <EmptyState title="No hay horarios disponibles" subtitle="Prueba con otra fecha." />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {slots.map((s) => (
                  <button
                    key={s.startTime}
                    className={`bingo-chip${startTime === s.startTime ? ' active' : ''}`}
                    onClick={() => setStartTime(s.startTime)}
                  >
                    {s.startTime}
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="bingo-button secondary" onClick={() => setStep('date')}>
                Atrás
              </button>
              <button className="bingo-button" disabled={!startTime} onClick={() => setStep('review')}>
                Continuar
              </button>
            </div>
          </>
        )}

        {step === 'review' && (
          <>
            <h2 className="bingo-section-title" style={{ marginTop: 0 }}>
              Confirmar reserva
            </h2>
            <div className="bingo-card">
              <div style={{ fontWeight: 700 }}>{service.name}</div>
              <div style={{ fontSize: 13, color: '#7f8ea3', marginTop: 2 }}>{service.business.tradeName}</div>
              <div style={{ marginTop: 10, fontSize: 13 }}>
                <div>
                  <strong>Mascota:</strong> {selectedPet?.name}
                </div>
                <div>
                  <strong>Fecha:</strong> {new Date(`${date}T00:00:00`).toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long' })}
                </div>
                <div>
                  <strong>Hora:</strong> {startTime}
                </div>
                <div>
                  <strong>Duración:</strong> {service.durationMinutes} min
                </div>
                <div>
                  <strong>Precio:</strong> ${Number(service.price).toFixed(2)}
                </div>
              </div>
            </div>

            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', margin: '14px 0 4px' }}>Notas (opcional)</label>
            <textarea className="bingo-input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="bingo-button secondary" onClick={() => setStep('time')} disabled={submitting}>
                Atrás
              </button>
              <button className="bingo-button" onClick={confirmBooking} disabled={submitting}>
                {submitting ? 'Reservando…' : 'Confirmar reserva'}
              </button>
            </div>
          </>
        )}
      </div>
    </CustomerShell>
  );
}
