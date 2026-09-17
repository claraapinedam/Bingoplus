'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import AdminShell from '@/components/AdminShell';
import DeliveriesTab from '@/components/rider-tabs/DeliveriesTab';
import { apiFetch, ApiError } from '@/lib/api';

interface Vehicle {
  id: string;
  type: string;
  status: string;
  plate: string | null;
  brand: string | null;
  model: string | null;
  color: string | null;
  year: number | null;
}

interface RiderDocument {
  id: string;
  type: string;
  side: 'FRONT' | 'BACK' | null;
  documentNumber: string | null;
  fileUrl: string;
  status: string;
  expirationDate: string | null;
  createdAt: string;
}

interface RiderPayoutMethod {
  method: 'BANK_ACCOUNT' | 'MOBILE_WALLET';
  bankName: string | null;
  accountType: string | null;
  accountNumber: string | null;
  walletProvider: string | null;
  walletNumber: string | null;
  accountHolderName: string;
  holderDocumentNumber: string;
}

interface RiderDetail {
  id: string;
  accountStatus: string;
  availabilityStatus: string;
  city: string | null;
  birthDate: string | null;
  nationalIdNumber: string | null;
  address: string | null;
  termsAcceptedAt: string | null;
  dataConsentAcceptedAt: string | null;
  ratingAvg: number;
  reviewCount: number;
  deliveriesCompleted: number;
  createdAt: string;
  user: { firstName: string; lastName: string; email: string; phone: string | null };
  vehicles: Vehicle[];
  documents: RiderDocument[];
  payoutMethod: RiderPayoutMethod | null;
}

const TABS = [
  { value: 'overview', label: 'Resumen' },
  { value: 'deliveries', label: 'Entregas' },
];

export default function AdminRiderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') ?? 'overview';

  const [rider, setRider] = useState<RiderDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRider(await apiFetch<RiderDetail>(`/admin/riders/${params.id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar el rider.');
      setRider(null);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  function setTab(value: string) {
    router.replace(`/riders/${params.id}?tab=${value}`);
  }

  async function runAction(action: 'approve' | 'suspend' | 'reactivate') {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/admin/riders/${params.id}/${action}`, { method: 'PATCH', body: JSON.stringify({}) });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'La acción falló.');
    } finally {
      setBusy(false);
    }
  }

  async function runStatusAction(status: string) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/admin/riders/${params.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'La acción falló.');
    } finally {
      setBusy(false);
    }
  }

  if (rider === undefined) {
    return (
      <AdminShell>
        <p>Cargando…</p>
      </AdminShell>
    );
  }
  if (!rider) {
    return (
      <AdminShell>
        <div className="bingo-card" style={{ color: 'var(--bingo-error)' }}>{error ?? 'Rider no encontrado.'}</div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <button className="bingo-button secondary" style={{ marginBottom: 16, padding: '8px 14px', fontSize: 13 }} onClick={() => router.back()}>
        ← Volver
      </button>

      <h1 className="bingo-page-title">
        {rider.user.firstName} {rider.user.lastName}
      </h1>
      <p className="bingo-page-subtitle">
        {rider.user.email} · {rider.user.phone ?? 'sin teléfono'} ·{' '}
        <span className={`bingo-badge badge-${rider.accountStatus.toLowerCase()}`}>{rider.accountStatus}</span>{' '}
        <span className={`bingo-badge badge-${rider.availabilityStatus.toLowerCase()}`}>{rider.availabilityStatus}</span>
      </p>

      {error && (
        <div className="bingo-card" style={{ marginBottom: 16, color: 'var(--bingo-error)' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', borderBottom: '1px solid #eef1f5', paddingBottom: 14 }}>
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`bingo-button ${tab === t.value ? '' : 'secondary'}`}
            style={{ padding: '8px 14px', fontSize: 13 }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="bingo-card">
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>Detalle</h2>
            <div style={{ fontSize: 13, marginBottom: 6 }}>Ciudad: {rider.city ?? '—'}</div>
            <div style={{ fontSize: 13, marginBottom: 6 }}>
              Fecha de nacimiento: {rider.birthDate ? new Date(rider.birthDate).toLocaleDateString('es-EC') : '—'}
            </div>
            <div style={{ fontSize: 13, marginBottom: 6 }}>Cédula / identificación: {rider.nationalIdNumber ?? '—'}</div>
            <div style={{ fontSize: 13, marginBottom: 6 }}>Dirección: {rider.address ?? '—'}</div>
            <div style={{ fontSize: 13, marginBottom: 6 }}>
              Rating: {rider.ratingAvg.toFixed(1)} ({rider.reviewCount} reseñas)
            </div>
            <div style={{ fontSize: 13, marginBottom: 6 }}>Entregas completadas: {rider.deliveriesCompleted}</div>
            <div style={{ fontSize: 12, color: '#9aa5b1', marginBottom: 6 }}>
              Registrado: {new Date(rider.createdAt).toLocaleString('es-EC')}
            </div>
            <div style={{ fontSize: 12, color: rider.termsAcceptedAt && rider.dataConsentAcceptedAt ? 'var(--bingo-success)' : '#9aa5b1' }}>
              {rider.termsAcceptedAt && rider.dataConsentAcceptedAt
                ? `✓ Términos y tratamiento de datos aceptados el ${new Date(rider.termsAcceptedAt).toLocaleDateString('es-EC')}`
                : 'Términos/consentimiento de datos aún no registrados'}
            </div>
          </div>

          <div className="bingo-card">
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>Información de pago</h2>
            {!rider.payoutMethod ? (
              <p style={{ fontSize: 13, color: '#7f8ea3' }}>Sin información de pago registrada.</p>
            ) : rider.payoutMethod.method === 'BANK_ACCOUNT' ? (
              <>
                <div style={{ fontSize: 13, marginBottom: 6 }}>Método: Cuenta bancaria</div>
                <div style={{ fontSize: 13, marginBottom: 6 }}>Banco: {rider.payoutMethod.bankName ?? '—'}</div>
                <div style={{ fontSize: 13, marginBottom: 6 }}>Tipo de cuenta: {rider.payoutMethod.accountType ?? '—'}</div>
                <div style={{ fontSize: 13, marginBottom: 6 }}>Número de cuenta: {rider.payoutMethod.accountNumber ?? '—'}</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 13, marginBottom: 6 }}>Método: Billetera móvil</div>
                <div style={{ fontSize: 13, marginBottom: 6 }}>Proveedor: {rider.payoutMethod.walletProvider ?? '—'}</div>
                <div style={{ fontSize: 13, marginBottom: 6 }}>Número: {rider.payoutMethod.walletNumber ?? '—'}</div>
              </>
            )}
            {rider.payoutMethod && (
              <>
                <div style={{ fontSize: 13, marginBottom: 6 }}>Titular: {rider.payoutMethod.accountHolderName}</div>
                <div style={{ fontSize: 13 }}>Cédula del titular: {rider.payoutMethod.holderDocumentNumber}</div>
              </>
            )}
          </div>

          <div className="bingo-card">
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>Acciones de cuenta</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {rider.accountStatus === 'PENDING_APPROVAL' && (
                <>
                  <button className="bingo-button" disabled={busy} onClick={() => runAction('approve')}>
                    Aprobar
                  </button>
                  <button className="bingo-button danger" disabled={busy} onClick={() => runStatusAction('REJECTED')}>
                    Rechazar
                  </button>
                </>
              )}
              {rider.accountStatus === 'SUSPENDED' && (
                <button className="bingo-button" disabled={busy} onClick={() => runAction('reactivate')}>
                  Reactivar
                </button>
              )}
              {rider.accountStatus === 'INACTIVE' && (
                <button className="bingo-button" disabled={busy} onClick={() => runStatusAction('ACTIVE')}>
                  Reactivar
                </button>
              )}
              {rider.accountStatus === 'ACTIVE' && (
                <button className="bingo-button danger" disabled={busy} onClick={() => runAction('suspend')}>
                  Suspender
                </button>
              )}
              {rider.accountStatus === 'REJECTED' && (
                <p style={{ fontSize: 13, color: '#7f8ea3', margin: 0 }}>Esta solicitud fue rechazada.</p>
              )}
            </div>
          </div>

          <div className="bingo-card" style={{ gridColumn: 'span 2' }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>Vehículos</h2>
            {rider.vehicles.length === 0 ? (
              <p style={{ fontSize: 13, color: '#7f8ea3' }}>Sin vehículos registrados.</p>
            ) : (
              <table className="bingo-table">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Estado</th>
                    <th>Placa</th>
                    <th>Marca / Modelo</th>
                    <th>Color</th>
                    <th>Año</th>
                  </tr>
                </thead>
                <tbody>
                  {rider.vehicles.map((v) => (
                    <tr key={v.id}>
                      <td>{v.type}</td>
                      <td>
                        <span className={`bingo-badge badge-${v.status.toLowerCase()}`}>{v.status}</span>
                      </td>
                      <td>{v.plate ?? '—'}</td>
                      <td>
                        {v.brand ?? '—'} {v.model ?? ''}
                      </td>
                      <td>{v.color ?? '—'}</td>
                      <td>{v.year ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="bingo-card" style={{ gridColumn: 'span 2' }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>Documentos</h2>
            {rider.documents.length === 0 ? (
              <p style={{ fontSize: 13, color: '#7f8ea3' }}>Sin documentos cargados.</p>
            ) : (
              <table className="bingo-table">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Lado</th>
                    <th>Número</th>
                    <th>Estado</th>
                    <th>Vence</th>
                    <th>Archivo</th>
                  </tr>
                </thead>
                <tbody>
                  {rider.documents.map((d) => (
                    <tr key={d.id}>
                      <td>{d.type}</td>
                      <td>{d.side === 'FRONT' ? 'Delantera' : d.side === 'BACK' ? 'Trasera' : '—'}</td>
                      <td>{d.documentNumber ?? '—'}</td>
                      <td>
                        <span className={`bingo-badge badge-${d.status.toLowerCase()}`}>{d.status}</span>
                      </td>
                      <td>{d.expirationDate ? new Date(d.expirationDate).toLocaleDateString('es-EC') : '—'}</td>
                      <td>
                        <a href={d.fileUrl} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={d.fileUrl} alt={`${d.type} ${d.side ?? ''}`} style={{ width: 64, height: 40, objectFit: 'cover', borderRadius: 4 }} />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'deliveries' && <DeliveriesTab riderId={rider.id} />}
    </AdminShell>
  );
}
