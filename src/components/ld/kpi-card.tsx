import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

type KpiCardProps = {
  value: string;
  label: string;
  /** Variation such as "+12%" or "-3%". A leading minus reads as a drop. */
  delta?: string;
  className?: string;
};

/** Flat panel with a border: no shadow, the figure does the talking. */
export function KpiCard({ value, label, delta, className }: KpiCardProps) {
  const down = delta?.trim().startsWith('-') || delta?.trim().startsWith('−');
  const Trend = down ? TrendingDown : TrendingUp;
  return (
    <div
      className={cn(
        'rounded-[var(--ld-radius-panel)] border border-ld-border bg-ld-surface p-4',
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="ld-num font-display text-[1.75rem] font-bold leading-9 tracking-[-0.02em] text-ld-navy">
          {value}
        </p>
        {delta ? (
          <p
            className={cn(
              'ld-num ld-small inline-flex items-center gap-1 font-semibold',
              down ? 'text-[var(--ld-danger-ink)]' : 'text-[var(--ld-success-ink)]',
            )}
          >
            <Trend aria-hidden="true" className="size-4" />
            <span className="sr-only">{down ? 'Baja de ' : 'Sube '}</span>
            {delta}
          </p>
        ) : null}
      </div>
      <p className="ld-small mt-1 text-ld-muted">{label}</p>
    </div>
  );
}
