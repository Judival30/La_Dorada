'use client';

import { CircleAlert, PenLine } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { requestAccessAction, signNdaAction } from '../actions';

const MIN = 20;
const MAX = 500;

function FormError({ id, error }: { id: string; error: string | null }) {
  return (
    <p id={id} aria-live="polite" className="ld-small text-[var(--ld-danger-ink)] empty:hidden">
      {error ? (
        <span className="flex items-start gap-1.5">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {error}
        </span>
      ) : null}
    </p>
  );
}

export function RequestForm({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();
  const [purpose, setPurpose] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const errId = useId();
  const hintId = useId();
  const length = purpose.trim().length;
  const valid = length >= MIN && length <= MAX;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) {
      setError(
        length < MIN
          ? `Escribe al menos ${MIN} caracteres para que el vendedor entienda tu interés.`
          : `El propósito puede tener máximo ${MAX} caracteres.`,
      );
      return;
    }
    start(async () => {
      setError(null);
      const res = await requestAccessAction(opportunityId, purpose);
      if ('error' in res) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="purpose" className="font-semibold text-ld-navy">
          ¿Para qué quieres conocer esta empresa?
        </label>
        <p id={hintId} className="ld-small text-ld-muted">
          El vendedor lee esto antes de decidir. Cuenta qué tipo de inversión buscas y qué te
          interesa del negocio.
        </p>
        <textarea
          id="purpose"
          name="purpose"
          rows={5}
          maxLength={MAX}
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          aria-describedby={`${hintId} ${errId}`}
          aria-invalid={error ? true : undefined}
          placeholder="Ej.: Fondo con foco en alimentos. Buscamos una participación mayoritaria y acompañar la expansión regional."
          className="ld-field min-h-32 resize-y py-3 leading-6"
        />
        <p className="ld-note ld-num self-end text-ld-muted" aria-live="off">
          {length}/{MAX}
          {length < MIN ? ` (mínimo ${MIN})` : ''}
        </p>
      </div>
      <FormError id={errId} error={error} />
      <button type="submit" disabled={pending} className="ld-btn ld-btn-primary sm:self-start">
        {pending ? 'Enviando solicitud…' : 'Solicitar acceso'}
      </button>
    </form>
  );
}

export function SignForm({
  opportunityId,
  accessRequestId,
  ndaText,
  renewal,
}: {
  opportunityId: string;
  accessRequestId: string;
  ndaText: string;
  renewal: boolean;
}) {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const errId = useId();
  const docId = useId();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accepted) {
      setError('Marca la casilla para confirmar que leíste y aceptas el acuerdo.');
      return;
    }
    start(async () => {
      setError(null);
      const res = await signNdaAction(opportunityId, accessRequestId, accepted);
      if ('error' in res) setError(res.error);
      else router.refresh();
    });
  };

  const [title, ...paragraphs] = ndaText.split('\n\n');

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div
        id={docId}
        tabIndex={0}
        role="document"
        aria-label="Texto del acuerdo de confidencialidad"
        className="max-h-[22rem] overflow-y-auto rounded-[var(--ld-radius-control)] border border-ld-border-strong bg-[var(--ld-bg)] px-5 py-5 md:px-7"
      >
        <p className="font-display text-base font-semibold text-ld-navy">{title}</p>
        {paragraphs.map((p) => (
          <p key={p.slice(0, 32)} className="ld-small mt-3 max-w-prose leading-6 text-ld-ink">
            {p}
          </p>
        ))}
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-[var(--ld-radius-control)] border border-ld-border bg-ld-surface p-3.5">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          aria-describedby={errId}
          className="mt-1 size-[1.125rem] shrink-0 accent-[var(--ld-primary)]"
        />
        <span className="text-ld-ink">
          He leído y acepto el acuerdo de confidencialidad. Entiendo que mi firma electrónica queda
          registrada con la fecha, mi dirección IP y la huella del documento.
        </span>
      </label>

      <FormError id={errId} error={error} />
      <button
        type="submit"
        disabled={pending}
        className="ld-btn ld-btn-primary gap-2 sm:self-start"
      >
        <PenLine aria-hidden="true" className="size-4" />
        {pending ? 'Firmando…' : renewal ? 'Firmar nuevo NDA' : 'Firmar NDA'}
      </button>
    </form>
  );
}
