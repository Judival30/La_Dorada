'use client';

import { Check, CircleAlert } from 'lucide-react';
import { useActionState, type ReactNode } from 'react';
import { saveStepAction, type ActionResult } from '../actions';

export const describedBy = (...ids: (string | false | undefined)[]) =>
  ids.filter(Boolean).join(' ') || undefined;

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p
      id={id}
      className="ld-small flex items-start gap-1.5 font-medium text-[var(--ld-danger-ink)]"
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

type TextFieldProps = {
  name: string;
  label: string;
  defaultValue?: string;
  error?: string;
  hint?: string;
  type?: string;
  autoComplete?: string;
  inputMode?: 'text' | 'numeric' | 'tel';
  placeholder?: string;
  maxLength?: number;
};

export function TextField({
  name,
  label,
  defaultValue,
  error,
  hint,
  type = 'text',
  autoComplete,
  inputMode,
  placeholder,
  maxLength,
}: TextFieldProps) {
  const id = `f-${name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="ld-small font-semibold text-ld-navy">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        inputMode={inputMode}
        placeholder={placeholder}
        maxLength={maxLength}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hint && `${id}-hint`, error && `${id}-error`)}
        className="ld-field"
      />
      {hint ? (
        <p id={`${id}-hint`} className="ld-small text-ld-muted">
          {hint}
        </p>
      ) : null}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

type SelectFieldProps = {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  error?: string;
  placeholder: string;
};

export function SelectField({
  name,
  label,
  options,
  defaultValue,
  error,
  placeholder,
}: SelectFieldProps) {
  const id = `f-${name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="ld-small font-semibold text-ld-navy">
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue ?? ''}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(error && `${id}-error`)}
        className="ld-field"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

/** A native radio drawn as a bordered option, same pattern as the sign-up role cards. */
export function RadioCard({
  name,
  value,
  title,
  text,
  defaultChecked,
  onSelect,
}: {
  name: string;
  value: string;
  title: string;
  text?: string;
  defaultChecked?: boolean;
  onSelect?: () => void;
}) {
  return (
    <label className="group relative flex cursor-pointer items-start gap-3 rounded-[var(--ld-radius-control)] border border-ld-border bg-ld-surface p-4 transition-colors hover:border-ld-border-strong has-[:checked]:border-ld-primary has-[:checked]:bg-ld-primary-soft has-[:checked]:shadow-[inset_0_0_0_1px_var(--ld-primary)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ld-primary">
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        onChange={onSelect}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-ld-border-strong bg-ld-surface group-has-[:checked]:border-ld-primary group-has-[:checked]:bg-ld-primary"
      >
        <Check className="hidden size-3.5 text-white group-has-[:checked]:block" strokeWidth={3} />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="font-display text-[1.0625rem] font-semibold leading-6 text-ld-navy">
          {title}
        </span>
        {text ? <span className="ld-small text-ld-muted">{text}</span> : null}
      </span>
    </label>
  );
}

export function CheckOption({
  name,
  value,
  label,
  defaultChecked,
}: {
  name: string;
  value: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 break-inside-avoid rounded-[var(--ld-radius-nav)] px-2 hover:bg-ld-primary-soft">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="size-5 shrink-0 cursor-pointer accent-[var(--ld-primary)]"
      />
      <span className="ld-small text-ld-ink">{label}</span>
    </label>
  );
}

/** Wires a step form to `saveStepAction`, which redirects to the next step once it saves. */
export function useStepForm(step: 1 | 3 | 4) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    saveStepAction.bind(null, step),
    null,
  );
  const failed = state && 'error' in state ? state : null;
  return {
    action,
    pending,
    error: failed?.error,
    fieldErrors: failed?.fieldErrors ?? {},
    values: failed?.values,
  };
}

export function str(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function StepFooter({
  pending,
  error,
  children,
}: {
  pending: boolean;
  error?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div aria-live="polite" className="empty:hidden">
        {error ? (
          <p
            role="alert"
            className="ld-small flex items-start gap-2 rounded-[var(--ld-radius-control)] bg-[var(--ld-danger-soft)] px-3 py-2.5 font-medium text-[var(--ld-danger-ink)]"
          >
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span className="whitespace-pre-line">{error}</span>
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button type="submit" disabled={pending} className="ld-btn ld-btn-primary w-full sm:w-auto">
          {pending ? 'Guardando…' : 'Guardar y continuar'}
        </button>
        {children}
      </div>
    </div>
  );
}
