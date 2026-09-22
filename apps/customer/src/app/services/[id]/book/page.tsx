'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import CustomerShell from '@/components/CustomerShell';
import BackButton from '@/components/BackButton';
import EmptyState from '@/components/EmptyState';
import { apiFetch, ApiError } from '@/lib/api';

interface ServiceDetail {
  id: string;
  type: string;
  name: string;
  price: string | number;
  durationMinutes: number;
  /** Only meaningful for DAYCARE/BOARDING — see DAY_RANGE_TYPES. */
  operatingDays: string[];
  business: { id: string; tradeName: string; addressLine: string };
  species: { id: string }[];
  bookingsEnabled: boolean;
  locationType: 'AT_BUSINESS' | 'AT_CUSTOMER_HOME' | 'BOTH';
}

// Booked by check-in/check-out date range instead of a time-of-day slot — mirrors the backend's
// own DAY_UNIT_TYPES (BookingsService).
const DAY_RANGE_TYPES = ['DAYCARE', 'BOARDING'];
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Client-side estimate only, shown before submitting — the backend recomputes and freezes the
 * authoritative count/price at booking time (see BookingsService.create). */
function countBillableDays(checkIn: string, checkOut: string, operatingDays: string[]): number {
  if (!checkIn || !checkOut) return 0;
  const start = new Date(`${checkIn}T00:00:00`);
  const end = new Date(`${checkOut}T00:00:00`);
  if (end.getTime() <= start.getTime()) return 0;
  let count = 0;
  for (const d = new Date(start); d.getTime() < end.getTime(); d.setDate(d.getDate() + 1)) {
    if (operatingDays.includes(WEEKDAY_KEYS[d.getDay()])) count++;
  }
  return count;
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

// Never `.toISOString()` — that converts to UTC first, which silently rolls "today" over to
// tomorrow once local time passes UTC midnight (e.g. 19:00+ in Ecuador's UTC-5), even though it's
// still today locally. That would make "today" unselectable/wrong in the date picker every evening.
function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type Step = 'pet' | 'location' | 'date' | 'time' | 'dates' | 'review';

export default function BookServicePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [service, setService] = useState<ServiceDetail | null | undefined>(undefined);
  const [pets, setPets] = useState<Pet[] | null>(null);
  const [step, setStep] = useState<Step>('pet');
  const [petId, setPetId] = useState('');
  const [date, setDate] = useState(todayString());
  const [checkOutDate, setCheckOutDate] = useState('');
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [startTime, setStartTime] = useState('');
  const [atCustomerHome, setAtCustomerHome] = useState<boolean | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useMemo(newIdempotencyKey, [params.id]);

  useEffect(() => {
    apiFetch<ServiceDetail>(`/public/services/${params.id}`).then(setService).catch(() => setService(null));
    apiFetch<Pet[]>('/me/pets').then(setPets).catch(() => setPets([]));
  }, [params.id]);

  useEffect(() => {
    if (step !== 'time' || !date || (service && DAY_RANGE_TYPES.includes(service.type))) return;
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
  const isDayRange = DAY_RANGE_TYPES.includes(service.type);
  const billableDays = isDayRange ? countBillableDays(date, checkOutDate, service.operatingDays) : 0;
  const needsLocationChoice = service.locationType === 'BOTH';
  const effectiveAtCustomerHome = needsLocationChoice ? atCustomerHome : service.locationType === 'AT_CUSTOMER_HOME';

  function afterPetStep() {
    if (needsLocationChoice) {
      setStep('location');
    } else {
      setStep(isDayRange ? 'dates' : 'date');
    }
  }

  async function confirmBooking() {
    setSubmitting(true);
    setError(null);
    try {
      const booking = await apiFetch<{ id: string }>('/me/bookings', {
        method: 'POST',
        body: JSON.stringify({
          serviceId: params.id,
          petId,
          date,
          ...(isDayRange ? { checkOutDate } : { startTime }),
          ...(needsLocationChoice ? { atCustomerHome } : {}),
          notes: notes || undefined,
          idempotencyKey,
        }),
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo%20para%20fondo%20osc.png" alt="BINGO+" className="bingo-logo-img" style={{ display: 'block', marginBottom: 10 }} />
        <BackButton onClick={() => router.back()} light />
        <div className="bingo-header-sub">Reservar {service.name}</div>
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
            <button className="bingo-button" style={{ marginTop: 16 }} disabled={!petId} onClick={afterPetStep}>
              Continuar
            </button>
          </>
        )}

        {step === 'location' && (
          <>
            <h2 className="bingo-section-title" style={{ marginTop: 0 }}>
              ¿Dónde prefieres el servicio?
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                className="bingo-card"
                style={{ textAlign: 'left', border: atCustomerHome === false ? '2px solid var(--bingo-teal)' : '1px solid transparent', cursor: 'pointer' }}
                onClick={() => setAtCustomerHome(false)}
              >
                <div style={{ fontWeight: 700 }}>En {service.business.tradeName}</div>
                <div style={{ fontSize: 12, color: '#7f8ea3' }}>{service.business.addressLine}</div>
              </button>
              <button
                className="bingo-card"
                style={{ textAlign: 'left', border: atCustomerHome === true ? '2px solid var(--bingo-teal)' : '1px solid transparent', cursor: 'pointer' }}
                onClick={() => setAtCustomerHome(true)}
              >
                <div style={{ fontWeight: 700 }}>A domicilio</div>
                <div style={{ fontSize: 12, color: '#7f8ea3' }}>El profesional va a tu dirección.</div>
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="bingo-button secondary" onClick={() => setStep('pet')}>
                Atrás
              </button>
              <button
                className="bingo-button"
                disabled={atCustomerHome === null}
                onClick={() => setStep(isDayRange ? 'dates' : 'date')}
              >
                Continuar
              </button>
            </div>
          </>
        )}

        {step === 'dates' && (
          <>
            <h2 className="bingo-section-title" style={{ marginTop: 0 }}>
              ¿Qué fechas?
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Entrada</label>
                <input
                  className="bingo-input"
                  type="date"
                  min={todayString()}
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    if (checkOutDate && checkOutDate <= e.target.value) setCheckOutDate('');
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Salida</label>
                <input
                  className="bingo-input"
                  type="date"
                  min={date}
                  value={checkOutDate}
                  onChange={(e) => setCheckOutDate(e.target.value)}
                />
              </div>
            </div>
            {date && checkOutDate && (
              <p style={{ fontSize: 12, color: '#7f8ea3', marginTop: 10 }}>
                {billableDays === 0
                  ? `${service.business.tradeName} no opera ningún día dentro de ese rango.`
                  : `${billableDays} ${service.type === 'BOARDING' ? 'noche(s)' : 'día(s)'} de servicio · estimado $${(Number(service.price) * billableDays).toFixed(2)}`}
              </p>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="bingo-button secondary" onClick={() => setStep(needsLocationChoice ? 'location' : 'pet')}>
                Atrás
              </button>
              <button className="bingo-button" disabled={billableDays === 0} onClick={() => setStep('review')}>
                Continuar
              </button>
            </div>
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
              <button className="bingo-button secondary" onClick={() => setStep(needsLocationChoice ? 'location' : 'pet')}>
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
                {service.locationType !== 'AT_BUSINESS' && (
                  <div>
                    <strong>Lugar:</strong> {effectiveAtCustomerHome ? 'A domicilio' : `En ${service.business.tradeName}`}
                  </div>
                )}
                {isDayRange ? (
                  <>
                    <div>
                      <strong>Entrada:</strong> {new Date(`${date}T00:00:00`).toLocaleDateString('es-EC', { day: 'numeric', month: 'long' })}
                    </div>
                    <div>
                      <strong>Salida:</strong>{' '}
                      {new Date(`${checkOutDate}T00:00:00`).toLocaleDateString('es-EC', { day: 'numeric', month: 'long' })}
                    </div>
                    <div>
                      <strong>{service.type === 'BOARDING' ? 'Noches' : 'Días'}:</strong> {billableDays}
                    </div>
                    <div>
                      <strong>Precio:</strong> ${(Number(service.price) * billableDays).toFixed(2)}
                    </div>
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </div>
            </div>

            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', margin: '14px 0 4px' }}>Notas (opcional)</label>
            <textarea className="bingo-input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="bingo-button secondary" onClick={() => setStep(isDayRange ? 'dates' : 'time')} disabled={submitting}>
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
