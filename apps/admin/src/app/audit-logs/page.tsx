'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { apiFetchPage } from '@/lib/api';

interface AuditLogRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  actor: { firstName: string; lastName: string; email: string } | null;
}

export default function AdminAuditLogsPage() {
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('');
  const [logs, setLogs] = useState<AuditLogRow[] | null>(null);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ pageSize: '50' });
    if (search) params.set('search', search);
    if (entityType) params.set('entityType', entityType);
    const result = await apiFetchPage<AuditLogRow>(`/admin/audit-logs?${params}`);
    setLogs(result.data);
    setTotal(result.meta.total);
  }, [search, entityType]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <AdminShell>
      <h1 className="bingo-page-title" style={{ marginBottom: 24 }}>Auditoría</h1>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="bingo-input" style={{ maxWidth: 280 }} placeholder="Buscar acción, entidad o ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="bingo-input" style={{ maxWidth: 220 }} value={entityType} onChange={(e) => setEntityType(e.target.value)}>
          <option value="">Todas las entidades</option>
          <option value="Business">Business</option>
          <option value="BusinessCapability">BusinessCapability</option>
          <option value="BusinessMembership">BusinessMembership</option>
          <option value="Rider">Rider</option>
          <option value="Delivery">Delivery</option>
          <option value="User">User</option>
          <option value="BusinessCoupon">BusinessCoupon</option>
          <option value="AdminCoupon">AdminCoupon</option>
          <option value="MembershipPlan">MembershipPlan</option>
          <option value="Payment">Payment</option>
          <option value="MarketplaceRankingConfig">MarketplaceRankingConfig</option>
          <option value="PricingConfiguration">PricingConfiguration</option>
        </select>
      </div>

      <div className="bingo-card">
        {logs === null ? (
          <p>Cargando…</p>
        ) : logs.length === 0 ? (
          <p>No hay registros en este filtro.</p>
        ) : (
          <table className="bingo-table">
            <thead>
              <tr>
                <th>Acción</th>
                <th>Entidad</th>
                <th>ID</th>
                <th>Actor</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} onClick={() => (window.location.href = `/audit-logs/${l.id}`)} style={{ cursor: 'pointer' }}>
                  <td>
                    <code>{l.action}</code>
                  </td>
                  <td>{l.entityType}</td>
                  <td style={{ fontSize: 11, color: '#9aa5b1' }}>{l.entityId}</td>
                  <td>{l.actor ? `${l.actor.firstName} ${l.actor.lastName}` : 'Sistema'}</td>
                  <td style={{ fontSize: 12 }}>{new Date(l.createdAt).toLocaleString('es-EC')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminShell>
  );
}
