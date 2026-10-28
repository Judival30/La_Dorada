import type { Metadata } from 'next';
import Link from 'next/link';
import { Search, SearchX } from 'lucide-react';
import { z } from 'zod';
import { EmptyState } from '@/components/ld/empty-state';
import { KpiCard } from '@/components/ld/kpi-card';
import { OpportunityCard } from '@/components/ld/opportunity-card';
import { DEPARTMENTS } from '@/domain/onboarding';
import { OPPORTUNITY_TYPES, OPPORTUNITY_TYPE_LABELS } from '@/domain/opportunity';
import { SECTORS, SECTOR_LABELS } from '@/domain/sectors';
import { requireUser } from '@/server/auth/guard';
import {
  EBITDA_FILTERS,
  MARKETPLACE_ORDERS,
  REVENUE_FILTERS,
  searchMarketplace,
  type MarketplaceFilter,
} from '@/server/services/marketplace';

export const metadata: Metadata = { title: 'Marketplace' };
export const dynamic = 'force-dynamic';

const key = <T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values).optional().catch(undefined);

const PARAMS = z.object({
  sector: key(SECTORS),
  department: key(DEPARTMENTS),
  revenue: key(REVENUE_FILTERS.map((f) => f.key) as [string, ...string[]]),
  ebitda: key(EBITDA_FILTERS.map((f) => f.key) as [string, ...string[]]),
  type: key(OPPORTUNITY_TYPES),
  order: key(MARKETPLACE_ORDERS),
  q: z.string().trim().max(80).optional().catch(undefined),
});

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function href(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `/marketplace?${s}` : '/marketplace';
}

export default async function MarketplacePage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser('BUYER');
  const raw = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const parsed = PARAMS.parse(
    Object.fromEntries(Object.keys(PARAMS.shape).map((k) => [k, first(raw[k])])),
  );
  const filter = parsed as MarketplaceFilter;
  const { items, total, kpis } = await searchMarketplace(user, filter);

  const active = { ...parsed, q: parsed.q || undefined };
  const filtered = Object.entries(active).some(([k, v]) => k !== 'order' && v);
  const order = parsed.order ?? 'recent';
  const firstName = user.name.split(' ')[0];

  return (
    <>
      <header className="mb-6">
        <h1 className="ld-h1">Hola, {firstName}</h1>
        <p className="mt-1 max-w-[62ch] text-ld-muted">
          Empresas privadas de Colombia que buscan comprador, inversión o socio. La identidad se
          revela solo tras firmar el acuerdo de confidencialidad.
        </p>
      </header>

      <section aria-label="Resumen del mercado" className="mb-6 grid gap-3 sm:grid-cols-3">
        <KpiCard value={String(kpis.published)} label="Oportunidades publicadas" />
        <KpiCard value={String(kpis.inDueDiligence)} label="En debida diligencia" />
        <KpiCard value={String(kpis.verifiedBuyers)} label="Compradores verificados" />
      </section>

      <form
        method="get"
        action="/marketplace"
        role="search"
        aria-label="Filtrar oportunidades"
        className="mb-6 rounded-[var(--ld-radius-panel)] border border-ld-border bg-ld-surface p-4"
      >
        {parsed.order ? <input type="hidden" name="order" value={parsed.order} /> : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field id="sector" label="Sector" value={parsed.sector} all="Todos los sectores">
            {SECTORS.map((s) => (
              <option key={s} value={s}>
                {SECTOR_LABELS[s]}
              </option>
            ))}
          </Field>
          <Field id="department" label="Región" value={parsed.department} all="Toda Colombia">
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Field>
          <Field
            id="revenue"
            label="Ingresos anuales (COP)"
            value={parsed.revenue}
            all="Cualquier monto"
          >
            {REVENUE_FILTERS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </Field>
          <Field id="ebitda" label="EBITDA (COP)" value={parsed.ebitda} all="Cualquier monto">
            {EBITDA_FILTERS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </Field>
          <Field id="type" label="Tipo de oportunidad" value={parsed.type} all="Todos los tipos">
            {OPPORTUNITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {OPPORTUNITY_TYPE_LABELS[t].label}
              </option>
            ))}
          </Field>
        </div>
        <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end">
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
                defaultValue={parsed.q ?? ''}
                maxLength={80}
                placeholder="Nombre clave, sector o palabra del negocio"
                className="ld-field pl-10"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="ld-btn ld-btn-primary flex-1 md:flex-none">
              Aplicar filtros
            </button>
            {filtered ? (
              <Link
                href={href({ order: parsed.order })}
                className="ld-btn ld-btn-quiet flex-1 md:flex-none"
              >
                Limpiar filtros
              </Link>
            ) : null}
          </div>
        </div>
      </form>

      <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <p className="ld-num font-semibold text-ld-navy" aria-live="polite">
          {total === 1 ? '1 oportunidad encontrada' : `${total} oportunidades encontradas`}
        </p>
        <nav aria-label="Ordenar" className="ld-small flex items-center gap-1">
          <span className="mr-1 text-ld-muted">Ordenar por</span>
          {(
            [
              ['recent', 'Más recientes'],
              ['score', 'Mejor puntuación'],
            ] as const
          ).map(([value, label]) => (
            <Link
              key={value}
              href={href({ ...active, order: value === 'recent' ? undefined : value })}
              aria-current={order === value ? 'true' : undefined}
              className="rounded-full px-3 py-1.5 font-medium text-ld-muted hover:bg-ld-primary-soft aria-[current=true]:bg-ld-primary-soft aria-[current=true]:font-semibold aria-[current=true]:text-ld-navy"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Ninguna oportunidad coincide con tus filtros"
          description="Amplía el rango de ingresos o EBITDA, o quita el sector o la región para ver más empresas."
          action={
            <Link href={href({ order: parsed.order })} className="ld-btn ld-btn-quiet">
              Limpiar filtros
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((t) => (
            <li key={t.id} className="flex">
              <div className="flex w-full flex-col [&>article]:flex-1">
                <OpportunityCard teaser={t} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Field({
  id,
  label,
  value,
  all,
  children,
}: {
  id: string;
  label: string;
  value: string | undefined;
  all: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="ld-small font-semibold text-ld-navy">
        {label}
      </label>
      <select id={id} name={id} defaultValue={value ?? ''} className="ld-field">
        <option value="">{all}</option>
        {children}
      </select>
    </div>
  );
}
