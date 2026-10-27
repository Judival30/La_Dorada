import { cn } from '@/lib/utils';

export type ChipTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE: Record<ChipTone, { box: string; dot: string }> = {
  success: {
    box: 'bg-[var(--ld-success-soft)] text-[var(--ld-success-ink)]',
    dot: 'bg-[var(--ld-success)]',
  },
  warning: {
    box: 'bg-[var(--ld-warning-soft)] text-[var(--ld-warning-ink)]',
    dot: 'bg-[var(--ld-warning)]',
  },
  danger: {
    box: 'bg-[var(--ld-danger-soft)] text-[var(--ld-danger-ink)]',
    dot: 'bg-[var(--ld-danger)]',
  },
  info: {
    box: 'bg-[var(--ld-info-soft)] text-[var(--ld-info-ink)]',
    dot: 'bg-[var(--ld-info)]',
  },
  neutral: {
    box: 'bg-[var(--ld-neutral-soft)] text-[var(--ld-neutral-ink)]',
    dot: 'bg-[var(--ld-neutral-ink)]',
  },
};

type StatusChipProps = {
  tone: ChipTone;
  children: React.ReactNode;
  className?: string;
};

/** State label. Color never travels alone: the child text always says the state. */
export function StatusChip({ tone, children, className }: StatusChipProps) {
  const t = TONE[tone];
  return (
    <span
      className={cn(
        'ld-note inline-flex items-center gap-1.5 rounded-full px-2.5 py-1',
        t.box,
        className,
      )}
    >
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', t.dot)} />
      {children}
    </span>
  );
}
