'use client';

import { CircleAlert, ExternalLink, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { StatusChip, type ChipTone } from '@/components/ld/status-chip';
import type { ReviewStatus, VerificationDocumentType } from '@/domain/onboarding';
import { deleteDocumentAction } from '../actions';
import { formatBytes } from './format';

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const ACCEPTED_EXT = /\.(pdf|jpe?g|png)$/i;

export type SlotDocument = {
  id: string;
  reviewStatus: ReviewStatus;
  size: number;
  originalName: string | null;
};

const STATE: Record<'missing' | ReviewStatus, { tone: ChipTone; label: string }> = {
  missing: { tone: 'neutral', label: 'Falta subir' },
  PENDING: { tone: 'success', label: 'Subido' },
  APPROVED: { tone: 'success', label: 'Aprobado' },
  REJECTED: { tone: 'danger', label: 'Rechazado' },
};

function clientError(file: File): string | null {
  if (file.size === 0) return 'El archivo está vacío. Elige otro.';
  if (!ACCEPTED_TYPES.includes(file.type) && !ACCEPTED_EXT.test(file.name)) {
    return 'Solo se aceptan archivos PDF, JPG o PNG.';
  }
  if (file.size > MAX_BYTES) return 'El archivo supera el límite de 10 MB.';
  return null;
}

type Props = { type: VerificationDocumentType; label: string; hint: string; doc?: SlotDocument };

/** One required document: shows its state and uploads with a progress bar. */
export function DocumentSlot({ type, label, hint, doc }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const [removing, startRemove] = useTransition();

  const uploading = progress !== null;
  const busy = uploading || refreshing || removing;
  const state = doc ? STATE[doc.reviewStatus] : STATE.missing;
  const locked = doc?.reviewStatus === 'APPROVED';
  const titleId = `doc-${type}`;

  function upload(file: File) {
    const invalid = clientError(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setProgress(0);

    const body = new FormData();
    body.set('type', type);
    body.set('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/verification/documents');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.timeout = 120_000;
    xhr.ontimeout = () => {
      setProgress(null);
      setError('La subida tardó demasiado. Revisa tu conexión e intenta de nuevo.');
    };
    xhr.onerror = () => {
      setProgress(null);
      setError('No pudimos subir el archivo. Revisa tu conexión e intenta de nuevo.');
    };
    xhr.onload = () => {
      setProgress(null);
      if (xhr.status === 201) {
        startRefresh(() => router.refresh());
        return;
      }
      if (xhr.status === 401) {
        setError('Tu sesión expiró. Vuelve a iniciar sesión.');
        return;
      }
      let message = 'No pudimos subir el archivo. Intenta de nuevo.';
      try {
        const parsed = JSON.parse(xhr.responseText) as { error?: { message?: string } };
        if (parsed.error?.message) message = parsed.error.message;
      } catch {
        // Not JSON (proxy error page, for example): keep the generic message.
      }
      setError(message);
    };
    xhr.send(body);
  }

  function remove() {
    if (!doc) return;
    setError(null);
    startRemove(async () => {
      const res = await deleteDocumentAction(doc.id);
      if ('error' in res) setError(res.error);
    });
  }

  return (
    <li className="flex flex-col gap-3 py-5 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--ld-radius-nav)] bg-ld-primary-soft text-ld-navy">
            <FileText aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 id={titleId} className="ld-h3">
              {label}
            </h3>
            <p className="ld-small text-ld-muted">{hint}</p>
            {doc ? (
              <p className="ld-small mt-1 flex flex-wrap items-center gap-x-2 text-ld-ink">
                <span className="break-all font-medium">
                  {doc.originalName ?? 'Archivo subido'}
                </span>
                <span className="ld-num text-ld-muted">{formatBytes(doc.size)}</span>
                <a
                  href={`/api/verification/documents/${doc.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-ld-primary underline underline-offset-4"
                >
                  Ver
                  <ExternalLink aria-hidden="true" className="size-3.5" />
                  <span className="sr-only">{label}, se abre en otra pestaña</span>
                </a>
              </p>
            ) : null}
          </div>
        </div>
        <StatusChip tone={state.tone} className="self-start">
          {state.label}
        </StatusChip>
      </div>

      {doc?.reviewStatus === 'REJECTED' ? (
        <p className="ld-small rounded-[var(--ld-radius-control)] bg-[var(--ld-danger-soft)] px-3 py-2.5 font-medium text-[var(--ld-danger-ink)]">
          Sube una versión nueva, legible y vigente.
        </p>
      ) : null}
      {doc?.reviewStatus === 'PENDING' ? (
        <p className="ld-small text-ld-muted">
          El Back Office lo revisará cuando envíes tu registro.
        </p>
      ) : null}

      {uploading || refreshing ? (
        <div className="flex flex-col gap-1.5">
          <div
            role="progressbar"
            aria-label={`Subida de ${label}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress ?? 100}
            className="h-2 overflow-hidden rounded-full bg-ld-border"
          >
            <div
              className="h-full rounded-full bg-ld-primary transition-[width] duration-150"
              style={{ width: `${progress ?? 100}%` }}
            />
          </div>
          <p className="ld-small ld-num text-ld-muted">
            {progress !== null && progress < 100
              ? `Subiendo… ${progress} %`
              : 'Verificando el archivo…'}
          </p>
        </div>
      ) : null}

      {!locked ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <label
            aria-disabled={busy}
            className={`ld-btn ld-btn-quiet w-full cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ld-primary sm:w-auto ${busy ? 'pointer-events-none opacity-60' : ''}`}
          >
            {doc ? 'Reemplazar' : 'Subir documento'}
            <span className="sr-only">: {label}</span>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              disabled={busy}
              aria-describedby={titleId}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload(file);
                e.target.value = '';
              }}
            />
          </label>
          {doc ? (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="ld-btn ld-btn-quiet w-full sm:w-auto"
            >
              {removing ? 'Quitando…' : 'Quitar'}
              <span className="sr-only">: {label}</span>
            </button>
          ) : null}
        </div>
      ) : null}

      <div aria-live="polite" className="empty:hidden">
        {error ? (
          <p
            role="alert"
            className="ld-small flex items-start gap-2 rounded-[var(--ld-radius-control)] bg-[var(--ld-danger-soft)] px-3 py-2.5 font-medium text-[var(--ld-danger-ink)]"
          >
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </p>
        ) : null}
      </div>
    </li>
  );
}
