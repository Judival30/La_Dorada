import type { Metadata } from 'next';
import { Info, ShieldCheck } from 'lucide-react';
import { ActionButton } from '@/components/ld/action-button';
import { EmptyState } from '@/components/ld/empty-state';
import { PageHeader } from '@/components/ld/page-header';
import { StatusChip, type ChipTone } from '@/components/ld/status-chip';
import { formatDay } from '@/lib/format';
import { requireUser } from '@/server/auth/guard';
import {
  listConfidentiality,
  type ConfidentialityAccess,
  type ConfidentialityNda,
  type ConfidentialityRow,
} from '@/server/services/access';
import { revokeAccessAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Confidencialidad y accesos' };

const NDA: Record<ConfidentialityNda, { tone: ChipTone; label: string }> = {
  SIGNED: { tone: 'success', label: 'Firmado' },
  EXPIRED: { tone: 'danger', label: 'Vencido' },
  SIGNING: { tone: 'warning', label: 'En firma' },
  PENDING: { tone: 'neutral', label: 'Pendiente' },
};
const ACCESS: Record<ConfidentialityAccess, { tone: ChipTone; label: string }> = {
  GRANTED: { tone: 'success', label: 'Con acceso' },
  NONE: { tone: 'warning', label: 'Sin acceso' },
  BLOCKED: { tone: 'danger', label: 'Bloqueado' },
};

function Chip({ c }: { c: { tone: ChipTone; label: string } }) {
  return (
    <StatusChip tone={c.tone} className="whitespace-nowrap">
      {c.label}
    </StatusChip>
  );
}

function Revoke({ row }: { row: ConfidentialityRow }) {
  if (!row.revocable) return <span className="sr-only">Sin acciones disponibles</span>;
  return (
    <ActionButton
      label="Revocar"
      pendingLabel="Revocando…"
      tone="danger"
      confirm="¿Retirar este acceso?"
      srContext={`de ${row.buyerName} a ${row.opportunityTitle}`}
      action={revokeAccessAction.bind(null, row.id)}
    />
  );
}

function Company({ row }: { row: ConfidentialityRow }) {
  return (
    <div className="min-w-0">
      <p className="font-semibold text-ld-navy">{row.opportunityTitle}</p>
      <p className="ld-small text-ld-muted">{row.companyName}</p>
    </div>
  );
}

export default async function ConfidentialityPage() {
  const user = await requireUser('BACKOFFICE');
  const rows = await listConfidentiality(user);
  const count = (a: ConfidentialityAccess) => rows.filter((r) => r.access === a).length;
  const expired = rows.filter((r) => r.nda === 'EXPIRED').length;

  return (
    <>
      <PageHeader
        title="Confidencialidad y accesos"
        description="Control de acuerdos de confidencialidad y permisos de acceso al data room por oportunidad."
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Todavía no hay solicitudes de acceso"
          description="Cuando un comprador pida acceso a una oportunidad, verás aquí su NDA y su permiso."
        />
      ) : (
        <>
          <ul aria-label="Resumen" className="mb-5 flex flex-wrap gap-2">
            <li>
              <StatusChip tone="success">
                <span className="ld-num">{count('GRANTED')}</span> con acceso
              </StatusChip>
            </li>
            <li>
              <StatusChip tone={count('NONE') > 0 ? 'warning' : 'neutral'}>
                <span className="ld-num">{count('NONE')}</span> sin acceso
              </StatusChip>
            </li>
            <li>
              <StatusChip tone={count('BLOCKED') > 0 ? 'danger' : 'neutral'}>
                <span className="ld-num">{count('BLOCKED')}</span> bloqueados
              </StatusChip>
            </li>
            {expired > 0 ? (
              <li>
                <StatusChip tone="danger">
                  <span className="ld-num">{expired}</span> NDA vencidos
                </StatusChip>
              </li>
            ) : null}
          </ul>

          {/* Desktop: table */}
          <div className="hidden overflow-x-auto rounded-[var(--ld-radius-panel)] border border-ld-border bg-ld-surface md:block">
            <table className="w-full min-w-[52rem] border-collapse text-left">
              <caption className="sr-only">Acuerdos de confidencialidad y accesos</caption>
              <thead>
                <tr className="border-b border-ld-border bg-[var(--ld-neutral-soft)]">
                  {['Empresa', 'Comprador', 'NDA', 'Acceso', 'Última actividad', 'Acción'].map(
                    (h) => (
                      <th
                        key={h}
                        scope="col"
                        className="ld-small px-4 py-3 font-semibold text-ld-navy"
                      >
                        {h === 'Acción' ? <span className="sr-only">Acción</span> : h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-ld-border last:border-b-0">
                    <td className="max-w-[16rem] px-4 py-3">
                      <Company row={r} />
                    </td>
                    <td className="ld-small px-4 py-3 text-ld-ink">{r.buyerName}</td>
                    <td className="px-4 py-3">
                      <Chip c={NDA[r.nda]} />
                      {r.ndaExpiresAt && r.nda !== 'PENDING' ? (
                        <p className="ld-note ld-num mt-1 text-ld-muted">
                          {r.nda === 'EXPIRED' ? 'Venció' : 'Hasta'} {formatDay(r.ndaExpiresAt)}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <Chip c={ACCESS[r.access]} />
                    </td>
                    <td className="ld-small ld-num whitespace-nowrap px-4 py-3 text-ld-muted">
                      {formatDay(r.lastActivity)}
                    </td>
                    <td className="w-40 px-4 py-3 text-right">
                      <Revoke row={r} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <ul className="flex flex-col gap-3 md:hidden">
            {rows.map((r) => (
              <li
                key={r.id}
                className="rounded-[var(--ld-radius-panel)] border border-ld-border bg-ld-surface p-4"
              >
                <Company row={r} />
                <p className="ld-small mt-2 text-ld-ink">{r.buyerName}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Chip c={{ ...NDA[r.nda], label: `NDA ${NDA[r.nda].label.toLowerCase()}` }} />
                  <Chip c={ACCESS[r.access]} />
                </div>
                <p className="ld-note ld-num mt-2 text-ld-muted">
                  Última actividad: {formatDay(r.lastActivity)}
                </p>
                {r.revocable ? (
                  <div className="mt-3">
                    <Revoke row={r} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>

          <p className="ld-small mt-4 flex items-start gap-2 rounded-[var(--ld-radius-control)] bg-ld-primary-soft px-4 py-3 text-ld-navy">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            El acceso al data room exige un NDA vigente y la autorización del vendedor. Cada
            descarga y cada intento denegado quedan en la auditoría.
          </p>
        </>
      )}
    </>
  );
}
