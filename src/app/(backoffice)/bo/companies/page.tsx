import type { Metadata } from 'next';
import { ChevronRight, Lightbulb } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/ld/empty-state';
import { PageHeader } from '@/components/ld/page-header';
import { StatusChip } from '@/components/ld/status-chip';
import { OPPORTUNITY_TYPE_LABELS } from '@/domain/opportunity';
import { SECTOR_LABELS } from '@/domain/sectors';
import { requireUser } from '@/server/auth/guard';
import {
  countOpportunitiesForReview,
  listOpportunitiesForReview,
  type OpportunityReviewRow,
} from '@/server/services/opportunity-review';
import { formatDay } from '../users/_components/labels';
import {
  OPP_STATUS_LABEL,
  OPP_STATUS_TONE,
  QUEUE_STATUSES,
  parseStatusParam,
  queueHref,
} from './_components/labels';

const TAB_LABEL = {
  IN_REVIEW: 'En revisión',
  ADJUSTMENTS_REQUESTED: 'Ajustes solicitados',
  PUBLISHED: 'Publicadas',
  REJECTED: 'Rechazadas',
  SUSPENDED: 'Suspendidas',
} as const;

export const metadata: Metadata = { title: 'Evaluación de empresas' };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function Docs({ delivered, required }: OpportunityReviewRow['docs']) {
  const complete = required > 0 && delivered >= required;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="ld-num ld-small font-semibold text-ld-navy">
        {delivered}/{required}
        <span className="sr-only"> carpetas con documentos</span>
      </span>
      <span aria-hidden="true" className="flex gap-0.5">
        {Array.from({ length: required }, (_, i) => (
          <span
            key={i}
            className={`h-1.5 w-3 rounded-full ${
              i < delivered
                ? complete
                  ? 'bg-[var(--ld-success)]'
                  : 'bg-ld-primary'
                : 'bg-ld-border-strong'
            }`}
          />
        ))}
      </span>
    </span>
  );
}

function RowAction({ row }: { row: OpportunityReviewRow }) {
  return (
    <Link
      href={`/bo/companies/${row.id}`}
      className={`ld-btn min-h-10 px-4 whitespace-nowrap ${
        row.status === 'IN_REVIEW' ? 'ld-btn-primary' : 'ld-btn-quiet'
      }`}
    >
      {row.status === 'IN_REVIEW' ? 'Evaluar' : 'Ver detalles'}
      <span className="sr-only"> {row.title}</span>
    </Link>
  );
}

export default async function CompaniesQueuePage({ searchParams }: PageProps) {
  const actor = await requireUser('BACKOFFICE');
  const status = parseStatusParam((await searchParams).estado);
  const [rows, counts] = await Promise.all([
    listOpportunitiesForReview(actor, status === 'ALL' ? {} : { status }),
    countOpportunitiesForReview(actor),
  ]);
  const total = Object.values(counts).reduce((a, n) => a + (n ?? 0), 0);

  const tabs = [
    ...QUEUE_STATUSES.map((s) => ({
      label: TAB_LABEL[s],
      value: s as (typeof QUEUE_STATUSES)[number] | 'ALL',
      count: counts[s] ?? 0,
    })),
    { label: 'Todas', value: 'ALL' as const, count: total },
  ];

  return (
    <>
      <PageHeader
        title="Evaluación de empresas"
        description="Revisa la información financiera, la valoración y los riesgos antes de publicar. Nada llega a los compradores sin tu aprobación."
      />

      <nav aria-label="Estado de la oportunidad" className="mb-5">
        <ul className="inline-flex max-w-full gap-1 overflow-x-auto rounded-[var(--ld-radius-control)] border border-ld-border bg-ld-surface p-1">
          {tabs.map((t) => {
            const active = t.value === status;
            return (
              <li key={t.value}>
                <Link
                  href={queueHref(t.value)}
                  aria-current={active ? 'page' : undefined}
                  className={`ld-small flex min-h-10 items-center gap-2 whitespace-nowrap rounded-[var(--ld-radius-nav)] px-3.5 font-semibold transition-colors ${
                    active
                      ? 'bg-ld-primary-soft text-ld-navy'
                      : 'text-ld-ink hover:bg-[var(--ld-neutral-soft)]'
                  }`}
                >
                  {t.label}
                  <span className="ld-num ld-note text-ld-muted">({t.count})</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="No hay oportunidades en este estado"
          description={
            status === 'IN_REVIEW'
              ? 'Cuando un vendedor envíe una oportunidad a revisión, aparecerá aquí.'
              : 'Cambia de pestaña para ver las demás oportunidades.'
          }
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-[var(--ld-radius-panel)] border border-ld-border bg-ld-surface md:block">
            <table className="w-full min-w-[56rem] border-collapse text-left">
              <caption className="sr-only">Oportunidades para evaluar</caption>
              <thead>
                <tr className="border-b border-ld-border bg-[var(--ld-neutral-soft)]">
                  {['Oportunidad', 'Sector', 'Modalidad', 'Data room', 'Estado', 'Actualizada', ''].map(
                    (h, i) => (
                      <th key={i} scope="col" className="ld-small px-3 py-3 font-semibold text-ld-navy">
                        {h || <span className="sr-only">Acción</span>}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-ld-border last:border-b-0">
                    <td className="max-w-[18rem] px-3 py-3">
                      <p className="ld-small truncate font-semibold text-ld-navy">{row.companyName}</p>
                      <p className="ld-note truncate text-ld-muted">
                        {row.title} · {row.sellerName}
                      </p>
                    </td>
                    <td className="ld-small px-3 py-3 text-ld-ink">
                      {SECTOR_LABELS[row.sector]}
                      <span className="ld-note block text-ld-muted">{row.department}</span>
                    </td>
                    <td className="ld-small px-3 py-3 text-ld-ink">
                      {OPPORTUNITY_TYPE_LABELS[row.type].label}
                    </td>
                    <td className="px-3 py-3">
                      <Docs {...row.docs} />
                    </td>
                    <td className="px-3 py-3">
                      <StatusChip tone={OPP_STATUS_TONE[row.status]} className="whitespace-nowrap">
                        {OPP_STATUS_LABEL[row.status]}
                      </StatusChip>
                    </td>
                    <td className="ld-small ld-num whitespace-nowrap px-3 py-3 text-ld-muted">
                      {formatDay(row.updatedAt).replaceAll(' de ', ' ')}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">
                      <RowAction row={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="flex flex-col gap-3 md:hidden">
            {rows.map((row) => (
              <li
                key={row.id}
                className="rounded-[var(--ld-radius-panel)] border border-ld-border bg-ld-surface p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ld-navy">{row.companyName}</p>
                    <p className="ld-small break-words text-ld-muted">{row.title}</p>
                  </div>
                  <StatusChip tone={OPP_STATUS_TONE[row.status]} className="whitespace-nowrap">
                    {OPP_STATUS_LABEL[row.status]}
                  </StatusChip>
                </div>
                <dl className="ld-small mt-3 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5">
                  <dt className="text-ld-muted">Sector</dt>
                  <dd className="text-ld-ink">{SECTOR_LABELS[row.sector]}</dd>
                  <dt className="text-ld-muted">Modalidad</dt>
                  <dd className="text-ld-ink">{OPPORTUNITY_TYPE_LABELS[row.type].label}</dd>
                  <dt className="text-ld-muted">Data room</dt>
                  <dd>
                    <Docs {...row.docs} />
                  </dd>
                  <dt className="text-ld-muted">Actualizada</dt>
                  <dd className="ld-num text-ld-ink">{formatDay(row.updatedAt).replaceAll(' de ', ' ')}</dd>
                </dl>
                <Link
                  href={`/bo/companies/${row.id}`}
                  className={`ld-btn mt-4 w-full ${row.status === 'IN_REVIEW' ? 'ld-btn-primary' : 'ld-btn-quiet'}`}
                >
                  {row.status === 'IN_REVIEW' ? 'Evaluar' : 'Ver detalles'}
                  <span className="sr-only"> {row.title}</span>
                  <ChevronRight aria-hidden="true" className="size-4" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
