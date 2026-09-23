'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, apiFetchPage, ApiError, getActiveBusinessId } from '@/lib/api';

const DAY_UNIT_TYPES = ['DAYCARE', 'BOARDING'];

const WEEKDAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTH_LABEL = new Intl.DateTimeFormat('es-EC', { month: 'long', year: 'numeric' });

type ViewMode = 'day' | 'week' | 'month';

interface ServiceOption {
  id: string;
  name: string;
  type: string;
  durationMinutes: number;
  capacity: number | null;
  active: boolean;
}

interface SlotEntry {
  serviceId: string;
  date: string;
  startTime: string;
  endTime: string;
  capacity: number;
  occupied: number;
  remaining: number;
}

interface CalendarBooking {
  id: string;
  serviceId: string;
  serviceName: string;
  source: 'APP' | 'MANUAL';
  status: string;
  startTime: string;
  endTime: string;
  customerName: string | null;
  petName: string | null;
  reason: string | null;
  atCustomerHome: boolean;
}

interface CalendarResponse {
  from: string;
  to: string;
  slots: SlotEntry[];
  bookings: CalendarBooking[];
}

// Never `.toISOString()` — see the same note in bookings/page.tsx: that converts to UTC first and
// can silently roll the date forward once local time has passed UTC midnight.
function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function startOfWeekMonday(d: Date): Date {
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  const r = new Date(d);
  r.setDate(r.getDate() - dow);
  r.setHours(0, 0, 0, 0);
  return r;
}

function timeLabel(start: string, end: string): string {
  return `${start}–${end}`;
}

export default function BookingsCalendar() {
  const router = useRouter();
  const businessId = getActiveBusinessId();
  const [services, setServices] = useState<ServiceOption[] | null>(null);
  const [serviceId, setServiceId] = useState<string>('');
  const [view, setView] = useState<ViewMode>('week');
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ date: string; startTime?: string; endTime?: string } | null>(null);

  useEffect(() => {
    if (!businessId) return;
    apiFetchPage<ServiceOption>(`/business/${businessId}/services?pageSize=100&active=true`)
      .then((r) => {
        setServices(r.data);
        if (r.data.length > 0) setServiceId((prev) => prev || r.data[0].id);
      })
      .catch(() => setServices([]));
  }, [businessId]);

  const range = useMemo(() => {
    if (view === 'day') {
      const s = toLocalDateString(anchor);
      return { from: s, to: s };
    }
    if (view === 'week') {
      const monday = startOfWeekMonday(anchor);
      return { from: toLocalDateString(monday), to: toLocalDateString(addDays(monday, 6)) };
    }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return { from: toLocalDateString(first), to: toLocalDateString(last) };
  }, [view, anchor]);

  const load = useCallback(() => {
    if (!businessId || !serviceId) return;
    apiFetch<CalendarResponse>(`/business/${businessId}/bookings/calendar?from=${range.from}&to=${range.to}&serviceId=${serviceId}`)
      .then((r) => {
        setData(r);
        setLoadError(null);
      })
      .catch((err) => {
        setData(null);
        setLoadError(err instanceof ApiError ? err.message : 'No se pudo cargar la agenda.');
      });
  }, [businessId, serviceId, range.from, range.to]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedService = services?.find((s) => s.id === serviceId) ?? null;
  const isDayUnit = selectedService ? DAY_UNIT_TYPES.includes(selectedService.type) : false;

  async function cancelBlock(bookingId: string) {
    if (!businessId) return;
    if (!window.confirm('¿Eliminar este bloqueo manual? El espacio quedará disponible de nuevo.')) return;
    try {
      await apiFetch(`/business/${businessId}/bookings/${bookingId}/cancel`, { method: 'PATCH', body: JSON.stringify({}) });
      load();
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'No se pudo eliminar el bloqueo.');
    }
  }

  if (services === null) {
    return <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>;
  }
  if (services.length === 0) {
    return (
      <div className="bingo-card">
        <p style={{ margin: 0, fontSize: 13, color: '#7f8ea3' }}>
          Necesitas al menos un servicio activo para ver la agenda del calendario.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="dashboard-toolbar" style={{ flexWrap: 'wrap' }}>
        <select
          className="bingo-input"
          style={{ maxWidth: 260 }}
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
        >
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <div className="bingo-chip-row">
          {([
            { value: 'day', label: 'Día' },
            { value: 'week', label: 'Semana' },
            { value: 'month', label: 'Mes' },
          ] as { value: ViewMode; label: string }[]).map((t) => (
            <button key={t.value} className={`bingo-chip${view === t.value ? ' active' : ''}`} onClick={() => setView(t.value)}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            className="bingo-button secondary small"
            style={{ width: 'auto' }}
            onClick={() => setAnchor((d) => addDays(d, view === 'day' ? -1 : view === 'week' ? -7 : -30))}
          >
            ←
          </button>
          <button className="bingo-chip" onClick={() => setAnchor(new Date())}>
            Hoy
          </button>
          <button
            className="bingo-button secondary small"
            style={{ width: 'auto' }}
            onClick={() => setAnchor((d) => addDays(d, view === 'day' ? 1 : view === 'week' ? 7 : 30))}
          >
            →
          </button>
        </div>

        <button
          className="bingo-button"
          style={{ width: 'auto', marginLeft: 'auto' }}
          onClick={() => setModal({ date: toLocalDateString(view === 'day' ? anchor : new Date()) })}
        >
          + Añadir bloqueo manual
        </button>
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', margin: '4px 0 14px', fontSize: 12, color: '#7f8ea3' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--bingo-teal)', display: 'inline-block' }} />
          Reserva de la app
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--bingo-coral)', display: 'inline-block' }} />
          Bloqueo manual (fuera de la plataforma)
        </span>
      </div>

      {loadError && <div className="bingo-error-banner" style={{ marginBottom: 14 }}>{loadError}</div>}

      {!data ? (
        <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando agenda…</p>
      ) : view === 'month' ? (
        <MonthGrid
          anchor={anchor}
          data={data}
          onDayClick={(dateStr) => {
            const [y, m, d] = dateStr.split('-').map(Number);
            setAnchor(new Date(y, m - 1, d));
            setView('day');
          }}
        />
      ) : isDayUnit ? (
        <DayUnitGrid
          days={view === 'day' ? [anchor] : weekDays(anchor)}
          data={data}
          serviceId={serviceId}
          onAddBlock={(dateStr) => setModal({ date: dateStr, startTime: undefined, endTime: undefined })}
          onCancelBlock={cancelBlock}
          onOpenBooking={(id) => router.push(`/bookings/${id}`)}
        />
      ) : (
        <TimeSlotGrid
          days={view === 'day' ? [anchor] : weekDays(anchor)}
          data={data}
          serviceId={serviceId}
          onAddBlock={(dateStr, startTime, endTime) => setModal({ date: dateStr, startTime, endTime })}
          onCancelBlock={cancelBlock}
          onOpenBooking={(id) => router.push(`/bookings/${id}`)}
        />
      )}

      {modal && selectedService && (
        <ManualBlockModal
          service={selectedService}
          initial={modal}
          onClose={() => setModal(null)}
          onCreated={() => {
            setModal(null);
            load();
          }}
        />
      )}
    </>
  );
}

function weekDays(anchor: Date): Date[] {
  const monday = startOfWeekMonday(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

function DayHeader({ d, onClick }: { d: Date; onClick?: () => void }) {
  const isToday = toLocalDateString(d) === toLocalDateString(new Date());
  return (
    <div
      onClick={onClick}
      style={{
        textAlign: 'center',
        fontSize: 12,
        fontWeight: 700,
        color: isToday ? 'var(--bingo-teal)' : 'var(--bingo-navy)',
        cursor: onClick ? 'pointer' : undefined,
        padding: '6px 2px',
      }}
    >
      {WEEKDAY_SHORT[d.getDay()]} {d.getDate()}
    </div>
  );
}

function OccupancyBadge({ occupied, capacity }: { occupied: number; capacity: number }) {
  const full = occupied >= capacity;
  return (
    <span
      className="bingo-badge"
      style={{
        background: full ? '#fdeceb' : occupied > 0 ? '#fff3ea' : '#f2f4f7',
        color: full ? 'var(--bingo-error)' : occupied > 0 ? 'var(--bingo-coral)' : '#7f8ea3',
        fontSize: 11,
      }}
    >
      {occupied}/{capacity}
    </span>
  );
}

function BookingChip({ booking, onCancel, onOpen }: { booking: CalendarBooking; onCancel: (id: string) => void; onOpen: (id: string) => void }) {
  const isManual = booking.source === 'MANUAL';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        background: isManual ? '#fff3ea' : '#e8f7f2',
        border: `1px solid ${isManual ? 'var(--bingo-coral)' : 'var(--bingo-teal)'}`,
        borderRadius: 6,
        padding: '2px 6px',
        fontSize: 11,
        marginTop: 3,
        cursor: isManual ? 'default' : 'pointer',
      }}
      title={isManual ? booking.reason ?? 'Bloqueo manual' : `${booking.customerName ?? ''} — ${booking.petName ?? ''}`}
      onClick={() => !isManual && onOpen(booking.id)}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>
        {isManual ? `🔒 ${booking.reason || 'Bloqueo manual'}` : booking.customerName ?? 'Reserva'}
      </span>
      {isManual && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCancel(booking.id);
          }}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--bingo-error)', fontWeight: 700, padding: 0, lineHeight: 1 }}
          aria-label="Eliminar bloqueo"
        >
          ×
        </button>
      )}
    </div>
  );
}

function TimeSlotGrid({
  days,
  data,
  serviceId,
  onAddBlock,
  onCancelBlock,
  onOpenBooking,
}: {
  days: Date[];
  data: CalendarResponse;
  serviceId: string;
  onAddBlock: (dateStr: string, startTime: string, endTime: string) => void;
  onCancelBlock: (id: string) => void;
  onOpenBooking: (id: string) => void;
}) {
  const dayStrings = days.map(toLocalDateString);
  // Small fixed-size input (a handful of slots per visible day) — plain computation on every
  // render is cheap enough that memoizing it would just trade one dependency-array footgun for
  // another (the array below is intentionally not wrapped in useMemo).
  const rowTimeSet = new Set<string>();
  for (const s of data.slots) {
    if (s.serviceId === serviceId && dayStrings.includes(s.date)) rowTimeSet.add(s.startTime);
  }
  const rowTimes = Array.from(rowTimeSet).sort();

  if (rowTimes.length === 0) {
    return (
      <div className="bingo-card">
        <p style={{ margin: 0, fontSize: 13, color: '#7f8ea3' }}>
          Este servicio no tiene horario de atención configurado en este rango — revisa el horario del negocio.
        </p>
      </div>
    );
  }

  return (
    <div className="dashboard-table-wrap">
      <div style={{ display: 'grid', gridTemplateColumns: `72px repeat(${days.length}, minmax(120px, 1fr))`, gap: 1, background: '#eceff3', minWidth: days.length > 1 ? 700 : 320 }}>
        <div />
        {days.map((d) => (
          <div key={d.toISOString()} style={{ background: '#fff' }}>
            <DayHeader d={d} />
          </div>
        ))}

        {rowTimes.map((t) => {
          const endForLabel = data.slots.find((s) => s.startTime === t)?.endTime ?? t;
          return (
            <FragmentRow key={t}>
              <div style={{ background: '#fff', fontSize: 11, color: '#7f8ea3', padding: '8px 4px', display: 'flex', alignItems: 'center' }}>
                {timeLabel(t, endForLabel)}
              </div>
              {dayStrings.map((dateStr, i) => {
                const slot = data.slots.find((s) => s.serviceId === serviceId && s.date === dateStr && s.startTime === t);
                if (!slot) {
                  return (
                    <div key={dateStr} style={{ background: '#fafbfc', minHeight: 54, padding: 6 }} />
                  );
                }
                const sStart = new Date(`${dateStr}T${slot.startTime}:00`);
                const sEnd = new Date(`${dateStr}T${slot.endTime}:00`);
                const bookingsInSlot = data.bookings.filter(
                  (b) => b.serviceId === serviceId && new Date(b.startTime) < sEnd && new Date(b.endTime) > sStart,
                );
                const full = slot.remaining <= 0;
                return (
                  <div
                    key={dateStr}
                    style={{
                      background: full ? '#fdf2f1' : '#fff',
                      minHeight: 54,
                      padding: 6,
                      cursor: full ? 'default' : 'pointer',
                    }}
                    onClick={() => !full && onAddBlock(dateStr, slot.startTime, slot.endTime)}
                    title={full ? 'Sin cupo disponible' : 'Clic para añadir un bloqueo manual en este horario'}
                  >
                    <OccupancyBadge occupied={slot.occupied} capacity={slot.capacity} />
                    {bookingsInSlot.map((b) => (
                      <div key={b.id} onClick={(e) => e.stopPropagation()}>
                        <BookingChip booking={b} onCancel={onCancelBlock} onOpen={onOpenBooking} />
                      </div>
                    ))}
                  </div>
                );
              })}
            </FragmentRow>
          );
        })}
      </div>
    </div>
  );
}

// A CSS-grid "row" is just N more direct children with the same column count — no real <tr>, so
// this is only a readability wrapper, not an actual React.Fragment-with-key requirement dodge.
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function DayUnitGrid({
  days,
  data,
  serviceId,
  onAddBlock,
  onCancelBlock,
  onOpenBooking,
}: {
  days: Date[];
  data: CalendarResponse;
  serviceId: string;
  onAddBlock: (dateStr: string) => void;
  onCancelBlock: (id: string) => void;
  onOpenBooking: (id: string) => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${days.length}, minmax(150px, 1fr))`, gap: 10 }}>
      {days.map((d) => {
        const dateStr = toLocalDateString(d);
        const slot = data.slots.find((s) => s.serviceId === serviceId && s.date === dateStr);
        const dayStart = new Date(d);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = addDays(dayStart, 1);
        const bookingsThatDay = data.bookings.filter(
          (b) => b.serviceId === serviceId && new Date(b.startTime) < dayEnd && new Date(b.endTime) > dayStart,
        );
        return (
          <div key={dateStr} className="bingo-card" style={{ padding: 10 }}>
            <DayHeader d={d} />
            {!slot ? (
              <p style={{ fontSize: 11, color: '#9aa5b1', textAlign: 'center', margin: '10px 0' }}>No opera</p>
            ) : (
              <>
                <div style={{ textAlign: 'center', margin: '6px 0' }}>
                  <OccupancyBadge occupied={slot.occupied} capacity={slot.capacity} />
                </div>
                {bookingsThatDay.map((b) => (
                  <BookingChip key={b.id} booking={b} onCancel={onCancelBlock} onOpen={onOpenBooking} />
                ))}
                {slot.remaining > 0 && (
                  <button className="bingo-button secondary small" style={{ width: '100%', marginTop: 8 }} onClick={() => onAddBlock(dateStr)}>
                    + Bloqueo
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MonthGrid({ anchor, data, onDayClick }: { anchor: Date; data: CalendarResponse; onDayClick: (dateStr: string) => void }) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7; // Monday-start offset
  const cells: (string | null)[] = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => toLocalDateString(new Date(anchor.getFullYear(), anchor.getMonth(), i + 1)))];

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, textTransform: 'capitalize' }}>{MONTH_LABEL.format(anchor)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {WEEKDAY_SHORT.slice(1).concat(WEEKDAY_SHORT[0]).map((w) => (
          <div key={w} style={{ fontSize: 11, fontWeight: 700, color: '#7f8ea3', textAlign: 'center' }}>
            {w}
          </div>
        ))}
        {cells.map((dateStr, i) => {
          if (!dateStr) return <div key={`pad-${i}`} />;
          const slotsForDate = data.slots.filter((s) => s.date === dateStr);
          const capacityTotal = slotsForDate.reduce((sum, s) => sum + s.capacity, 0);
          const occupiedTotal = slotsForDate.reduce((sum, s) => sum + s.occupied, 0);
          const bookingsForDate = data.bookings.filter((b) => {
            const bd = new Date(b.startTime);
            const bStart = toLocalDateString(bd);
            const bEnd = toLocalDateString(new Date(new Date(b.endTime).getTime() - 1));
            return dateStr >= bStart && dateStr <= bEnd;
          });
          const manualCount = bookingsForDate.filter((b) => b.source === 'MANUAL').length;
          const appCount = bookingsForDate.length - manualCount;
          const pct = capacityTotal > 0 ? Math.round((occupiedTotal / capacityTotal) * 100) : 0;
          const [, , dayNum] = dateStr.split('-');
          return (
            <div
              key={dateStr}
              onClick={() => onDayClick(dateStr)}
              className="bingo-card"
              style={{
                padding: 6,
                cursor: 'pointer',
                minHeight: 70,
                background: dateStr === toLocalDateString(new Date()) ? '#fff8f2' : '#fff',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700 }}>{Number(dayNum)}</div>
              {slotsForDate.length > 0 && (
                <>
                  <div style={{ height: 4, background: '#eceff3', borderRadius: 2, marginTop: 4 }}>
                    <div style={{ height: 4, width: `${pct}%`, background: pct >= 100 ? 'var(--bingo-error)' : 'var(--bingo-teal)', borderRadius: 2 }} />
                  </div>
                  <div style={{ fontSize: 10, color: '#7f8ea3', marginTop: 3 }}>
                    {appCount > 0 && <span>🟢{appCount} </span>}
                    {manualCount > 0 && <span>🟠{manualCount}</span>}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ManualBlockModal({
  service,
  initial,
  onClose,
  onCreated,
}: {
  service: ServiceOption;
  initial: { date: string; startTime?: string; endTime?: string };
  onClose: () => void;
  onCreated: () => void;
}) {
  const businessId = getActiveBusinessId();
  const isDayUnit = DAY_UNIT_TYPES.includes(service.type);
  const [date, setDate] = useState(initial.date);
  const [startTime, setStartTime] = useState(initial.startTime ?? '09:00');
  const [endTime, setEndTime] = useState(initial.endTime ?? '09:30');
  const [checkOutDate, setCheckOutDate] = useState(() => {
    const d = new Date(`${initial.date}T00:00:00`);
    d.setDate(d.getDate() + 1);
    return toLocalDateString(d);
  });
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!businessId) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/business/${businessId}/bookings/blocks`, {
        method: 'POST',
        body: JSON.stringify(
          isDayUnit
            ? { serviceId: service.id, date, checkOutDate, reason: reason || undefined }
            : { serviceId: service.id, date, startTime, endTime, reason: reason || undefined },
        ),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el bloqueo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(23,43,77,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
      onClick={onClose}
    >
      <div className="bingo-card" style={{ maxWidth: 420, width: '90%' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800 }}>Añadir bloqueo manual</h3>
        <p style={{ margin: '0 0 14px', fontSize: 12, color: '#7f8ea3' }}>
          Para una reserva que llegó fuera de la app (teléfono, walk-in) en <strong>{service.name}</strong>. Ocupa capacidad igual que una
          reserva normal.
        </p>

        {error && <div className="bingo-error-banner" style={{ marginBottom: 10 }}>{error}</div>}

        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Fecha</label>
        <input className="bingo-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ marginBottom: 10 }} />

        {isDayUnit ? (
          <>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Fecha de salida</label>
            <input
              className="bingo-input"
              type="date"
              value={checkOutDate}
              onChange={(e) => setCheckOutDate(e.target.value)}
              style={{ marginBottom: 10 }}
            />
          </>
        ) : (
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Hora inicio</label>
              <input className="bingo-input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Hora fin</label>
              <input className="bingo-input" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
        )}

        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Motivo (opcional)</label>
        <input
          className="bingo-input"
          placeholder="Ej. Reservado por teléfono a nombre de Juan Pérez"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={{ marginBottom: 14 }}
        />

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="bingo-button" style={{ width: 'auto' }} disabled={busy} onClick={submit}>
            Guardar bloqueo
          </button>
          <button className="bingo-button secondary" style={{ width: 'auto' }} onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
