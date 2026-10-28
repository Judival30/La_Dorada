'use client';

import { CircleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { cn } from '@/lib/utils';

export type ActionResult = { ok: true } | { error: string };

type Tone = 'primary' | 'quiet' | 'danger';

const TONE: Record<Tone, string> = {
  primary: 'ld-btn-primary',
  quiet: 'ld-btn-quiet',
  danger:
    'border border-[var(--ld-danger)] bg-ld-surface text-[var(--ld-danger-ink)] hover:bg-[var(--ld-danger-soft)]',
};

type Props = {
  label: string;
  /** Busy label, e.g. "Aprobando…". */
  pendingLabel: string;
  action: () => Promise<ActionResult>;
  tone?: Tone;
  icon?: React.ReactNode;
  /** When set, a first click asks for confirmation with this question. */
  confirm?: string;
  disabled?: boolean;
  /** Accessible context appended to the label for screen readers. */
  srContext?: string;
  className?: string;
};

/**
 * Runs a server action, refreshes the page on success and shows the error next
 * to the button. Destructive actions ask first (`confirm`) without a modal.
 */
export function ActionButton({
  label,
  pendingLabel,
  action,
  tone = 'quiet',
  icon,
  confirm,
  disabled,
  srContext,
  className,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = () =>
    start(async () => {
      setError(null);
      try {
        const res = await action();
        if ('error' in res) setError(res.error);
        else {
          setAsking(false);
          router.refresh();
        }
      } catch {
        setError('No pudimos completar la acción. Revisa tu conexión e intenta de nuevo.');
      }
    });

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {asking ? (
        <div role="group" aria-label={confirm} className="flex flex-col gap-2">
          <p className="ld-small font-semibold text-ld-navy">{confirm}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={run}
              disabled={pending}
              className={cn('ld-btn min-h-10 flex-1 px-3', TONE[tone])}
            >
              {pending ? pendingLabel : `Sí, ${label.toLowerCase()}`}
            </button>
            <button
              type="button"
              onClick={() => setAsking(false)}
              disabled={pending}
              className="ld-btn ld-btn-quiet min-h-10 flex-1 px-3"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || pending}
          onClick={() => (confirm ? setAsking(true) : run())}
          className={cn('ld-btn min-h-10 w-full gap-1.5 whitespace-nowrap px-3', TONE[tone])}
        >
          {icon}
          {pending ? pendingLabel : label}
          {srContext ? <span className="sr-only"> {srContext}</span> : null}
        </button>
      )}
      <p aria-live="polite" className="ld-note text-[var(--ld-danger-ink)] empty:hidden">
        {error ? (
          <span className="flex items-start gap-1">
            <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
            {error}
          </span>
        ) : null}
      </p>
    </div>
  );
}
