'use client';

import { CircleAlert, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { INVESTMENT_TYPES, OFFER_LIMITS, makeOfferSchema } from '@/domain/deal';
import { formatCOP, millions } from '@/domain/money';
import { cn } from '@/lib/utils';
import { counterOfferAction, makeOfferAction, type OfferActionResult } from '../actions';

type Fields = {
  preMoneyValue: string;
  stakePct: string;
  investmentType: string;
  paymentScheme: string;
  exclusivityDays: string;
  validUntil: string;
};
type FieldName = keyof Fields;

export type OfferDefaults = {
  preMoneyMillions: number;
  stakePct: number;
  investmentType: string;
  paymentScheme: string;
  exclusivityDays: number;
};

type Props = {
  /** Buyer: offer on this opportunity (first offer or counter). */
  opportunityId?: string;
  /** Seller: counter-offer on this deal. */
  dealId?: string;
  defaults?: OfferDefaults;
  submitLabel: string;
  pendingLabel: string;
  onCancel?: () => void;
  /** After success, open the deal page; otherwise refresh the current page. */
  redirectToDeal?: boolean;
  compact?: boolean;
};

/** YYYY-MM-DD `days` from today, in local time (the input's own format). */
function inDays(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** End of the chosen day in Bogotá, so "valid until 30 nov" means the whole day. */
const endOfDayBogota = (ymd: string): string => (ymd ? `${ymd}T23:59:59-05:00` : '');

const schema = makeOfferSchema();

export function OfferForm({
  opportunityId,
  dealId,
  defaults,
  submitLabel,
  pendingLabel,
  onCancel,
  redirectToDeal,
  compact,
}: Props) {
  const router = useRouter();
  const uid = useId();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [v, setV] = useState<Fields>({
    preMoneyValue: defaults ? String(defaults.preMoneyMillions) : '',
    stakePct: defaults ? String(defaults.stakePct) : '',
    investmentType: defaults?.investmentType ?? '',
    paymentScheme: defaults?.paymentScheme ?? '',
    exclusivityDays: defaults ? String(defaults.exclusivityDays) : '60',
    validUntil: inDays(30),
  });

  const set = (k: FieldName) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setV((s) => ({ ...s, [k]: e.target.value }));
    setFieldErrors((f) => ({ ...f, [k]: undefined }));
  };

  const preview = (() => {
    const n = Number(v.preMoneyValue);
    return Number.isInteger(n) && n > 0 ? formatCOP(millions(n)) : null;
  })();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = { ...v, validUntil: endOfDayBogota(v.validUntil) };
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const errs: Partial<Record<FieldName, string>> = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path[0] as FieldName | undefined;
        if (k && !errs[k]) errs[k] = issue.message;
      }
      setFieldErrors(errs);
      setError('Revisa los campos marcados.');
      return;
    }
    start(async () => {
      setError(null);
      let res: OfferActionResult;
      try {
        res = dealId
          ? await counterOfferAction(dealId, input)
          : await makeOfferAction(opportunityId ?? '', input);
      } catch {
        setError('No pudimos enviar la oferta. Revisa tu conexión e intenta de nuevo.');
        return;
      }
      if ('error' in res) {
        setError(res.error);
        return;
      }
      if (redirectToDeal) router.push(`/processes/${res.dealId}`);
      else {
        onCancel?.();
        router.refresh();
      }
    });
  };

  const id = (k: FieldName) => `${uid}-${k}`;
  const describedBy = (k: FieldName, hint?: boolean) =>
    [hint ? `${id(k)}-hint` : null, fieldErrors[k] ? `${id(k)}-err` : null]
      .filter(Boolean)
      .join(' ') || undefined;
  const fieldError = (k: FieldName) =>
    fieldErrors[k] ? (
      <p id={`${id(k)}-err`} className="ld-note text-[var(--ld-danger-ink)]">
        {fieldErrors[k]}
      </p>
    ) : null;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className={cn('grid gap-4', compact ? '' : 'sm:grid-cols-2')}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id('preMoneyValue')} className="ld-small font-semibold text-ld-navy">
            Valor de la empresa (pre-money)
          </label>
          <div className="relative">
            <span className="ld-small pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ld-muted">
              COP
            </span>
            <input
              id={id('preMoneyValue')}
              inputMode="numeric"
              value={v.preMoneyValue}
              onChange={set('preMoneyValue')}
              aria-invalid={fieldErrors.preMoneyValue ? true : undefined}
              aria-describedby={describedBy('preMoneyValue', true)}
              className="ld-field ld-num pl-12 pr-24"
            />
            <span className="ld-small pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ld-muted">
              millones
            </span>
          </div>
          <p id={`${id('preMoneyValue')}-hint`} className="ld-note ld-num text-ld-muted">
            {preview
              ? `Equivale a ${preview}`
              : `Mínimo ${OFFER_LIMITS.minPreMoneyMillions} millones`}
          </p>
          {fieldError('preMoneyValue')}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={id('stakePct')} className="ld-small font-semibold text-ld-navy">
            Participación a adquirir
          </label>
          <div className="relative">
            <input
              id={id('stakePct')}
              inputMode="decimal"
              value={v.stakePct}
              onChange={set('stakePct')}
              aria-invalid={fieldErrors.stakePct ? true : undefined}
              aria-describedby={describedBy('stakePct')}
              className="ld-field ld-num pr-10"
            />
            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ld-muted">
              %
            </span>
          </div>
          {fieldError('stakePct')}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={id('investmentType')} className="ld-small font-semibold text-ld-navy">
            Tipo de inversión
          </label>
          <select
            id={id('investmentType')}
            value={v.investmentType}
            onChange={set('investmentType')}
            aria-invalid={fieldErrors.investmentType ? true : undefined}
            aria-describedby={describedBy('investmentType')}
            className="ld-field"
          >
            <option value="">Elige una opción</option>
            {INVESTMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {fieldError('investmentType')}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={id('paymentScheme')} className="ld-small font-semibold text-ld-navy">
            Esquema de pago
          </label>
          <input
            id={id('paymentScheme')}
            value={v.paymentScheme}
            maxLength={OFFER_LIMITS.paymentSchemeMax}
            onChange={set('paymentScheme')}
            placeholder="Ej.: 70% al cierre / 30% a 12 meses"
            aria-invalid={fieldErrors.paymentScheme ? true : undefined}
            aria-describedby={describedBy('paymentScheme')}
            className="ld-field"
          />
          {fieldError('paymentScheme')}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={id('exclusivityDays')} className="ld-small font-semibold text-ld-navy">
            Exclusividad
          </label>
          <div className="relative">
            <input
              id={id('exclusivityDays')}
              inputMode="numeric"
              value={v.exclusivityDays}
              onChange={set('exclusivityDays')}
              aria-invalid={fieldErrors.exclusivityDays ? true : undefined}
              aria-describedby={describedBy('exclusivityDays')}
              className="ld-field ld-num pr-14"
            />
            <span className="ld-small pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ld-muted">
              días
            </span>
          </div>
          {fieldError('exclusivityDays')}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={id('validUntil')} className="ld-small font-semibold text-ld-navy">
            Oferta válida hasta
          </label>
          <input
            id={id('validUntil')}
            type="date"
            min={inDays(1)}
            max={inDays(OFFER_LIMITS.maxValidityDays - 1)}
            value={v.validUntil}
            onChange={set('validUntil')}
            aria-invalid={fieldErrors.validUntil ? true : undefined}
            aria-describedby={describedBy('validUntil')}
            className="ld-field"
          />
          {fieldError('validUntil')}
        </div>
      </div>

      <p aria-live="polite" className="ld-small text-[var(--ld-danger-ink)] empty:hidden">
        {error ? (
          <span className="flex items-start gap-1.5">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {error}
          </span>
        ) : null}
      </p>

      <div className={cn('flex gap-2', compact ? 'flex-col' : 'flex-col sm:flex-row')}>
        <button type="submit" disabled={pending} className="ld-btn ld-btn-primary gap-2">
          <Send aria-hidden="true" className="size-4" />
          {pending ? pendingLabel : submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="ld-btn ld-btn-quiet"
          >
            Cancelar
          </button>
        ) : null}
      </div>
    </form>
  );
}
