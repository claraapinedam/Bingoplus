'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import AdminShell from '@/components/AdminShell';
import DeliveriesTab from '@/components/rider-tabs/DeliveriesTab';
import ReviewsList from '@/components/ReviewsList';
import BackButton from '@/components/BackButton';
import IconButton from '@/components/IconButton';
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
  idType: 'RUC' | 'CEDULA' | null;
  legalName: string | null;
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

interface RiderContract {
  id: string;
  status: 'PENDING_SIGNATURE' | 'SIGNED' | 'SUPERSEDED';
  idType: 'RUC' | 'CEDULA';
  legalName: string;
  taxId: string;
  bingoCommissionPercent: string | number;
  riderTaxWithholdingPercent: string | number;
  signedAt: string | null;
  signedIp: string | null;
  pdfUrl: string | null;
  createdAt: string;
}

const TABS = [
  { value: 'overview', label: 'Resumen' },
  { value: 'deliveries', label: 'Entregas' },
  { value: 'reviews', label: 'Reseñas' },
];

export default function AdminRiderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') ?? 'overview';

  const [rider, setRider] = useState<RiderDetail | null | undefined>(undefined);
  const [contract, setContract] = useState<RiderContract | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRider(await apiFetch<RiderDetail>(`/admin/riders/${params.id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar el rider.');
      setRider(null);
    }
    apiFetch<RiderContract | null>(`/admin/riders/${params.id}/contract`)
      .then(setContract)
      .catch(() => setContract(null));
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

  async function runDocumentAction(documentId: string, action: 'verify' | 'reject') {
    setBusyDocId(documentId);
    setError(null);
    try {
      await apiFetch(`/admin/riders/${params.id}/documents/${documentId}/${action}`, { method: 'PATCH', body: JSON.stringify({}) });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'La acción falló.');
    } finally {
      setBusyDocId(null);
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

  // Mirrors RidersService.approve()'s own guard server-side — disabled here purely so the admin
  // sees why before clicking, not as the real enforcement (that's still the backend's job).
  const allDocumentsVerified = rider.documents.length > 0 && rider.documents.every((d) => d.status === 'VERIFIED');

  return (
    <AdminShell>
      <BackButton onClick={() => router.back()} />

      <h1 className="bingo-page-title" style={{ marginBottom: 12 }}>
        {rider.user.firstName} {rider.user.lastName}
      </h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        <span>
          {rider.user.email} · {rider.user.phone ?? 'sin teléfono'} ·{' '}
          <span className={`bingo-badge badge-${rider.accountStatus.toLowerCase()}`}>{rider.accountStatus}</span>{' '}
          <span className={`bingo-badge badge-${rider.availabilityStatus.toLowerCase()}`}>{rider.availabilityStatus}</span>
        </span>
        {rider.accountStatus === 'PENDING_APPROVAL' && (
          <>
            <button
              className="bingo-button small"
              disabled={busy || !allDocumentsVerified}
              title={allDocumentsVerified ? undefined : 'Verifica todos los documentos antes de aprobar.'}
              onClick={() => runAction('approve')}
            >
              Aprobar
            </button>
            <button className="bingo-button danger small" disabled={busy} onClick={() => runStatusAction('REJECTED')}>
              Rechazar
            </button>
            {!allDocumentsVerified && (
              <span style={{ fontSize: 12, color: 'var(--bingo-error)' }}>
                Faltan documentos por verificar — revisa la sección &quot;Documentos&quot; abajo.
              </span>
            )}
          </>
        )}
        {rider.accountStatus === 'APPROVED' && (
          <button className="bingo-button small" disabled={busy} onClick={() => runStatusAction('ACTIVE')} title="Se generó un contrato — esperando que el rider lo firme desde su app.">
            Activar sin firma
          </button>
        )}
        {rider.accountStatus === 'SUSPENDED' && (
          <button className="bingo-button small" disabled={busy} onClick={() => runAction('reactivate')}>
            Reactivar
          </button>
        )}
        {rider.accountStatus === 'INACTIVE' && (
          <button className="bingo-button small" disabled={busy} onClick={() => runStatusAction('ACTIVE')}>
            Reactivar
          </button>
        )}
        {rider.accountStatus === 'ACTIVE' && (
          <button className="bingo-button danger small" disabled={busy} onClick={() => runAction('suspend')}>
            Suspender
          </button>
        )}
      </div>
      {rider.accountStatus === 'APPROVED' && (
        <p style={{ fontSize: 12, color: '#7f8ea3', marginTop: -8, marginBottom: 16 }}>
          Se generó un contrato — esperando que el rider lo firme desde su app.
        </p>
      )}
      {rider.accountStatus === 'REJECTED' && (
        <p style={{ fontSize: 12, color: '#7f8ea3', marginTop: -8, marginBottom: 16 }}>Esta solicitud fue rechazada.</p>
      )}

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

          {contract && (
            <div className="bingo-card">
              <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 10px' }}>Contrato</h2>
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                Estado: <span className={`bingo-badge badge-${contract.status.toLowerCase()}`}>{contract.status}</span>
              </div>
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                {contract.idType === 'RUC' ? `${contract.legalName} — RUC ${contract.taxId}` : `${contract.legalName} — Cédula ${contract.taxId}`}
              </div>
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                Comisión BINGO+: <strong>{Number(contract.bingoCommissionPercent).toFixed(2)}%</strong> · Retención de impuesto:{' '}
                <strong>{Number(contract.riderTaxWithholdingPercent).toFixed(2)}%</strong>
              </div>
              <div style={{ fontSize: 12, color: '#7f8ea3', marginBottom: 4 }}>
                Congelado al generarse el contrato el {new Date(contract.createdAt).toLocaleString('es-EC')}.
              </div>
              {contract.signedAt && (
                <div style={{ fontSize: 12, color: '#7f8ea3', marginBottom: 10 }}>
                  Firmado el {new Date(contract.signedAt).toLocaleString('es-EC')}
                  {contract.signedIp && ` desde IP ${contract.signedIp}`}.
                </div>
              )}
              {contract.pdfUrl && (
                <a href={contract.pdfUrl} target="_blank" rel="noreferrer" className="bingo-button secondary small" style={{ marginTop: 10, display: 'inline-block' }}>
                  Ver PDF
                </a>
              )}
            </div>
          )}

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
                    <th>Estado</th>
                    <th>Archivo</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rider.documents.map((d) => (
                    <tr key={d.id}>
                      <td>{d.type}{d.side === 'FRONT' ? ' — Delantera' : d.side === 'BACK' ? ' — Trasera' : ''}</td>
                      <td>
                        <span className={`bingo-badge badge-${d.status.toLowerCase()}`}>{d.status}</span>
                      </td>
                      <td>
                        <a href={d.fileUrl} target="_blank" rel="noreferrer" className="bingo-button secondary small">
                          {d.type === 'CONTRACT' ? '📄 Ver PDF' : '🖼️ Ver imagen'}
                        </a>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          {d.status === 'PENDING' && (
                            <>
                              <IconButton icon="approve" label="Verificar" disabled={busyDocId === d.id} onClick={() => runDocumentAction(d.id, 'verify')} />
                              <IconButton icon="reject" label="Rechazar" disabled={busyDocId === d.id} onClick={() => runDocumentAction(d.id, 'reject')} />
                            </>
                          )}
                        </div>
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
      {tab === 'reviews' && <ReviewsList targetType="RIDER" targetId={rider.id} />}
    </AdminShell>
  );
}
