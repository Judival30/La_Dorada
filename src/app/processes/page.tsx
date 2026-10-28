import type { Metadata } from 'next';
import Link from 'next/link';
import { Handshake } from 'lucide-react';
import { EmptyState } from '@/components/ld/empty-state';
import { PageHeader } from '@/components/ld/page-header';
import { requireUser } from '@/server/auth/guard';
import { listDeals } from '@/server/services/deal';
import { DealList } from './_components/deal-list';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Mis procesos' };

export default async function BuyerProcessesPage() {
  const user = await requireUser('BUYER');
  const rows = await listDeals(user);
  return (
    <>
      <PageHeader
        title="Mis procesos"
        description="Tus negociaciones con vendedores: ofertas, carta de intención, due diligence y cierre."
      />
      {rows.length > 0 ? (
        <DealList rows={rows} party="BUYER" />
      ) : (
        <EmptyState
          icon={Handshake}
          title="Aún no tienes procesos de negociación"
          description="Cuando el vendedor autorice tu acceso a una oportunidad, podrás hacerle una oferta desde su ficha."
          action={
            <Link href="/marketplace" className="ld-btn ld-btn-primary">
              Explorar el marketplace
            </Link>
          }
        />
      )}
    </>
  );
}
