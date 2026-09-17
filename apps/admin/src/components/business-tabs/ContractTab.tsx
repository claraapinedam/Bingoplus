'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface Contract {
  id: string;
  status: 'PENDING_SIGNATURE' | 'SIGNED';
  idType: 'RUC' | 'CEDULA';
  legalName: string;
  representativeName: string | null;
  taxId: string;
  contractText: string;
  pdfUrl: string | null;
  signedAt: string | null;
  signedIp: string | null;
  createdAt: string;
}

export default function ContractTab({ businessId }: { businessId: string }) {
  const [contract, setContract] = useState<Contract | null | undefined>(undefined);

  useEffect(() => {
    apiFetch<Contract | null>(`/admin/businesses/${businessId}/contract`)
      .then(setContract)
      .catch(() => setContract(null));
  }, [businessId]);

  if (contract === undefined) return <p>Cargando…</p>;

  if (contract === null) {
    return (
      <div className="bingo-card">
        <p style={{ fontSize: 13, color: '#7f8ea3' }}>
          Este negocio todavía no tiene un contrato — se genera automáticamente al aprobar la solicitud.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div className="bingo-card">
        <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px' }}>Estado</h2>
        <p style={{ fontSize: 13, marginBottom: 6 }}>
          <span className={`bingo-badge badge-${contract.status.toLowerCase()}`}>{contract.status}</span>
        </p>
        <p style={{ fontSize: 12, color: '#7f8ea3', marginBottom: 4 }}>ID de contrato: {contract.id}</p>
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
