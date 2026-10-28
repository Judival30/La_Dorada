import { Check, X } from 'lucide-react';
import { DEAL_STAGE_LABELS, DEAL_STAGES, type DealStage } from '@/domain/deal';
import { formatDay } from '@/lib/format';
import { cn } from '@/lib/utils';

export type StepState = 'done' | 'current' | 'stopped' | 'pending';
export type Step = { stage: DealStage; state: StepState; date: Date | null };

const STATE_LABEL: Record<StepState, string> = {
  done: 'Completado',
  current: 'En curso',
  stopped: 'Desistido',
  pending: 'Pendiente',
};

/** Builds the seven steps from the stage reached (P8) and the deal's outcome. */
export function buildSteps(input: {
  reached: DealStage;
  closed: boolean;
  withdrawn: boolean;
  dates: Partial<Record<DealStage, Date | null>>;
}): Step[] {
  const at = DEAL_STAGES.indexOf(input.reached);
  return DEAL_STAGES.map((stage, i) => {
    let state: StepState = 'pending';
    if (input.closed || i < at) state = 'done';
    else if (i === at) state = input.withdrawn ? 'stopped' : 'current';
    return { stage, state, date: state === 'done' ? (input.dates[stage] ?? null) : null };
  });
}

function sub(step: Step): string {
  return step.state === 'done' && step.date ? formatDay(step.date) : STATE_LABEL[step.state];
}

/** Seven-step process tracker: full row from md, compact progress on phones. */
export function DealStepper({ steps }: { steps: Step[] }) {
  const currentIndex = steps.findIndex((s) => s.state === 'current' || s.state === 'stopped');
  const current = steps[currentIndex];
  const doneCount = steps.filter((s) => s.state === 'done').length;

  return (
    <section
      aria-label="Etapas del proceso"
      className="rounded-[var(--ld-radius-panel)] border border-ld-border bg-ld-surface px-4 py-4 md:px-6 md:py-5"
    >
      {/* Phones: where we are + a segmented bar. */}
      <div className="md:hidden">
        <p className="ld-small text-ld-muted">
          {current
            ? `Etapa ${currentIndex + 1} de ${steps.length}`
            : `${doneCount} de ${steps.length} etapas completadas`}
        </p>
        <p className="font-display text-lg font-semibold text-ld-navy">
          {current ? DEAL_STAGE_LABELS[current.stage] : 'Proceso cerrado'}
          {current?.state === 'stopped' ? ' (desistido)' : ''}
        </p>
        <div aria-hidden="true" className="mt-3 flex gap-1">
          {steps.map((s) => (
            <span
              key={s.stage}
              className={cn(
                'h-1.5 flex-1 rounded-full',
                s.state === 'done' && 'bg-[var(--ld-gold)]',
                s.state === 'current' && 'bg-ld-primary',
                s.state === 'stopped' && 'bg-[var(--ld-danger)]',
                s.state === 'pending' && 'bg-ld-border',
              )}
            />
          ))}
        </div>
      </div>

      <ol className="sr-only md:not-sr-only md:grid md:grid-cols-7">
        {steps.map((s, i) => (
          <li
            key={s.stage}
            aria-current={s.state === 'current' ? 'step' : undefined}
            className="relative flex flex-col items-start pr-2"
          >
            {i < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute left-7 right-0 top-[0.8125rem] h-[3px] rounded-full',
                  s.state === 'done' ? 'bg-[var(--ld-gold)]' : 'bg-ld-border',
                )}
              />
            ) : null}
            <span
              aria-hidden="true"
              className={cn(
                'relative z-[1] flex size-7 items-center justify-center rounded-full text-[0.8125rem] font-semibold',
                s.state === 'done' && 'bg-ld-navy text-white',
                s.state === 'current' &&
                  'bg-ld-primary text-white ring-4 ring-[var(--ld-primary-soft)]',
                s.state === 'stopped' && 'bg-[var(--ld-danger)] text-white',
                s.state === 'pending' &&
                  'border-2 border-ld-border-strong bg-ld-surface text-ld-muted',
              )}
            >
              {s.state === 'done' ? (
                <Check className="size-4" strokeWidth={3} />
              ) : s.state === 'stopped' ? (
                <X className="size-4" strokeWidth={3} />
              ) : (
                i + 1
              )}
            </span>
            <span
              className={cn(
                'ld-small mt-2 font-semibold',
                s.state === 'pending' ? 'text-ld-muted' : 'text-ld-navy',
              )}
            >
              {DEAL_STAGE_LABELS[s.stage]}
            </span>
            <span
              className={cn(
                'ld-note ld-num',
                s.state === 'current' ? 'text-ld-primary' : 'text-ld-muted',
                s.state === 'stopped' && 'text-[var(--ld-danger-ink)]',
              )}
            >
              {sub(s)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
