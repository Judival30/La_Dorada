'use client';

import { CircleAlert, FileSignature, Flag, Handshake, PenLine, SearchCheck, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { ActionButton } from '@/components/ld/action-button';
import type { DealAction } from '@/domain/deal';
import {
  acceptOfferAction,
  confirmCloseAction,
  signLoiAction,
  startDueDiligenceAction,
  withdrawAction,
} from '../actions';
import { OfferForm, type OfferDefaults } from './offer-form';

type Props = {
  dealId: string;
  opportunityId: string;
  party: 'BUYER' | 'SELLER';
  actions: DealAction[];
  counterDefaults: OfferDefaults | null;
};

/**
 * The viewer's buttons, driven by `dealMachine.availableEvents` filtered with
 * `canAcceptOffer` on the server (`DealView.actions`). Nothing here decides
 * permissions; the services re-check every call.
 */
export function DealActions({ dealId, opportunityId, party, actions, counterDefaults }: Props) {
  const [countering, setCountering] = useState(false);
  const has = (a: DealAction) => actions.includes(a);
  const main = actions.filter((a) => a !== 'WITHDRAW');

  if (countering) {
    return (
      <div className="flex flex-col gap-3">
        <p className="font-semibold text-ld-navy">Tu contraoferta</p>
        <OfferForm
          compact
          {...(party === 'BUYER' ? { opportunityId } : { dealId })}
          defaults={counterDefaults ?? undefined}
          submitLabel="Enviar contraoferta"
          pendingLabel="Enviando…"
          onCancel={() => setCountering(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {has('ACCEPT') ? (
        <ActionButton
          tone="primary"
          label="Aceptar oferta"
          pendingLabel="Aceptando…"
          confirm="¿Aceptas estos términos? Se generará la carta de intención para que ambas partes la firmen."
          icon={<Handshake aria-hidden="true" className="size-4" />}
          action={() => acceptOfferAction(dealId)}
        />
      ) : null}
      {has('COUNTER') ? (
        <button
          type="button"
          onClick={() => setCountering(true)}
          className={`ld-btn ${has('ACCEPT') ? 'ld-btn-quiet' : 'ld-btn-primary'} min-h-10 w-full gap-1.5`}
        >
          <PenLine aria-hidden="true" className="size-4" />
          Hacer contraoferta
        </button>
      ) : null}
      {has('SIGN_LOI') ? (
        <ActionButton
          tone="primary"
          label="Firmar carta de intención"
          pendingLabel="Firmando…"
          confirm="¿Firmas la carta de intención? Es un documento de referencia y no te obliga a cerrar."
          icon={<FileSignature aria-hidden="true" className="size-4" />}
          action={() => signLoiAction(dealId)}
        />
      ) : null}
      {has('START_DD') ? (
        <ActionButton
          tone="primary"
          label="Iniciar due diligence"
          pendingLabel="Iniciando…"
          icon={<SearchCheck aria-hidden="true" className="size-4" />}
          action={() => startDueDiligenceAction(dealId)}
        />
      ) : null}
      {has('CONFIRM_CLOSE') ? (
        <ActionButton
          tone="primary"
          label="Confirmar cierre"
          pendingLabel="Confirmando…"
          confirm="¿Confirmas el cierre de la transacción? Cuando ambas partes confirmen, el proceso se cierra y la oportunidad sale del marketplace."
          icon={<Flag aria-hidden="true" className="size-4" />}
          action={() => confirmCloseAction(dealId)}
        />
      ) : null}
      {has('WITHDRAW') ? <WithdrawButton dealId={dealId} prominent={main.length === 0} /> : null}
    </div>
  );
}

const REASON_MAX = 500;

function WithdrawButton({ dealId, prominent }: { dealId: string; prominent: boolean }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const titleId = useId();
  const descId = useId();
  const errId = useId();

  useEffect(() => {
    const d = dialog.current;
    const onClose = () => setError(null);
    d?.addEventListener('close', onClose);
    return () => d?.removeEventListener('close', onClose);
  }, []);

  const confirm = () =>
    start(async () => {
      setError(null);
      try {
        const res = await withdrawAction(dealId, reason);
        if ('error' in res) setError(res.error);
        else {
          dialog.current?.close();
          router.refresh();
        }
      } catch {
        setError('No pudimos completar la acción. Revisa tu conexión e intenta de nuevo.');
      }
    });

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className={
          prominent
            ? 'ld-btn min-h-10 w-full border border-[var(--ld-danger)] bg-ld-surface text-[var(--ld-danger-ink)] hover:bg-[var(--ld-danger-soft)]'
            : 'ld-small mt-1 self-center rounded-[var(--ld-radius-nav)] px-2 py-1.5 font-semibold text-[var(--ld-danger-ink)] underline-offset-4 hover:underline'
        }
      >
        Desistir del proceso
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-[var(--ld-radius-panel)] border border-ld-border bg-ld-surface p-0 text-ld-ink shadow-[0_24px_60px_rgba(11,42,107,0.28)] backdrop:bg-ld-navy/50"
      >
        <div className="flex flex-col gap-4 p-5 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <h2 id={titleId} className="ld-h3">
              ¿Desistir de este proceso?
            </h2>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              aria-label="Cerrar"
              className="-m-2 flex size-10 shrink-0 items-center justify-center rounded-full text-ld-muted hover:bg-[var(--ld-neutral-soft)]"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
          <p id={descId} className="ld-small">
            La negociación termina para ambas partes y no se puede reabrir. Las ofertas pendientes
            quedan retiradas. Le avisaremos a la otra parte.
          </p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${titleId}-reason`} className="ld-small font-semibold text-ld-navy">
              Motivo (opcional)
            </label>
            <textarea
              id={`${titleId}-reason`}
              rows={3}
              maxLength={REASON_MAX}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-describedby={errId}
              placeholder="Solo lo verá la otra parte."
              className="ld-field min-h-24 resize-y py-2.5 leading-6"
            />
            <p className="ld-note ld-num self-end text-ld-muted">
              {reason.length}/{REASON_MAX}
            </p>
          </div>
          <p
            id={errId}
            aria-live="polite"
            className="ld-small text-[var(--ld-danger-ink)] empty:hidden"
          >
            {error ? (
              <span className="flex items-start gap-1.5">
                <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                {error}
              </span>
            ) : null}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              disabled={pending}
              className="ld-btn ld-btn-quiet"
            >
              Seguir en el proceso
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={pending}
              className="ld-btn border border-[var(--ld-danger)] bg-[var(--ld-danger)] text-white hover:bg-[var(--ld-danger-ink)]"
            >
              {pending ? 'Desistiendo…' : 'Sí, desistir'}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
