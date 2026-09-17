'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface Contract {
  id: string;
  status: 'PENDING_SIGNATURE' | 'SIGNED' | 'SUPERSEDED';
  idType: 'RUC' | 'CEDULA';
  legalName: string;
  representativeName: string | null;
  taxId: string;
  contractText: string;
  sellsProducts: boolean;
  directoryListing: boolean;
  pdfUrl: string | null;
  signedAt: string | null;
  signedIp: string | null;
  createdAt: string;
}

function ContractDetail({ contract }: { contract: Contract }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div className="bingo-card">
        <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px' }}>Estado</h2>
        <p style={{ fontSize: 13, marginBottom: 6 }}>
          <span className={`bingo-badge badge-${contract.status.toLowerCase()}`}>{contract.status}</span>
        </p>
        <p style={{ fontSize: 12, color: '#7f8ea3', marginBottom: 4 }}>ID de contrato: {contract.id}</p>
        <p style={{ fontSize: 12, color: '#7f8ea3', marginBottom: 4 }}>
          Cubre: {[contract.sellsProducts && 'Tienda', contract.directoryListing && 'Directorio'].filter(Boolean).join(' + ') || '—'}
        </p>
        <p style={{ fontSize: 12, color: '#7f8ea3', marginBottom: 4 }}>
          Generado: {new Date(contract.createdAt).toLocaleString('es-EC')}
        </p>
        {contract.signedAt && (
          <p style={{ fontSize: 12, color: '#7f8ea3', marginBottom: 4 }}>
            Firmado: {new Date(contract.signedAt).toLocaleString('es-EC')} desde IP {contract.signedIp}
          </p>
        )}
        {contract.pdfUrl && (
          <a href={contract.pdfUrl} target="_blank" rel="noreferrer" className="bingo-button secondary" style={{ marginTop: 10, width: 'auto', display: 'inline-block', padding: '8px 14px', fontSize: 13 }}>
            Ver PDF firmado
          </a>
        )}
      </div>

      <div className="bingo-card">
        <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px' }}>Firmante</h2>
        {contract.idType === 'RUC' ? (
          <>
            <p style={{ fontSize: 13, marginBottom: 4 }}>Razón social: {contract.legalName}</p>
            <p style={{ fontSize: 13, marginBottom: 4 }}>Representante legal: {contract.representativeName}</p>
            <p style={{ fontSize: 13 }}>RUC: {contract.taxId}</p>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, marginBottom: 4 }}>Nombre: {contract.legalName}</p>
            <p style={{ fontSize: 13 }}>Cédula: {contract.taxId}</p>
          </>
        )}
      </div>

      <div className="bingo-card" style={{ gridColumn: '1 / -1', whiteSpace: 'pre-wrap', fontSize: 12.5, lineHeight: 1.6, maxHeight: 320, overflowY: 'auto' }}>
        {contract.contractText}
      </div>
    </div>
  );
}

export default function ContractTab({ businessId }: { businessId: string }) {
  const [contracts, setContracts] = useState<Contract[] | null>(null);

  useEffect(() => {
    apiFetch<Contract[]>(`/admin/businesses/${businessId}/contracts`)
      .then(setContracts)
      .catch(() => setContracts([]));
  }, [businessId]);

  if (contracts === null) return <p>Cargando…</p>;

  if (contracts.length === 0) {
    return (
      <div className="bingo-card">
        <p style={{ fontSize: 13, color: '#7f8ea3' }}>
          Este negocio todavía no tiene un contrato — se genera automáticamente al aprobar la solicitud.
        </p>
      </div>
    );
  }

  const [current, ...history] = contracts;

  return (
    <div>
      <ContractDetail contract={current} />

      {history.length > 0 && (
        <div className="bingo-card" style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>Historial de contratos anteriores</h2>
          <p style={{ fontSize: 12, color: '#7f8ea3', margin: '0 0 12px' }}>
            Nunca se eliminan — quedan visibles aquí cuando un cambio de capacidades (ej. agregar Directorio) requiere una firma nueva.
          </p>
          <table className="bingo-table">
            <thead>
              <tr>
                <th>Estado</th>
                <th>Cubre</th>
                <th>Generado</th>
                <th>Firmado</th>
                <th>PDF</th>
              </tr>
            </thead>
            <tbody>
              {history.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className={`bingo-badge badge-${c.status.toLowerCase()}`}>{c.status}</span>
                  </td>
                  <td>{[c.sellsProducts && 'Tienda', c.directoryListing && 'Directorio'].filter(Boolean).join(' + ') || '—'}</td>
                  <td>{new Date(c.createdAt).toLocaleDateString('es-EC')}</td>
                  <td>{c.signedAt ? new Date(c.signedAt).toLocaleDateString('es-EC') : '—'}</td>
                  <td>
                    {c.pdfUrl ? (
                      <a href={c.pdfUrl} target="_blank" rel="noreferrer">
                        Ver PDF
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
