'use client';

import { CircleAlert, CircleCheck } from 'lucide-react';
import { useState } from 'react';
import type { UserStatus } from '@/domain/machines/user';
import {
  approveUserAction,
  blockUserAction,
  rejectUserAction,
  requestCorrectionsAction,
  unblockUserAction,
} from '../actions';
import { useReviewFeedback } from './feedback';
import { ReasonDialog } from './reason-dialog';

type Props = {
  userId: string;
  userName: string;
  status: UserStatus;
  /** What still blocks the approval, computed from the detail data the same way the service does. */
  missing: string[];
};

type Open = 'corrections' | 'reject' | 'block' | null;

export function DecisionPanel({ userId, userName, status, missing }: Props) {
  const { run, busy } = useReviewFeedback();
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);

  const canApprove = status === 'IN_REVIEW' && missing.length === 0;

  return (
    <>
      {status === 'IN_REVIEW' ? (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            disabled={!canApprove || busy}
            aria-describedby="approve-missing"
            onClick={() => run(() => approveUserAction(userId))}
            className="ld-btn ld-btn-primary w-full"
          >
            Aprobar registro
          </button>
          <div id="approve-missing" className="ld-small">
            {canApprove ? (
              <p className="flex items-start gap-2 text-[var(--ld-success-ink)]">
                <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                Documentos aprobados y checklist completo. Ya puedes aprobar.
              </p>
            ) : (
              <div className="rounded-[var(--ld-radius-control)] bg-[var(--ld-warning-soft)] px-3 py-2.5 text-[var(--ld-warning-ink)]">
                <p className="flex items-start gap-2 font-semibold">
                  <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  Para aprobar falta:
                </p>
                <ul className="mt-1.5 list-disc space-y-1 pl-9">
                  {missing.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => setOpen('corrections')}
            className="ld-btn ld-btn-quiet w-full"
          >
            Solicitar correcciones
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setOpen('reject')}
            className="ld-btn w-full border border-[var(--ld-danger)] bg-ld-surface text-[var(--ld-danger-ink)] hover:bg-[var(--ld-danger-soft)]"
          >
            Rechazar registro
          </button>
        </div>
      ) : null}

      {status === 'ENABLED' ? (
        <div className="flex flex-col gap-3">
          <p className="ld-small">
            La cuenta está habilitada. Si detectas un problema, puedes bloquearla: se cierran sus sesiones al instante.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => setOpen('block')}
            className="ld-btn w-full border border-[var(--ld-danger)] bg-ld-surface text-[var(--ld-danger-ink)] hover:bg-[var(--ld-danger-soft)]"
          >
            Bloquear cuenta
          </button>
        </div>
      ) : null}

      {status === 'BLOCKED' ? (
        <div className="flex flex-col gap-3">
          <p className="ld-small">La cuenta está bloqueada y la persona no puede entrar.</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => unblockUserAction(userId))}
            className="ld-btn ld-btn-primary w-full"
          >
            Desbloquear cuenta
          </button>
        </div>
      ) : null}

      {status === 'PENDING' || status === 'CORRECTIONS_REQUESTED' || status === 'REJECTED' ? (
        <p className="ld-small">
          {status === 'PENDING'
            ? 'La persona todavía no envió su registro. Podrás revisarlo cuando lo envíe.'
            : status === 'CORRECTIONS_REQUESTED'
              ? 'Esperando que la persona corrija y vuelva a enviar su registro.'
              : 'Este registro fue rechazado. No hay acciones disponibles.'}
        </p>
      ) : null}

      <ReasonDialog
        open={open === 'corrections'}
        onClose={close}
        title="Solicitar correcciones"
        description={`Cuéntale a ${userName} qué debe corregir. Verá estas observaciones al volver a su registro.`}
        fieldLabel="Observaciones"
        confirmLabel="Solicitar correcciones"
        submit={(notes) => requestCorrectionsAction(userId, notes)}
      />
      <ReasonDialog
        open={open === 'reject'}
        onClose={close}
        title="Rechazar registro"
        description={`El registro de ${userName} quedará rechazado y no podrá usar la plataforma. Explica el motivo.`}
        fieldLabel="Motivo del rechazo"
        confirmLabel="Rechazar registro"
        tone="danger"
        submit={(reason) => rejectUserAction(userId, reason)}
      />
      <ReasonDialog
        open={open === 'block'}
        onClose={close}
        title="Bloquear cuenta"
        description={`${userName} perderá el acceso y se cerrarán todas sus sesiones. Explica el motivo.`}
        fieldLabel="Motivo del bloqueo"
        confirmLabel="Bloquear cuenta"
        tone="danger"
        submit={(reason) => blockUserAction(userId, reason)}
      />
    </>
  );
}
