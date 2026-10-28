import Link from 'next/link';
import { ArrowRight, MapPin } from 'lucide-react';
import type { Teaser } from '@/domain/teaser';
import type { TeaserSectionKey } from '@/domain/visibility';
import { StatusChip, type ChipTone } from './status-chip';

const TYPE_TONE: Record<Teaser['type'], ChipTone> = {
  VENTA_TOTAL: 'info',
  VENTA_PARCIAL: 'warning',
  LEVANTAMIENTO_CAPITAL: 'success',
  SOCIO_ESTRATEGICO: 'neutral',
};

/** One labelled value of a teaser section, or null when it is not public. */
export function teaserField(t: Teaser, section: TeaserSectionKey, label: string): string | null {
  return t.sections[section]?.fields.find((f) => f.label === label)?.value ?? null;
}

export function TeaserImage({
  teaser,
  className,
}: {
  teaser: Pick<Teaser, 'teaserImageUrl' | 'title'>;
  className?: string;
}) {
  return teaser.teaserImageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- authorized same-origin route, not optimizable
    <img src={teaser.teaserImageUrl} alt="" loading="lazy" className={className} />
  ) : (
    <div aria-hidden="true" className={className} style={{ background: 'var(--ld-navy)' }} />
  );
}

function Metric({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="ld-note text-ld-muted">{label}</dt>
      <dd className="ld-num ld-small mt-0.5 whitespace-nowrap font-semibold text-ld-navy">
        {value ? value.replace(/COP /g, '') : '—'}
      </dd>
    </div>
  );
}

/** Marketplace card (slide02): image, modality chip, codename, 4 range metrics, "Ver teaser". */
export function OpportunityCard({ teaser }: { teaser: Teaser }) {
  const summary = teaser.sections.SUMMARY?.text ?? teaser.sections.BUSINESS?.text ?? null;
  const deal = teaserField(teaser, 'SUMMARY', 'Tamaño de la transacción');
  const revenue = teaserField(teaser, 'REVENUE', 'Ingresos del último año');
  const growth = teaserField(teaser, 'REVENUE', 'Crecimiento anual compuesto');
  const score = teaser.evaluation ? `${teaser.evaluation.score} / 100` : null;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[var(--ld-radius-panel)] border border-ld-border bg-ld-surface transition-colors hover:border-ld-border-strong">
      <div className="relative aspect-[16/9] overflow-hidden bg-ld-primary-soft">
        <TeaserImage teaser={teaser} className="size-full object-cover" />
        <StatusChip tone={TYPE_TONE[teaser.type]} className="absolute left-3 top-3 shadow-sm">
          {teaser.typeLabel}
        </StatusChip>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4 md:p-5">
        <div>
          <h3 className="ld-h3">
            <Link
              href={`/opportunities/${teaser.id}`}
              className="after:absolute after:inset-0 focus-visible:outline-none after:focus-visible:rounded-[var(--ld-radius-panel)] after:focus-visible:outline-2 after:focus-visible:outline-ld-primary"
            >
              {teaser.title}
            </Link>
          </h3>
          <p className="ld-small mt-1 flex items-center gap-1.5 text-ld-muted">
            <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
            {teaser.sectorLabel} | {teaser.department}
          </p>
        </div>
        {summary ? <p className="ld-small line-clamp-3 text-ld-ink">{summary}</p> : null}
        <dl className="mt-auto grid grid-cols-2 gap-x-4 gap-y-3 border-t border-ld-border pt-3">
          <Metric label="Ingresos anuales" value={revenue} />
          <Metric label="Crecimiento anual" value={growth} />
          <Metric label="Puntuación" value={score} />
          <Metric label="Transacción" value={deal} />
        </dl>
        <span className="ld-small inline-flex items-center gap-1.5 font-semibold text-ld-primary">
          Ver teaser
          <ArrowRight
            aria-hidden="true"
            className="size-4 transition-transform group-hover:translate-x-0.5"
          />
        </span>
      </div>
    </article>
  );
}
