import { ChevronRight, FileText } from 'lucide-react';
import Link from 'next/link';
import { StatusChip } from '@/components/ld/status-chip';
import type { UserReviewRow } from '@/server/services/user-review';
import {
  ROLE_NAME,
  STATUS_LABEL,
  STATUS_TONE,
  formatDay,
  initialsOf,
} from './labels';

function actionLabel(row: UserReviewRow): string {
  return row.status === 'IN_REVIEW' ? 'Revisar' : 'Ver detalles';
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ld-primary-soft text-[0.8125rem] font-semibold text-ld-navy"
    >
      {initialsOf(name)}
    </span>
  );
}

/** Delivered / required as a number plus one segment per required document. */
function Docs({ delivered, required }: { delivered: number; required: number }) {
  const complete = required > 0 && delivered >= required;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="ld-num ld-small font-semibold text-ld-navy">
        {delivered}/{required}
        <span className="sr-only"> documentos entregados</span>
      </span>
      <span aria-hidden="true" className="flex gap-0.5">
        {Array.from({ length: required }, (_, i) => (
          <span
            key={i}
            className={`h-1.5 w-3 rounded-full ${
              i < delivered
                ? complete
                  ? 'bg-[var(--ld-success)]'
                  : 'bg-ld-primary'
                : 'bg-ld-border-strong'
            }`}
          />
        ))}
      </span>
    </span>
  );
}

function RowAction({ row }: { row: UserReviewRow }) {
  const primary = row.status === 'IN_REVIEW';
  return (
    <Link
      href={`/bo/users/${row.id}`}
      className={`ld-btn min-h-10 px-4 whitespace-nowrap ${primary ? 'ld-btn-primary' : 'ld-btn-quiet'}`}
    >
      {actionLabel(row)}
      <span className="sr-only"> de {row.name}</span>
    </Link>
  );
}

export function UsersTable({ rows }: { rows: UserReviewRow[] }) {
  return (
    <>
      {/* Desktop: table */}
      <div className="hidden overflow-x-auto rounded-[var(--ld-radius-panel)] border border-ld-border bg-ld-surface md:block">
        <table className="w-full min-w-[56rem] border-collapse text-left">
          <caption className="sr-only">Usuarios pendientes de validación</caption>
          <thead>
            <tr className="border-b border-ld-border bg-[var(--ld-neutral-soft)]">
              {['Usuario', 'Empresa', 'Tipo', 'Documentos', 'Estado', 'Actualizado', 'Acción'].map(
                (h) => (
                  <th
                    key={h}
                    scope="col"
                    className="ld-small px-3 py-3 font-semibold text-ld-navy"
                  >
                    {h === 'Acción' ? <span className="sr-only">Acción</span> : h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-ld-border last:border-b-0">
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={row.name} />
                    <div className="min-w-0 max-w-[13rem]">
                      <p className="ld-small truncate font-semibold text-ld-navy">{row.name}</p>
                      <p className="ld-note truncate text-ld-muted">{row.email}</p>
                    </div>
                  </div>
                </td>
                <td className="ld-small max-w-[10rem] px-3 py-3 text-ld-ink">
                  {row.organizationName ?? <span className="text-ld-muted">Sin empresa aún</span>}
                </td>
                <td className="ld-small px-3 py-3 text-ld-ink">{ROLE_NAME[row.role]}</td>
                <td className="px-3 py-3">
                  <Docs {...row.docs} />
                </td>
                <td className="px-3 py-3">
                  <StatusChip tone={STATUS_TONE[row.status]} className="whitespace-nowrap">{STATUS_LABEL[row.status]}</StatusChip>
                </td>
                <td className="ld-small ld-num whitespace-nowrap px-3 py-3 text-ld-muted">
                  {formatDay(row.updatedAt).replaceAll(" de ", " ")}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right">
                  <RowAction row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: card list */}
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => (
          <li
            key={row.id}
            className="rounded-[var(--ld-radius-panel)] border border-ld-border bg-ld-surface p-4"
          >
            <div className="flex items-start gap-3">
              <Avatar name={row.name} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ld-navy">{row.name}</p>
                <p className="ld-small break-words text-ld-muted">
                  {row.organizationName ?? 'Sin empresa aún'}
                </p>
              </div>
              <StatusChip tone={STATUS_TONE[row.status]} className="whitespace-nowrap">{STATUS_LABEL[row.status]}</StatusChip>
            </div>
            <dl className="ld-small mt-3 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5">
              <dt className="text-ld-muted">Tipo</dt>
              <dd className="text-ld-ink">{ROLE_NAME[row.role]}</dd>
              <dt className="flex items-center gap-1 text-ld-muted">
                <FileText aria-hidden="true" className="size-4" />
                Documentos
              </dt>
              <dd>
                <Docs {...row.docs} />
              </dd>
              <dt className="text-ld-muted">Actualizado</dt>
              <dd className="ld-num text-ld-ink">{formatDay(row.updatedAt).replaceAll(" de ", " ")}</dd>
            </dl>
            <Link
              href={`/bo/users/${row.id}`}
              className={`ld-btn mt-4 w-full ${row.status === 'IN_REVIEW' ? 'ld-btn-primary' : 'ld-btn-quiet'}`}
            >
              {actionLabel(row)}
              <span className="sr-only"> de {row.name}</span>
              <ChevronRight aria-hidden="true" className="size-4" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
