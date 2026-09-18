'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { apiFetch, apiFetchPage } from '@/lib/api';

interface NamedItem {
  id: string;
  name: string;
  detailHref: string;
}

interface ActionGroup {
  title: string;
  total: number;
  items: NamedItem[];
  href: string;
}

function ActionCard({ group }: { group: ActionGroup }) {
  const pending = group.total > 0;
  return (
    <a
      href={group.href}
      className="bingo-card"
      style={{
        display: 'block',
        textDecoration: 'none',
        border: pending ? '1px solid #f5d9a8' : '1px solid #e0e4ea',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--bingo-navy)' }}>{group.title}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: pending ? 'var(--bingo-warning)' : 'var(--bingo-success)' }}>
          {group.total}
        </div>
      </div>
      {!pending ? (
        <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 8 }}>✓ Al día</div>
      ) : (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {group.items.map((item) => (
            <a
              key={item.id}
              href={item.detailHref}
              onClick={(e) => e.stopPropagation()}
              style={{ fontSize: 13, color: 'var(--bingo-teal)', textDecoration: 'none' }}
            >
              {item.name}
            </a>
          ))}
          {group.total > group.items.length && (
            <span style={{ fontSize: 12, color: '#9aa5b1' }}>+{group.total - group.items.length} más</span>
          )}
        </div>
      )}
    </a>
  );
}

const LIST_LIMIT = 6;

export default function HomePage() {
  const [groups, setGroups] = useState<ActionGroup[] | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetchPage<{ id: string; tradeName: string }>(`/admin/businesses?status=PENDING&pageSize=${LIST_LIMIT}`),
      apiFetchPage<{ id: string; tradeName: string }>(`/admin/businesses?status=UNDER_REVIEW&pageSize=${LIST_LIMIT}`),
      apiFetchPage<{ id: string; tradeName: string }>(`/admin/businesses?status=APPROVED&pageSize=${LIST_LIMIT}`),
      apiFetchPage<{ id: string; user: { firstName: string; lastName: string } }>(
        `/admin/riders?status=PENDING_APPROVAL&pageSize=${LIST_LIMIT}`,
      ),
      apiFetchPage<{ id: string; user: { firstName: string; lastName: string } }>(
        `/admin/riders?status=APPROVED&pageSize=${LIST_LIMIT}`,
      ),
      apiFetchPage<{ id: string; name: string }>(`/admin/pet-friendly-places?status=PENDING&pageSize=${LIST_LIMIT}`),
      apiFetch<{ total: number; riders: { id: string; user: { firstName: string; lastName: string } }[] }>(
        `/admin/riders/pending-documents`,
      ),
    ])
      .then(([businessesPending, businessesUnderReview, businessesApproved, ridersPending, ridersApproved, petFriendlyPending, ridersWithPendingDocs]) => {
        const businessRequests = [...businessesPending.data, ...businessesUnderReview.data].slice(0, LIST_LIMIT);
        setGroups([
          {
            title: 'Solicitudes de negocios',
            total: businessesPending.meta.total + businessesUnderReview.meta.total,
            items: businessRequests.map((b) => ({ id: b.id, name: b.tradeName, detailHref: `/businesses/${b.id}` })),
            href: '/businesses/requests',
          },
          {
            title: 'Solicitudes de riders',
            total: ridersPending.meta.total,
            items: ridersPending.data.map((r) => ({ id: r.id, name: `${r.user.firstName} ${r.user.lastName}`, detailHref: `/riders/${r.id}` })),
            href: '/riders/requests',
          },
          {
            title: 'Solicitudes de espacios Pet Friendly',
            total: petFriendlyPending.meta.total,
            items: petFriendlyPending.data.map((p) => ({ id: p.id, name: p.name, detailHref: `/pet-friendly-places/${p.id}` })),
            href: '/pet-friendly-places/requests',
          },
          {
            title: 'Riders con documentos pendientes de aprobación',
            total: ridersWithPendingDocs.total,
            items: ridersWithPendingDocs.riders.map((r) => ({
              id: r.id,
              name: `${r.user.firstName} ${r.user.lastName}`,
              detailHref: `/riders/${r.id}`,
            })),
            href: '/riders',
          },
          {
            title: 'Negocios aprobados sin firmar contrato',
            total: businessesApproved.meta.total,
            items: businessesApproved.data.map((b) => ({ id: b.id, name: b.tradeName, detailHref: `/businesses/${b.id}` })),
            href: '/businesses/requests',
          },
          {
            title: 'Riders aprobados sin firmar contrato',
            total: ridersApproved.meta.total,
            items: ridersApproved.data.map((r) => ({ id: r.id, name: `${r.user.firstName} ${r.user.lastName}`, detailHref: `/riders/${r.id}` })),
            href: '/riders/requests',
          },
        ]);
      })
      .catch(() => undefined);
  }, []);

  return (
    <AdminShell>
      <h1 className="bingo-page-title">Inicio</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {groups === null ? <p>Cargando…</p> : groups.map((g) => <ActionCard key={g.title} group={g} />)}
      </div>
    </AdminShell>
  );
}
