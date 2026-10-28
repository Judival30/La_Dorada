import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Disclaimer } from '@/components/ld/disclaimer';
import { EmptyState } from '@/components/ld/empty-state';
import { OfferForm } from '@/app/processes/_components/offer-form';
import { NotFoundError } from '@/domain/errors';
import { requireUser } from '@/server/auth/guard';
import { getAccessState, type BuyerAccessState } from '@/server/services/access';
import { activeDealId } from '@/server/services/deal';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Hacer una oferta' };

type Props = { params: Promise<{ id: string }> };

export default async function OfferPage({ params }: Props) {
  const user = await requireUser('BUYER');
  const { id } = await params;
  let state: BuyerAccessState;
  try {
    state = await getAccessState(user, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const o = state.opportunity;
  const dealId = await activeDealId(user.id, o.id);
  if (dealId) redirect(`/processes/${dealId}`);

  return (
    <>
      <Link
        href={`/opportunities/${o.id}`}
        className="ld-small mb-4 inline-flex items-center gap-1.5 font-semibold text-ld-primary hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver a la oportunidad
      </Link>

      <header className="mb-6">
        <h1 className="ld-h1">Hacer una oferta</h1>
        <p className="mt-1 text-ld-muted">
          {o.title} | {o.sectorLabel} | {o.department}
        </p>
      </header>

      {state.canOpenDataRoom ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <section className="rounded-[var(--ld-radius-panel)] border border-ld-border bg-ld-surface p-5 md:p-6">
            <h2 className="ld-h2 mb-1">Tus términos</h2>
            <p className="ld-small mb-5 max-w-prose text-ld-ink">
              El vendedor verá tu oferta y podrá aceptarla o responder con una contraoferta. Los
              montos van en millones de pesos.
            </p>
            <OfferForm
              opportunityId={o.id}
              submitLabel="Enviar oferta"
              pendingLabel="Enviando oferta…"
              redirectToDeal
            />
          </section>
          <aside className="flex flex-col gap-4">
            <section className="rounded-[var(--ld-radius-panel)] border border-ld-border bg-ld-surface p-5">
              <h2 className="ld-h3 mb-2">Qué pasa después</h2>
              <ol className="ld-small flex list-decimal flex-col gap-2 pl-5 text-ld-ink">
                <li>El vendedor acepta tu oferta o te envía una contraoferta.</li>
                <li>Con términos acordados, ambas partes firman una carta de intención.</li>
                <li>Hacen la due diligence y cada parte confirma el cierre.</li>
              </ol>
              <p className="ld-small mt-3 text-ld-muted">Puedes desistir en cualquier etapa.</p>
            </section>
            <Disclaimer />
          </aside>
        </div>
      ) : (
        <EmptyState
          title="Primero necesitas acceso autorizado"
          description="Para hacer una oferta debes tener tu acuerdo de confidencialidad vigente y la autorización del vendedor."
          action={
            <Link href={`/opportunities/${o.id}`} className="ld-btn ld-btn-primary">
              Ver el estado de tu acceso
            </Link>
          }
        />
      )}
    </>
  );
}
