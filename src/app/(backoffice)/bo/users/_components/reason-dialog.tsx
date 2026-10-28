'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { ReviewActionResult } from '../actions';
import { useReviewFeedback } from './feedback';

export const MIN_LEN = 10;
export const MAX_LEN = 1000;

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  fieldLabel: string;
  /** Same verb as the opening button and as the confirmation message. */
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  submit: (text: string) => Promise<ReviewActionResult>;
};

/**
 * Native `<dialog>` opened with `showModal()`: the browser traps focus, makes the
 * rest of the page inert and closes on Esc. Focus returns to the opener on close.
 */
export function ReasonDialog({
  open,
  onClose,
  title,
  description,
  fieldLabel,
  confirmLabel,
  tone = 'primary',
  submit,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const { run, busy } = useReviewFeedback();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const uid = useId();
  const fieldId = `${uid}-field`;
  const helpId = `${uid}-help`;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setText('');
      setError(null);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open]);

  const length = text.trim().length;
  const valid = length >= MIN_LEN && length <= MAX_LEN;
  const hint =
    length < MIN_LEN
      ? `Escribe al menos ${MIN_LEN} caracteres. Te faltan ${MIN_LEN - length}.`
      : length > MAX_LEN
        ? `Quita ${length - MAX_LEN} caracteres para continuar.`
        : 'Longitud válida.';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setError(null);
    const result = await run(() => submit(text.trim()));
    if ('ok' in result) onClose();
    else setError(result.error);
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby={`${uid}-title`}
      aria-describedby={`${uid}-desc`}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-[var(--ld-radius-panel)] border border-ld-border bg-ld-surface p-0 text-ld-ink shadow-[0_12px_40px_rgba(11,42,107,0.28)] backdrop:bg-ld-navy/50"
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4 p-5 md:p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 id={`${uid}-title`} className="ld-h2">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-2 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-[var(--ld-radius-control)] text-ld-muted hover:bg-[var(--ld-neutral-soft)] hover:text-ld-navy"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        <p id={`${uid}-desc`} className="max-w-[60ch]">
          {description}
        </p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={fieldId} className="ld-small font-semibold text-ld-navy">
            {fieldLabel}
          </label>
          <textarea
            id={fieldId}
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-describedby={helpId}
            aria-invalid={length > MAX_LEN || undefined}
            className="w-full resize-y rounded-[var(--ld-radius-control)] border border-ld-border-strong bg-ld-surface p-3 text-ld-navy"
          />
          <p id={helpId} className="ld-small flex flex-wrap justify-between gap-x-4 text-ld-muted">
            <span>{hint}</span>
            <span
              className={`ld-num font-semibold ${valid ? 'text-ld-navy' : 'text-ld-muted'}`}
              aria-label={`${length} de ${MAX_LEN} caracteres`}
            >
              {length}/{MAX_LEN}
            </span>
          </p>
        </div>
        {error ? (
          <p role="alert" className="ld-small whitespace-pre-line font-medium text-[var(--ld-danger-ink)]">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="ld-btn ld-btn-quiet">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!valid || busy}
            className={`ld-btn disabled:cursor-not-allowed disabled:opacity-60 ${
              tone === 'danger'
                ? 'bg-[var(--ld-danger)] text-white hover:bg-[var(--ld-danger-ink)]'
                : 'ld-btn-primary'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
