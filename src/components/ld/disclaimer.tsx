import { Info } from 'lucide-react';
import { VALUATION_DISCLAIMER } from '@/domain/valuation';
import { cn } from '@/lib/utils';

type DisclaimerProps = {
  /** Replaces the default valuation notice (the landing footer uses its own legal text). */
  children?: React.ReactNode;
  className?: string;
};

export function Disclaimer({ children, className }: DisclaimerProps) {
  return (
    <p
      role="note"
      className={cn(
        'ld-small flex items-start gap-2 rounded-[var(--ld-radius-control)] bg-[var(--ld-neutral-soft)] px-3 py-2.5 text-[var(--ld-neutral-ink)]',
        className,
      )}
    >
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{children ?? VALUATION_DISCLAIMER}</span>
    </p>
  );
}
