import { Check } from 'lucide-react';
import Link from 'next/link';
import type { OnboardingStep } from '@/domain/onboarding';
import { cn } from '@/lib/utils';

type StepperProps = {
  steps: { step: OnboardingStep; title: string; description: string }[];
  current: OnboardingStep;
  completed: OnboardingStep[];
};

/**
 * Six steps, horizontal from 768 px and vertical on phones (as in the pitch).
 * Every step is a link: nothing is locked, the missing-items list says what is left.
 */
export function Stepper({ steps, current, completed }: StepperProps) {
  return (
    <nav aria-label="Pasos del registro">
      <ol className="flex flex-col md:flex-row">
        {steps.map((s, i) => {
          const done = completed.includes(s.step);
          const isCurrent = s.step === current;
          const last = i === steps.length - 1;
          return (
            <li key={s.step} className={cn('flex md:flex-col', !last && 'md:flex-1')}>
              <Link
                href={`/onboarding?paso=${s.step}`}
                aria-current={isCurrent ? 'step' : undefined}
                className="group flex min-h-11 flex-1 gap-3 rounded-[var(--ld-radius-nav)] md:flex-col md:gap-2"
              >
                <span className="flex flex-col items-center md:w-full md:flex-row">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'ld-num flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
                      done && 'border-ld-primary bg-ld-primary text-white',
                      !done && isCurrent && 'border-ld-primary bg-ld-surface text-ld-primary',
                      !done && !isCurrent && 'border-ld-border-strong bg-ld-surface text-ld-muted',
                      isCurrent && 'ring-4 ring-ld-primary-soft',
                    )}
                  >
                    {done ? <Check className="size-4" strokeWidth={3} /> : s.step}
                  </span>
                  {!last ? (
                    <span
                      aria-hidden="true"
                      className={cn(
                        'my-1 min-h-3 w-0.5 flex-1 md:mx-2 md:my-0 md:h-0.5 md:min-h-0 md:w-auto',
                        done ? 'bg-ld-primary' : 'bg-ld-border-strong',
                      )}
                    />
                  ) : null}
                </span>
                <span className="flex flex-col pb-4 md:pb-0 md:pr-3">
                  <span
                    className={cn(
                      'ld-small font-semibold group-hover:underline',
                      isCurrent ? 'text-ld-navy' : 'text-ld-ink',
                    )}
                  >
                    {s.title}
                  </span>
                  <span className="ld-note text-ld-muted">
                    {done ? 'Completado' : isCurrent ? 'Estás aquí' : 'Pendiente'}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
