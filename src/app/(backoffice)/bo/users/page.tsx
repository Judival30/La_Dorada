import type { Metadata } from 'next';
import { Search, UsersRound } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/ld/empty-state';
import { PageHeader } from '@/components/ld/page-header';
import { USER_STATUSES } from '@/domain/machines/user';
import { requireUser } from '@/server/auth/guard';
import {
  REVIEW_PAGE_SIZE,
  countUsersForReview,
  listUsersForReview,
} from '@/server/services/user-review';
import { STATUS_LABEL } from './_components/labels';
import { parseQueueQuery, queueHref } from './_components/query';
import { UsersTable } from './_components/users-table';

export const metadata: Metadata = { title: 'Validación de usuarios' };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function UsersQueuePage({ searchParams }: PageProps) {
  const actor = await requireUser('BACKOFFICE');
  const query = parseQueueQuery(await searchParams);
  const { role, status, q, page } = query;
  const base = { status, q };

  // Tab counts respect the status filter (one grouped count); the list call feeds the table.
  // A text search cannot be counted by role/status, so then the tab totals come from list calls.
  const current = await listUsersForReview(actor, { ...base, role, page });
  let tabTotals: { all: number; buyers: number; sellers: number };
  if (q) {
    const totalOf = async (r?: 'BUYER' | 'SELLER') =>
      r === role ? current.total : (await listUsersForReview(actor, { ...base, role: r })).total;
    const [all, buyers, sellers] = await Promise.all([
      totalOf(undefined),
      totalOf('BUYER'),
      totalOf('SELLER'),
    ]);
    tabTotals = { all, buyers, sellers };
  } else {
    const counts = await countUsersForReview(actor);
    const sum = (r: 'BUYER' | 'SELLER') =>
      status
        ? (counts[r][status] ?? 0)
        : Object.values(counts[r]).reduce((a, n) => a + (n ?? 0), 0);
    tabTotals = { all: sum('BUYER') + sum('SELLER'), buyers: sum('BUYER'), sellers: sum('SELLER') };
  }
  const pages = Math.max(1, Math.ceil(current.total / REVIEW_PAGE_SIZE));
  const from = (page - 1) * REVIEW_PAGE_SIZE + 1;
  const to = Math.min(page * REVIEW_PAGE_SIZE, current.total);
  const filtered = Boolean(status || q);

  const tabs = [
    { label: 'Todos', value: undefined, total: tabTotals.all },
    { label: 'Compradores', value: 'BUYER' as const, total: tabTotals.buyers },
    { label: 'Vendedores', value: 'SELLER' as const, total: tabTotals.sellers },
  ];

  return (
    <>
      <PageHeader
        title="Validación de usuarios"
        description="Revisa la identidad, la representación y los documentos de compradores y vendedores antes de habilitarlos."
      />

      <nav aria-label="Tipo de usuario" className="mb-4">
        <ul className="inline-flex max-w-full gap-1 overflow-x-auto rounded-[var(--ld-radius-control)] border border-ld-border bg-ld-surface p-1">
          {tabs.map((t) => {
            const active = t.value === role;
            return (
              <li key={t.label}>
                <Link
                  href={queueHref({ ...base, role: t.value })}
                  aria-current={active ? 'page' : undefined}
                  className={`ld-small flex min-h-10 items-center gap-2 whitespace-nowrap rounded-[var(--ld-radius-nav)] px-3.5 font-semibold transition-colors ${
                    active
                      ? 'bg-ld-primary-soft text-ld-navy'
                      : 'text-ld-ink hover:bg-[var(--ld-neutral-soft)]'
                  }`}
                >
                  {t.label}
                  <span className="ld-num ld-note text-ld-muted">({t.total})</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <form
        method="get"
        action="/bo/users"
        role="search"
        aria-label="Buscar y filtrar usuarios"
        className="mb-5 flex flex-col gap-3 md:flex-row md:items-end"
      >
        {role ? <input type="hidden" name="rol" value={role} /> : null}
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="q" className="ld-small font-semibold text-ld-navy">
            Buscar
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 size-[1.125rem] -translate-y-1/2 text-ld-muted"
            />
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={q ?? ''}
              maxLength={120}
              placeholder="Nombre, correo o empresa"
              className="ld-field pl-10"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5 md:w-60">
          <label htmlFor="estado" className="ld-small font-semibold text-ld-navy">
            Estado
          </label>
          <select id="estado" name="estado" defaultValue={status ?? ''} className="ld-field">
            <option value="">Todos los estados</option>
            {USER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button type="submit" className="ld-btn ld-btn-primary flex-1 md:flex-none">
            Filtrar
          </button>
          {filtered ? (
            <Link href={queueHref({ role })} className="ld-btn ld-btn-quiet flex-1 md:flex-none">
              Limpiar filtros
            </Link>
          ) : null}
        </div>
      </form>

      {current.items.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={UsersRound}
            title="Ningún usuario coincide con tu búsqueda"
            description="Prueba con otro nombre o empresa, o quita el filtro de estado."
            action={
              <Link href={queueHref({ role })} className="ld-btn ld-btn-quiet">
                Limpiar filtros
              </Link>
            }
          />
        ) : (
          <EmptyState
            icon={UsersRound}
            title="Todavía no hay registros para validar"
            description="Cuando un comprador o un vendedor envíe su registro, aparecerá aquí para que lo revises."
          />
        )
      ) : (
        <>
          <UsersTable rows={current.items} />
          <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="ld-small ld-num text-ld-muted" aria-live="polite">
              Mostrando {from} a {to} de {current.total}
            </p>
            {pages > 1 ? (
              <nav aria-label="Paginación" className="flex items-center gap-2">
                {page > 1 ? (
                  <Link
                    href={queueHref({ ...query, page: page - 1 })}
                    rel="prev"
                    className="ld-btn ld-btn-quiet min-h-10"
                  >
                    Anterior
                  </Link>
                ) : null}
                <span className="ld-small ld-num px-2 text-ld-ink">
                  Página {page} de {pages}
                </span>
                {page < pages ? (
                  <Link
                    href={queueHref({ ...query, page: page + 1 })}
                    rel="next"
                    className="ld-btn ld-btn-quiet min-h-10"
                  >
                    Siguiente
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </div>
        </>
      )}
    </>
  );
}
