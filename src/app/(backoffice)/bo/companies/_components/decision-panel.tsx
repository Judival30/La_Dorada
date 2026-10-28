'use client';

import { CircleAlert, CircleCheck } from 'lucide-react';
import { useState } from 'react';
import type { OpportunityStatus } from '@/domain/machines/opportunity';
import { useReviewFeedback } from '../../users/_components/feedback';
import { ReasonDialog } from '../../users/_components/reason-dialog';
import {
  approveOpportunityAction,
  rejectOpportunityAction,
  requestAdjustmentsAction,
} from '../actions';

type Props = {
  opportunityId: string;
  title: string;
  status: OpportunityStatus;
  /** Why publishing is not available yet; empty = it is. */
  blockers: string[];
};

type Open = 'adjustments' | 'reject' | null;

const DANGER =
  'ld-btn w-full border border-[var(--ld-danger)] bg-ld-surface text-[var(--ld-danger-ink)] hover:bg-[var(--ld-danger-soft)]';

export function DecisionPanel({ opportunityId, title, status, blockers }: Props) {
  const { run, busy } = useReviewFeedback();
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);

  if (status !== 'IN_REVIEW') {
    return (
      <p className="ld-small">
        {status === 'ADJUSTMENTS_REQUESTED'
          ? 'Esperando que el vendedor haga los ajustes y vuelva a enviar la oportunidad.'
          : status === 'PUBLISHED'
            ? 'La oportunidad está publicada en el marketplace.'
            : status === 'REJECTED'
              ? 'Esta oportunidad fue rechazada. No hay acciones disponibles.'
              : 'No hay acciones disponibles para el estado actual.'}
      </p>
    );
  }

  const canApprove = blockers.length === 0;

  return (
    <>
      <div className="flex flex-col gap-3">
        <button
          type="button"
          disabled={!canApprove || busy}
          aria-describedby="approve-blockers"
          onClick={() => run(() => approveOpportunityAction(opportunityId))}
          className="ld-btn ld-btn-primary w-full"
        >
          Aprobar y publicar
        </button>
        <div id="approve-blockers" className="ld-small">
          {canApprove ? (
            <p className="flex items-start gap-2 text-[var(--ld-success-ink)]">
              <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              La evaluación está completa. Al aprobar, la oportunidad se publica para los compradores.
            </p>
          ) : (
            <div className="rounded-[var(--ld-radius-control)] bg-[var(--ld-warning-soft)] px-3 py-2.5 text-[var(--ld-warning-ink)]">
              <p className="flex items-start gap-2 font-semibold">
                <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                Para publicar falta:
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-9">
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => setOpen('adjustments')}
          className="ld-btn ld-btn-quiet w-full"
        >
          Solicitar ajustes
        </button>
        <button type="button" disabled={busy} onClick={() => setOpen('reject')} className={DANGER}>
          Rechazar
        </button>
      </div>

      <ReasonDialog
        open={open === 'adjustments'}
        onClose={close}
        title="Solicitar ajustes"
        description={`Cuéntale al vendedor qué debe ajustar en «${title}». Verá estas observaciones y podrá volver a enviarla.`}
        fieldLabel="Observaciones"
        confirmLabel="Solicitar ajustes"
        submit={(notes) => requestAdjustmentsAction(opportunityId, notes)}
      />
      <ReasonDialog
        open={open === 'reject'}
        onClose={close}
        title="Rechazar oportunidad"
        description={`«${title}» quedará rechazada y no se publicará. Explica el motivo al vendedor.`}
        fieldLabel="Motivo del rechazo"
        confirmLabel="Rechazar oportunidad"
        tone="danger"
        submit={(reason) => rejectOpportunityAction(opportunityId, reason)}
      />
    </>
  );
}
