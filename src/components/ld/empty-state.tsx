import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type EmptyStateProps = {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
};

/** An empty screen is an invitation: say what will live here and what to do now. */
export function EmptyState({ title, description, icon: Icon, action, className }: EmptyStateProps) {
  return (
    <section
      className={cn(
        'flex flex-col items-start gap-3 rounded-[var(--ld-radius-panel)] border border-dashed border-ld-border-strong bg-ld-surface px-5 py-8 md:px-8 md:py-10',
        className,
      )}
    >
      {Icon ? (
        <span className="flex size-10 items-center justify-center rounded-[var(--ld-radius-control)] bg-ld-primary-soft text-ld-primary">
          <Icon aria-hidden="true" className="size-5" />
        </span>
      ) : null}
      <h2 className="ld-h3">{title}</h2>
      <p className="max-w-[60ch] text-ld-ink">{description}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </section>
  );
}
