import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, KeyRound, X } from 'lucide-react';
import { ActionButton } from '@/components/ld/action-button';
import { EmptyState } from '@/components/ld/empty-state';
import { PageHeader } from '@/components/ld/page-header';
import { StatusChip, type ChipTone } from '@/components/ld/status-chip';
import type { NdaState } from '@/domain/policies/confidential';
import { formatDay, initialsOf } from '@/lib/format';
import { cn } from '@/lib/utils';
import { requireUser } from '@/server/auth/guard';
import {
  ACCESS_TABS,
  listAccessRequests,
  type AccessTab,
  type SellerAccessRow,
} from '@/server/services/access';
import { approveAccessAction, rejectAccessAction, revokeAccessAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Solicitudes de acceso' };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const TAB_PARAM: Record<AccessTab, string> = {
  PENDING: 'pendientes',
  APPROVED: 'aprobados',
  REJECTED: 'rechazados',
};
const TAB_LABEL: Record<AccessTab, string> = {
  PENDING: 'Pendientes',
  APPROVED: 'Aprobados',
  REJECTED: 'Rechazados',
};

const EMPTY: Record<AccessTab, { title: string; description: string }> = {
  PENDING: {
    title: 'No tienes solicitudes por revisar',
    description:
      'Cuando un comprador verificado pida acceso a tu oportunidad, aparecerá aquí con su propósito y su relevancia.',
  },
  APPROVED: {
    title: 'Aún no has aprobado compradores',
    description: 'Los compradores que autorices verán tu data room mientras su NDA esté vigente.',
  },
  REJECTED: {
    title: 'No hay solicitudes rechazadas',
    description: 'Aquí verás las solicitudes que rechaces y los accesos que retires.',
  },
};

function NdaChip({ row }: { row: SellerAccessRow }) {
  const map: Record<NdaState, { tone: ChipTone; label: string }> = {
    SIGNED: { tone: 'success', label: 'NDA firmado' },
    EXPIRED: { tone: 'danger', label: 'NDA vencido' },
    PENDING: { tone: 'warning', label: 'Sin firmar' },
  };
  const c = map[row.ndaState];
  return (
    <StatusChip tone={c.tone} className="whitespace-nowrap">
      {c.label}
    </StatusChip>
  );
}

function StatusLine({ row }: { row: SellerAccessRow }) {
  if (row.status === 'REVOKED') return <StatusChip tone="danger">Acceso retirado</StatusChip>;
  if (row.status === 'REJECTED') return <StatusChip tone="neutral">Rechazada</StatusChip>;
  if (row.status === 'AUTHORIZED' && row.ndaExpiresAt && row.ndaState === 'SIGNED') {
    return (
      <span className="ld-note ld-num text-ld-muted">
        Vigente hasta {formatDay(row.ndaExpiresAt)}
      </span>
    );
  }
  return null;
}

function Relevance({ value }: { value: number }) {
  const tone = value >= 80 ? 'success' : value >= 50 ? 'info' : 'neutral';
  return (
    <span className="inline-flex flex-col gap-1">
      <span
        className={cn(
          'ld-num inline-flex w-fit rounded-full px-2.5 py-0.5 text-[0.9375rem] font-semibold',
          tone === 'success' && 'bg-[var(--ld-success-soft)] text-[var(--ld-success-ink)]',
          tone === 'info' && 'bg-[var(--ld-info-soft)] text-[var(--ld-info-ink)]',
          tone === 'neutral' && 'bg-[var(--ld-neutral-soft)] text-[var(--ld-neutral-ink)]',
        )}
      >
        {value}%<span className="sr-only"> de relevancia</span>
      </span>
    </span>
  );
}

function Actions({ row }: { row: SellerAccessRow }) {
  const who = `de ${row.buyerName}`;
  if (row.canRevoke) {
    return (
      <ActionButton
        label="Revocar"
        pendingLabel="Revocando…"
        tone="danger"
        confirm="¿Retirar el acceso al data room?"
        srContext={who}
        action={revokeAccessAction.bind(null, row.id)}
      />
    );
  }
  if (!row.canReject) return null;
  return (
    <div className="flex flex-col gap-2">
      <ActionButton
        label="Aprobar"
        pendingLabel="Aprobando…"
        tone="primary"
        icon={<Check aria-hidden="true" className="size-4" />}
        disabled={!row.canApprove}
        srContext={who}
        action={approveAccessAction.bind(null, row.id)}
      />
      {!row.canApprove ? (
        <p className="ld-note text-ld-muted">Podrás aprobar cuando firme el NDA.</p>
      ) : null}
      <ActionButton
        label="Rechazar"
        pendingLabel="Rechazando…"
        tone="danger"
        icon={<X aria-hidden="true" className="size-4" />}
        confirm="¿Rechazar esta solicitud?"
        srContext={who}
        action={rejectAccessAction.bind(null, row.id)}
      />
    </div>
  );
}

function Buyer({ row }: { row: SellerAccessRow }) {
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ld-navy text-[0.8125rem] font-semibold text-white"
      >
        {initialsOf(row.buyerName)}
      </span>
      <div className="min-w-0">
        <p className="font-semibold text-ld-navy">{row.buyerName}</p>
        <p className="ld-small text-ld-muted">{row.buyerTypeLabel ?? 'Comprador verificado'}</p>
      </div>
    </div>
  );
}

export default async function AccessRequestsPage({ searchParams }: PageProps) {
  const user = await requireUser('SELLER');
  const sp = await searchParams;
  const raw = typeof sp.tab === 'string' ? sp.tab : '';
  const tab = ACCESS_TABS.find((t) => TAB_PARAM[t] === raw) ?? 'PENDING';
  const { items, counts } = await listAccessRequests(user, tab);
  const titles = new Set(items.map((r) => r.opportunityTitle));
  const showOpportunity = titles.size > 1;

  return (
    <>
      <PageHeader
        title="Solicitudes de acceso"
        description="Revisa a los compradores interesados en tu empresa y decide quién accede a la información confidencial. Solo puedes aprobar a quien ya firmó el NDA."
      />

      <nav aria-label="Estado de las solicitudes" className="mb-5">
        <ul className="grid grid-cols-3 gap-1 rounded-[var(--ld-radius-control)] border border-ld-border bg-ld-surface p-1 sm:inline-grid">
          {ACCESS_TABS.map((t) => {
            const active = t === tab;
            return (
              <li key={t}>
                <Link
                  href={`/seller/access-requests?tab=${TAB_PARAM[t]}`}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'ld-small flex min-h-11 items-center justify-center gap-1 whitespace-nowrap rounded-[var(--ld-radius-nav)] px-2 font-semibold transition-colors sm:px-3.5',
                    active
                      ? 'bg-ld-primary-soft text-ld-navy'
                      : 'text-ld-ink hover:bg-[var(--ld-neutral-soft)]',
                  )}
                >
                  {TAB_LABEL[t]}
                  <span className="ld-num ld-note text-ld-muted">({counts[t]})</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {items.length === 0 ? (
        <EmptyState icon={KeyRound} {...EMPTY[tab]} />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((row) => (
            <li
              key={row.id}
              className="grid gap-4 rounded-[var(--ld-radius-panel)] border border-ld-border bg-ld-surface p-4 md:grid-cols-[minmax(12rem,1.1fr)_minmax(0,2fr)_auto_10rem] md:items-start md:gap-6 md:p-5"
            >
              <Buyer row={row} />

              <div className="min-w-0">
                {showOpportunity ? (
                  <p className="ld-note mb-1 text-ld-muted">{row.opportunityTitle}</p>
                ) : null}
                <p className="ld-small text-ld-ink">{row.purpose}</p>
                <p className="ld-note mt-2 text-ld-muted">Recibida el {formatDay(row.createdAt)}</p>
              </div>

              <dl className="flex flex-wrap items-center gap-x-5 gap-y-2 md:flex-col md:items-start md:gap-2">
                <div className="flex items-center gap-2 md:flex-col md:items-start md:gap-1">
                  <dt className="ld-note text-ld-muted">Relevancia</dt>
                  <dd>
                    <Relevance value={row.relevance} />
                  </dd>
                </div>
                <div className="flex items-center gap-2 md:flex-col md:items-start md:gap-1">
                  <dt className="ld-note text-ld-muted">Acuerdo</dt>
                  <dd className="flex flex-col gap-1">
                    <NdaChip row={row} />
                    <StatusLine row={row} />
                  </dd>
                </div>
              </dl>

              <Actions row={row} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
