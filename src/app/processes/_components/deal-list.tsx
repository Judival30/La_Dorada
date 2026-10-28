import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { StatusChip, type ChipTone } from '@/components/ld/status-chip';
import { DEAL_STAGE_LABELS, DEAL_STATUS_LABELS } from '@/domain/deal';
import type { DealStatus } from '@/domain/machines/deal';
import { formatDay } from '@/lib/format';
import type { DealRow } from '@/server/services/deal';

const TONE: Record<DealStatus, ChipTone> = {
  OFFER_SENT: 'info',
  COUNTER_OFFER: 'info',
  PRELIMINARY_AGREEMENT: 'warning',
  LOI_SIGNED: 'info',
  DUE_DILIGENCE: 'info',
  CLOSED: 'success',
  WITHDRAWN: 'neutral',
};

const pct = (n: number) => `${n.toLocaleString('es-CO', { maximumFractionDigits: 2 })} %`;

/** One row per deal; the title is the link, the chip says the state in words. */
export function DealList({ rows, party }: { rows: DealRow[]; party: 'BUYER' | 'SELLER' }) {
  return (
    <ul className="overflow-hidden rounded-[var(--ld-radius-panel)] border border-ld-border bg-ld-surface">
      {rows.map((r) => (
        <li key={r.id} className="border-b border-ld-border last:border-b-0">
          <Link
            href={`/processes/${r.id}`}
            className="flex items-center gap-4 px-4 py-4 hover:bg-[var(--ld-bg)] md:px-5"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <p className="font-semibold text-ld-navy">
                  {party === 'SELLER' ? r.buyerName : r.opportunityTitle}
                </p>
                <StatusChip tone={TONE[r.status]}>{DEAL_STATUS_LABELS[r.status]}</StatusChip>
                {r.awaitingMe ? <StatusChip tone="warning">Te toca responder</StatusChip> : null}
              </div>
              <p className="ld-small mt-1 text-ld-muted">
                {party === 'SELLER' ? `${r.opportunityTitle}. ` : ''}
                Etapa: {DEAL_STAGE_LABELS[r.stage]}
                {r.lastOffer
                  ? `. Última propuesta: ${r.lastOffer.preMoneyLabel} por el ${pct(r.lastOffer.stakePct)}`
                  : ''}
              </p>
            </div>
            <p className="ld-note ld-num hidden whitespace-nowrap text-ld-muted sm:block">
              Actualizado el {formatDay(r.updatedAt)}
            </p>
            <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-ld-muted" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
