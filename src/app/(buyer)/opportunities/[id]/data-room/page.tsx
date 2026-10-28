import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ChevronDown, Download, FileText, Folder, LockKeyhole } from 'lucide-react';
import { NotFoundError } from '@/domain/errors';
import { formatDay, formatSize } from '@/lib/format';
import { requireUser } from '@/server/auth/guard';
import { getDataRoom, type DataRoomView } from '@/server/services/data-room';
import { activeDealId } from '@/server/services/deal';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Data room' };

type Props = { params: Promise<{ id: string }> };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default async function DataRoomPage({ params }: Props) {
  const user = await requireUser('BUYER');
  const { id } = await params;
  let room: DataRoomView;
  try {
    room = await getDataRoom(user, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const o = room.opportunity;
  const dealId = await activeDealId(user.id, o.id);

  return (
    <>
      <Link
        href={`/opportunities/${o.id}`}
        className="ld-small mb-4 inline-flex items-center gap-1.5 font-semibold text-ld-primary hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver a la oportunidad
      </Link>

      <header className="mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="ld-h1">{o.title}</h1>
          <p className="mt-1 text-ld-muted">
            {o.legalName} | {o.sectorLabel} | {o.department} | {o.typeLabel}
          </p>
        </div>
        <Link
          href={dealId ? `/processes/${dealId}` : `/opportunities/${o.id}/oferta`}
          className="ld-btn ld-btn-primary w-full sm:w-auto"
        >
          {dealId ? 'Ver proceso' : 'Hacer una oferta'}
        </Link>
      </header>

      <div
        role="note"
        className="mb-6 flex items-start gap-3 rounded-[var(--ld-radius-panel)] bg-ld-navy px-5 py-4 text-white"
      >
        <LockKeyhole aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[var(--ld-gold)]" />
        <div>
          <p className="font-semibold">Información confidencial — acceso registrado</p>
          <p className="ld-small mt-0.5 text-white/85">
            Cada descarga queda registrada con tu usuario y la hora.
            {room.nda
              ? ` Tu acuerdo de confidencialidad está vigente hasta el ${formatDay(room.nda.expiresAt)}.`
              : ''}{' '}
            Los enlaces de descarga duran 60 segundos.
          </p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="ld-h2">Documentos del data room</h2>
        <p className="ld-small ld-num text-ld-muted">
          {plural(room.totals.folders, 'carpeta', 'carpetas')},{' '}
          {plural(room.totals.documents, 'documento', 'documentos')}
        </p>
      </div>

      <div className="overflow-hidden rounded-[var(--ld-radius-panel)] border border-ld-border bg-ld-surface">
        {room.folders.map((f, i) => (
          <details
            key={f.id}
            open={i === 0}
            className="group border-b border-ld-border last:border-b-0"
          >
            <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-[var(--ld-bg)] md:px-5 [&::-webkit-details-marker]:hidden">
              <Folder aria-hidden="true" className="size-5 shrink-0 text-[var(--ld-gold-ink)]" />
              <span className="min-w-0 flex-1 font-semibold text-ld-navy">{f.name}</span>
              <span className="ld-small ld-num whitespace-nowrap text-ld-muted">
                {f.documents.length === 0
                  ? 'Vacía'
                  : plural(f.documents.length, 'documento', 'documentos')}
              </span>
              <ChevronDown
                aria-hidden="true"
                className="size-4 shrink-0 text-ld-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
              />
            </summary>
            {f.documents.length === 0 ? (
              <p className="ld-small px-4 pb-4 pl-12 text-ld-muted md:px-5 md:pl-13">
                El vendedor aún no ha subido documentos a esta carpeta.
              </p>
            ) : (
              <ul className="border-t border-ld-border bg-[var(--ld-bg)]/60">
                {f.documents.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-col gap-2 border-b border-ld-border px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4 md:px-5 md:pl-12"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-2.5">
                      <FileText
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-ld-muted"
                      />
                      <span className="ld-small min-w-0 break-words font-medium text-ld-ink">
                        {d.name}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4 pl-6 sm:pl-0">
                      <span className="ld-note ld-num whitespace-nowrap text-ld-muted">
                        {formatSize(d.size)} | {formatDay(d.createdAt)}
                      </span>
                      <a
                        href={`/api/documents/${d.id}`}
                        rel="noreferrer"
                        className="ld-btn ld-btn-quiet min-h-10 gap-1.5 px-3"
                      >
                        <Download aria-hidden="true" className="size-4" />
                        Descargar
                        <span className="sr-only"> {d.name}</span>
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </details>
        ))}
      </div>
    </>
  );
}
