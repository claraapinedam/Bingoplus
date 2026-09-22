'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import RiderShell from '@/components/RiderShell';
import ImageUploadField from '@/components/ImageUploadField';
import { apiFetch, ApiError, clearTokens } from '@/lib/api';
import { disconnectSocket } from '@/lib/socket';

interface Profile {
  id: string;
  accountStatus: string;
  availabilityStatus: string;
  city: string | null;
  ratingAvg: number;
  deliveriesCompleted: number;
  user: { firstName: string; lastName: string; email: string; phone: string | null };
}

interface Vehicle {
  id: string;
  type: string;
  status: string;
  plate: string | null;
  brand: string | null;
  model: string | null;
}

interface RiderDocument {
  id: string;
  type: string;
  status: string;
  fileUrl: string;
  expirationDate: string | null;
}

const ACCOUNT_STATUS_LABELS: Record<string, string> = {
  PENDING_APPROVAL: 'En revisión',
  ACTIVE: 'Activa',
  SUSPENDED: 'Suspendida',
  REJECTED: 'Rechazada',
  INACTIVE: 'Inactiva',
};

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  WALK: 'A pie',
  BIKE: 'Bicicleta',
  MOTORCYCLE: 'Moto',
  CAR: 'Auto',
  OTHER: 'Otro',
};

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  ID: 'Cédula / Identificación',
  LICENSE: 'Licencia de conducir',
  INSURANCE: 'Seguro',
  VEHICLE_REGISTRATION: 'Matrícula del vehículo',
};

const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'En revisión',
  VERIFIED: 'Verificado',
  REJECTED: 'Rechazado',
  EXPIRED: 'Expirado',
};

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [documents, setDocuments] = useState<RiderDocument[]>([]);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [showAddDocument, setShowAddDocument] = useState(false);
  const [vehicleType, setVehicleType] = useState('MOTORCYCLE');
  const [plate, setPlate] = useState('');
  const [documentType, setDocumentType] = useState('ID');
  const [fileUrl, setFileUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    apiFetch<Profile>('/rider/profile').then(setProfile).catch(() => undefined);
    apiFetch<Vehicle[]>('/rider/vehicles').then(setVehicles).catch(() => setVehicles([]));
    apiFetch<RiderDocument[]>('/rider/documents').then(setDocuments).catch(() => setDocuments([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addVehicle(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/rider/vehicles', {
        method: 'POST',
        body: JSON.stringify({ type: vehicleType, plate: plate || undefined }),
      });
      setPlate('');
      setShowAddVehicle(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo agregar el vehículo.');
    } finally {
      setSaving(false);
    }
  }

  async function removeVehicle(id: string) {
    await apiFetch(`/rider/vehicles/${id}`, { method: 'DELETE' }).catch(() => undefined);
    load();
  }

  async function addDocument(e: FormEvent) {
    e.preventDefault();
    if (!fileUrl) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/rider/documents', {
        method: 'POST',
        body: JSON.stringify({ type: documentType, fileUrl }),
      });
      setFileUrl('');
      setShowAddDocument(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo agregar el documento.');
    } finally {
      setSaving(false);
    }
  }

  function logout() {
    disconnectSocket();
    clearTokens();
    router.push('/login');
  }

  if (!profile) {
    return (
      <RiderShell>
        <div className="bingo-content">
          <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
        </div>
      </RiderShell>
    );
  }

  return (
    <RiderShell>
      <header className="bingo-header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo%20para%20fondo%20osc.png" alt="BINGO+" className="bingo-logo-img" />
        <div className="bingo-header-sub" style={{ marginTop: 4 }}>Perfil</div>
      </header>

      <div className="bingo-content">
        <div className="bingo-card">
          <div style={{ fontWeight: 800, fontSize: 16 }}>
            {profile.user.firstName} {profile.user.lastName}
          </div>
          <div style={{ color: '#7f8ea3', fontSize: 13, marginTop: 4 }}>{profile.user.email}</div>
          {profile.user.phone && <div style={{ color: '#7f8ea3', fontSize: 13 }}>{profile.user.phone}</div>}
          <div style={{ marginTop: 10 }}>
            <span className="bingo-badge" style={{ background: '#f2f4f7', color: 'var(--bingo-navy)' }}>
              Cuenta: {ACCOUNT_STATUS_LABELS[profile.accountStatus] ?? profile.accountStatus}
            </span>
          </div>
          <div style={{ fontSize: 13, color: '#7f8ea3', marginTop: 8 }}>
            ⭐ {profile.ratingAvg.toFixed(1)} · {profile.deliveriesCompleted} entregas completadas
          </div>
        </div>

        <h2 className="bingo-section-title">Vehículos</h2>
        {error && <div className="bingo-error-banner" style={{ marginBottom: 8 }}>{error}</div>}
        {vehicles.map((v) => (
          <div key={v.id} className="bingo-card" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{VEHICLE_TYPE_LABELS[v.type] ?? v.type}</div>
              {v.plate && <div style={{ fontSize: 12, color: '#7f8ea3' }}>Placa: {v.plate}</div>}
            </div>
            <button className="bingo-button secondary small" onClick={() => removeVehicle(v.id)}>
              Eliminar
            </button>
          </div>
        ))}
        {showAddVehicle ? (
          <form onSubmit={addVehicle} className="bingo-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <select className="bingo-input" value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
              {Object.entries(VEHICLE_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input
              className="bingo-input"
              placeholder="Placa (opcional)"
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="bingo-button" type="submit" disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
              <button className="bingo-button secondary" type="button" onClick={() => setShowAddVehicle(false)}>
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button className="bingo-button secondary" onClick={() => setShowAddVehicle(true)}>
            + Agregar vehículo
          </button>
        )}

        <h2 className="bingo-section-title">Documentos</h2>
        {documents.map((d) => (
          <div key={d.id} className="bingo-card" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{DOCUMENT_TYPE_LABELS[d.type] ?? d.type}</div>
            <span className="bingo-badge" style={{ background: '#f2f4f7', color: 'var(--bingo-navy)' }}>
              {DOCUMENT_STATUS_LABELS[d.status] ?? d.status}
            </span>
          </div>
        ))}
        {showAddDocument ? (
          <form onSubmit={addDocument} className="bingo-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <select className="bingo-input" value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
              {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <ImageUploadField label="Foto del documento" value={fileUrl} onChange={setFileUrl} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="bingo-button" type="submit" disabled={saving || !fileUrl}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
              <button
                className="bingo-button secondary"
                type="button"
                onClick={() => {
                  setShowAddDocument(false);
                  setFileUrl('');
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button className="bingo-button secondary" onClick={() => setShowAddDocument(true)}>
            + Agregar documento
          </button>
        )}

        <button className="bingo-button" style={{ marginTop: 24, background: 'var(--bingo-error)' }} onClick={logout}>
          Cerrar sesión
        </button>
      </div>
    </RiderShell>
  );
}
